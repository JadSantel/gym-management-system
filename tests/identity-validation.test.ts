import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { bootstrapSyntheticOwner, completeSetup, getActor, inviteStaff, reauthenticate } from "../src/lib/identity";
import { assertSynthetic, localEmail, type EmailSender } from "../src/lib/email";
import { POST } from "../src/app/api/identity/[action]/route";
import type { IdentityAction } from "../src/lib/identity-schema";

assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/gym_crm_synthetic");
}
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }) });
const origin = process.env.BETTER_AUTH_URL!;
// Surrounding spaces are part of the credential, not normalization candidates.
const password = " Synthetic validation password 2026! ";
const suffix = randomUUID().slice(0, 8);
const gyms = [randomUUID(), randomUUID()];
const ownerEmail = `validation-owner-${suffix}@example.test`;
let token = "";
const sender: EmailSender = { async send(message) { token = new URL(message.url).hash.slice(1); } };
function request(action: string, body: unknown, headers = new Headers(), raw?: string) {
  const h = new Headers(headers); h.set("content-type", "application/json"); h.set("origin", origin);
  return POST(new Request(`${origin}/api/identity/${action}`, { method: "POST", headers: h, body: raw ?? JSON.stringify(body) }), { params: Promise.resolve({ action }) });
}
async function login(identifier: string, mode = "email") {
  await admin.rateLimit.deleteMany();
  const response = await auth.handler(new Request(`${origin}/api/auth/sign-in/${mode}`, {
    method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ [mode]: identifier, password }),
  }));
  assert.equal(response.status, 200);
  return new Headers({ cookie: response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ") });
}
async function snapshot() {
  const operators = await admin.operator.findMany({ where: { gymId: { in: gyms } }, orderBy: { id: "asc" } });
  const userIds = operators.map(row => row.userId);
  const data = await Promise.all([
    admin.gym.findMany({ where: { id: { in: gyms } }, orderBy: { id: "asc" } }),
    admin.user.findMany({ where: { id: { in: userIds } }, orderBy: { id: "asc" } }),
    admin.account.findMany({ where: { userId: { in: userIds } }, orderBy: { id: "asc" } }),
    admin.invitation.findMany({ where: { gymId: { in: gyms } }, orderBy: { id: "asc" } }),
    admin.session.findMany({ where: { userId: { in: userIds } }, orderBy: { id: "asc" } }),
    admin.identityAudit.findMany({ where: { gymId: { in: gyms } }, orderBy: { id: "asc" } }),
  ]);
  // Assertion output may contain this digest, never password hashes/session tokens.
  return createHash("sha256").update(JSON.stringify([operators, data])).digest("hex");
}
async function capturedToken(operatorId: string) {
  const invitation = await admin.invitation.findFirstOrThrow({ where: { operatorId, consumedAt: null }, orderBy: { createdAt: "desc" } });
  const message = JSON.parse(await readFile(`.local/mailbox/${invitation.id}.json`, "utf8"));
  return new URL(message.url).hash.slice(1);
}
after(async () => { await db.$disconnect(); await admin.$disconnect(); });

test("R-06/08 real identity routes: strict validation, safe errors, no writes and unchanged authority", async t => {
  await admin.rateLimit.deleteMany();
  await bootstrapSyntheticOwner({ gymId: gyms[0], gymName: "Synthetic validation gym", email: ownerEmail, name: "Validation Owner" }, sender, admin);
  const ownerToken = token;
  await t.test("setup rejects protected fields without consuming the link, then preserves exact password bytes", async () => {
    const before = await snapshot();
    const response = await request("setup", { token: ownerToken, password, role: "OWNER_SENTINEL" });
    assert.equal(response.status, 400);
    assert.ok(!(await response.text()).includes("OWNER_SENTINEL"));
    assert.equal(await snapshot(), before);
    assert.equal((await request("setup", { token: ownerToken, password })).status, 200);
    assert.equal((await request("setup", { token: ownerToken, password })).status, 400);
  });
  const owner = await login(ownerEmail);
  await reauthenticate(owner, password);
  const staffEmail = `validation-staff-${suffix}@example.test`;
  const username = `validation_${suffix}`;
  await inviteStaff(owner, { email: staffEmail, username, name: "Validation Staff" }, sender);
  const staffToken = token;
  const staff = await admin.operator.findFirstOrThrow({ where: { gymId: gyms[0], role: "STAFF" } });
  await bootstrapSyntheticOwner({ gymId: gyms[1], gymName: "Foreign validation gym", email: `foreign-validation-${suffix}@example.test`, name: "Foreign Owner" }, sender, admin);
  await completeSetup(token, password);
  const foreignOwner = await login(`foreign-validation-${suffix}@example.test`);
  await reauthenticate(foreignOwner, password);
  await inviteStaff(foreignOwner, { email: `foreign-staff-validation-${suffix}@example.test`, username: `foreignv_${suffix}`, name: "Foreign Staff" }, sender);
  await completeSetup(token, password);
  const foreignStaff = await admin.operator.findFirstOrThrow({ where: { gymId: gyms[1], role: "STAFF" } });
  const valid: Record<IdentityAction, Record<string, unknown>> = {
    setup: { token: staffToken, password }, reauthenticate: { password },
    invite: { email: `new-validation-${suffix}@example.test`, username: `newv_${suffix}`, name: "New Staff" },
    "reset-owner": { email: ownerEmail }, "reset-staff": { operatorId: staff.id }, disable: { operatorId: staff.id },
    capabilities: { operatorId: staff.id, canManageMembers: true, canCollectCash: false },
  };
  await t.test("all actions reject unknown keys, missing fields, null, wrong types and malformed values without identity writes", async () => {
    for (const action of Object.keys(valid) as IdentityAction[]) {
      const firstField = Object.keys(valid[action])[0];
      const missing = { ...valid[action] }; delete missing[firstField];
      const invalid = [
        { ...valid[action], gymId: gyms[1], role: "OWNER", rawSecret: "PRIVATE_INPUT_SENTINEL" },
        missing, { ...valid[action], [firstField]: null }, { ...valid[action], [firstField]: [] },
        { ...valid[action], [firstField]: 17 }, { ...valid[action], [firstField]: "" },
        ...(["setup", "reset-staff", "disable", "capabilities"].includes(action)
          ? [{ ...valid[action], [firstField]: `${valid[action][firstField]}\n` }] : []),
      ];
      for (const body of invalid) {
        await admin.rateLimit.deleteMany();
        const before = await snapshot();
        const response = await request(action, body, owner);
        assert.equal(response.status, 400, `${action} invalid input`);
        assert.equal(response.headers.get("cache-control"), "no-store");
        const result = await response.json();
        assert.ok(!JSON.stringify(result).includes("PRIVATE_INPUT_SENTINEL"));
        assert.ok(!JSON.stringify(result).includes(password));
        assert.ok(!JSON.stringify(result).includes(staffToken));
        assert.ok(!("issues" in result));
        assert.equal(await snapshot(), before, `${action} must leave identity state unchanged`);
      }
    }
    await admin.rateLimit.deleteMany();
    const before = await snapshot();
    assert.equal((await request("setup", {}, owner, "{")).status, 400);
    assert.equal((await request("setup", {}, owner, JSON.stringify({ password: "x".repeat(5000) }))).status, 413);
    assert.equal(await snapshot(), before);
  });
  await t.test("corrected invitation/setup, reauth and explicit false capabilities succeed through real routes", async () => {
    await admin.rateLimit.deleteMany();
    assert.equal((await request("reauthenticate", { password: "incorrect" }, owner)).status, 401);
    assert.equal((await request("reauthenticate", { password }, owner)).status, 200);
    assert.equal((await request("invite", { ...valid.invite, email: ` NEW-VALIDATION-${suffix}@EXAMPLE.TEST `, name: " New Staff " }, owner)).status, 200);
    const invited = await admin.user.findUniqueOrThrow({ where: { email: `new-validation-${suffix}@example.test` } });
    assert.equal(invited.name, "New Staff");
    assert.equal((await request("setup", valid.setup)).status, 200);
    assert.equal((await request("capabilities", valid.capabilities, owner)).status, 200);
    const updated = await admin.operator.findUniqueOrThrow({ where: { id: staff.id } });
    assert.deepEqual([updated.canManageMembers, updated.canCollectCash], [true, false]);
  });
  const staffHeaders = await login(username, "username");
  await t.test("failed email capture leaves invitations pending and active staff access intact; corrected retry rotates the link", async () => {
    await admin.rateLimit.deleteMany();
    const send = localEmail.send;
    const email = `failed-capture-${suffix}@example.test`;
    try {
      localEmail.send = async () => { throw new Error("PRIVATE_TRANSPORT_SENTINEL"); };
      const invite = await request("invite", { email, name: "Pending Capture", username: `failedv_${suffix}` }, owner);
      assert.equal(invite.status, 200);
      assert.deepEqual(await invite.json(), { status: "pending" });
      assert.equal((await request("reset-staff", { operatorId: staff.id }, owner)).status, 200);
      assert.equal((await admin.operator.findUniqueOrThrow({ where: { id: staff.id } })).state, "ACTIVE");
      await getActor(staffHeaders);
      assert.equal((await admin.invitation.findFirstOrThrow({ where: { operatorId: staff.id, consumedAt: null } })).sentAt, null);
    } finally { localEmail.send = send; }
    const pending = await admin.operator.findFirstOrThrow({ where: { user: { email } } });
    assert.equal(pending.state, "PENDING");
    const failed = await admin.invitation.findFirstOrThrow({ where: { operatorId: pending.id, consumedAt: null } });
    assert.equal(failed.sentAt, null);
    assert.equal((await request("invite", { email, name: "Pending Capture", username: `failedv_${suffix}` }, owner)).status, 200);
    assert.ok((await admin.invitation.findUniqueOrThrow({ where: { id: failed.id } })).consumedAt);
    assert.ok((await admin.invitation.findFirstOrThrow({ where: { operatorId: pending.id, consumedAt: null } })).sentAt);
    const audit = JSON.stringify(await admin.identityAudit.findMany({ where: { gymId: gyms[0] } }));
    assert.ok(!audit.includes("PRIVATE_TRANSPORT_SENTINEL"));
  });
  await t.test("valid schemas cannot bypass staff, stale-owner, cross-gym or anonymous denials", async () => {
    for (const action of ["reauthenticate", "invite", "reset-staff", "disable", "capabilities"] as const) {
      await admin.rateLimit.deleteMany();
      const before = await snapshot();
      assert.equal((await request(action, valid[action], staffHeaders)).status, 403, action);
      assert.equal((await request(action, valid[action])).status, 401, action);
      assert.equal(await snapshot(), before);
    }
    for (const action of ["reset-staff", "disable", "capabilities"] as const) {
      const before = await snapshot();
      assert.equal((await request(action, { ...valid[action], operatorId: foreignStaff.id }, owner)).status, 403);
      assert.equal(await snapshot(), before);
    }
    const actor = await getActor(owner);
    await admin.session.update({ where: { id: actor.sessionId }, data: { reauthenticatedAt: new Date(Date.now() - 300_000) } });
    const before = await snapshot();
    for (const action of ["invite", "reset-staff", "disable", "capabilities"] as const) {
      assert.equal((await request(action, valid[action], owner)).status, 403, `${action} stale password check`);
    }
    assert.equal(await snapshot(), before);
    await reauthenticate(owner, password);
  });
  await t.test("owner recovery remains generic; staff reset and disable preserve link/session revocation", async () => {
    await admin.rateLimit.deleteMany();
    const generic = await (await request("reset-owner", { email: `missing-${suffix}@example.test` })).json();
    assert.deepEqual(await (await request("reset-owner", { email: staffEmail })).json(), generic);
    assert.deepEqual(await (await request("reset-owner", { email: ownerEmail })).json(), generic);
    assert.equal((await request("reset-staff", { operatorId: staff.id }, owner)).status, 200);
    const reset = await capturedToken(staff.id);
    assert.equal((await request("setup", { token: reset, password })).status, 200);
    await assert.rejects(getActor(staffHeaders));
    const newStaffSession = await login(username, "username");
    assert.equal((await request("reset-staff", { operatorId: staff.id }, owner)).status, 200);
    const revoked = await capturedToken(staff.id);
    assert.equal((await request("disable", { operatorId: staff.id }, owner)).status, 200);
    await assert.rejects(getActor(newStaffSession));
    assert.equal((await request("setup", { token: revoked, password })).status, 400);
    const audit = JSON.stringify(await admin.identityAudit.findMany({ where: { gymId: { in: gyms } } }));
    for (const secret of [password, ownerToken, staffToken, reset, revoked, "PRIVATE_INPUT_SENTINEL"]) assert.ok(!audit.includes(secret));
  });
});
