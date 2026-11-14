import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { bootstrapSyntheticOwner, completeSetup, inviteStaff } from "../src/lib/identity";
import { assertSynthetic } from "../src/lib/email";
import { changePlans } from "../src/lib/plans";
import { attendanceCsv, reportAttendance, reportOverview } from "../src/lib/reports";
import { comparisonDates, csvCell, DAY, reportDates, reportQuerySchema } from "../src/lib/reports-schema";
import { dayStart, manilaDay } from "../src/lib/attendance-schema";
import { GET } from "../src/app/api/reports/attendance/route";
import { confirmOnline, prepareCharge } from "../src/lib/charges";

assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/gym_crm_synthetic");
}
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC" }) });
after(async () => { await db.$disconnect(); await admin.$disconnect(); });

test("Report calendar boundaries and CSV escaping", () => {
  for (const [now, start, previous, end] of [
    ["2024-03-31T12:00:00+08:00", "2024-03-01", "2024-02-01", "2024-03-01"],
    ["2025-01-01T08:30:00+08:00", "2025-01-01", "2024-12-01", "2024-12-01"],
    ["2024-03-01T00:00:00+08:00", "2024-03-01", "2024-02-01", "2024-02-01"],
  ]) {
    const dates = comparisonDates(new Date(now));
    assert.equal(manilaDay(dates.start), start); assert.equal(manilaDay(dates.previousStart), previous); assert.equal(manilaDay(dates.previousEnd), end);
  }
  assert.equal(comparisonDates(new Date("2025-01-01T08:30:00+08:00")).previousEnd.toISOString(), "2024-12-01T00:30:00.000Z");
  const query = reportQuerySchema.parse({});
  assert.equal(reportDates(query, new Date("2024-03-31T23:00:00+08:00")).week, "2024-03-25");
  assert.equal(reportDates(query, new Date("2024-04-01T00:00:00+08:00")).week, "2024-04-01");
  for (const input of [{ tab: "unknown" }, { from: "2024-02-30" }, { page: "0" }, { gymId: randomUUID() }, { from: ["2024-03-01", "2024-03-02"] }]) assert.equal(reportQuerySchema.safeParse(input).success, false);
  assert.equal(csvCell('A, "B"\nC'), '"A, ""B""\nC"');
  for (const value of ["=HYPERLINK(1)", " +SUM(1)", "\t@IMPORTDATA(1)", "-1+2"]) assert.ok(csvCell(value).startsWith('"\''));
});

