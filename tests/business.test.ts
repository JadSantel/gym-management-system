import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { bootstrapSyntheticOwner, completeSetup, inviteStaff, reauthenticate, setCapabilities } from "../src/lib/identity";
import { assertSynthetic, type EmailSender } from "../src/lib/email";
import { inGym } from "../src/lib/tenant";
import { createMember } from "../src/lib/members";
import { GET as memberGet, POST as memberPost } from "../src/app/api/members/route";

assertSynthetic();
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC" }) });
const password = "Synthetic business password 2026!";
const suffix = randomUUID().slice(0, 8);
let link = "";
const sender: EmailSender = { async send(message) { link = new URL(message.url).hash.slice(1); } };
async function login(identifier: string, mode = "email") {
  const response = await auth.handler(new Request("http://127.0.0.1:3000/api/auth/sign-in/" + mode, { method: "POST", headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" }, body: JSON.stringify({ [mode]: identifier, password }) }));
  assert.equal(response.status, 200);
  return new Headers({ cookie: response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ") });
}
function req(path: string, headers: Headers, body?: object) {
  const h = new Headers(headers); h.set("origin", "http://127.0.0.1:3000"); h.set("content-type", "application/json");
  return new Request(`http://127.0.0.1:3000${path}`, { method: body ? "POST" : "GET", headers: h, ...(body ? { body: JSON.stringify(body) } : {}) });
}
after(async () => { await db.$disconnect(); await admin.$disconnect(); });

test("S-01 business acceptance using restricted PostgreSQL runtime and actual route handlers", async t => {
  await admin.rateLimit.deleteMany();
  const gyms = [randomUUID(), randomUUID()];
  const owners: Headers[] = [];
  for (let i = 0; i < 2; i++) {
    const email = `business-${i}-${suffix}@example.test`;
    await bootstrapSyntheticOwner({ gymId: gyms[i], gymName: `Business ${i}`, email, name: "Synthetic Owner" }, sender, admin);
    await completeSetup(link, password);
    owners.push(await login(email)); await reauthenticate(owners[i], password);
  }
  await inviteStaff(owners[0], { name: "Synthetic Staff", email: `business-staff-${suffix}@example.test`, username: `business_${suffix}` }, sender);
  await completeSetup(link, password);
  const staffHeaders = await login(`business_${suffix}`, "username");
  const staff = await admin.operator.findFirstOrThrow({ where: { gymId: gyms[0], role: "STAFF" } });
  await t.test("S-01c member create/search validate inputs and deny anonymous/ungranted staff endpoints", async () => {
    await createMember(owners[0], "Direct service check");
    assert.equal((await memberGet(req("/api/members", new Headers()))).status, 401);
    assert.equal((await memberPost(req("/api/members", staffHeaders, { fullName: "Synthetic Member" }))).status, 403);
    assert.equal((await memberGet(req("/api/members", staffHeaders))).status, 403);
    assert.equal((await memberPost(req("/api/members", owners[0], { fullName: "   " }))).status, 400);
    assert.equal((await memberPost(req("/api/members", owners[0], { fullName: "Synthetic Member", confirmDuplicate: "true" }))).status, 400);
    const response = await memberPost(req("/api/members", owners[0], { fullName: "  Synthetic   Member  " }));
    assert.equal(response.status, 200);
    const member = await response.json();
    assert.equal(member.fullName, "Synthetic Member");
    assert.equal(member.gymId, gyms[0]);
    assert.equal((await (await memberGet(req("/api/members?q=synthetic", owners[0]))).json()).length, 1);
    assert.equal((await (await memberGet(req("/api/members?q=synthetic", owners[1]))).json()).length, 0);
    assert.equal(await inGym(owners[1], "MEMBERS", tx => tx.member.findUnique({ where: { id: member.id } })), null);
    assert.equal(await db.member.count(), 0);
  });
  await t.test("S-01c duplicate review and concurrent create preserve distinct stable identities", async () => {
    assert.equal((await memberPost(req("/api/members", owners[0], { fullName: "synthetic member" }))).status, 409);
    const response = await memberPost(req("/api/members", owners[0], { fullName: "Synthetic Member", confirmDuplicate: true }));
    assert.equal(response.status, 200);
    const results = await Promise.all([0, 1].map(() => memberPost(req("/api/members", owners[0], { fullName: "Concurrent Person" }))));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    const matches = await (await memberGet(req("/api/members?q=Synthetic%20Member", owners[0]))).json();
    assert.equal(matches.length, 2);
    assert.notEqual(matches[0].id, matches[1].id);
  });
  await t.test("S-01c grants take effect at direct endpoints and revocation denies the same cookie", async () => {
    await setCapabilities(owners[0], staff.id, { canManageMembers: true, canCollectCash: false });
    assert.equal((await memberPost(req("/api/members", staffHeaders, { fullName: "Staff-created Member" }))).status, 200);
    await setCapabilities(owners[0], staff.id, { canManageMembers: false, canCollectCash: false });
    assert.equal((await memberPost(req("/api/members", staffHeaders, { fullName: "Denied Member" }))).status, 403);
    const otherOwner = await admin.operator.findFirstOrThrow({ where: { gymId: gyms[1], role: "OWNER" } });
    await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.member.create({ data: { gymId: gyms[0], fullName: "Invalid foreign creator", nameKey: "invalid", createdBy: otherOwner.id } })));
  });
});
