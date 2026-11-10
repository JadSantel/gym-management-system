import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { bootstrapSyntheticOwner, completeSetup, reauthenticate, inviteStaff } from "../src/lib/identity";
import { assertSynthetic } from "../src/lib/email";
import { createMember } from "../src/lib/members";
import { changePlans } from "../src/lib/plans";
import { confirmOnline, prepareCharge } from "../src/lib/charges";
import { workspaceOverview } from "../src/lib/workspace";
import { dayStart, manilaDay } from "../src/lib/attendance-schema";

assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/gym_crm_synthetic");
}
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC" }) });
const password = "Synthetic dashboard password 2026!", suffix = randomUUID().slice(0, 8);
after(async () => { await db.$disconnect(); await admin.$disconnect(); });

test("Owner dashboard uses confirmed money, Manila dates, current eligibility and recorded attendance", async t => {
  await admin.rateLimit.deleteMany();
  let token = "";
  const sender = { async send(message: { url: string }) { token = new URL(message.url).hash.slice(1); } };
  async function login(identifier: string, mode = "email") {
    const response = await auth.handler(new Request(`http://127.0.0.1:3000/api/auth/sign-in/${mode}`, { method: "POST", headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" }, body: JSON.stringify({ [mode]: identifier, password }) }));
    assert.equal(response.status, 200);
    return new Headers({ cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") });
  }
  const gymId = randomUUID(), otherGym = randomUUID(), owners: Headers[] = [];
  for (const [i, id] of [gymId, otherGym].entries()) {
    const email = `dashboard-${i}-${suffix}@example.test`;
    await bootstrapSyntheticOwner({ gymId: id, gymName: "Synthetic dashboard", name: "Dashboard Owner", email }, sender, admin);
    await completeSetup(token, password); const owner = await login(email); await reauthenticate(owner, password); owners.push(owner);
  }
  const owner = owners[0], [plan] = await changePlans(owner, { action: "initialize" });
  const actor = await admin.operator.findFirstOrThrow({ where: { gymId, role: "OWNER" } });
  const now = new Date("2024-03-01T01:00:00+08:00"), start = dayStart(manilaDay(now));
  const at = (value: string) => new Date(value);
  const snapshot = () => workspaceOverview(owner, () => now);
  // Complete, constraint-checked historical synthetic results; no immutable row is rewritten.
  async function historical(collectedAt: Date, method = "CASH", startsAt = dayStart(manilaDay(collectedAt)), isCurrentProjection = true) {
    const member = await createMember(owner, { fullName: `Dashboard fixture ${randomUUID()}` });
    const endsAt = new Date(startsAt.getTime() + 30 * 86400000);
    await admin.$transaction(async tx => {
      const charge = await tx.charge.create({ data: { gymId, memberId: member.id, planId: plan.id, planName: plan.name, durationDays: 30, priceCentavos: 80000, planVersion: plan.version, preparedBy: actor.id, intendedStart: startsAt, intendedEnd: endsAt } });
      let claimId: string | undefined;
      if (method !== "CASH") {
        const account = await tx.receivingAccount.create({ data: { gymId, label: method === "GCASH" ? "Enrollment: GCash" : "Enrollment: GoTyme", method, createdBy: actor.id } });
        const claim = await tx.digitalClaim.create({ data: { gymId, chargeId: charge.id, accountId: account.id, amountCentavos: 80000, transactionReference: randomUUID(), reportedReceivedAt: collectedAt, collectedBy: actor.id, enteredAt: collectedAt } });
        claimId = claim.id;
      }
      const payment = await tx.payment.create({ data: { gymId, memberId: member.id, chargeId: charge.id, reference: `DASH-${randomUUID()}`, amountCentavos: 80000, method, collectedBy: actor.id, verifiedBy: actor.id, collectedAt, enteredAt: collectedAt, verifiedAt: collectedAt } });
      if (claimId) await tx.digitalSettlement.create({ data: { gymId, claimId, paymentId: payment.id, evidenceReference: "Synthetic matched full funds", accountMatched: true } });
      const period = await tx.membershipPeriod.create({ data: { gymId, memberId: member.id, paymentId: payment.id, confirmedBy: actor.id, startsAt, endsAt } });
      await tx.effectiveEntitlement.create({ data: { gymId, memberId: member.id, periodId: period.id, startsAt, endsAt, isCurrentProjection } });
      await tx.paymentReceipt.create({ data: { gymId, paymentId: payment.id, reference: `DASH-RECEIPT-${randomUUID()}` } });
    });
    return member;
  }
  await t.test("empty data is zero and staff/anonymous cannot read owner analytics", async () => {
    const empty = await snapshot();
    assert.equal(empty.days.length, 7); assert.ok(empty.days.every(day => day.amount === 0 && day.count === 0 && day.cash === 0 && day.online === 0));
    assert.equal(empty.activeMembers, 0); assert.equal(empty.attendance.inside, 0); assert.equal(empty.attendance.checkedIn, 0); assert.deepEqual(empty.payments, []);
    await inviteStaff(owner, { name: "Dashboard Staff", email: `dash-staff-${suffix}@example.test`, username: `dash_${suffix}` }, sender);
    await completeSetup(token, password);
    await assert.rejects(workspaceOverview(await login(`dash_${suffix}`, "username")), { status: 403 });
    await assert.rejects(workspaceOverview(new Headers()), { status: 401 });
  });
  await t.test("half-open Manila days include Cash/GCash/Bank across leap day and week boundaries", async () => {
    await historical(at("2024-02-23T23:59:59.999+08:00")); // Immediately before the seven-day window.
    await historical(at("2024-02-24T00:00:00+08:00"));
    await historical(at("2024-02-29T23:59:59.999+08:00"), "GCASH");
    await historical(start, "BANK");
    await historical(at("2024-03-01T23:59:59.999+08:00"));
    await historical(at("2024-03-02T00:00:00+08:00")); // Exclusive next midnight.
    const pending = await createMember(owner, { fullName: `Unconfirmed claim ${suffix}` });
    const charge = await prepareCharge(owner, pending.id, plan.id);
    const account = await admin.receivingAccount.create({ data: { gymId, label: "Synthetic pending evidence", method: "BANK", createdBy: actor.id } });
    await admin.digitalClaim.create({ data: { gymId, chargeId: charge.id, accountId: account.id, amountCentavos: 80000, transactionReference: randomUUID(), reportedReceivedAt: start, collectedBy: actor.id } });
    const data = await snapshot();
    assert.equal(data.days[0].date.toISOString(), "2024-02-23T16:00:00.000Z");
    assert.equal(data.days[0].amount, 80000);
    assert.equal(data.days[5].online, 80000);
    assert.deepEqual({ cash: data.days[6].cash, online: data.days[6].online, amount: data.days[6].amount, count: data.days[6].count }, { cash: 80000, online: 80000, amount: 160000, count: 2 });
    assert.equal(data.days.reduce((sum, day) => sum + day.amount, 0), 320000);
    assert.ok(data.days.every(day => day.cash + day.online === day.amount));
    assert.ok(data.payments.every(payment => payment.gymId === gymId && payment.receipt));
    const other = await workspaceOverview(owners[1], () => now);
    assert.ok(other.days.every(day => day.amount === 0)); assert.deepEqual(other.payments, []); assert.equal(other.activeMembers, 0);
  });
  await t.test("eligibility retains exact start/end, scheduled and withdrawn projection semantics", async () => {
    const before = (await snapshot()).activeMembers;
    await historical(start, "CASH", now); // Inclusive start.
    await historical(start, "CASH", new Date(now.getTime() - 30 * 86400000)); // Exclusive end.
    await historical(start, "CASH", new Date(now.getTime() + 1)); // Scheduled.
    await historical(start, "CASH", start, false); // Withdrawn projection.
    assert.equal((await snapshot()).activeMembers, before + 1);
    assert.equal((await workspaceOverview(owner, () => new Date(now.getTime() + 1))).activeMembers, before + 2);
  });
  await t.test("inside count excludes voids, checkout and yesterday's missing departure; check-ins count visits", async () => {
    for (const visit of [
      { arrivedAt: start, departedAt: null, voided: false },
      { arrivedAt: start, departedAt: now, voided: false },
      { arrivedAt: start, departedAt: null, voided: true },
      { arrivedAt: new Date(start.getTime() - 1000), departedAt: null, voided: false },
      { arrivedAt: new Date(start.getTime() - 1000), departedAt: new Date(now.getTime() + 1000), voided: false },
    ]) {
      const member = await createMember(owner, { fullName: `Attendance dashboard ${randomUUID()}` });
      await admin.attendanceVisit.create({ data: { gymId, memberId: member.id, ...visit, day: new Date(manilaDay(visit.arrivedAt)), isOpen: !visit.voided && !visit.departedAt } });
    }
    const data = await snapshot();
    assert.equal(data.attendance.inside, 2); assert.equal(data.attendance.checkedIn, 2);
    assert.equal((await workspaceOverview(owners[1], () => now)).attendance.inside, 0);
  });
  await t.test("prepared and rejected Online attempts add nothing; committed original-key retry counts once", async () => {
    const member = await createMember(owner, { fullName: `Online dashboard ${suffix}` });
    const charge = await prepareCharge(owner, member.id, plan.id), key = randomUUID();
    const input = { chargeId: charge.id, amount: "799.99", provider: "GCash" as const, transactionReference: randomUUID(), fundsChecked: true as const };
    const before = (await workspaceOverview(owner)).days.at(-1)!;
    await assert.rejects(confirmOnline(owner, input, key));
    assert.deepEqual((await workspaceOverview(owner)).days.at(-1), before);
    input.amount = "800.00";
    const committed = await confirmOnline(owner, input, key); // A lost client response cannot undo a committed confirmation.
    await confirmOnline(owner, input, key);
    const after = (await workspaceOverview(owner)).days.at(-1)!;
    assert.equal(after.online, before.online + 80000); assert.equal(after.count, before.count + 1);
    assert.equal(await admin.payment.count({ where: { memberId: member.id } }), 1);
    assert.equal((await workspaceOverview(owner)).payments[0].receipt!.id, committed.receipt.id);
  });
});