test("Reports enforce owner/RLS scope and preserve report denominators and individual visits", async t => {
  await admin.rateLimit.deleteMany();
  const suffix = randomUUID().slice(0, 8), password = "Synthetic reports password 2026!", gymId = randomUUID(), otherGym = randomUUID();
  let token = "";
  const sender = { async send(message: { url: string }) { token = new URL(message.url).hash.slice(1); } };
  async function login(identifier: string, mode = "email") {
    const response = await auth.handler(new Request(`http://127.0.0.1:3000/api/auth/sign-in/${mode}`, { method: "POST", headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" }, body: JSON.stringify({ [mode]: identifier, password }) }));
    assert.equal(response.status, 200);
    return new Headers({ cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") });
  }
  const owners: Headers[] = [];
  for (const [i, id] of [gymId, otherGym].entries()) {
    const email = `reports-${i}-${suffix}@example.test`;
    await bootstrapSyntheticOwner({ gymId: id, gymName: "Synthetic Reports", name: "Reports Owner", email }, sender, admin);
    await completeSetup(token, password); owners.push(await login(email));
  }
  const owner = owners[0], [plan] = await changePlans(owner, { action: "initialize" });
  const actor = await admin.operator.findFirstOrThrow({ where: { gymId, role: "OWNER" } });
  const now = new Date("2024-03-31T12:00:00+08:00"), clock = () => now;
  const query = { tab: "attendance", from: "2024-03-30", to: "2024-03-31", week: "2024-03-31" };
  async function member(fullName = "Reports fixture", createdAt = dayStart("2024-03-01")) {
    return admin.member.create({ data: { gymId, fullName, nameKey: fullName.toLowerCase(), createdAt, createdBy: actor.id } });
  }
  async function paid(memberId: string, startsAt: Date, collectedAt: Date, projection = true) {
    const endsAt = new Date(startsAt.getTime() + 30 * DAY);
    return admin.$transaction(async tx => {
      const charge = await tx.charge.create({ data: { gymId, memberId, planId: plan.id, planName: plan.name, durationDays: 30, priceCentavos: 80000, planVersion: plan.version, preparedBy: actor.id, intendedStart: startsAt, intendedEnd: endsAt } });
      const payment = await tx.payment.create({ data: { gymId, memberId, chargeId: charge.id, reference: `REPORT-${randomUUID()}`, amountCentavos: 80000, method: "CASH", collectedBy: actor.id, verifiedBy: actor.id, collectedAt } });
      const period = await tx.membershipPeriod.create({ data: { gymId, memberId, paymentId: payment.id, confirmedBy: actor.id, startsAt, endsAt } });
      await tx.effectiveEntitlement.create({ data: { gymId, memberId, periodId: period.id, startsAt, endsAt, isCurrentProjection: projection } });
      await tx.paymentReceipt.create({ data: { gymId, paymentId: payment.id, reference: `REPORT-RECEIPT-${randomUUID()}` } });
      return period;
    });
  }
  await t.test("empty reports and denied anonymous/staff requests", async () => {
    const empty = await reportOverview(owner, clock);
    assert.equal(empty.members.total, 0); assert.equal(empty.revenue.current, 0); assert.equal(empty.revenue.previous, 0);
    await inviteStaff(owner, { name: "Reports Staff", email: `reports-staff-${suffix}@example.test`, username: `reports_${suffix}` }, sender);
    await completeSetup(token, password); const staff = await login(`reports_${suffix}`, "username");
    for (const headers of [new Headers(), staff]) {
      await assert.rejects(reportOverview(headers), { status: headers.has("cookie") ? 403 : 401 });
      await assert.rejects(reportAttendance(headers, query));
      const response = await GET(new Request("http://127.0.0.1:3000/api/reports/attendance", { headers }));
      assert.equal(response.status, headers.has("cookie") ? 403 : 401); assert.equal(response.headers.get("cache-control"), "no-store");
    }
  });
  const repeated = await member('=HYPERLINK("unsafe"), Member');
  await t.test("current eligibility, registration dates and adjacent renewals", async () => {
    const expiringStart = new Date(now.getTime() - 25 * DAY);
    const renewed = await paid(repeated.id, expiringStart, dayStart("2024-03-01"));
    await paid(repeated.id, renewed.endsAt, dayStart("2024-03-02"));
    await paid((await member()).id, expiringStart, dayStart("2024-02-29"));
    await paid((await member()).id, new Date(now.getTime() + DAY), dayStart("2024-03-03"));
    await paid((await member()).id, new Date(now.getTime() - 30 * DAY), dayStart("2024-02-01"));
    await paid((await member()).id, expiringStart, dayStart("2024-03-04"), false);
    await member("Old registration", dayStart("2024-02-29"));
    await member("Pending registration");
    const snapshot = await reportOverview(owner, clock);
    assert.equal(snapshot.members.total, 7); assert.equal(snapshot.members.newMembers, 6);
    assert.equal(snapshot.members.active, 2); assert.equal(snapshot.members.expiring, 1);
    assert.equal(snapshot.members.plans.reduce((sum, row) => sum + row.count, 0), 2);
    assert.equal(snapshot.revenue.current, 4 * 80000); assert.equal(snapshot.revenue.previous, 2 * 80000);
    assert.equal(snapshot.revenue.mix[0].name, plan.name); assert.equal(snapshot.revenue.mix[0].count, 4);
    await changePlans(owner, { action: "update", planId: plan.id, version: plan.version, price: "900.00" });
    assert.equal((await reportOverview(owner, clock)).revenue.current, snapshot.revenue.current);
    assert.equal(snapshot.revenue.mix.reduce((sum, row) => sum + row.amount, 0), snapshot.revenue.current);
    const exactMonthStart = await reportOverview(owner, () => dayStart("2024-03-01"));
    assert.equal(exactMonthStart.revenue.current, 80000); assert.equal(exactMonthStart.revenue.previous, 80000);
    const other = await reportOverview(owners[1], clock);
    assert.equal(other.members.total, 0); assert.equal(other.members.active, 0); assert.equal(other.revenue.current, 0);
  });
  await t.test("weekly counts and CSV retain repeated visits across all log pages", async () => {
    const start = dayStart("2024-03-30");
    for (let i = 0; i < 22; i++) {
      const arrivedAt = new Date(start.getTime() + i * 30 * 60_000);
      await admin.attendanceVisit.create({ data: { gymId, memberId: repeated.id, arrivedAt, departedAt: new Date(arrivedAt.getTime() + 15 * 60_000), day: new Date("2024-03-30"), isOpen: false } });
    }
    await admin.attendanceVisit.create({ data: { gymId, memberId: repeated.id, arrivedAt: dayStart("2024-03-31"), day: new Date("2024-03-31"), isOpen: false, voided: true } });
    const log = await reportAttendance(owner, query, false, clock);
    assert.equal(log.count, 22); assert.equal(log.visits.length, 20); assert.equal(log.pages, 2); assert.equal(log.week, "2024-03-25");
    assert.equal(log.days[5].count, 22); assert.equal(log.days[6].count, 0);
    const page = await reportAttendance(owner, { ...query, page: "2" }, false, clock);
    assert.equal(page.visits.length, 2); assert.ok(!log.visits.some(a => page.visits.some(b => b.id === a.id)));
    const { csv } = await attendanceCsv(owner, query, clock);
    assert.ok(csv.startsWith("\uFEFFDate,Member ID,Name,Time in,Notes\r\n"));
    assert.equal(csv.trim().split("\r\n").length, 23); assert.equal(csv.split(repeated.id).length - 1, 22);
    assert.ok(csv.includes('"\'=HYPERLINK(""unsafe""), Member"')); assert.ok(csv.includes('"00:00:00"'));
    const other = await attendanceCsv(owners[1], query, clock); assert.equal(other.csv.trim().split("\r\n").length, 1);
    const response = await GET(new Request("http://127.0.0.1:3000/api/reports/attendance?from=2024-03-30&to=2024-03-31", { headers: owner }));
    assert.equal(response.status, 200); assert.match(response.headers.get("content-type")!, /text\/csv/);
    assert.match(response.headers.get("content-disposition")!, /attendance-2024-03-30-to-2024-03-31.csv/);
    assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal((await response.text()).trim().split("\r\n").length, 23);
  });
  await t.test("invalid and duplicate filters fail safely; no-context runtime reads remain empty", async () => {
    for (const input of [{ from: "2024-04-01", to: "2024-03-31" }, { from: "2020-01-01", to: "2024-03-31" }, { gymId: otherGym }]) await assert.rejects(reportAttendance(owner, input), { status: 400 });
    const response = await GET(new Request("http://127.0.0.1:3000/api/reports/attendance?from=2024-03-30&from=2024-03-31", { headers: owner }));
    assert.equal(response.status, 400);
    assert.equal(await db.attendanceVisit.count(), 0); assert.equal(await db.member.count(), 0);
  });
  await t.test("pending and rejected collections add nothing; confirmed Online retries count once", async () => {
    const pending = await member("Pending online collection");
    const charge = await prepareCharge(owner, pending.id, plan.id), key = randomUUID();
    const before = (await reportOverview(owner)).revenue;
    const input = { chargeId: charge.id, amount: "899.99", provider: "GCash" as const, transactionReference: randomUUID(), fundsChecked: true as const };
    await assert.rejects(confirmOnline(owner, input, key));
    assert.equal((await reportOverview(owner)).revenue.current, before.current);
    input.amount = "900.00";
    await confirmOnline(owner, input, key); await confirmOnline(owner, input, key);
    const after = (await reportOverview(owner)).revenue;
    assert.equal(after.current, before.current + 90000);
    assert.equal(after.mix.reduce((sum, row) => sum + row.count, 0), before.mix.reduce((sum, row) => sum + row.count, 0) + 1);
  });
  await t.test("revoked owners lose reads and exports immediately", async () => {
    await admin.operator.update({ where: { id: actor.id }, data: { state: "DISABLED" } });
    await assert.rejects(reportOverview(owner));
    await assert.rejects(attendanceCsv(owner, query));
    const response = await GET(new Request("http://127.0.0.1:3000/api/reports/attendance", { headers: owner }));
    assert.ok([401, 403].includes(response.status));
  });
});
