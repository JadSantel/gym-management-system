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
import { changePlans } from "../src/lib/plans";
import { prepareCharge, confirmCash, proposedPeriod } from "../src/lib/charges";
import { investigationCommand } from "../src/lib/investigations";
import { assessEligibility } from "../src/lib/eligibility";
import { outageCommandSchema } from "../src/lib/outage-schema";
import { POST, GET } from "../src/app/api/outage/route";

assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/gym_crm_synthetic");
}
assert.equal(process.env.BETTER_AUTH_URL, "http://127.0.0.1:3000");
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC" }) });
after(async () => { await db.$disconnect(); await admin.$disconnect(); });
const password = "Synthetic Outage Password 2026!"; const suffix = randomUUID().slice(0, 8);
let link = ""; const sender: EmailSender = { async send(message) { link = new URL(message.url).hash.slice(1); } };
async function login(identifier: string, mode = "email") {
  const response = await auth.handler(new Request(`http://127.0.0.1:3000/api/auth/sign-in/${mode}`, { method: "POST", headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" }, body: JSON.stringify({ [mode]: identifier, password }) }));
  assert.equal(response.status, 200); return new Headers({ cookie: response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ") });
}
function req(headers: Headers, body?: object, key = randomUUID()) {
  const h = new Headers(headers); h.set("origin", "http://127.0.0.1:3000"); h.set("content-type", "application/json"); h.set("idempotency-key", key);
  return new Request("http://127.0.0.1:3000/api/outage", { method: body ? "POST" : "GET", headers: h, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function ok(headers: Headers, body: object, key = randomUUID()) {
  const response = await POST(req(headers, body, key)); const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result;
}

test("S-05 restricted PostgreSQL outage recovery and physical custody evidence", async t => {
  t.beforeEach(async () => { await admin.rateLimit.deleteMany(); });
  await admin.rateLimit.deleteMany();
  const gyms = [randomUUID(), randomUUID()]; const owners: Headers[] = [];
  for (const [i, gymId] of gyms.entries()) {
    const email = `outage-owner-${i}-${suffix}@example.test`;
    await bootstrapSyntheticOwner({ gymId, gymName: `Outage ${i}`, email, name: "Synthetic Outage Owner" }, sender, admin);
    await completeSetup(link, password); const headers = await login(email); await reauthenticate(headers, password); owners.push(headers);
  }
  const owner = await admin.operator.findFirstOrThrow({ where: { gymId: gyms[0], role: "OWNER" } });
  const staff: { id: string; headers: Headers }[] = [];
  for (const name of ["collector", "entrant", "verifier", "denied"]) {
    const username = `outage_${name}_${suffix}`;
    await inviteStaff(owners[0], { name: `Synthetic ${name}`, username, email: `${username}@example.test` }, sender);
    await completeSetup(link, password); const headers = await login(username, "username");
    const operator = await admin.operator.findFirstOrThrow({ where: { gymId: gyms[0], user: { username } } });
    await setCapabilities(owners[0], operator.id, { canManageMembers: name !== "denied", canCollectCash: ["collector", "entrant"].includes(name) });
    staff.push({ id: operator.id, headers });
  }
  const [collector, entrant, verifier, denied] = staff;
  await changePlans(owners[0], { action: "initialize" });
  await ok(owners[0], { action: "verifier", operatorId: verifier.id, active: true });
  // Historical synthetic pre-outage registry/price fixtures, created directly under migration credentials.
  // These are setup, not evidence that the application can backdate registry creation.
  const at = new Date(Date.now() - 2 * 86400_000); const registeredAt = new Date(at.getTime() - 86400_000);
  const collectedAt = at.toISOString(); const issuedAt = new Date(at.getTime() + 1000).toISOString();
  const h1At = new Date(at.getTime() + 3600_000).toISOString(); const h2At = new Date(at.getTime() + 7200_000).toISOString();
  async function fixture(durationDays = 30, memberId?: string) {
    const member = memberId ? { id: memberId } : await createMember(owners[0], { fullName: `Outage Member ${randomUUID().slice(0,8)}` });
    const plan = await admin.plan.findFirstOrThrow({ where: { gymId: gyms[0], durationDays } });
    const book = await admin.outageBook.create({ data: { gymId: gyms[0], code: `T${randomUUID().replaceAll("-", "").slice(0,12).toUpperCase()}`, firstNumber: 1, lastNumber: 4, custodianId: collector.id, createdBy: owner.id, createdAt: registeredAt } });
    const price = await admin.outagePrice.create({ data: { gymId: gyms[0], bookId: book.id, planId: plan.id, planName: plan.name, planVersion: plan.version, durationDays, priceCentavos: plan.priceCentavos } });
    const command = { action: "enter", bookId: book.id, number: 1, memberId: member.id, priceId: price.id, method: "CASH", amount: String(plan.priceCentavos / 100),
      collectorId: collector.id, collectedAt, issuedAt, historyCertain: true, receiptReference: `PAPER-${randomUUID()}`, cashReference: `CASH-${randomUUID()}`,
      visit: { at: issuedAt, authorizerId: collector.id, reference: `VISIT-${randomUUID()}` } };
    return { member, book, price, command };
  }
  async function handover(bookId: string, options: object = {}) {
    return ok(entrant.headers, { action: "handover", bookId, toId: entrant.id, actualAt: h1At, used: [1], unused: [2,3,4], void: [], missing: [], cashHeld: "800", cashTransferred: "0",
      transferReference: `NO-TRANSFER-${randomUUID()}`, evidenceReference: `SIGNED-${randomUUID()}`, outstanding: "Pending receipt verification; no balancing adjustment", bothSigned: true, ...options });
  }
  const verification = (bookId: string, entryId: string) => ({ action: "verify", bookId, entryId, receiptEvidence: `RETAINED-${randomUUID()}`, cashEvidence: `COUNT-${randomUUID()}`, custodyEvidence: `HANDOVER-${randomUUID()}`, independentlyMatched: true });
  const pending = async (memberId: string) => {
    assert.equal(await admin.payment.count({ where: { memberId } }), 0);
    assert.equal(assessEligibility(await admin.effectiveEntitlement.findMany({ where: { memberId } }), new Date()).status, "NOT_ELIGIBLE");
  };
  await t.test("registry uniqueness, owner freshness, explicit verifier designations and direct denials", async () => {
    const cmd = { action: "register", code: `REG${suffix.toUpperCase()}`, first: 1, last: 5, custodianId: collector.id };
    assert.equal((await POST(req(collector.headers, cmd))).status, 403);
    const session = await auth.api.getSession({ headers: owners[0] });
    await admin.session.update({ where: { id: session!.session.id }, data: { reauthenticatedAt: new Date(0) } });
    assert.equal((await POST(req(owners[0], cmd))).status, 403); await reauthenticate(owners[0], password);
    const key = randomUUID(); const first = await ok(owners[0], cmd, key);
    assert.equal((await ok(owners[0], cmd, key)).id, first.id);
    assert.equal((await POST(req(owners[0], cmd))).status, 409);
    assert.equal((await POST(req(owners[0], { ...cmd, code: "HUGE", last: 201 }))).status, 400);
    assert.equal((await POST(req(owners[0], { ...cmd, code: "FOREIGN", custodianId: (await admin.operator.findFirstOrThrow({ where: { gymId: gyms[1] } })).id }))).status, 400);
    assert.equal((await GET(req(new Headers()))).status, 401);
    assert.equal((await GET(req(denied.headers))).status, 403);
    assert.equal((await POST(req(collector.headers, { action: "verifier", operatorId: collector.id, active: true }))).status, 403);
  });
  await t.test("pending full cash records one separate visit; partial/digital/uncertain input grants nothing", async () => {
    const f = await fixture();
    for (const patch of [{ amount: "799" }, { method: "GCASH" }, { historyCertain: false }, { collectedAt: "uncertain" }, { number: 5 }, { collectorId: entrant.id }, { gymId: gyms[1] }, { verifiedBy: owner.id }]) {
      const response = await POST(req(entrant.headers, { ...f.command, ...patch })); assert.ok([400,409].includes(response.status));
      await pending(f.member.id);
    }
    assert.equal((await POST(req(denied.headers, f.command))).status, 403);
    assert.equal((await POST(req(owners[1], f.command))).status, 404);
    const foreignMember = await createMember(owners[1], { fullName: "Foreign outage member" });
    assert.equal((await POST(req(entrant.headers, { ...f.command, memberId: foreignMember.id }))).status, 404);
    const key = randomUUID(); const saved = await ok(entrant.headers, f.command, key);
    assert.equal(saved.outcome, "PENDING"); assert.equal((await ok(entrant.headers, f.command, key)).id, saved.id);
    const entry = await admin.outageEntry.findUniqueOrThrow({ where: { id: saved.result.entryId } });
    assert.equal(entry.collectorId, collector.id); assert.equal(entry.enteredBy, entrant.id); assert.equal(entry.visitAt?.toISOString(), issuedAt);
    assert.ok(entry.enteredAt > entry.collectedAt); await pending(f.member.id);
    assert.equal((await POST(req(entrant.headers, { ...f.command, amount: "801" }, key))).status, 409);
    const verify = verification(f.book.id, entry.id);
    assert.equal((await POST(req(verifier.headers, verify))).status, 409, "No physical handover yet");
    await handover(f.book.id);
    assert.equal((await POST(req(owners[0], verify))).status, 403, "Owner needs explicit designation");
    for (const actor of [collector, entrant]) {
      await ok(owners[0], { action: "verifier", operatorId: actor.id, active: true });
      assert.equal((await POST(req(actor.headers, verify))).status, 403, "Collector and entrant cannot self-verify");
    }
    await pending(f.member.id);
  });
  await t.test("D/D+2 and approved durations use original midnight; exact expiry and durable immutable history", async () => {
    for (const duration of [30,90,180]) {
      const f = await fixture(duration); const saved = await ok(entrant.headers, f.command); await handover(f.book.id);
      const command = verification(f.book.id, saved.result.entryId); const key = randomUUID();
      const result = await ok(verifier.headers, command, key);
      assert.equal((await ok(verifier.headers, command, key)).id, result.id, "lost response returns saved result");
      assert.equal(result.outcome, "VERIFIED");
      const payment = await admin.payment.findUniqueOrThrow({ where: { id: result.result.paymentId } });
      const period = await admin.membershipPeriod.findUniqueOrThrow({ where: { paymentId: payment.id } });
      const date = new Date(at.getTime() + 8 * 3600_000).toISOString().slice(0,10);
      assert.equal(period.startsAt.toISOString(), new Date(`${date}T00:00:00+08:00`).toISOString());
      assert.equal(period.endsAt.getTime() - period.startsAt.getTime(), duration * 86400_000);
      assert.equal(payment.collectedAt.toISOString(), collectedAt); assert.equal(payment.collectedBy, collector.id); assert.equal(payment.verifiedBy, verifier.id);
      assert.ok(payment.enteredAt > payment.collectedAt); assert.ok(payment.verifiedAt >= payment.enteredAt);
      assert.equal(assessEligibility([period], period.endsAt).status, "EXPIRED");
      assert.equal(assessEligibility([period], new Date(period.endsAt.getTime()-1)).status, "ELIGIBLE");
      assert.ok(await admin.paymentReceipt.findUnique({ where: { id: result.result.receiptId } }));
      await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.$executeRaw`UPDATE outage_entries SET amount_centavos=1 WHERE id=${saved.result.entryId}::uuid`));
      await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.$executeRaw`UPDATE payments SET amount_centavos=1 WHERE id=${payment.id}::uuid`));
    }
  });
  await t.test("concurrent same-key entry and verification, distinct-key verification and conflicting reuse", async () => {
    const f = await fixture(); const key = randomUUID();
    const results = await Promise.all([ok(entrant.headers, f.command, key), ok(entrant.headers, f.command, key)]);
    assert.equal(results[0].id, results[1].id); await handover(f.book.id);
    const command = verification(f.book.id, results[0].result.entryId); const vKey = randomUUID();
    const confirmed = await Promise.all([ok(verifier.headers, command, vKey), ok(verifier.headers, command, vKey)]);
    assert.equal(confirmed[0].id, confirmed[1].id);
    assert.equal((await POST(req(verifier.headers, command))).status, 409);
    const conflict = await ok(entrant.headers, { ...f.command, memberId: (await fixture()).member.id });
    assert.equal(conflict.outcome, "OWNER_REVIEW"); assert.ok(conflict.caseId);
    assert.equal(await admin.payment.count({ where: { memberId: f.member.id } }), 1);
    assert.equal(await admin.outageEntry.count({ where: { bookId: f.book.id } }), 1);
    assert.equal((await admin.outageEntry.findUniqueOrThrow({ where: { id: results[0].result.entryId } })).memberId, f.member.id);
    const g = await fixture();
    const competing = await Promise.all([ok(entrant.headers, g.command), ok(entrant.headers, { ...g.command, amount: "801" })]);
    assert.deepEqual(competing.map(e => e.outcome).sort(), ["OWNER_REVIEW", "PENDING"]);
    await handover(g.book.id);
    assert.equal((await POST(req(verifier.headers, verification(g.book.id, competing.find(e => e.outcome === "PENDING").result.entryId)))).status, 409);
    await pending(g.member.id);
    const h = await fixture(); const entry = await ok(entrant.headers, h.command); await handover(h.book.id);
    const competingVerifications = await Promise.all([POST(req(verifier.headers, verification(h.book.id, entry.result.entryId))), POST(req(verifier.headers, verification(h.book.id, entry.result.entryId)))]);
    assert.deepEqual(competingVerifications.map(response => response.status).sort(), [200,409]);
    assert.equal(await admin.payment.count({ where: { memberId: h.member.id } }), 1);
  });
  await t.test("continued outage across shifts, full physical counts, void/missing/lost-copy and later-visit boundaries", async () => {
    const f = await fixture(); const saved = await ok(entrant.headers, f.command);
    assert.equal((await POST(req(entrant.headers, { action: "handover", bookId: f.book.id, toId: entrant.id, actualAt: h1At, used: [1], unused: [2,3], void: [], missing: [], cashHeld: "800", cashTransferred: "0", transferReference: "NONE", evidenceReference: "SIGNED", outstanding: "Open", bothSigned: true }))).status, 400);
    await handover(f.book.id, { unused: [2], void: [3], missing: [4] });
    await handover(f.book.id, { actualAt: h2At, toId: collector.id, unused: [2], void: [3], missing: [4] });
    const hs = await admin.outageHandover.findMany({ where: { bookId: f.book.id }, orderBy: { actualAt: "asc" } });
    assert.equal(hs.length, 2); assert.equal(hs[1].fromId, entrant.id); assert.equal(hs[1].toId, collector.id);
    assert.ok(hs.every(h => h.enteredAt > h.actualAt));
    assert.equal((await POST(req(entrant.headers, { ...f.command, number: 4 }))).status, 409);
    await ok(entrant.headers, { action: "exception", bookId: f.book.id, number: 1, memberId: f.member.id, kind: "LOST_COPY", actualAt: h2At, evidenceReference: "LOST-MEMBER-COPY", reasoning: "Retained booklet copy and cash record are available" });
    await ok(entrant.headers, { action: "exception", bookId: f.book.id, number: 1, memberId: f.member.id, kind: "LATER_VISIT", actualAt: h2At, evidenceReference: "OWNER-VISIT-DECISION", reasoning: "Old receipt does not grant admission; separate owner incident recorded" });
    await pending(f.member.id);
    await ok(verifier.headers, verification(f.book.id, saved.result.entryId));
    assert.equal(await admin.outageEntry.count({ where: { bookId: f.book.id, visitAt: { not: null } } }), 1);
    const g = await fixture(); const entered = await ok(entrant.headers, g.command); await handover(g.book.id);
    const event = await ok(entrant.headers, { action: "exception", bookId: g.book.id, number: 1, memberId: g.member.id, kind: "INVALID", actualAt: h2At, evidenceReference: "INVALID-PAPER", reasoning: "Receipt does not establish actual collection" });
    assert.ok(event.caseId); assert.equal((await POST(req(verifier.headers, verification(g.book.id, entered.result.entryId)))).status, 409); await pending(g.member.id);
  });
  await t.test("historical snapshots survive price changes; early adjacency and queued/overlapping terms block", async () => {
    const f = await fixture();
    const current = await admin.plan.findUniqueOrThrow({ where: { id: f.price.planId } });
    await changePlans(owners[0], { action: "update", planId: current.id, version: current.version, price: "900" });
    const entered = await ok(entrant.headers, f.command); await handover(f.book.id);
    const verified = await ok(verifier.headers, verification(f.book.id, entered.result.entryId));
    assert.equal((await admin.payment.findUniqueOrThrow({ where: { id: verified.result.paymentId } })).amountCentavos, 80_000);
    const early = await fixture(30, f.member.id); const e = await ok(entrant.headers, early.command); await handover(early.book.id);
    const next = await ok(verifier.headers, verification(early.book.id, e.result.entryId));
    const periods = await admin.membershipPeriod.findMany({ where: { memberId: f.member.id }, orderBy: { startsAt: "asc" } });
    assert.equal(periods[0].endsAt.getTime(), periods[1].startsAt.getTime()); assert.equal(periods[1].paymentId, next.result.paymentId);
    const queued = await fixture(30, f.member.id); const q = await ok(entrant.headers, queued.command); await handover(queued.book.id);
    assert.equal((await POST(req(verifier.headers, verification(queued.book.id, q.result.entryId)))).status, 409);
    const overlap = await fixture();
    const sale = await confirmCash(owners[0], (await prepareCharge(owners[0], overlap.member.id, current.id)).id, "900", randomUUID());
    const o = await ok(entrant.headers, overlap.command); await handover(overlap.book.id);
    assert.equal((await POST(req(verifier.headers, verification(overlap.book.id, o.result.entryId)))).status, 409);
    assert.equal(await admin.payment.count({ where: { memberId: overlap.member.id } }), 1); assert.ok(sale.payment.id);
  });
  await t.test("injected audit failure rolls back every financial write; original-key retry succeeds", async () => {
    const f = await fixture(); const entered = await ok(entrant.headers, f.command); await handover(f.book.id);
    const command = verification(f.book.id, entered.result.entryId); const key = randomUUID();
    await admin.$executeRawUnsafe(`CREATE FUNCTION public.fail_s05_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.gym_id='${gyms[0]}'::uuid AND NEW.action='OUTAGE_VERIFY_VERIFIED' THEN RAISE EXCEPTION 'synthetic injected failure'; END IF; RETURN NEW; END $$`);
    await admin.$executeRawUnsafe("CREATE TRIGGER fail_s05_audit BEFORE INSERT ON identity_audit FOR EACH ROW EXECUTE FUNCTION public.fail_s05_audit()");
    try { assert.equal((await POST(req(verifier.headers, command, key))).status, 500); await pending(f.member.id); }
    finally { await admin.$executeRawUnsafe("DROP TRIGGER fail_s05_audit ON identity_audit"); await admin.$executeRawUnsafe("DROP FUNCTION public.fail_s05_audit()"); }
    assert.equal(await admin.outageConfirmation.count({ where: { entryId: entered.result.entryId } }), 0);
    assert.equal((await ok(verifier.headers, command, key)).outcome, "VERIFIED");
  });
  await t.test("database independently enforces full price, custody, complete counts and one atomic payment source", async () => {
    const f = await fixture(); const entered = await ok(entrant.headers, f.command); await handover(f.book.id);
    const original = await admin.outageEntry.findUniqueOrThrow({ where: { id: entered.result.entryId } });
    const { id: _id, ...data } = original; void _id;
    for (const patch of [{ amountCentavos: 1 }, { collectorId: entrant.id }, { number: 99 }]) {
      await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.outageEntry.create({ data: { ...data, number: 2, receiptReference: randomUUID(), cashReference: randomUUID(), ...patch } })));
    }
    await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.outageHandover.create({ data: { gymId: gyms[0], bookId: f.book.id, fromId: entrant.id, toId: collector.id, actualAt: new Date(h2At), enteredBy: entrant.id,
      counts: { used:[1],unused:[2],void:[],missing:[] }, cashHeld:0,cashTransferred:0,transferReference:"NO-TRANSFER",evidenceReference:"INCOMPLETE-COUNT",outstanding:"Open" } })));
    async function directSourcePayment(sourceId: string) {
      return inGym(owners[0], "MEMBERS", async tx => {
        const dates = proposedPeriod(at, f.price.durationDays);
        const charge = await tx.charge.create({ data: { gymId:gyms[0],memberId:f.member.id,planId:f.price.planId,planName:f.price.planName,durationDays:f.price.durationDays,
          priceCentavos:f.price.priceCentavos,planVersion:f.price.planVersion,preparedBy:entrant.id,...dates } });
        return tx.payment.create({ data: { gymId:gyms[0],memberId:f.member.id,chargeId:charge.id,outageEntryId:sourceId,reference:`DIRECT-${randomUUID()}`,amountCentavos:f.price.priceCentavos,
          collectedBy:collector.id,collectedAt:at,enteredAt:original.enteredAt,verifiedBy:verifier.id,verifiedAt:new Date() } });
      });
    }
    await assert.rejects(directSourcePayment(original.id), "Orphan payment cannot commit without complete linked result and event"); await pending(f.member.id);
    const result = await ok(verifier.headers, verification(f.book.id, original.id));
    assert.equal((await admin.payment.findUniqueOrThrow({where:{id:result.result.paymentId}})).outageEntryId,original.id);
    await assert.rejects(directSourcePayment(original.id), "Source uniqueness rejects another charge/key using the same paper entry");
    assert.equal(await admin.payment.count({where:{outageEntryId:original.id}}),1);
    await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.$executeRaw`DELETE FROM outage_events WHERE book_id=${f.book.id}::uuid`));
  });
  await t.test("known collection references cannot bypass outage independence through owner omitted-payment recovery", async () => {
    const f = await fixture(); await ok(entrant.headers, f.command);
    const opened = await investigationCommand(owners[0], { action:"open",memberId:f.member.id,reason:"MISSING_PAYMENT",summary:"Known paper collection source",method:"CASH",claimedAmount:f.command.amount,originalCollectedAt:collectedAt },randomUUID());
    await assert.rejects(investigationCommand(owners[0], { action:"approveRecovery",caseId:opened.caseId,expectedRevision:1,planId:f.price.planId,collectorId:collector.id,
      reasoning:"Known outage source must stay in independent verification",evidenceReference:"PRIMARY",independentEvidenceReference:f.command.cashReference,independentlyVerified:true,originalDateVerified:true,omittedPaymentVerified:true },randomUUID()), /controlled paper receipt/);
    await pending(f.member.id);
  });
  await t.test("a price change before original collection blocks an old paper price at entry and verification", async () => {
    const f = await fixture(180);
    const audit = await admin.identityAudit.create({ data: { gymId:gyms[0],initiatorId:owner.userId,subjectId:f.price.planId,action:"PLAN_PRICE_CHANGED_90000_CENTAVOS",createdAt:new Date(at.getTime()-3600_000) } });
    // This synthetic historical fact proves that the book's earlier price is uncertain at collection.
    // No audit facts or prices are rewritten to make the blocked collection confirmable.
    assert.ok(audit.id); assert.equal((await POST(req(entrant.headers,f.command))).status,409); await pending(f.member.id);
    const g = await fixture(90); const saved = await ok(entrant.headers,g.command); await handover(g.book.id);
    await admin.identityAudit.create({ data:{gymId:gyms[0],initiatorId:owner.userId,subjectId:g.price.planId,action:"PLAN_PRICE_CHANGED_220000_CENTAVOS",createdAt:new Date(at.getTime()-3600_000)} });
    assert.equal((await POST(req(verifier.headers,verification(g.book.id,saved.result.entryId)))).status,409); await pending(g.member.id);
  });
  await t.test("restricted RLS, foreign references, missing context, pooled isolation, immutable books and verifier revocation", async () => {
    const roles = await db.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
    assert.equal(roles[0].rolsuper, false); assert.equal(roles[0].rolbypassrls, false);
    const tables = await db.$queryRaw<{relrowsecurity:boolean;relforcerowsecurity:boolean;owns:boolean}[]>`SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner)=current_user AS owns FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname LIKE 'outage_%'`;
    assert.equal(tables.length,7); for (const table of tables) assert.deepEqual([table.relrowsecurity,table.relforcerowsecurity,table.owns],[true,true,false]);
    assert.equal(await db.outageBook.count(), 0); assert.equal(await db.outageEntry.count(), 0);
    for (let i=0; i<4; i++) {
      const [a,b] = await Promise.all(owners.map(h => inGym(h, "MEMBERS", tx => tx.outageEntry.findMany())));
      assert.ok(a.length > 0); assert.equal(b.length, 0); assert.equal(await db.outageEntry.count(), 0);
    }
    const f = await fixture(); const entered = await ok(entrant.headers, f.command); await handover(f.book.id);
    await assert.rejects(db.outageBook.create({ data: { gymId: gyms[0], code: "NOCTX", firstNumber: 1, lastNumber: 1, custodianId: collector.id, createdBy: owner.id } }));
    const foreign = await admin.operator.findFirstOrThrow({ where: { gymId: gyms[1] } });
    await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.outageBook.create({ data: { gymId: gyms[0], code: "BADFK", firstNumber: 1, lastNumber: 1, custodianId: foreign.id, createdBy: owner.id } })));
    await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.$executeRaw`UPDATE outage_books SET id=id WHERE id=${f.book.id}::uuid`));
    await ok(owners[0], { action: "verifier", operatorId: verifier.id, active: false });
    assert.equal((await POST(req(verifier.headers, verification(f.book.id, entered.result.entryId)))).status, 403);
    await pending(f.member.id);
    await db.$transaction(async tx => { await setGymContext(tx, gyms[1]); assert.equal(await tx.outageBook.count(), 0); });
    assert.equal(await db.outageBook.count(), 0);
    assert.equal(outageCommandSchema.safeParse({ ...f.command, visit: { ...f.command.visit, secondVisit: true } }).success, false);
  });
});
