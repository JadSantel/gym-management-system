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
import { setGymContext } from "../src/lib/binding";
import { createMember } from "../src/lib/members";
import { prepareCharge, confirmCash } from "../src/lib/charges";
import { changePlans } from "../src/lib/plans";
import { assessEligibility } from "../src/lib/eligibility";
import { manilaDate } from "../src/lib/digital";
import { digitalCommand } from "../src/lib/digital";
import { investigationCommandSchema, historyQuerySchema } from "../src/lib/investigation-schema";
import { GET, POST } from "../src/app/api/investigations/route";

assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/gym_crm_synthetic");
}
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC" }) });
const pooled = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1, options: "-c timezone=UTC" }) });
after(async () => { await db.$disconnect(); await admin.$disconnect(); await pooled.$disconnect(); });
const password = "Synthetic Investigation Password 2026!"; const suffix = randomUUID().slice(0, 8);
let link = ""; const sender: EmailSender = { async send(message) { link = new URL(message.url).hash.slice(1); } };
async function login(identifier: string, mode = "email") {
  const response = await auth.handler(new Request(`http://127.0.0.1:3000/api/auth/sign-in/${mode}`, { method: "POST", headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" }, body: JSON.stringify({ [mode]: identifier, password }) }));
  assert.equal(response.status, 200); return new Headers({ cookie: response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ") });
}
function req(headers: Headers, body?: object, key = randomUUID(), query = "") {
  const h = new Headers(headers); h.set("origin", "http://127.0.0.1:3000"); h.set("content-type", "application/json"); h.set("idempotency-key", key);
  return new Request(`http://127.0.0.1:3000/api/investigations${query}`, { method: body ? "POST" : "GET", headers: h, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function ok(headers: Headers, body: object, key = randomUUID()) {
  const response = await POST(req(headers, body, key)); const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result;
}
async function read(headers: Headers, query: string) {
  const response = await GET(req(headers, undefined, randomUUID(), query)); const result = await response.json(); assert.equal(response.status, 200); return result;
}

test("S-04 append-only investigations, owner reviews and enforced policy gates on real PostgreSQL", async t => {
  t.beforeEach(async () => { await admin.rateLimit.deleteMany(); }); await admin.rateLimit.deleteMany();
  const gyms = [randomUUID(), randomUUID()]; const owners: Headers[] = [];
  for (const [i, gymId] of gyms.entries()) {
    const email = `case-owner-${i}-${suffix}@example.test`;
    await bootstrapSyntheticOwner({ gymId, gymName: `Cases ${i}`, email, name: `Case owner ${i}` }, sender, admin);
    await completeSetup(link, password); const headers = await login(email); await reauthenticate(headers, password); owners.push(headers);
  }
  const username = `investigator_${suffix}`;
  await inviteStaff(owners[0], { name: "Synthetic case reporter", username, email: `${username}@example.test` }, sender);
  await completeSetup(link, password); const staff = await login(username, "username");
  const operator = await admin.operator.findFirstOrThrow({ where: { gymId: gyms[0], user: { username } } });
  await setCapabilities(owners[0], operator.id, { canManageMembers: true, canCollectCash: true });
  await changePlans(owners[0], { action: "initialize" });
  const plan = await admin.plan.findFirstOrThrow({ where: { gymId: gyms[0], durationDays: 30 } });
  const member = await createMember(owners[0], { fullName: `Case member ${suffix}` });
  const foreignMember = await createMember(owners[1], { fullName: `Foreign case member ${suffix}` });
  const first = await confirmCash(staff, (await prepareCharge(staff, member.id, plan.id)).id, "800", randomUUID());
  const second = await confirmCash(owners[0], (await prepareCharge(owners[0], member.id, plan.id)).id, "800", randomUUID());
  const open = (patch = {}) => ({ action: "open", memberId: member.id, reason: "MISSING_PAYMENT", summary: "Verbal claim only", method: "UNKNOWN", ...patch });
  async function revision(caseId: string) { return (await admin.investigationEvent.findFirstOrThrow({ where: { caseId }, orderBy: { revision: "desc" } })).revision; }
  const event = async (caseId: string, patch = {}) => ({ caseId, expectedRevision: await revision(caseId), reasoning: "Compared independent synthetic references", evidenceReference: "CASE-EVIDENCE-001", ...patch });
  const proposal = async (caseId: string, patch = {}) => event(caseId, { action: "request", reason: "INCORRECT_ENTRY", paymentId: first.payment.id,
    periodId: first.period.id, collectionCount: "UNKNOWN", amount: "0.00", method: "CASH", moneyOutcome: "NO_MOVEMENT", accessOutcome: "STAYS", effectiveAt: new Date().toISOString(), ...patch });
  const originals = async () => ({ payments: await admin.payment.findMany({ where: { memberId: member.id }, orderBy: { id: "asc" } }), periods: await admin.membershipPeriod.findMany({ where: { memberId: member.id }, orderBy: { id: "asc" } }),
    intervals: await admin.effectiveEntitlement.findMany({ where: { memberId: member.id }, orderBy: { id: "asc" } }), receipts: await admin.paymentReceipt.findMany({ where: { paymentId: { in: [first.payment.id, second.payment.id] } }, orderBy: { id: "asc" } }) });
  const initial = await originals();

  await t.test("history filters combine member, payment/receipt, PHT date, method and collector", async () => {
    const query = new URLSearchParams({ member: suffix, reference: first.receipt.reference.toLowerCase(), date: manilaDate(first.payment.collectedAt), method: "CASH", collectorId: operator.id });
    const result = await read(staff, `?${query}`); assert.equal(result.payments.length, 1); assert.equal(result.payments[0].id, first.payment.id);
    assert.equal((await read(staff, `?reference=${first.payment.reference}`)).payments[0].id, first.payment.id);
    for (const patch of [{ method: "BANK" }, { date: "2000-01-01" }, { member: "No matching member" }]) {
      const mismatch = new URLSearchParams(query); for (const [key, value] of Object.entries(patch)) mismatch.set(key, value!);
      assert.equal((await read(staff, `?${mismatch}`)).payments.length, 0);
    }
    assert.equal((await read(owners[1], `?reference=${first.payment.reference}`)).payments.length, 0);
    assert.equal((await GET(req(staff, undefined, randomUUID(), "?date=2026-02-30"))).status, 400);
    assert.equal((await GET(req(staff, undefined, randomUUID(), "?gymId=invalid"))).status, 400);
    assert.equal(historyQuerySchema.safeParse({ date: ["2026-10-25"] }).success, false);
  });
  await t.test("digital account reference search finds the confirmed transfer", async () => {
    const digitalMember = await createMember(owners[0], { fullName: `Digital case ${suffix}` });
    const account = await digitalCommand(owners[0], { action: "account", method: "BANK", label: `Case bank ${suffix}` });
    assert.ok("id" in account);
    await digitalCommand(owners[0], { action: "verifier", accountId: account.id, operatorId: operator.id, active: true });
    const charge = await prepareCharge(staff, digitalMember.id, plan.id); const at = new Date().toISOString();
    const claim = await digitalCommand(staff, { action: "claim", chargeId: charge.id, accountId: account.id, amount: "800", transactionReference: `CASE-TRANSFER-${suffix}`, reportedReceivedAt: at });
    assert.ok("id" in claim);
    const result = await digitalCommand(staff, { action: "confirm", claimId: claim.id, accountId: account.id, amount: "800", transactionReference: `CASE-TRANSFER-${suffix}`, receivedAt: at, accountMatched: true, evidenceReference: "ACTIVITY-CASE-01" }, randomUUID());
    assert.ok("payment" in result);
    const rows = await read(staff, `?reference=case-transfer-${suffix}&method=BANK`); assert.equal(rows.payments.length, 1); assert.equal(rows.payments[0].id, result.payment.id);
  });
  await t.test("collection-date search includes Manila midnight and excludes the next midnight", async () => {
    // Historical synthetic fixtures, not an application recovery/backdating command.
    for (const [index, instant] of ["2025-12-31T15:59:59.999Z", "2025-12-31T16:00:00.000Z", "2026-01-01T15:59:59.999Z", "2026-01-01T16:00:00.000Z"].entries()) {
      await admin.$transaction(async tx => {
        const fixture = await tx.member.create({ data: { gymId: gyms[0], fullName: `Date fixture ${index} ${suffix}`, nameKey: randomUUID(), createdBy: operator.id } });
        const startsAt = new Date(instant); const endsAt = new Date(startsAt.getTime() + 30 * 86_400_000);
        const charge = await tx.charge.create({ data: { gymId: gyms[0], memberId: fixture.id, planId: plan.id, planName: plan.name, durationDays: 30, priceCentavos: 80000, planVersion: plan.version, preparedBy: operator.id, intendedStart: startsAt, intendedEnd: endsAt } });
        const payment = await tx.payment.create({ data: { gymId: gyms[0], memberId: fixture.id, chargeId: charge.id, reference: `DATE-${suffix}-${index}`, amountCentavos: 80000, collectedBy: operator.id, collectedAt: startsAt, verifiedBy: operator.id, verifiedAt: startsAt } });
        const period = await tx.membershipPeriod.create({ data: { gymId: gyms[0], memberId: fixture.id, paymentId: payment.id, confirmedBy: operator.id, startsAt, endsAt } });
        await tx.effectiveEntitlement.create({ data: { gymId: gyms[0], memberId: fixture.id, periodId: period.id, startsAt, endsAt } });
        await tx.paymentReceipt.create({ data: { gymId: gyms[0], paymentId: payment.id, reference: `DATE-RECEIPT-${suffix}-${index}` } });
      });
    }
    const rows = await read(staff, `?date=2026-01-01&reference=DATE-${suffix}`);
    assert.deepEqual(rows.payments.map((row: { reference: string }) => row.reference), [`DATE-${suffix}-2`, `DATE-${suffix}-1`]);
  });
  await t.test("verbal and screenshot-only claims persist and escalate without payment or access", async () => {
    const unpaid = await createMember(staff, { fullName: `Unpaid case ${suffix}` });
    for (const summary of ["Verbal payment claim", "Screenshot only, no account verification"]) {
      const created = await ok(staff, open({ memberId: unpaid.id, summary, originalCollectedAt: "2026-01-01T10:00:00+08:00", claimedAmount: "800", method: "GCASH" }));
      assert.equal(created.outcome, "OPEN");
      const escalated = await ok(staff, await event(created.caseId, { action: "escalate" })); assert.equal(escalated.outcome, "ESCALATED");
      const detail = await read(staff, `?caseId=${created.caseId}`); assert.equal(detail.events.length, 2);
      assert.equal(detail.record.originalCollectedAt, "2026-01-01T02:00:00.000Z"); assert.equal(detail.record.openedBy, operator.id);
      for (const action of ["recover", "execute"]) {
        const response = await POST(req(action === "execute" ? owners[0] : staff, { action, caseId: created.caseId }));
        assert.equal(response.status, action === "recover" ? 400 : 409);
      }
    }
    assert.equal(await admin.payment.count({ where: { memberId: unpaid.id } }), 0);
    assert.equal(assessEligibility(await admin.effectiveEntitlement.findMany({ where: { memberId: unpaid.id } }), new Date()).status, "NOT_ELIGIBLE");
  });
  await t.test("case creation, transaction matching and notes survive exact and concurrent retries", async () => {
    const command = open(); const key = randomUUID();
    const results = await Promise.all([ok(staff, command, key), ok(staff, command, key)]); assert.equal(results[0].id, results[1].id);
    assert.equal(await admin.investigationCase.count({ where: { id: results[0].caseId } }), 1);
    const match = await event(results[0].caseId, { action: "link", paymentId: first.payment.id }); const matchKey = randomUUID();
    const matched = await Promise.all([ok(staff, match, matchKey), ok(staff, match, matchKey)]); assert.equal(matched[0].id, matched[1].id); assert.equal(matched[0].outcome, "MATCHED");
    assert.equal((await ok(staff, match, matchKey)).id, matched[0].id, "Replay works with old revision after commit");
    const conflict = await POST(req(staff, { ...match, paymentId: second.payment.id }, matchKey)); assert.equal(conflict.status, 409); assert.equal(conflict.headers.get("case-command-outcome"), null);
    const note = await event(results[0].caseId, { action: "note" });
    const competing = await Promise.all([POST(req(staff, note)), POST(req(staff, { ...note, reasoning: "Independent concurrent note" }))]);
    assert.deepEqual(competing.map(response => response.status).sort(), [200, 409]);
    assert.equal(await admin.investigationEvent.count({ where: { caseId: results[0].caseId } }), 3);
  });
  await t.test("classified requests require explicit financial, access and affected-period fields", async () => {
    const created = await ok(staff, open()); const command = await proposal(created.caseId);
    for (const field of ["evidenceReference", "reason", "amount", "method", "moneyOutcome", "accessOutcome", "effectiveAt", "periodId"]) {
      const missing = { ...command }; delete missing[field as keyof typeof missing];
      assert.equal((await POST(req(staff, missing))).status, 400, field);
    }
    for (const patch of [{ periodId: second.period.id }, { moneyOutcome: "REFUND_PROPOSED" }, { amount: "1" }, { retainedPeriodId: second.period.id }, { reason: "MISSING_PAYMENT" }]) assert.equal((await POST(req(staff, { ...command, ...patch }))).status, 400);
    const requested = await ok(staff, command); assert.equal(requested.amountCentavos, 0); assert.equal(requested.outcome, "OWNER_REVIEW");
    assert.equal((await POST(req(staff, { action: "execute", caseId: created.caseId }))).status, 403);
    assert.equal((await POST(req(owners[0], { action: "execute", caseId: created.caseId }))).status, 409);
  });
  await t.test("one collection with duplicate records cannot propose refund of nonexistent funds; unproven excess requests remain gated", async () => {
    const created = await ok(staff, open({ reason: "DUPLICATE_RECORD" }));
    const duplicate = await proposal(created.caseId, { reason: "DUPLICATE_RECORD", collectionCount: "ONE", relatedPaymentId: second.payment.id, retainedPeriodId: second.period.id, accessOutcome: "ENDS" });
    for (const patch of [{ amount: "800", moneyOutcome: "REFUND_PROPOSED" }, { collectionCount: "TWO" }, { relatedPaymentId: first.payment.id }]) assert.equal((await POST(req(staff, { ...duplicate, ...patch }))).status, 400);
    const requested = await ok(staff, duplicate); assert.equal(requested.moneyOutcome, "NO_MOVEMENT"); assert.equal(requested.amountCentavos, 0);
    const excess = await proposal(created.caseId, { reason: "TWO_COLLECTIONS", collectionCount: "TWO", relatedPaymentId: second.payment.id, amount: "800", moneyOutcome: "REFUND_PROPOSED", accessOutcome: "ADJUSTS" });
    const excessEvent = await ok(staff, excess); assert.equal(excessEvent.amountCentavos, 80000);
    const review = await event(created.caseId, { action: "review", requestEventId: excessEvent.id, decision: "APPROVE" }); const key = randomUUID();
    const approval = await ok(owners[0], review, key); assert.equal(approval.outcome, "APPROVED_BLOCKED");
    assert.equal((await ok(owners[0], review, key)).id, approval.id);
    const execute = await POST(req(owners[0], { action: "execute", caseId: created.caseId })); assert.equal(execute.status, 409); assert.match((await execute.json()).error, /cancellation/);
    const repeated = await POST(req(owners[0], await event(created.caseId, { action: "review", requestEventId: excessEvent.id, decision: "APPROVE" })));
    assert.equal(repeated.status, 409); assert.equal(repeated.headers.get("case-command-outcome"), "not-recorded");
    assert.deepEqual(await originals(), initial);
  });
  await t.test("owner reviews require current role and fresh reauthentication, bind the exact request and remain append-only", async () => {
    const created = await ok(staff, open()); const requested = await ok(staff, await proposal(created.caseId));
    const review = await event(created.caseId, { action: "review", requestEventId: requested.id, decision: "REJECT" });
    assert.equal((await POST(req(staff, review))).status, 403);
    const session = await auth.api.getSession({ headers: owners[0] });
    await admin.session.update({ where: { id: session!.session.id }, data: { reauthenticatedAt: new Date(0) } });
    assert.equal((await POST(req(owners[0], review))).status, 403);
    await reauthenticate(owners[0], password);
    assert.equal((await ok(owners[0], review)).outcome, "REJECTED");
    assert.equal((await POST(req(owners[0], { ...await event(created.caseId, { action: "review", requestEventId: requested.id, decision: "APPROVE" }) }))).status, 409);
    const other = await ok(staff, open());
    assert.equal((await POST(req(owners[0], await event(other.caseId, { action: "review", requestEventId: requested.id, decision: "APPROVE" })))).status, 404);
    assert.deepEqual(await originals(), initial);
  });
  await t.test("concurrent requests and owner decisions each append once, with authorization rechecked on recovery", async () => {
    const created = await ok(staff, open()); const request = await proposal(created.caseId); const requestKey = randomUUID();
    const requested = await Promise.all([ok(staff, request, requestKey), ok(staff, request, requestKey)]); assert.equal(requested[0].id, requested[1].id);
    const review = await event(created.caseId, { action: "review", requestEventId: requested[0].id, decision: "APPROVE" }); const reviewKey = randomUUID();
    const reviewed = await Promise.all([ok(owners[0], review, reviewKey), ok(owners[0], review, reviewKey)]); assert.equal(reviewed[0].id, reviewed[1].id);
    assert.equal(await admin.investigationEvent.count({ where: { caseId: created.caseId } }), 3);
    await setCapabilities(owners[0], operator.id, { canManageMembers: false, canCollectCash: true });
    assert.equal((await POST(req(staff, request, requestKey))).status, 403);
    await setCapabilities(owners[0], operator.id, { canManageMembers: true, canCollectCash: true });
    assert.equal((await ok(staff, request, requestKey)).id, requested[0].id);
    assert.deepEqual(await originals(), initial);
  });
  await t.test("cross-gym/member references, protected fields and unauthorized or revoked accounts fail", async () => {
    const created = await ok(staff, open());
    assert.equal((await GET(req(owners[1], undefined, randomUUID(), `?caseId=${created.caseId}`))).status, 404);
    assert.equal((await POST(req(owners[1], await event(created.caseId, { action: "note" })))).status, 404);
    assert.equal((await POST(req(staff, open({ memberId: foreignMember.id })))).status, 404);
    const foreignCase = await ok(owners[1], open({ memberId: foreignMember.id }));
    assert.equal((await POST(req(owners[1], await event(foreignCase.caseId, { action: "link", paymentId: first.payment.id })))).status, 404);
    const other = await createMember(staff, { fullName: `Other case ${suffix}` }); const otherCase = await ok(staff, open({ memberId: other.id }));
    assert.equal((await POST(req(staff, await event(otherCase.caseId, { action: "link", paymentId: first.payment.id })))).status, 404);
    for (const patch of [{ gymId: gyms[1] }, { actorId: operator.id }, { outcome: "MATCHED" }, { evidenceReference: "https://secret?token=private" }, { evidenceReference: "https://example.test" }, { originalCollectedAt: "invalid" }, { claimedAmount: "8e2" }]) {
      const response = await POST(req(staff, open(patch))); assert.equal(response.status, 400); assert.ok(!(await response.text()).includes("private"));
    }
    assert.equal(investigationCommandSchema.safeParse(open({ claimedAmount: 800 })).success, false);
    assert.equal((await POST(req(new Headers(), open()))).status, 401);
    await setCapabilities(owners[0], operator.id, { canManageMembers: false, canCollectCash: true });
    assert.equal((await POST(req(staff, open()))).status, 403); assert.equal((await GET(req(staff))).status, 403);
    await setCapabilities(owners[0], operator.id, { canManageMembers: true, canCollectCash: true });
  });
  await t.test("failed audit rolls back both case and event; original operation safely retries", async () => {
    const before = [await admin.investigationCase.count({ where: { gymId: gyms[0] } }), await admin.investigationEvent.count({ where: { gymId: gyms[0] } })];
    await admin.$executeRawUnsafe(`CREATE FUNCTION public.synthetic_case_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.gym_id = '${gyms[0]}'::uuid AND NEW.action = 'INVESTIGATION_OPENED' THEN RAISE EXCEPTION 'synthetic rollback'; END IF; RETURN NEW; END $$`);
    const command = open(); const key = randomUUID();
    try {
      await admin.$executeRawUnsafe("CREATE TRIGGER synthetic_case_failure BEFORE INSERT ON identity_audit FOR EACH ROW EXECUTE FUNCTION public.synthetic_case_failure()");
      const response = await POST(req(staff, command, key)); assert.equal(response.status, 500); assert.equal(response.headers.get("case-command-outcome"), null);
      assert.deepEqual([await admin.investigationCase.count({ where: { gymId: gyms[0] } }), await admin.investigationEvent.count({ where: { gymId: gyms[0] } })], before);
    } finally { await admin.$executeRawUnsafe("DROP TRIGGER IF EXISTS synthetic_case_failure ON identity_audit"); await admin.$executeRawUnsafe("DROP FUNCTION public.synthetic_case_failure()"); }
    await ok(staff, command, key);
  });
  await t.test("owner-only independent cash recovery preserves original dates, receipts and retry safety", async () => {
    const unpaid = await createMember(staff, { fullName: `Recovery ${suffix}` });
    const created = await ok(staff, open({ memberId: unpaid.id, method: "CASH", claimedAmount: "800", originalCollectedAt: "2024-02-29T12:00:00+08:00" }));
    const approval = await event(created.caseId, { action: "approveRecovery", planId: plan.id, collectorId: operator.id,
      independentEvidenceReference: "CASH-BOOK-02", independentlyVerified: true, originalDateVerified: true, omittedPaymentVerified: true });
    assert.equal((await POST(req(staff, approval))).status, 403);
    for (const patch of [{ independentlyVerified: false }, { originalDateVerified: false }, { independentEvidenceReference: "CASE-EVIDENCE-001" }]) {
      assert.equal((await POST(req(owners[0], { ...approval, ...patch }))).status, 400);
    }
    const accepted = await ok(owners[0], approval); assert.equal(accepted.outcome, "APPROVED");
    assert.equal(await admin.payment.count({ where: { memberId: unpaid.id } }), 0, "Approval creates no payment");
    const command = await event(created.caseId, { action: "recover", approvalEventId: accepted.id }); const key = randomUUID();
    assert.equal((await POST(req(staff, command))).status, 403);
    assert.equal((await POST(req(owners[1], command))).status, 404);
    const results = await Promise.all([ok(owners[0], command, key), ok(owners[0], command, key)]);
    assert.equal(results[0].id, results[1].id); assert.equal(results[0].outcome, "RECOVERED");
    assert.equal((await ok(owners[0], command, key)).id, results[0].id);
    const recovered = await admin.payment.findUniqueOrThrow({ where: { id: results[0].paymentId }, include: { period: true, receipt: true } });
    assert.equal(recovered.collectedAt.toISOString(), "2024-02-29T04:00:00.000Z");
    assert.equal(recovered.period!.startsAt.toISOString(), "2024-02-28T16:00:00.000Z");
    assert.equal(recovered.period!.endsAt.toISOString(), "2024-03-29T16:00:00.000Z");
    assert.ok(recovered.enteredAt > recovered.collectedAt); assert.ok(recovered.verifiedAt > recovered.collectedAt); assert.ok(recovered.receipt);
    assert.equal(await admin.payment.count({ where: { memberId: unpaid.id } }), 1);
    assert.equal((await POST(req(owners[0], await event(created.caseId, { action: "recover", approvalEventId: accepted.id })))).status, 409);
    const duplicateMember = await createMember(staff, { fullName: `Duplicate source ${suffix}` });
    const duplicateCase = await ok(staff, open({ memberId: duplicateMember.id, method: "CASH", claimedAmount: "800", originalCollectedAt: "2024-02-29T12:00:00+08:00" }));
    const duplicateApproval = await ok(owners[0], { ...approval, caseId: duplicateCase.caseId, expectedRevision: 1 });
    assert.equal((await POST(req(owners[0], await event(duplicateCase.caseId, { action: "recover", approvalEventId: duplicateApproval.id })))).status, 409);
    assert.equal(await admin.payment.count({ where: { memberId: duplicateMember.id } }), 0, "Same original collection reference cannot be recovered in another case");
  });
  await t.test("uncertain, digital, matched and conflicting recovered dates reject without financial writes", async () => {
    for (const patch of [{ method: "UNKNOWN" }, { method: "GCASH" }, { originalCollectedAt: undefined }]) {
      const created = await ok(staff, open({ ...patch, claimedAmount: "800", originalCollectedAt: "2026-01-01T10:00:00+08:00", ...patch }));
      const response = await POST(req(owners[0], await event(created.caseId, { action: "approveRecovery", planId: plan.id, collectorId: operator.id,
        independentEvidenceReference: "OTHER-BOOK-01", independentlyVerified: true, originalDateVerified: true, omittedPaymentVerified: true })));
      assert.equal(response.status, 409);
    }
    const created = await ok(staff, open({ method: "CASH", claimedAmount: "800", originalCollectedAt: first.payment.collectedAt.toISOString() }));
    assert.equal((await POST(req(owners[0], await event(created.caseId, { action: "approveRecovery", planId: plan.id, collectorId: operator.id,
      independentEvidenceReference: "OTHER-BOOK-02", independentlyVerified: true, originalDateVerified: true, omittedPaymentVerified: true })))).status, 409);
    assert.deepEqual(await originals(), initial);
  });
  async function adjustmentFixture(reason: string, accessOutcome = "ENDS") {
    const m = await createMember(staff, { fullName: `Adjustment ${reason} ${accessOutcome} ${suffix}` });
    const retained = await confirmCash(staff, (await prepareCharge(staff, m.id, plan.id)).id, "800", randomUUID());
    const affected = await confirmCash(staff, (await prepareCharge(staff, m.id, plan.id)).id, "800", randomUUID());
    const c = await ok(staff, open({ memberId: m.id, reason }));
    const request = await ok(staff, await event(c.caseId, { action: "request", reason, paymentId: affected.payment.id, relatedPaymentId: retained.payment.id,
      periodId: affected.period.id, retainedPeriodId: retained.period.id, collectionCount: reason === "DUPLICATE_RECORD" ? "ONE" : "TWO",
      amount: reason === "DUPLICATE_RECORD" ? "0" : "800", method: "CASH", moneyOutcome: reason === "DUPLICATE_RECORD" ? "NO_MOVEMENT" : "REFUND_PROPOSED",
      accessOutcome, effectiveAt: new Date().toISOString(), independentEvidenceReference: "INDEPENDENT-RECEIPT-02", sameObligation: true, unintendedCollection: true,
      ...(accessOutcome === "ADJUSTS" ? { adjustedStartsAt: affected.period.startsAt.toISOString(), adjustedEndsAt: new Date(affected.period.endsAt.getTime() - 86400_000).toISOString() } : {}) }));
    const approval = await ok(owners[0], await event(c.caseId, { action: "review", requestEventId: request.id, decision: "APPROVE" }));
    return { m, retained, affected, c, request, approval };
  }
  await t.test("duplicate-record zero-movement correction executes once, preserves originals and explicit retained access", async () => {
    const f = await adjustmentFixture("DUPLICATE_RECORD"); assert.equal(f.approval.outcome, "APPROVED");
    const command = await event(f.c.caseId, { action: "executeApproved", requestEventId: f.request.id, independentlyVerified: true, independentEvidenceReference: "EXEC-CORROBORATION-01" });
    assert.equal((await POST(req(staff, command))).status, 403); assert.equal((await POST(req(owners[1], command))).status, 404);
    const key = randomUUID(); const results = await Promise.all([ok(owners[0], command, key), ok(owners[0], command, key)]);
    assert.equal(results[0].id, results[1].id); assert.equal(results[0].outcome, "COMPLETED"); assert.equal(results[0].amountCentavos, 0);
    assert.equal((await ok(owners[0], command, key)).id, results[0].id);
    assert.equal((await admin.effectiveEntitlement.findUniqueOrThrow({ where: { periodId: f.affected.period.id } })).isCurrentProjection, false);
    assert.deepEqual(await admin.membershipPeriod.findUnique({ where: { id: f.affected.period.id } }), f.affected.period);
    assert.deepEqual(await admin.payment.findUnique({ where: { id: f.affected.payment.id } }), f.affected.payment);
    assert.deepEqual(await admin.paymentReceipt.findUnique({ where: { id: f.affected.receipt.id } }), f.affected.receipt);
    assert.equal(assessEligibility(await admin.effectiveEntitlement.findMany({ where: { memberId: f.m.id, isCurrentProjection: true } }), new Date()).status, "ELIGIBLE");
    assert.equal((await POST(req(owners[0], await event(f.c.caseId, { ...command, expectedRevision: undefined })))).status, 400);
    assert.equal(await admin.investigationEvent.count({ where: { caseId: f.c.caseId, kind: "SETTLE" } }), 0);
  });
  await t.test("full evidenced excess refund awaits separate exact external settlement; concurrent completion is idempotent", async () => {
    const f = await adjustmentFixture("TWO_COLLECTIONS", "STAYS"); assert.equal(f.approval.outcome, "APPROVED");
    const command = await event(f.c.caseId, { action: "executeApproved", requestEventId: f.request.id, independentlyVerified: true, independentEvidenceReference: "EXEC-EXCESS-01" });
    const key = randomUUID(); const results = await Promise.all([ok(owners[0], command, key), ok(owners[0], command, key)]);
    assert.equal(results[0].id, results[1].id); assert.equal(results[0].outcome, "AWAITING_SETTLEMENT");
    const settle = await event(f.c.caseId, { action: "settle", executionEventId: results[0].id, independentlyVerified: true,
      independentEvidenceReference: "REFUND-ACTIVITY-02", settlementReference: `REFUND-${suffix}`, amount: "800", method: "CASH", settledAt: new Date().toISOString() });
    for (const patch of [{ amount: "799.99" }, { method: "BANK" }, { settledAt: "2000-01-01T00:00:00Z" }]) assert.ok((await POST(req(owners[0], { ...settle, ...patch }))).status >= 400);
    assert.equal((await POST(req(staff, settle))).status, 403);
    const settlementKey = randomUUID(); const settled = await Promise.all([ok(owners[0], settle, settlementKey), ok(owners[0], settle, settlementKey)]);
    assert.equal(settled[0].id, settled[1].id); assert.equal(settled[0].outcome, "COMPLETED");
    assert.equal(await admin.investigationEvent.count({ where: { executionEventId: results[0].id, kind: "SETTLE" } }), 1);
    assert.equal((await admin.effectiveEntitlement.findUniqueOrThrow({ where: { periodId: f.affected.period.id } })).isCurrentProjection, true, "Explicit STAYS preserved");
    assert.deepEqual(await admin.payment.findUnique({ where: { id: f.affected.payment.id } }), f.affected.payment);
    const repeat = { ...settle, expectedRevision: settled[0].revision };
    assert.equal((await POST(req(owners[0], repeat))).status, 409);
  });
  await t.test("explicit adjusted interval is applied; failed execution audit rolls back event and access", async () => {
    const f = await adjustmentFixture("DUPLICATE_RECORD", "ADJUSTS");
    const command = await event(f.c.caseId, { action: "executeApproved", requestEventId: f.request.id, independentlyVerified: true, independentEvidenceReference: "EXEC-ADJUST-02" });
    const before = await admin.effectiveEntitlement.findUniqueOrThrow({ where: { periodId: f.affected.period.id } });
    await admin.$executeRawUnsafe(`CREATE FUNCTION public.synthetic_execution_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.gym_id = '${gyms[0]}'::uuid AND NEW.action = 'INVESTIGATION_EXECUTE_APPROVED' THEN RAISE EXCEPTION 'synthetic execution rollback'; END IF; RETURN NEW; END $$`);
    const key = randomUUID();
    try {
      await admin.$executeRawUnsafe("CREATE TRIGGER synthetic_execution_failure BEFORE INSERT ON identity_audit FOR EACH ROW EXECUTE FUNCTION public.synthetic_execution_failure()");
      assert.equal((await POST(req(owners[0], command, key))).status, 500);
      assert.deepEqual(await admin.effectiveEntitlement.findUnique({ where: { id: before.id } }), before);
      assert.equal(await admin.investigationEvent.count({ where: { kind: "EXECUTE_APPROVED", caseId: f.c.caseId } }), 0);
    } finally { await admin.$executeRawUnsafe("DROP TRIGGER IF EXISTS synthetic_execution_failure ON identity_audit"); await admin.$executeRawUnsafe("DROP FUNCTION public.synthetic_execution_failure()"); }
    await ok(owners[0], command, key);
    assert.equal((await admin.effectiveEntitlement.findUniqueOrThrow({ where: { id: before.id } })).endsAt.toISOString(), f.request.adjustedEndsAt);
    await assert.rejects(inGym(staff, "MEMBERS", tx => tx.effectiveEntitlement.update({ where: { periodId: f.retained.period.id }, data: { isCurrentProjection: false } })));
  });
  await t.test("discretionary cancellation and legitimate second purchase remain unexecutable", async () => {
    const legitimate = await ok(staff, open({ reason: "TWO_COLLECTIONS" }));
    const unproven = await ok(staff, await proposal(legitimate.caseId, { reason: "TWO_COLLECTIONS", collectionCount: "TWO", relatedPaymentId: second.payment.id,
      amount: "800", moneyOutcome: "REFUND_PROPOSED", independentEvidenceReference: "TWO-LEGITIMATE-PURCHASES" }));
    const unprovenApproval = await ok(owners[0], await event(legitimate.caseId, { action: "review", requestEventId: unproven.id, decision: "APPROVE" }));
    assert.equal(unprovenApproval.outcome, "APPROVED_BLOCKED", "Two collections alone do not establish duplicate excess");
    for (const reason of ["CANCEL_BEFORE_USE", "CANCEL_AFTER_USE", "INCORRECT_ENTRY", "FUNDS_ABSENT"]) {
      const c = await ok(staff, open({ reason })); const requested = await ok(staff, await proposal(c.caseId, { reason }));
      const approval = await ok(owners[0], await event(c.caseId, { action: "review", requestEventId: requested.id, decision: "APPROVE" }));
      assert.equal(approval.outcome, "APPROVED_BLOCKED");
      assert.equal((await POST(req(owners[0], await event(c.caseId, { action: "executeApproved", requestEventId: requested.id, independentlyVerified: true, independentEvidenceReference: "UNSUPPORTED-02" })))).status, 409);
    }
    assert.deepEqual(await originals(), initial);
  });
  await t.test("independently evidenced zero-movement corrections require explicit owner access outcomes and preserve original history", async () => {
    for (const reason of ["INCORRECT_ENTRY", "FUNDS_ABSENT"]) {
      const m = await createMember(staff, { fullName: `Zero movement ${reason} ${suffix}` });
      const original = await confirmCash(staff, (await prepareCharge(staff, m.id, plan.id)).id, "800", randomUUID());
      const c = await ok(staff, open({ memberId: m.id, reason }));
      if (reason === "INCORRECT_ENTRY") {
        const futureRequest = await ok(staff, await event(c.caseId, { action: "request", reason, paymentId: original.payment.id, periodId: original.period.id,
          collectionCount: "UNKNOWN", amount: "0", method: "CASH", moneyOutcome: "NO_MOVEMENT", accessOutcome: "ADJUSTS",
          effectiveAt: new Date(Date.now() + 2 * 86400_000).toISOString(), adjustedStartsAt: new Date(Date.now() + 86400_000).toISOString(),
          adjustedEndsAt: original.period.endsAt.toISOString(), independentEvidenceReference: "FUTURE-CORRECTION-02" }));
        await ok(owners[0], await event(c.caseId, { action: "review", requestEventId: futureRequest.id, decision: "APPROVE" }));
        const rejected = await POST(req(owners[0], await event(c.caseId, { action: "executeApproved", requestEventId: futureRequest.id,
          independentlyVerified: true, independentEvidenceReference: "FUTURE-EXECUTION-02" })));
        assert.equal(rejected.status, 409, "Cannot remove access before the approved future effective time");
        assert.equal((await admin.effectiveEntitlement.findUniqueOrThrow({ where: { periodId: original.period.id } })).endsAt.toISOString(), original.period.endsAt.toISOString());
      }
      const effectiveAt = new Date().toISOString();
      const request = await ok(staff, await event(c.caseId, { action: "request", reason, paymentId: original.payment.id, periodId: original.period.id,
        collectionCount: "UNKNOWN", amount: "0", method: "CASH", moneyOutcome: "NO_MOVEMENT", accessOutcome: "ENDS", effectiveAt,
        independentEvidenceReference: `CORRECTION-${reason}-02` }));
      const approval = await ok(owners[0], await event(c.caseId, { action: "review", requestEventId: request.id, decision: "APPROVE" }));
      assert.equal(approval.outcome, "APPROVED");
      const result = await ok(owners[0], await event(c.caseId, { action: "executeApproved", requestEventId: request.id,
        independentlyVerified: true, independentEvidenceReference: `EXECUTION-${reason}-02` }));
      assert.equal(result.outcome, "COMPLETED"); assert.equal(result.amountCentavos, 0);
      const projection = await admin.effectiveEntitlement.findUniqueOrThrow({ where: { periodId: original.period.id } });
      assert.equal(projection.endsAt.toISOString(), effectiveAt);
      assert.equal(assessEligibility([projection], new Date(effectiveAt)).status, "EXPIRED", "Exact approved end excludes access");
      assert.deepEqual(await admin.payment.findUnique({ where: { id: original.payment.id } }), original.payment);
      assert.deepEqual(await admin.membershipPeriod.findUnique({ where: { id: original.period.id } }), original.period);
      assert.deepEqual(await admin.paymentReceipt.findUnique({ where: { id: original.receipt.id } }), original.receipt);
      assert.equal(await admin.investigationEvent.count({ where: { caseId: c.caseId, kind: "SETTLE" } }), 0);
    }
  });
  await t.test("revoked owner freshness, wrong full excess and repeated distinct-key executions produce no extra adjustments", async () => {
    const f = await adjustmentFixture("TWO_COLLECTIONS", "ENDS");
    const command = await event(f.c.caseId, { action: "executeApproved", requestEventId: f.request.id, independentlyVerified: true, independentEvidenceReference: "OWNER-EXECUTION-02" });
    const session = await auth.api.getSession({ headers: owners[0] });
    await admin.session.update({ where: { id: session!.session.id }, data: { reauthenticatedAt: new Date(0) } });
    assert.equal((await POST(req(owners[0], command))).status, 403);
    assert.equal(await admin.investigationEvent.count({ where: { caseId: f.c.caseId, kind: "EXECUTE_APPROVED" } }), 0);
    await reauthenticate(owners[0], password);
    const competing = await Promise.all([POST(req(owners[0], command)), POST(req(owners[0], command))]);
    assert.deepEqual(competing.map(row => row.status).sort(), [200, 409]);
    assert.equal(await admin.investigationEvent.count({ where: { caseId: f.c.caseId, kind: "EXECUTE_APPROVED" } }), 1);
    assert.equal((await POST(req(owners[0], { ...command, expectedRevision: command.expectedRevision + 1 }))).status, 409);
    const c = await ok(staff, open({ memberId: f.m.id, reason: "TWO_COLLECTIONS" }));
    const request = await ok(staff, await event(c.caseId, { action: "request", reason: "TWO_COLLECTIONS", paymentId: f.retained.payment.id, relatedPaymentId: f.affected.payment.id,
      periodId: f.retained.period.id, collectionCount: "TWO", amount: "799", method: "CASH", moneyOutcome: "REFUND_PROPOSED", accessOutcome: "STAYS", effectiveAt: new Date().toISOString(),
      independentEvidenceReference: "WRONG-EXCESS-02", sameObligation: true, unintendedCollection: true }));
    await ok(owners[0], await event(c.caseId, { action: "review", requestEventId: request.id, decision: "APPROVE" }));
    assert.equal((await POST(req(owners[0], await event(c.caseId, { action: "executeApproved", requestEventId: request.id,
      independentlyVerified: true, independentEvidenceReference: "WRONG-EXCESS-EXEC" })))).status, 409, "Cannot refund retained collection through a different case");
  });
  await t.test("restricted runtime RLS, tenant-consistent references, pool cleanup and immutable originals remain enforced", async () => {
    assert.equal(await db.investigationCase.count(), 0); assert.equal(await db.investigationEvent.count(), 0);
    const created = await ok(staff, open()); const row = await admin.investigationCase.findUniqueOrThrow({ where: { id: created.caseId } });
    await assert.rejects(db.investigationCase.create({ data: { ...row, id: randomUUID() } }));
    await assert.rejects(inGym(owners[1], "MEMBERS", tx => tx.investigationCase.create({ data: { ...row, id: randomUUID(), gymId: gyms[1] } })));
    await assert.rejects(inGym(staff, "MEMBERS", tx => tx.$executeRaw`UPDATE investigation_cases SET summary = 'changed' WHERE id = ${row.id}::uuid`));
    await assert.rejects(admin.investigationEvent.update({ where: { id: created.id }, data: { reasoning: "changed" } }));
    await assert.rejects(admin.investigationCase.delete({ where: { id: row.id } }));
    const originalEvent = await admin.investigationEvent.findUniqueOrThrow({ where: { id: created.id } });
    await assert.rejects(inGym(staff, "MEMBERS", tx => tx.investigationEvent.create({ data: { ...originalEvent, id: randomUUID(), operationKey: randomUUID(), revision: 2,
      kind: "REVIEW", outcome: "APPROVED_BLOCKED", decision: "APPROVE", requestEventId: created.id, evidenceReference: "FAKE-REVIEW" } })));
    const requested = await ok(staff, await proposal(created.caseId));
    await assert.rejects(inGym(staff, "MEMBERS", tx => tx.investigationEvent.create({ data: { ...originalEvent, id: randomUUID(), operationKey: randomUUID(), revision: 3,
      kind: "REVIEW", outcome: "APPROVED_BLOCKED", decision: "APPROVE", requestEventId: requested.id, evidenceReference: "STAFF-FAKE-APPROVAL" } })));
    for (const gymId of [gyms[0], gyms[1], gyms[0], gyms[1]]) {
      await pooled.$transaction(async tx => {
        await setGymContext(tx, gymId);
        const rows = await tx.investigationCase.findMany(); assert.ok(rows.length); assert.ok(rows.every(record => record.gymId === gymId));
        const events = await tx.investigationEvent.findMany(); assert.ok(events.length); assert.ok(events.every(record => record.gymId === gymId));
      });
      assert.equal(await pooled.investigationCase.count(), 0); assert.equal(await pooled.investigationEvent.count(), 0);
    }
    await assert.rejects(pooled.$transaction(async tx => { await setGymContext(tx, gyms[0]); assert.ok(await tx.investigationCase.count()); throw Error("synthetic pool rollback"); }));
    assert.equal(await pooled.investigationCase.count(), 0);
    const roles = await db.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    assert.equal(roles[0].rolsuper, false); assert.equal(roles[0].rolbypassrls, false);
    const security = await admin.$queryRaw<{ relforcerowsecurity: boolean }[]>`SELECT relforcerowsecurity FROM pg_class WHERE relname IN ('investigation_cases','investigation_events')`;
    assert.equal(security.length, 2); assert.ok(security.every(row => row.relforcerowsecurity));
    assert.deepEqual(await originals(), initial);
  });
});
