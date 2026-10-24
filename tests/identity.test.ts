import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { getSchema } from "better-auth/db";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { bootstrapSyntheticOwner, completeSetup, disableStaff, getActor, inviteStaff, reauthenticate, requestOwnerReset, requestStaffReset } from "../src/lib/identity";
import { assertSynthetic, type EmailSender } from "../src/lib/email";

assertSynthetic();
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC" }) });
const messages: Parameters<EmailSender["send"]>[0][] = [];
const sender: EmailSender = { async send(message) { messages.push(message); } };
const failedSender: EmailSender = { async send() { throw new Error("Synthetic delivery unavailable"); } };
const password = "Synthetic secret password 2026!";
const prefix = randomUUID().slice(0, 8);
const ownerEmail = `owner-${prefix}@example.test`;
const staffEmail = `staff-${prefix}@example.test`;
const gymId = randomUUID();
const token = () => new URL(messages.at(-1)!.url).hash.slice(1);
function request(path: string, body?: object, cookie?: string, origin = "http://127.0.0.1:3000") {
  return new Request(`http://127.0.0.1:3000/api/auth/${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function login(mode: "email" | "username", identifier: string, secret = password) {
  const response = await auth.handler(request(`sign-in/${mode}`, { [mode]: identifier, password: secret }));
  assert.equal(response.status, 200, `Expected valid ${mode} login`);
  const cookie = response.headers.getSetCookie().map(item => item.split(";")[0]).join("; ");
  assert.ok(cookie);
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/i);
  assert.match(response.headers.get("set-cookie")!, /SameSite=Lax/i);
  const body = await response.json();
  return { headers: new Headers({ cookie }), cookie, body };
}
after(async () => { await db.$disconnect(); await admin.$disconnect(); });

test("S-01a PostgreSQL identity lifecycle with actual Better Auth Prisma/username adapter", async t => {
  // Each scenario receives a fresh real database rate bucket; test throttling separately below.
  t.beforeEach(async () => { await admin.rateLimit.deleteMany(); });
  await t.test("runtime role is restricted; provider-generated schema matches actual auth columns", async () => {
    const [role] = await db.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean; rolcreatedb: boolean }[]>`SELECT rolsuper, rolbypassrls, rolcreatedb FROM pg_roles WHERE rolname=current_user`;
    assert.deepEqual(role, { rolsuper: false, rolbypassrls: false, rolcreatedb: false });
    const schema = getSchema(auth.options);
    for (const [model, table] of Object.entries(schema)) {
      const mapped = { user: "auth_users", session: "auth_sessions", account: "auth_accounts", verification: "auth_verifications", rateLimit: "auth_rate_limits" }[model];
      assert.ok(mapped, `Unreviewed provider model: ${model}`);
      const columns = await db.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=${mapped}`;
      for (const [field, definition] of Object.entries(table.fields)) assert.ok(columns.some(c => c.column_name === (definition.fieldName ?? field)), `Missing ${model}.${field}`);
    }
  });
  await t.test("public signup denied; unknown login and hostile origin denied", async () => {
    assert.notEqual((await auth.handler(request("sign-up/email", { email: ownerEmail, name: "Intruder", password }))).status, 200);
    assert.notEqual((await auth.handler(request("sign-in/email", { email: ownerEmail, password }))).status, 200);
    assert.notEqual((await auth.handler(request("sign-in/email", { email: ownerEmail, password }, undefined, "https://evil.example"))).status, 200);
    await assert.rejects(getActor(new Headers()));
    assert.equal(await db.user.count({ where: { email: ownerEmail } }), 0);
  });
  let owner: Awaited<ReturnType<typeof login>>;
  await t.test("private pending bootstrap, 48-hour expiry, rotation, concurrent one-use activation", async () => {
    const input = { gymId, gymName: "Synthetic reception test", email: ownerEmail, name: "Synthetic Owner" };
    assert.equal((await bootstrapSyntheticOwner(input, failedSender, admin)).status, "pending");
    const invitation = await admin.invitation.findFirstOrThrow({ where: { gymId }, orderBy: { createdAt: "desc" } });
    assert.equal(invitation.sentAt, null);
    assert.ok(Math.abs(invitation.expiresAt.getTime() - invitation.createdAt.getTime() - 48 * 3600_000) < 2000);
    assert.notEqual((await auth.handler(request("sign-in/email", { email: ownerEmail, password }))).status, 200);
    await bootstrapSyntheticOwner(input, sender, admin);
    const replaced = token();
    await bootstrapSyntheticOwner(input, sender, admin);
    await assert.rejects(completeSetup(replaced, password));
    const usable = token();
    const result = await Promise.allSettled([completeSetup(usable, password), completeSetup(usable, password)]);
    assert.equal(result.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(await admin.operator.count({ where: { gymId, role: "OWNER", state: "ACTIVE" } }), 1);
    assert.equal((await admin.gym.findUniqueOrThrow({ where: { id: gymId } })).state, "ACTIVE");
    await assert.rejects(completeSetup(usable, password));
    await assert.rejects(bootstrapSyntheticOwner(input, sender, admin));
    owner = await login("email", ownerEmail);
    assert.equal((await getActor(owner.headers)).operator.gymId, gymId);
  });
  let staff: Awaited<ReturnType<typeof login>>;
  let staffId: string;
  await t.test("fresh owner verification required; staff setup, expired/replaced links and username collision", async () => {
    const input = { email: staffEmail, name: "Synthetic Staff", username: `staff_${prefix}` };
    await assert.rejects(inviteStaff(owner.headers, input, sender));
    await assert.rejects(reauthenticate(owner.headers, "wrong password"));
    await reauthenticate(owner.headers, password);
    await inviteStaff(owner.headers, input, sender);
    const expired = token();
    const pending = await admin.operator.findFirstOrThrow({ where: { gymId, role: "STAFF" } });
    staffId = pending.id;
    await admin.invitation.updateMany({ where: { operatorId: staffId, consumedAt: null }, data: { createdAt: new Date(Date.now() - 49 * 3600_000), expiresAt: new Date(Date.now() - 1) } });
    await assert.rejects(completeSetup(expired, password));
    await inviteStaff(owner.headers, input, sender);
    await assert.rejects(completeSetup(expired, password));
    const result = await Promise.allSettled([
      inviteStaff(owner.headers, { ...input, email: `collision-${prefix}@example.test` }, sender),
      inviteStaff(owner.headers, { ...input, email: `collision2-${prefix}@example.test` }, sender),
    ]);
    assert.equal(result.filter(r => r.status === "fulfilled").length, 0);
    await completeSetup(token(), password);
    staff = await login("username", input.username.toUpperCase());
    assert.notEqual((await auth.handler(request("sign-in/email", { email: staffEmail, password }))).status, 200);
    assert.notEqual((await auth.handler(request("sign-in/username", { username: ownerEmail, password }))).status, 200);
    await assert.rejects(inviteStaff(staff.headers, { ...input, email: `extra-${prefix}@example.test` }, sender));
    await assert.rejects(requestStaffReset(staff.headers, staffId, sender));
    await assert.rejects(disableStaff(staff.headers, staffId));
  });
  await t.test("7-day rolling sessions renew after 24 hours; expired/revoked sessions fail", async () => {
    const actor = await getActor(staff.headers);
    const original = await db.session.findUniqueOrThrow({ where: { id: actor.sessionId } });
    assert.ok(Math.abs(original.expiresAt.getTime() - original.createdAt.getTime() - 7 * 86400_000) < 2000);
    await admin.session.update({ where: { id: actor.sessionId }, data: { updatedAt: new Date(Date.now() - 23 * 3600_000), expiresAt: new Date(Date.now() + 7 * 86400_000 - 23 * 3600_000) } });
    await auth.handler(request("get-session", undefined, staff.cookie));
    const unrenewed = await db.session.findUniqueOrThrow({ where: { id: actor.sessionId } });
    assert.ok(unrenewed.updatedAt.getTime() < Date.now() - 22 * 3600_000);
    await admin.session.update({ where: { id: actor.sessionId }, data: { updatedAt: new Date(Date.now() - 25 * 3600_000), expiresAt: new Date(Date.now() + 7 * 86400_000 - 25 * 3600_000) } });
    await auth.handler(request("get-session", undefined, staff.cookie));
    const renewed = await db.session.findUniqueOrThrow({ where: { id: actor.sessionId } });
    assert.ok(renewed.updatedAt.getTime() > Date.now() - 5000);
    assert.ok(Math.abs(renewed.expiresAt.getTime() - Date.now() - 7 * 86400_000) < 5000);
    await admin.session.update({ where: { id: actor.sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(getActor(staff.headers));
    staff = await login("username", `staff_${prefix}`);
    const current = await getActor(staff.headers);
    await admin.session.delete({ where: { id: current.sessionId } });
    await assert.rejects(getActor(staff.headers));
    staff = await login("username", `staff_${prefix}`);
  });
  await t.test("owner reauthentication expires at five minutes; cross-gym reset/disable denied", async () => {
    const current = await getActor(owner.headers);
    await admin.session.update({ where: { id: current.sessionId }, data: { reauthenticatedAt: new Date(Date.now() - 300_000) } });
    await assert.rejects(requestStaffReset(owner.headers, staffId, sender));
    await reauthenticate(owner.headers, password);
    await assert.rejects(requestStaffReset(owner.headers, randomUUID(), sender));
    await assert.rejects(disableStaff(owner.headers, randomUUID()));
  });
  await t.test("owner-initiated 30-minute single-use staff reset; old sessions/password revoked", async () => {
    await requestStaffReset(owner.headers, staffId, sender);
    const reset = token();
    const invitation = await admin.invitation.findFirstOrThrow({ where: { operatorId: staffId, consumedAt: null } });
    assert.ok(Math.abs(invitation.expiresAt.getTime() - invitation.createdAt.getTime() - 30 * 60_000) < 2000);
    await admin.invitation.update({ where: { id: invitation.id }, data: { createdAt: new Date(Date.now() - 31 * 60_000), expiresAt: new Date(Date.now() - 1) } });
    await assert.rejects(completeSetup(reset, password));
    await requestStaffReset(owner.headers, staffId, sender);
    const usable = token();
    const nextPassword = `${password} changed`;
    const results = await Promise.allSettled([completeSetup(usable, nextPassword), completeSetup(usable, nextPassword)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    await assert.rejects(getActor(staff.headers));
    await assert.rejects(completeSetup(usable, password));
    assert.equal((await auth.handler(request("sign-in/username", { username: `staff_${prefix}`, password }))).status, 401);
    staff = await login("username", `staff_${prefix}`, nextPassword);
  });
  await t.test("disable blocks cookies, sign-in, and outstanding reset links immediately", async () => {
    await requestStaffReset(owner.headers, staffId, sender);
    const outstanding = token();
    await disableStaff(owner.headers, staffId);
    await assert.rejects(getActor(staff.headers));
    await assert.rejects(completeSetup(outstanding, password));
    assert.notEqual((await auth.handler(request("sign-in/username", { username: `staff_${prefix}`, password }))).status, 200);
  });
  await t.test("owner self-recovery is generic; staff cannot self-initiate; logout invalidates session", async () => {
    const count = messages.length;
    const generic = await requestOwnerReset(`missing-${prefix}@example.test`, sender);
    assert.deepEqual(await requestOwnerReset(staffEmail, sender), generic);
    assert.equal(messages.length, count);
    await requestOwnerReset(ownerEmail, sender);
    const reset = token();
    await completeSetup(reset, password);
    await assert.rejects(getActor(owner.headers));
    owner = await login("email", ownerEmail);
    assert.equal((await auth.handler(request("sign-out", {}, owner.cookie))).status, 200);
    await assert.rejects(getActor(owner.headers));
    const events = await admin.identityAudit.findMany({ where: { gymId } });
    assert.ok(events.length > 0);
    const audit = JSON.stringify(events);
    assert.ok(!audit.includes(password));
    for (const message of messages) assert.ok(!audit.includes(new URL(message.url).hash.slice(1)));
    await assert.rejects(db.identityAudit.deleteMany({ where: { gymId } }));
  });
  await t.test("login rate limiting is backed by PostgreSQL and survives auth handler calls", async () => {
    for (let i = 0; i < 5; i++) {
      assert.equal((await auth.handler(request("sign-in/email", { email: ownerEmail, password: "wrong password" }))).status, 401);
    }
    assert.equal((await auth.handler(request("sign-in/email", { email: ownerEmail, password }))).status, 429);
    assert.ok(await db.rateLimit.count() > 0);
  });
});
