import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { assertSynthetic, type EmailSender } from "../src/lib/email";
import { bootstrapSyntheticOwner, completeSetup, inviteStaff, reauthenticate, setCapabilities } from "../src/lib/identity";
import { inGym } from "../src/lib/tenant";
import { createMember } from "../src/lib/members";
import { prepareCharge, confirmCash } from "../src/lib/charges";
import { changePlans } from "../src/lib/plans";
import { assessEligibility } from "../src/lib/eligibility";
import { manilaDate } from "../src/lib/digital";
import { digitalCommandSchema } from "../src/lib/digital-schema";
import { POST, GET } from "../src/app/api/digital/route";

assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/gym_crm_synthetic");
}
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC" }) });
after(async () => { await db.$disconnect(); await admin.$disconnect(); });
const password = "Synthetic Digital Password 2026!"; const suffix = randomUUID().slice(0, 8);
let link = ""; const sender: EmailSender = { async send(message) { link = new URL(message.url).hash.slice(1); } };
async function login(identifier: string, mode = "email") {
  const response = await auth.handler(new Request(`http://127.0.0.1:3000/api/auth/sign-in/${mode}`, { method: "POST", headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" }, body: JSON.stringify({ [mode]: identifier, password }) }));
  assert.equal(response.status, 200); return new Headers({ cookie: response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ") });
}
function req(headers: Headers, body?: object, key?: string) {
  const h = new Headers(headers); h.set("origin", "http://127.0.0.1:3000"); h.set("content-type", "application/json"); if (key) h.set("idempotency-key", key);
  return new Request("http://127.0.0.1:3000/api/digital", { method: body ? "POST" : "GET", headers: h, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function ok(headers: Headers, body: object, key?: string) {
  const response = await POST(req(headers, body, key)); const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result;
}

test("S-03 real digital collection endpoints and PostgreSQL integrity", async t => {
  t.beforeEach(async () => { await admin.rateLimit.deleteMany(); });
  await admin.rateLimit.deleteMany();
  const gyms = [randomUUID(), randomUUID()]; const owners: Headers[] = [];
  for (const [i, gymId] of gyms.entries()) {
    const email = `digital-owner-${i}-${suffix}@example.test`;
    await bootstrapSyntheticOwner({ gymId, gymName: `Digital ${i}`, email, name: "Synthetic Digital Owner" }, sender, admin);
    await completeSetup(link, password); const headers = await login(email); await reauthenticate(headers, password); owners.push(headers);
  }
  const staff: { id: string; headers: Headers }[] = [];
  for (const name of ["collector", "verifier"]) {
    const username = `digital_${name}_${suffix}`;
    await inviteStaff(owners[0], { name: `Synthetic ${name}`, username, email: `${username}@example.test` }, sender);
    await completeSetup(link, password); const headers = await login(username, "username");
    const operator = await admin.operator.findFirstOrThrow({ where: { gymId: gyms[0], user: { username } } });
    await setCapabilities(owners[0], operator.id, { canManageMembers: true, canCollectCash: name === "collector" });
    staff.push({ id: operator.id, headers });
  }
  const [collector, verifier] = staff;
  await changePlans(owners[0], { action: "initialize" });
  const plan = await admin.plan.findFirstOrThrow({ where: { gymId: gyms[0], durationDays: 30 } });
  const accounts: Record<string, { id: string }> = {};
  for (const method of ["GCASH", "BANK"]) {
    accounts[method] = await ok(owners[0], { action: "account", label: `Synthetic ${method}`, method });
    await ok(owners[0], { action: "verifier", accountId: accounts[method].id, operatorId: verifier.id, active: true });
  }
  async function newClaim(method = "GCASH", amount = "800", options: { memberId?: string; at?: Date; durationDays?: number } = {}) {
    const member = options.memberId ? { id: options.memberId } : await createMember(owners[0], { fullName: `Digital Member ${randomUUID().slice(0, 8)}` });
    const chosenPlan = options.durationDays ? await admin.plan.findFirstOrThrow({ where: { gymId: gyms[0], durationDays: options.durationDays } }) : plan;
    const charge = await prepareCharge(collector.headers, member.id, chosenPlan.id);
    const at = options.at ?? new Date(Date.now() - 1000); const reference = `TRANSFER-${randomUUID()}`.toUpperCase();
    const command = { action: "claim", chargeId: charge.id, accountId: accounts[method].id, amount, transactionReference: reference, reportedReceivedAt: at.toISOString() };
    const claim = await ok(collector.headers, command);
    const confirmation = { action: "confirm", claimId: claim.id, accountId: accounts[method].id, amount, transactionReference: reference, receivedAt: at.toISOString(), accountMatched: true, evidenceReference: `ACTIVITY-${randomUUID()}` };
    return { member, charge, claim, command, confirmation };
  }
  const counts = async () => Promise.all([admin.payment.count({ where: { gymId: gyms[0] } }), admin.membershipPeriod.count({ where: { gymId: gyms[0] } }),
    admin.effectiveEntitlement.count({ where: { gymId: gyms[0] } }), admin.paymentReceipt.count({ where: { gymId: gyms[0] } }), admin.digitalSettlement.count({ where: { gymId: gyms[0] } }), admin.idempotencyOperation.count({ where: { gymId: gyms[0] } })]);
  async function pending(memberId: string) { assert.equal(await admin.payment.count({ where: { memberId } }), 0); assert.equal(await admin.effectiveEntitlement.count({ where: { memberId } }), 0); }

  await t.test("owner controls designations with fresh reauth; owners have no implicit verifier authority", async () => {
    const fixture = await newClaim();
    assert.equal((await POST(req(owners[0], fixture.confirmation, randomUUID()))).status, 403);
    assert.equal((await POST(req(collector.headers, { action: "account", label: "Denied", method: "BANK" }))).status, 403);
    assert.equal((await POST(req(collector.headers, { action: "verifier", accountId: accounts.GCASH.id, operatorId: collector.id, active: true }))).status, 403);
    const session = await auth.api.getSession({ headers: owners[0] });
    await admin.session.update({ where: { id: session!.session.id }, data: { reauthenticatedAt: new Date(0) } });
    assert.equal((await POST(req(owners[0], { action: "account", label: "Stale", method: "BANK" }))).status, 403);
    await reauthenticate(owners[0], password); await pending(fixture.member.id);
  });
  await t.test("GCash and bank claims grant no access; actual full funds create one linked receipt and exact period", async () => {
    for (const method of ["GCASH", "BANK"]) for (const [durationDays, amount] of [[30, "800"], [90, "2100"], [180, "4000"]] as const) {
      const fixture = await newClaim(method, amount, { durationDays }); await pending(fixture.member.id);
      assert.equal((await ok(collector.headers, fixture.command)).id, fixture.claim.id, "Exact lost claim response replay");
      const result = await ok(verifier.headers, fixture.confirmation, randomUUID());
      assert.equal(result.payment.method, method); assert.equal(result.payment.collectedBy, collector.id); assert.equal(result.payment.verifiedBy, verifier.id);
      assert.equal(result.payment.enteredAt, fixture.claim.enteredAt); assert.equal(result.payment.collectedAt, fixture.confirmation.receivedAt);
      assert.ok(result.payment.reference && result.receipt.id);
      assert.equal(result.period.startsAt, new Date(`${manilaDate(new Date())}T00:00:00+08:00`).toISOString());
      assert.equal(new Date(result.period.endsAt).getTime() - new Date(result.period.startsAt).getTime(), durationDays * 86400_000);
      const intervals = await admin.effectiveEntitlement.findMany({ where: { memberId: fixture.member.id } });
      assert.equal(assessEligibility(intervals, new Date()).status, "ELIGIBLE");
      assert.equal(assessEligibility(intervals, intervals[0].endsAt).status, "EXPIRED");
      const audit = await admin.identityAudit.findFirstOrThrow({ where: { subjectId: result.payment.id, action: "DIGITAL_FUNDS_CONFIRMED" } });
      assert.ok(audit.initiatorId);
    }
  });
  await t.test("screenshots, missing evidence, malformed and protected fields fail safely", async () => {
    const fixture = await newClaim(); const before = await counts();
    for (const patch of [{ accountMatched: false }, { evidenceReference: "" }, { evidenceReference: "https://secret?token=private" }, { gymId: gyms[1] }, { verifiedBy: collector.id }, { amount: "8e2" }, { receivedAt: "invalid" }, { screenshot: "only-proof" }]) {
      const response = await POST(req(verifier.headers, { ...fixture.confirmation, ...patch }, randomUUID()));
      assert.equal(response.status, 400); assert.equal(response.headers.get("digital-confirmation-outcome"), null);
      assert.ok(!(await response.text()).includes("only-proof"));
    }
    assert.equal((await POST(req(verifier.headers, fixture.confirmation))).status, 400);
    assert.deepEqual(await counts(), before); await pending(fixture.member.id);
    assert.equal(digitalCommandSchema.safeParse({ ...fixture.command, amount: 800 }).success, false);
  });
  await t.test("short claims, mismatched actual amount/account/reference remain pending", async () => {
    for (const patch of [{ amount: "799" }, { accountId: accounts.BANK.id }, { transactionReference: "WRONG" }]) {
      const fixture = await newClaim(); const before = await counts();
      const response = await POST(req(verifier.headers, { ...fixture.confirmation, ...patch }, randomUUID()));
      assert.equal(response.status, 400); assert.equal(response.headers.get("digital-confirmation-outcome"), "not-confirmed");
      assert.deepEqual(await counts(), before); await pending(fixture.member.id);
    }
    const fixture = await newClaim("GCASH", "799");
    assert.equal((await POST(req(verifier.headers, { ...fixture.confirmation, amount: "800" }, randomUUID()))).status, 400);
    await pending(fixture.member.id);
  });
  await t.test("unavailable and revoked verifiers cannot be bypassed; same cookie observes restored grant", async () => {
    const fixture = await newClaim(); const key = randomUUID();
    assert.equal((await POST(req(collector.headers, fixture.confirmation, key))).status, 403);
    await ok(owners[0], { action: "verifier", accountId: accounts.GCASH.id, operatorId: verifier.id, active: false });
    assert.equal((await POST(req(verifier.headers, fixture.confirmation, key))).status, 403);
    await pending(fixture.member.id);
    await ok(owners[0], { action: "verifier", accountId: accounts.GCASH.id, operatorId: verifier.id, active: true });
    const result = await ok(verifier.headers, fixture.confirmation, key);
    await ok(owners[0], { action: "verifier", accountId: accounts.GCASH.id, operatorId: verifier.id, active: false });
    const denied = await POST(req(verifier.headers, fixture.confirmation, key)); assert.equal(denied.status, 403); assert.equal(denied.headers.get("digital-confirmation-outcome"), null);
    await ok(owners[0], { action: "verifier", accountId: accounts.GCASH.id, operatorId: verifier.id, active: true });
    assert.equal((await ok(verifier.headers, fixture.confirmation, key)).payment.id, result.payment.id);
  });
  await t.test("cross-Manila-date and future confirmations stay pending without effective-date guesses", async () => {
    const old = new Date(Date.now() - 86400_000); const fixture = await newClaim("BANK", "800", { at: old });
    for (const receivedAt of [old.toISOString(), new Date().toISOString(), new Date(Date.now() + 86400_000).toISOString()]) {
      assert.equal((await POST(req(verifier.headers, { ...fixture.confirmation, receivedAt }, randomUUID()))).status, 409);
    }
    await pending(fixture.member.id);
    assert.equal(manilaDate(new Date("2026-10-25T15:59:59Z")), "2026-10-25");
    assert.equal(manilaDate(new Date("2026-10-25T16:00:00Z")), "2026-10-26");
  });
  await t.test("same-key concurrency and lost-response replay retain exactly one immutable result", async () => {
    const fixture = await newClaim(); const key = randomUUID(); const before = await counts();
    const responses = await Promise.all([0, 1].map(() => POST(req(verifier.headers, fixture.confirmation, key))));
    assert.deepEqual(responses.map(response => response.status), [200, 200]);
    const results = await Promise.all(responses.map(response => response.json())); assert.equal(results[0].payment.id, results[1].payment.id);
    assert.deepEqual(await counts(), before.map(count => count + 1));
    assert.equal((await ok(verifier.headers, { ...fixture.confirmation, amount: "800.00" }, key)).payment.id, results[0].payment.id);
    const conflict = await POST(req(verifier.headers, { ...fixture.confirmation, evidenceReference: "DIFFERENT" }, key));
    assert.equal(conflict.status, 409); assert.equal(conflict.headers.get("digital-confirmation-outcome"), null);
  });
  await t.test("distinct-key concurrent confirmation and duplicate transaction references cannot duplicate funds", async () => {
    const fixture = await newClaim(); const responses = await Promise.all([0, 1].map(() => POST(req(verifier.headers, fixture.confirmation, randomUUID()))));
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    assert.equal(await admin.payment.count({ where: { chargeId: fixture.charge.id } }), 1);
    const another = await newClaim();
    assert.equal((await POST(req(collector.headers, { ...another.command, transactionReference: fixture.command.transactionReference }))).status, 409);
    assert.equal((await POST(req(collector.headers, { ...fixture.command, amount: "799" }))).status, 409);
  });
  await t.test("failed settlement rolls back payment, period, projection, receipt, audit and operation; same-key retry succeeds", async () => {
    const fixture = await newClaim(); const before = await counts(); const key = randomUUID();
    const auditBefore = await admin.identityAudit.count({ where: { gymId: gyms[0], action: "DIGITAL_FUNDS_CONFIRMED" } });
    await admin.$executeRawUnsafe(`CREATE FUNCTION public.synthetic_digital_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.gym_id = '${gyms[0]}'::uuid THEN RAISE EXCEPTION 'synthetic rollback'; END IF; RETURN NEW; END $$`);
    try {
      await admin.$executeRawUnsafe("CREATE TRIGGER synthetic_digital_failure BEFORE INSERT ON digital_settlements FOR EACH ROW EXECUTE FUNCTION public.synthetic_digital_failure()");
      const response = await POST(req(verifier.headers, fixture.confirmation, key)); assert.equal(response.status, 500); assert.equal(response.headers.get("digital-confirmation-outcome"), null);
      assert.deepEqual(await counts(), before); assert.equal(await admin.identityAudit.count({ where: { gymId: gyms[0], action: "DIGITAL_FUNDS_CONFIRMED" } }), auditBefore);
    } finally { await admin.$executeRawUnsafe("DROP TRIGGER IF EXISTS synthetic_digital_failure ON digital_settlements"); await admin.$executeRawUnsafe("DROP FUNCTION public.synthetic_digital_failure()"); }
    await ok(verifier.headers, fixture.confirmation, key);
  });
  await t.test("disputed, reversed and absent funds append owner-review flags without rewriting history or access", async () => {
    const fixture = await newClaim("BANK"); const result = await ok(verifier.headers, fixture.confirmation, randomUUID());
    const before = await admin.payment.findUniqueOrThrow({ where: { id: result.payment.id } });
    const intervals = await admin.effectiveEntitlement.findMany({ where: { memberId: fixture.member.id } });
    for (const reason of ["DISPUTED", "REVERSED", "MISSING"]) {
      const flag = await ok(collector.headers, { action: "flag", paymentId: result.payment.id, reason });
      assert.equal((await ok(collector.headers, { action: "flag", paymentId: result.payment.id, reason })).id, flag.id);
    }
    assert.deepEqual(await admin.payment.findUniqueOrThrow({ where: { id: before.id } }), before);
    assert.deepEqual(await admin.effectiveEntitlement.findMany({ where: { memberId: fixture.member.id } }), intervals);
    const overview = await (await GET(req(owners[0]))).json(); assert.equal(overview.flags.filter((flag: { paymentId: string }) => flag.paymentId === before.id).length, 3);
    await assert.rejects(inGym(collector.headers, "MEMBERS", tx => tx.paymentFlag.deleteMany({ where: { paymentId: before.id } })));
  });
  await t.test("a pending renewal preserves existing paid access, then confirmed digital renewal preserves adjacency", async () => {
    const member = await createMember(owners[0], { fullName: `Cash Then Digital ${suffix}` });
    const cashCharge = await prepareCharge(collector.headers, member.id, plan.id); const cash = await confirmCash(collector.headers, cashCharge.id, "800", randomUUID());
    const fixture = await newClaim("GCASH", "800", { memberId: member.id });
    let intervals = await admin.effectiveEntitlement.findMany({ where: { memberId: member.id } });
    assert.equal(intervals.length, 1); assert.equal(assessEligibility(intervals, new Date()).status, "ELIGIBLE");
    const result = await ok(verifier.headers, fixture.confirmation, randomUUID());
    assert.equal(result.period.startsAt, cash.period.endsAt.toISOString());
    intervals = await admin.effectiveEntitlement.findMany({ where: { memberId: member.id } }); assert.equal(intervals.length, 2);
    assert.deepEqual(await admin.membershipPeriod.findUniqueOrThrow({ where: { id: cash.period.id } }), cash.period);
    await assert.rejects(prepareCharge(collector.headers, member.id, plan.id), /future paid period/);
  });
  await t.test("all digital tables enforce RLS and immutable least privilege; direct cross-gym API and FK references fail", async () => {
    const fixture = await newClaim();
    assert.equal((await GET(req(new Headers()))).status, 401);
    assert.equal((await POST(req(owners[1], fixture.confirmation, randomUUID()))).status, 404);
    const foreign = await ok(owners[1], { action: "account", label: "Other Gym", method: "BANK" });
    assert.equal((await POST(req(owners[0], { action: "verifier", accountId: foreign.id, operatorId: verifier.id, active: true }))).status, 404);
    assert.equal((await POST(req(collector.headers, { ...fixture.command, accountId: foreign.id }))).status, 404);
    assert.equal((await (await GET(req(owners[1]))).json()).claims.length, 0);
    const tables = ["receiving_accounts", "digital_verifiers", "digital_claims", "digital_settlements", "payment_flags"];
    const policies = await db.$queryRaw<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = ANY(${tables}::text[])`;
    assert.equal(policies.length, 5); for (const row of policies) { assert.ok(row.relrowsecurity); assert.ok(row.relforcerowsecurity); }
    assert.deepEqual(await Promise.all([db.digitalClaim.count(), db.receivingAccount.count(), db.digitalVerifier.count(), db.digitalSettlement.count(), db.paymentFlag.count()]), [0, 0, 0, 0, 0]);
    assert.equal(await inGym(owners[1], "MEMBERS", tx => tx.digitalClaim.count({ where: { id: fixture.claim.id } })), 0);
    await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.digitalClaim.update({ where: { id: fixture.claim.id }, data: { amountCentavos: 1 } })));
    await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.digitalVerifier.update({ where: { accountId_operatorId: { accountId: accounts.GCASH.id, operatorId: verifier.id } }, data: { operatorId: collector.id } })));
    const member = await createMember(owners[0], { fullName: `Foreign Reference ${suffix}` });
    const charge = await prepareCharge(owners[0], member.id, plan.id);
    await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.digitalClaim.create({ data: { gymId: gyms[0], chargeId: charge.id, accountId: foreign.id, amountCentavos: 80000, transactionReference: "FK-NEGATIVE", collectedBy: collector.id, reportedReceivedAt: new Date() } })), /Foreign key constraint/);
    // Both tenants and missing context reuse the same single-connection pool.
    const pooled = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) });
    try { for (const gymId of gyms) { await pooled.$transaction(async tx => { await tx.$executeRaw`SELECT set_config('app.current_gym_id', ${gymId}, true)`; const rows = await tx.digitalClaim.findMany(); assert.ok(rows.every(row => row.gymId === gymId)); }); assert.equal(await pooled.digitalClaim.count(), 0); } }
    finally { await pooled.$disconnect(); }
  });
  await t.test("database rejects a digital payment missing matched settlement at commit", async () => {
    const fixture = await newClaim(); const before = await counts();
    await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.payment.create({ data: { gymId: gyms[0], memberId: fixture.member.id, chargeId: fixture.charge.id,
      method: "GCASH", amountCentavos: 80000, reference: `INVALID-${randomUUID()}`, collectedBy: collector.id, collectedAt: new Date(), verifiedBy: verifier.id } })));
    assert.deepEqual(await counts(), before);
  });
  await t.test("competing claims for one member serialize and recheck reviewed dates", async () => {
    const first = await newClaim(); const second = await newClaim("BANK", "800", { memberId: first.member.id });
    const before = await counts();
    const results = await Promise.all([first, second].map(fixture => POST(req(verifier.headers, fixture.confirmation, randomUUID()))));
    assert.deepEqual(results.map(response => response.status).sort(), [200, 409]);
    assert.deepEqual(await counts(), before.map(count => count + 1));
  });
  await t.test("database evidence guard rejects unauthorized verifiers, wrong entry attribution and cross-date funds", async () => {
    const fixture = await newClaim(); const before = await counts();
    for (const patch of [{ verifiedBy: collector.id }, { enteredAt: new Date(0) }, { collectedAt: new Date(Date.now() - 86400_000) }]) {
      await assert.rejects(inGym(owners[0], "MEMBERS", async tx => {
        const payment = await tx.payment.create({ data: { gymId: gyms[0], memberId: fixture.member.id, chargeId: fixture.charge.id,
          method: "GCASH", amountCentavos: 80000, reference: `INVALID-EVIDENCE-${randomUUID()}`, collectedBy: collector.id,
          collectedAt: new Date(fixture.confirmation.receivedAt), enteredAt: new Date(fixture.claim.enteredAt), verifiedAt: new Date(), verifiedBy: verifier.id, ...patch } });
        await tx.digitalSettlement.create({ data: { gymId: gyms[0], claimId: fixture.claim.id, paymentId: payment.id, evidenceReference: "GUARD-NEGATIVE", accountMatched: true } });
      }), /Digital settlement requires/);
      assert.deepEqual(await counts(), before);
    }
  });
  await t.test("gym lock makes a committed verifier revocation win over a waiting confirmation", async () => {
    const fixture = await newClaim();
    let unlock!: () => void; let locked!: () => void;
    const release = new Promise<void>(resolve => { unlock = resolve; }); const acquired = new Promise<void>(resolve => { locked = resolve; });
    const holder = db.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('app.current_gym_id', ${gyms[0]}, true)`;
      await tx.$queryRaw`SELECT id FROM gyms WHERE id = ${gyms[0]}::uuid FOR UPDATE`;
      await tx.digitalVerifier.update({ where: { accountId_operatorId: { accountId: accounts.GCASH.id, operatorId: verifier.id } }, data: { active: false } });
      locked(); await release;
    });
    await acquired;
    const confirmation = POST(req(verifier.headers, fixture.confirmation, randomUUID()));
    try {
      let observed = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const waiting = await admin.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE datname = current_database() AND usename = 'gym_runtime' AND wait_event_type = 'Lock' AND query LIKE '%FROM gyms%FOR SHARE%'`;
        if (waiting[0].count > 0) { observed = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.ok(observed, "Confirmation must reach the held PostgreSQL gym lock before revocation commits");
    } finally { unlock(); await holder; }
    assert.equal((await confirmation).status, 403); await pending(fixture.member.id);
    await ok(owners[0], { action: "verifier", accountId: accounts.GCASH.id, operatorId: verifier.id, active: true });
  });
  await t.test("catalogue changes block pending stale claims but never obstruct committed-key recovery", async () => {
    const confirmed = await newClaim(); const key = randomUUID();
    const result = await ok(verifier.headers, confirmed.confirmation, key);
    const waiting = await newClaim();
    const current = await admin.plan.findUniqueOrThrow({ where: { id: plan.id } });
    await changePlans(owners[0], { action: "update", planId: plan.id, price: "801", version: current.version });
    try {
      assert.equal((await POST(req(verifier.headers, waiting.confirmation, randomUUID()))).status, 409);
      await pending(waiting.member.id);
      assert.equal((await ok(verifier.headers, confirmed.confirmation, key)).payment.id, result.payment.id);
      assert.equal((await admin.charge.findUniqueOrThrow({ where: { id: confirmed.charge.id } })).priceCentavos, 80000);
    } finally {
      const changed = await admin.plan.findUniqueOrThrow({ where: { id: plan.id } });
      await changePlans(owners[0], { action: "update", planId: plan.id, price: "800", version: changed.version });
    }
  });
});
