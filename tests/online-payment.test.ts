import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { bootstrapSyntheticOwner, completeSetup, inviteStaff, reauthenticate, setCapabilities } from "../src/lib/identity";
import { assertSynthetic, type EmailSender } from "../src/lib/email";
import { createMember } from "../src/lib/members";
import { changePlans } from "../src/lib/plans";
import { confirmCash, prepareCharge } from "../src/lib/charges";
import { inGym } from "../src/lib/tenant";
import { onlineConfirmationSchema } from "../src/lib/finance-schema";
import { POST } from "../src/app/api/payments/online/route";

assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/gym_crm_synthetic");
}
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }) });
const suffix = randomUUID().slice(0, 8), password = "Synthetic online password 2026!";
let token = "";
const sender: EmailSender = { async send(message) { token = new URL(message.url).hash.slice(1); } };
async function login(identifier: string, mode = "email") {
  const response = await auth.handler(new Request(`http://127.0.0.1:3000/api/auth/sign-in/${mode}`, { method: "POST", headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" }, body: JSON.stringify({ [mode]: identifier, password }) }));
  assert.equal(response.status, 200);
  return new Headers({ cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") });
}
function request(headers: Headers, body: object, key = randomUUID()) {
  const h = new Headers(headers); h.set("origin", "http://127.0.0.1:3000"); h.set("content-type", "application/json"); h.set("idempotency-key", key);
  return new Request("http://127.0.0.1:3000/api/payments/online", { method: "POST", headers: h, body: JSON.stringify(body) });
}
after(async () => { await db.$disconnect(); await admin.$disconnect(); });

test("Online enrollment validates input, authority, real DB atomicity, evidence and retry invariants", async t => {
  await admin.rateLimit.deleteMany();
  const gymId = randomUUID(), otherGymId = randomUUID();
  const owners: Headers[] = [];
  for (const [i, id] of [gymId, otherGymId].entries()) {
    const email = `online-${i}-${suffix}@example.test`;
    await bootstrapSyntheticOwner({ gymId: id, gymName: "Synthetic Online Gym", name: "Online Owner", email }, sender, admin);
    await completeSetup(token, password); const headers = await login(email); await reauthenticate(headers, password); owners.push(headers);
  }
  await inviteStaff(owners[0], { name: "Online Collector", email: `online-staff-${suffix}@example.test`, username: `online_${suffix}` }, sender);
  await completeSetup(token, password);
  const staffHeaders = await login(`online_${suffix}`, "username");
  const staff = await admin.operator.findFirstOrThrow({ where: { gymId, role: "STAFF" } });
  await setCapabilities(owners[0], staff.id, { canManageMembers: true, canCollectCash: true });
  const [plan] = await changePlans(owners[0], { action: "initialize" });
  const fixture = async () => {
    const member = await createMember(owners[0], { fullName: `Online ${randomUUID()}`, email: null, phone: null, confirmDuplicate: false });
    return { member, charge: await prepareCharge(owners[0], member.id, plan.id) };
  };
  const body = (chargeId: string, extra: object = {}) => ({ chargeId, amount: "800.00", provider: "GCash", transactionReference: `REF-${randomUUID()}`, fundsChecked: true, ...extra });
  const counts = () => Promise.all([admin.payment.count({ where: { gymId } }), admin.digitalClaim.count({ where: { gymId } }), admin.digitalSettlement.count({ where: { gymId } }), admin.membershipPeriod.count({ where: { gymId } }), admin.paymentReceipt.count({ where: { gymId } })]);
  await t.test("strict no-write rejection covers claims, partial amounts, protected fields and unauthorized tenants", async () => {
    const { charge } = await fixture(); const before = await counts();
    for (const extra of [{ fundsChecked: false }, { fundsChecked: undefined }, { provider: "Card" }, { transactionReference: "" }, { amount: "1e3" }, { amount: "800.001" }, { gymId }, { verifiedBy: staff.id }, { accountId: randomUUID() }]) {
      assert.equal((await POST(request(staffHeaders, body(charge.id, extra)))).status, 400);
    }
    for (const amount of ["799.99", "800.01"]) {
      const response = await POST(request(staffHeaders, body(charge.id, { amount })));
      assert.equal(response.status, 400); assert.equal(response.headers.get("payment-confirmation-outcome"), "not-confirmed");
    }
    assert.equal((await POST(request(new Headers(), body(charge.id)))).status, 401);
    assert.equal((await POST(request(owners[1], body(charge.id)))).status, 404);
    await setCapabilities(owners[0], staff.id, { canManageMembers: true, canCollectCash: false });
    assert.equal((await POST(request(staffHeaders, body(charge.id)))).status, 403);
    await setCapabilities(owners[0], staff.id, { canManageMembers: true, canCollectCash: true });
    assert.deepEqual(await counts(), before);
  });
  await t.test("all providers create one complete matched result; concurrent original-key retries survive price changes", async () => {
    for (const provider of ["GCash", "GoTyme", "MariBank"]) {
      const { member, charge } = await fixture(), key = randomUUID(); const input = body(charge.id, { provider });
      const results = await Promise.all([POST(request(staffHeaders, input, key)), POST(request(staffHeaders, input, key))]);
      assert.deepEqual(results.map(result => result.status), [200, 200]);
      const [first, retry] = await Promise.all(results.map(result => result.json()));
      assert.equal(first.payment.id, retry.payment.id); assert.equal(first.receipt.id, retry.receipt.id);
      assert.equal(first.payment.method, provider === "GCash" ? "GCASH" : "BANK");
      assert.equal(first.payment.collectedBy, staff.id); assert.equal(first.payment.verifiedBy, staff.id);
      assert.equal(await admin.payment.count({ where: { memberId: member.id } }), 1);
      assert.equal(await admin.memberQr.count({ where: { memberId: member.id, revokedAt: null } }), 1);
      const claim = await admin.digitalClaim.findUniqueOrThrow({ where: { chargeId: charge.id } });
      assert.equal((await admin.receivingAccount.findUniqueOrThrow({ where: { id: claim.accountId } })).label, `Enrollment: ${provider}`);
      assert.equal((await admin.digitalSettlement.findUniqueOrThrow({ where: { claimId: claim.id } })).paymentId, first.payment.id);
      assert.equal((await POST(request(staffHeaders, { ...input, transactionReference: "CHANGED" }, key))).status, 409);
      const changed = await changePlans(owners[0], { action: "update", planId: plan.id, version: (await admin.plan.findUniqueOrThrow({ where: { id: plan.id } })).version, price: "801.00" });
      assert.equal((await POST(request(staffHeaders, input, key))).status, 200);
      await changePlans(owners[0], { action: "update", planId: plan.id, version: changed[0].version, price: "800.00" });
      await assert.rejects(inGym(owners[0], "CASH", tx => tx.digitalClaim.update({ where: { id: claim.id }, data: { transactionReference: "REWRITE" } })));
      assert.equal(await inGym(owners[1], "MEMBERS", tx => tx.digitalClaim.findUnique({ where: { id: claim.id } })), null);
    }
  });
  await t.test("provider reference uniqueness serializes different members and method races produce only one payment", async () => {
    const a = await fixture(), b = await fixture(), reference = `SAME-${randomUUID()}`;
    const responses = await Promise.all([POST(request(staffHeaders, body(a.charge.id, { transactionReference: reference.toLowerCase() }))), POST(request(staffHeaders, body(b.charge.id, { transactionReference: reference })))]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    const mixed = await fixture();
    const outcomes = await Promise.allSettled([confirmCash(staffHeaders, mixed.charge.id, "800", randomUUID()), POST(request(staffHeaders, body(mixed.charge.id)))]);
    assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled" && (!(outcome.value instanceof Response) || outcome.value.status === 200)).length, 1);
    assert.equal(await admin.payment.count({ where: { memberId: mixed.member.id } }), 1);
  });
  await t.test("stale price/date and queued terms fail closed; DB failure rolls back every Online result", async () => {
    const stale = await fixture();
    const currentPlan = await admin.plan.findUniqueOrThrow({ where: { id: plan.id } });
    await changePlans(owners[0], { action: "update", planId: plan.id, version: currentPlan.version, price: "800.01" });
    assert.equal((await POST(request(staffHeaders, body(stale.charge.id)))).status, 409);
    await changePlans(owners[0], { action: "update", planId: plan.id, version: currentPlan.version + 1, price: "800.00" });
    const expired = await fixture();
    await confirmCash(owners[0], (await prepareCharge(owners[0], expired.member.id, plan.id)).id, "800", randomUUID());
    assert.equal((await POST(request(staffHeaders, body(expired.charge.id)))).status, 409);
    const advance = await prepareCharge(owners[0], expired.member.id, plan.id);
    assert.equal((await POST(request(staffHeaders, body(advance.id)))).status, 200);
    await assert.rejects(prepareCharge(owners[0], expired.member.id, plan.id), /future paid period/);
    const rollback = await fixture(), before = await counts();
    await admin.$executeRawUnsafe(`CREATE FUNCTION public.test_online_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.gym_id = '${gymId}'::uuid THEN RAISE EXCEPTION 'Synthetic receipt failure'; END IF; RETURN NEW; END $$`);
    await admin.$executeRawUnsafe("CREATE TRIGGER test_online_rollback BEFORE INSERT ON payment_receipts FOR EACH ROW EXECUTE FUNCTION public.test_online_rollback()");
    try {
      const response = await POST(request(staffHeaders, body(rollback.charge.id)));
      assert.equal(response.status, 500); assert.equal(response.headers.get("payment-confirmation-outcome"), null);
      assert.deepEqual(await counts(), before);
    } finally {
      await admin.$executeRawUnsafe("DROP TRIGGER test_online_rollback ON payment_receipts");
      await admin.$executeRawUnsafe("DROP FUNCTION public.test_online_rollback()");
    }
  });
  await t.test("completed retries still enforce revoked collection permission", async () => {
    const { charge } = await fixture(), input = body(charge.id), key = randomUUID();
    assert.equal((await POST(request(staffHeaders, input, key))).status, 200);
    await setCapabilities(owners[0], staff.id, { canManageMembers: true, canCollectCash: false });
    assert.equal((await POST(request(staffHeaders, input, key))).status, 403);
    assert.equal(onlineConfirmationSchema.safeParse({ ...input, fundsChecked: "true" }).success, false);
    const direct = await fixture(), now = new Date();
    const before = await counts();
    await assert.rejects(inGym(owners[0], "MEMBERS", async tx => {
      const account = await tx.receivingAccount.findUniqueOrThrow({ where: { gymId_label: { gymId, label: "Enrollment: GCash" } } });
      const claim = await tx.digitalClaim.create({ data: { gymId, chargeId: direct.charge.id, accountId: account.id, amountCentavos: 80000, transactionReference: randomUUID(), reportedReceivedAt: now, enteredAt: now, collectedBy: staff.id } });
      const payment = await tx.payment.create({ data: { gymId, memberId: direct.member.id, chargeId: direct.charge.id, amountCentavos: 80000, method: "GCASH", reference: randomUUID(), collectedBy: staff.id, verifiedBy: staff.id, collectedAt: now, verifiedAt: now, enteredAt: now } });
      await tx.digitalSettlement.create({ data: { gymId, claimId: claim.id, paymentId: payment.id, evidenceReference: claim.transactionReference, accountMatched: true } });
    }), /Digital settlement requires/);
    await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.payment.create({ data: { gymId, memberId: direct.member.id, chargeId: direct.charge.id, amountCentavos: 80000, method: "GCASH", reference: randomUUID(), collectedBy: staff.id, verifiedBy: staff.id, collectedAt: now, verifiedAt: now } })), /Digital payment requires/);
    assert.deepEqual(await counts(), before, "DB constraints roll back bypass attempts without evidence/authority");
  });
});
