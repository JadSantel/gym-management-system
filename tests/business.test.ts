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
import { GET as plansGet, POST as plansPost } from "../src/app/api/plans/route";
import { GET as chargeGet, POST as chargePost } from "../src/app/api/charges/route";
import { proposedPeriod } from "../src/lib/charges";
import { parsePesos, formatPhp } from "../src/lib/money";

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

test("S-01d parses exact integer centavos and proposes fixed plan-duration PHT intervals", () => {
  for (const [input, expected] of [["800", 80_000], ["2100.00", 210_000], ["4000.5", 400_050], ["0.01", 1], ["21474836.47", 2_147_483_647]] as const) assert.equal(parsePesos(input), expected);
  for (const input of ["0", "0.00", "-1", "1.001", "1e3", "NaN", "1,000", " 800", "21474836.48", "999999999"]) assert.equal(parsePesos(input), null);
  assert.equal(formatPhp(80_001), "₱800.01");
  assert.equal(proposedPeriod(new Date("2027-01-31T10:30:00Z"), 30).intendedEnd.toISOString(), "2027-03-01T16:00:00.000Z");
  assert.equal(proposedPeriod(new Date("2028-01-31T10:30:00Z"), 30).intendedEnd.toISOString(), "2028-02-29T16:00:00.000Z");
  for (const days of [30, 90, 180]) {
    const period = proposedPeriod(new Date("2026-10-24T18:30:00Z"), days);
    assert.equal(period.intendedStart.toISOString(), "2026-10-24T16:00:00.000Z");
    assert.equal(period.intendedEnd.getTime() - period.intendedStart.getTime(), days * 86400_000);
  }
  assert.throws(() => proposedPeriod(new Date(), 31));
});

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
  let plans: { id: string; name: string; durationDays: number; priceCentavos: number; version: number }[];
  let memberId: string;
  let chargeId: string;
  await t.test("S-01d catalogue initialization requires fresh owner and preserves three approved plans", async () => {
    assert.equal((await plansGet(req("/api/plans", new Headers()))).status, 401);
    assert.equal((await plansPost(req("/api/plans", staffHeaders, { action: "initialize" }))).status, 403);
    assert.deepEqual(await (await plansGet(req("/api/plans", owners[0]))).json(), []);
    const ownerSession = await auth.api.getSession({ headers: owners[0] });
    await admin.session.update({ where: { id: ownerSession!.session.id }, data: { reauthenticatedAt: new Date(Date.now() - 300_000) } });
    assert.equal((await plansPost(req("/api/plans", owners[0], { action: "initialize" }))).status, 403);
    await reauthenticate(owners[0], password);
    const responses = await Promise.all([0, 1].map(() => plansPost(req("/api/plans", owners[0], { action: "initialize" }))));
    assert.deepEqual(responses.map(r => r.status), [200, 200]);
    plans = await responses[0].json();
    assert.deepEqual(plans.map(p => [p.name, p.durationDays, p.priceCentavos]), [["Monthly", 30, 80_000], ["3 Months", 90, 210_000], ["6 Months", 180, 400_000]]);
    assert.equal(await admin.plan.count({ where: { gymId: gyms[0] } }), 3);
    assert.equal((await plansPost(req("/api/plans", owners[0], { action: "initialize", durationDays: 31 }))).status, 400);
    assert.equal((await plansPost(req("/api/plans", owners[0], { action: "create", name: "Guest pass" }))).status, 400);
    memberId = (await createMember(owners[0], "Charge Preview Member")).id;
  });
  await t.test("S-01d charge endpoint uses authoritative exact terms and persists a retrievable preview", async () => {
    for (const plan of plans) {
      const response = await chargePost(req("/api/charges", owners[0], { memberId, planId: plan.id }));
      assert.equal(response.status, 200);
      const charge = await response.json();
      chargeId = plan.durationDays === 30 ? charge.id : chargeId;
      assert.deepEqual([charge.planName, charge.durationDays, charge.priceCentavos, charge.planVersion], [plan.name, plan.durationDays, plan.priceCentavos, plan.version]);
      assert.equal(new Date(charge.intendedEnd).getTime() - new Date(charge.intendedStart).getTime(), plan.durationDays * 86400_000);
      assert.equal(new Date(new Date(charge.intendedStart).getTime() + 8 * 3600_000).toISOString().slice(11), "00:00:00.000Z");
      const saved = await chargeGet(req(`/api/charges?id=${charge.id}`, owners[0]));
      assert.equal(saved.status, 200);
      assert.equal((await saved.json()).member.fullName, "Charge Preview Member");
    }
    for (const extra of [{ priceCentavos: 1 }, { durationDays: 365 }, { method: "GCASH" }, { gymId: gyms[1] }, { discount: 1 }]) {
      assert.equal((await chargePost(req("/api/charges", owners[0], { memberId, planId: plans[0].id, ...extra }))).status, 400);
    }
    assert.equal((await chargePost(req("/api/charges", new Headers(), { memberId, planId: plans[0].id }))).status, 401);
  });
  await t.test("S-01d raw endpoint permission changes take effect without a new staff session", async () => {
    await setCapabilities(owners[0], staff.id, { canManageMembers: true, canCollectCash: false });
    assert.equal((await plansGet(req("/api/plans", staffHeaders))).status, 200);
    assert.equal((await chargePost(req("/api/charges", staffHeaders, { memberId, planId: plans[0].id }))).status, 403);
    await setCapabilities(owners[0], staff.id, { canManageMembers: true, canCollectCash: true });
    const response = await chargePost(req("/api/charges", staffHeaders, { memberId, planId: plans[0].id }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).preparedBy, staff.id);
    assert.equal((await plansPost(req("/api/plans", staffHeaders, { action: "update", planId: plans[0].id, price: "1", version: 1 }))).status, 403);
    await setCapabilities(owners[0], staff.id, { canManageMembers: false, canCollectCash: true });
    assert.equal((await chargeGet(req(`/api/charges?id=${chargeId}`, staffHeaders))).status, 403);
    assert.equal((await chargePost(req("/api/charges", staffHeaders, { memberId, planId: plans[0].id }))).status, 403);
  });
  await t.test("S-01d runtime RLS and composite references reject foreign gym plans and members", async () => {
    const foreignMember = await createMember(owners[1], "Other Gym Member");
    const foreignPlans = await (await plansPost(req("/api/plans", owners[1], { action: "initialize" }))).json();
    assert.equal((await chargeGet(req(`/api/charges?id=${chargeId}`, owners[1]))).status, 404);
    assert.equal((await chargePost(req("/api/charges", owners[0], { memberId: foreignMember.id, planId: plans[0].id }))).status, 404);
    assert.equal((await chargePost(req("/api/charges", owners[0], { memberId, planId: foreignPlans[0].id }))).status, 404);
    assert.equal((await plansPost(req("/api/plans", owners[0], { action: "update", planId: foreignPlans[0].id, price: "1", version: 1 }))).status, 409);
    assert.equal(await db.plan.count(), 0); assert.equal(await db.charge.count(), 0);
    const source = await admin.charge.findUniqueOrThrow({ where: { id: chargeId } });
    const { id: _id, ...data } = source;
    assert.ok(_id);
    await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.charge.create({ data: { ...data, memberId: foreignMember.id } })));
    await assert.rejects(db.charge.create({ data }));
    const policies = await db.$queryRaw<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('plans', 'charge_snapshots') AND relnamespace='public'::regnamespace`;
    assert.equal(policies.length, 2); for (const policy of policies) assert.deepEqual(policy, { relrowsecurity: true, relforcerowsecurity: true });
  });
  await t.test("S-01d validates prices, rejects unsupported changes and preserves immutable snapshots", async () => {
    const original = await admin.charge.findUniqueOrThrow({ where: { id: chargeId } });
    const update = { action: "update", planId: plans[0].id, version: plans[0].version, price: "900.25" };
    for (const price of ["0", "-1", "800.001", "1e3", "1,000", "21474836.48"]) {
      assert.equal((await plansPost(req("/api/plans", owners[0], { ...update, price }))).status, 400);
    }
    assert.equal((await plansPost(req("/api/plans", owners[0], { ...update, durationDays: 31 }))).status, 400);
    assert.equal((await plansPost(req("/api/plans", owners[0], update))).status, 200);
    assert.equal((await plansPost(req("/api/plans", owners[0], update))).status, 409);
    assert.deepEqual(await admin.charge.findUniqueOrThrow({ where: { id: chargeId } }), original);
    const current = await admin.plan.findUniqueOrThrow({ where: { id: plans[0].id } });
    assert.equal(current.priceCentavos, 90_025);
    const concurrent = await Promise.all(["901.25", "902.25"].map(price => plansPost(req("/api/plans", owners[0], { ...update, version: current.version, price }))));
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
    await plansPost(req("/api/plans", owners[0], { action: "initialize" }));
    const latest = await admin.plan.findUniqueOrThrow({ where: { id: plans[0].id } });
    assert.ok([90_125, 90_225].includes(latest.priceCentavos));
    const next = await chargePost(req("/api/charges", owners[0], { memberId, planId: plans[0].id }));
    assert.equal((await next.json()).priceCentavos, latest.priceCentavos);
    await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.charge.update({ where: { id: chargeId }, data: { priceCentavos: 1 } })));
    await assert.rejects(admin.charge.update({ where: { id: chargeId }, data: { priceCentavos: 1 } }));
    await assert.rejects(admin.charge.delete({ where: { id: chargeId } }));
    await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.plan.update({ where: { id: plans[0].id }, data: { durationDays: 31 } })));
    assert.deepEqual(await admin.charge.findUniqueOrThrow({ where: { id: chargeId } }), original);
  });
});
