import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { BinaryBitmap, DecodeHintType, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { assertSynthetic } from "../src/lib/email";
import { bootstrapSyntheticOwner, completeSetup, inviteStaff, reauthenticate, setCapabilities } from "../src/lib/identity";
import { createMember } from "../src/lib/members";
import { changePlans } from "../src/lib/plans";
import { prepareCharge, confirmCash } from "../src/lib/charges";
import { attendanceHistory, correctVisit, memberQr, scanAttendance } from "../src/lib/attendance";
import { attendanceQuerySchema, correctionSchema, dayStart, manilaDay, manilaMonthRange, scanSchema } from "../src/lib/attendance-schema";
import { inGym } from "../src/lib/tenant";
import { acceptCameraRead, type CameraGate } from "../src/lib/camera-gate";
import { POST as scanPost } from "../src/app/api/attendance/scan/route";
import { GET as historyGet, POST as correctionPost } from "../src/app/api/attendance/route";
import { POST as qrPost } from "../src/app/api/members/[id]/qr/route";
assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) { const url = new URL(process.env[key]!); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/gym_crm_synthetic"); }
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC" }) });
const password = "Synthetic attendance password 2026!", suffix = randomUUID().slice(0, 8), origin = "http://127.0.0.1:3000";
let setup = "";
const sender = { async send(message: { url: string }) { setup = new URL(message.url).hash.slice(1); } };
async function login(identifier: string, username = false) {
  const response = await auth.handler(new Request(`${origin}/api/auth/sign-in/${username ? "username" : "email"}`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ [username ? "username" : "email"]: identifier, password }) }));
  assert.equal(response.status, 200); return new Headers({ cookie: response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ") });
}
const at = (value: Date | number) => () => new Date(value);
function req(path: string, body?: unknown, headers?: Headers) { const h = new Headers(headers); h.set("origin", origin); h.set("content-type", "application/json"); return new Request(origin + path, { method: body ? "POST" : "GET", headers: h, ...(body ? { body: JSON.stringify(body) } : {}) }); }
after(async () => { await db.$disconnect(); await admin.$disconnect(); });
test("FR-14 strict attendance boundaries and Manila-day derivation", () => {
  const gate: CameraGate = { code: null, missingSince: null };
  assert.equal(acceptCameraRead(gate, "first", 0), true); assert.equal(acceptCameraRead(gate, "first", 10000), false);
  acceptCameraRead(gate, null, 10001); acceptCameraRead(gate, null, 10500); assert.equal(acceptCameraRead(gate, "first", 10501), false);
  acceptCameraRead(gate, null, 11000); acceptCameraRead(gate, null, 11500); assert.equal(acceptCameraRead(gate, "first", 11501), true);
  assert.equal(acceptCameraRead(gate, "second", 11502), true);
  assert.equal(manilaDay(new Date("2026-11-02T15:59:59.999Z")), "2026-11-02"); assert.equal(manilaDay(new Date("2026-11-02T16:00:00Z")), "2026-11-03");
  const november = manilaMonthRange(new Date("2026-10-31T16:00:00Z"));
  assert.deepEqual([november.start.toISOString(), november.end.toISOString()], ["2026-10-31T16:00:00.000Z", "2026-11-30T16:00:00.000Z"]);
  const january = manilaMonthRange(new Date("2026-12-31T16:00:00Z"));
  assert.deepEqual([january.start.toISOString(), january.end.toISOString()], ["2026-12-31T16:00:00.000Z", "2027-01-31T16:00:00.000Z"]);
  for (const value of [{ code: "bad", requestId: randomUUID() }, { code: "a".repeat(43), requestId: randomUUID(), gymId: randomUUID() }, { code: "a".repeat(43), requestId: randomUUID(), now: new Date() }]) assert.equal(scanSchema.safeParse(value).success, false);
  assert.equal(attendanceQuerySchema.safeParse({ from: ["2026-11-02", "2026-11-03"] }).success, false);
  assert.equal(correctionSchema.safeParse({ action: "create", requestId: randomUUID() }).success, false);
});
test("FR-14 restricted-role QR, scans, midnight, corrections and permission acceptance", async t => {
  await admin.rateLimit.deleteMany();
  const gyms = [randomUUID(), randomUUID()], owners: Headers[] = [];
  for (const [i, gymId] of gyms.entries()) { const email = `attendance-owner-${i}-${suffix}@example.test`; await bootstrapSyntheticOwner({ gymId, gymName: `Synthetic Attendance ${i}`, name: "Attendance Owner", email }, sender, admin); await completeSetup(setup, password); const owner = await login(email); await reauthenticate(owner, password); owners.push(owner); }
  const owner = owners[0], now = new Date(), plans = await changePlans(owner, { action: "initialize" }), plan = plans.find(row => row.durationDays === 30)!;
  async function paid(name: string) { const member = await createMember(owner, { fullName: `${name} ${suffix}` }); const charge = await prepareCharge(owner, member.id, plan.id); await confirmCash(owner, charge.id, "800.00", randomUUID()); const qr = await memberQr(owner, member.id, { action: "issue", requestId: randomUUID() }); assert.ok(qr); return { member, qr }; }
  const a = await paid("Attendance A");
  const scan = (code: string, time: number, key = randomUUID()) => scanAttendance(owner, { code, requestId: key }, at(time));
  await t.test("issue only with entitlement; opaque QR retained on repeat issuance and renewal", async () => {
    const pending = await createMember(owner, { fullName: `Pending QR ${suffix}` });
    await assert.rejects(memberQr(owner, pending.id, { action: "issue", requestId: randomUUID() }), /Current verified/);
    assert.match(a.qr.code, /^[A-Za-z0-9_-]{43}$/); assert.equal(a.qr.code.includes(a.member.id), false);
    const require = createRequire(import.meta.url), png = createRequire(require.resolve("qrcode"))("pngjs").PNG.sync.read(Buffer.from(a.qr.png.split(",")[1], "base64")) as { width: number; height: number; data: Uint8Array };
    const pixels = Int32Array.from({ length: png.width * png.height }, (_, index) => (png.data[index*4]<<16)|(png.data[index*4+1]<<8)|png.data[index*4+2]);
    assert.equal(new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,png.width,png.height))), new Map([[DecodeHintType.PURE_BARCODE, true]])).getText(), a.qr.code);
    assert.equal((await memberQr(owner, a.member.id, { action: "issue", requestId: randomUUID() }))!.code, a.qr.code);
    const charge = await prepareCharge(owner, a.member.id, plan.id); await confirmCash(owner, charge.id, "800.00", randomUUID());
    assert.equal((await memberQr(owner, a.member.id))!.code, a.qr.code);
    assert.equal(await admin.payment.count({ where: { memberId: a.member.id } }), 2, "QR handling adds no payment");
  });
  let firstVisit = "";
  await t.test("simultaneous devices, exact eight-second boundary and request-ID lost-response retries", async () => {
    const key = randomUUID(), time = now.getTime();
    const result = await scan(a.qr.code, time, key); assert.equal(result.status, "IN"); firstVisit = result.visitId!;
    assert.deepEqual(await scan(a.qr.code, time + 10000, key), result);
    await assert.rejects(scan("b".repeat(43), time + 10000, key), /different action/);
    assert.equal((await scan(a.qr.code, time + 7999)).status, "SUPPRESSED");
    assert.equal((await scan(a.qr.code, time + 8000)).status, "OUT");
    const both = await Promise.all([scan(a.qr.code, time + 16000), scan(a.qr.code, time + 16000)]);
    assert.deepEqual(both.map(row => row.status).sort(), ["IN", "SUPPRESSED"]);
    assert.equal(await admin.attendanceVisit.count({ where: { memberId: a.member.id, isOpen: true } }), 1);
    assert.equal(await admin.attendanceEvent.count({ where: { memberId: a.member.id } }), 3);
  });
  await t.test("QR replacement revokes new scans with old code, committed retries still replay", async () => {
    const key = randomUUID(); const original = await scan(a.qr.code, now.getTime() + 24000, key); assert.equal(original.status, "OUT");
    const replacementKey = randomUUID(); const next = await memberQr(owner, a.member.id, { action: "replace", requestId: replacementKey }); assert.ok(next); assert.notEqual(next.code, a.qr.code);
    assert.equal((await memberQr(owner, a.member.id, { action: "replace", requestId: replacementKey }))!.code, next.code);
    assert.equal((await scan(a.qr.code, now.getTime() + 32000)).status, "DENIED");
    assert.deepEqual(await scan(a.qr.code, now.getTime() + 32000, key), original);
  });
  await t.test("exact expiry blocks arrival but permits departure for an existing visit", async () => {
    // Ordinary paid terms expire at Manila midnight. A retained historical entitlement may have an exact midday end.
    const member = await createMember(owner, { fullName: `Midday Expiry ${suffix}` }), end = now.getTime() + 60000;
    const actor = await admin.operator.findFirstOrThrow({ where: { gymId: gyms[0], role: "OWNER" } });
    const startsAt = new Date(now.getTime() - 86400_000), endsAt = new Date(end);
    await admin.$transaction(async tx => {
      const proposal = await tx.legacyRecord.create({ data: { gymId: gyms[0], memberId: member.id, kind: "PREPARE", sourceReference: `ATTENDANCE-${suffix}`,
        sourceType: "GYM_REGISTER", corroboratingReference: `ATTENDANCE-CARD-${suffix}`, interpretation: "INSTANTS", claimedStart: startsAt.toISOString(), claimedEnd: endsAt.toISOString(),
        startsAt, endsAt, uncertainty: "CERTAIN", notes: "Synthetic retained interval fixture.", actorId: actor.id, operationKey: randomUUID(), fingerprint: "a".repeat(64) } });
      const approval = await tx.legacyRecord.create({ data: { ...proposal, id: randomUUID(), kind: "APPROVE", proposalId: proposal.id, actorId: actor.id,
        notes: "Synthetic historical entitlement preserved for eligibility testing.", operationKey: randomUUID(), fingerprint: "b".repeat(64), createdAt: new Date() } });
      await tx.effectiveEntitlement.create({ data: { gymId: gyms[0], memberId: member.id, legacyRecordId: approval.id, startsAt, endsAt } });
    });
    const qr = await memberQr(owner, member.id, { action: "issue", requestId: randomUUID() }); assert.ok(qr);
    assert.equal((await scan(qr.code, end - 1)).status, "IN");
    assert.equal((await scan(qr.code, end + 7999)).status, "OUT");
    assert.equal((await scan(qr.code, end + 16000)).status, "DENIED");
    const c = await paid("Exact Expiry C"); const expiry = await admin.effectiveEntitlement.findFirstOrThrow({ where: { memberId: c.member.id } });
    assert.equal((await scan(c.qr.code, expiry.endsAt.getTime())).status, "DENIED");
  });
  let midnightVisit = "";
  await t.test("Manila midnight derives Missing checkout without invented departure; new-day scan starts a new visit", async () => {
    const c = await paid("Midnight C"); const midnight = dayStart(manilaDay(now)); midnight.setUTCDate(midnight.getUTCDate() + 1);
    const first = await scan(c.qr.code, midnight.getTime() - 20000); midnightVisit = first.visitId!;
    assert.equal(first.status, "IN");
    const read = await attendanceHistory(owner, { from: manilaDay(now), to: manilaDay(midnight), view: "MISSING" }, at(midnight));
    assert.ok(read.visits.some(row => row.id === midnightVisit && row.departedAt === null && row.status === "Missing checkout"));
    const second = await scan(c.qr.code, midnight.getTime()); assert.equal(second.status, "IN"); assert.notEqual(second.visitId, first.visitId);
    const original = await admin.attendanceVisit.findUniqueOrThrow({ where: { id: first.visitId } }); assert.equal(original.departedAt, null); assert.equal(original.isOpen, false);
    assert.equal(await admin.attendanceEvent.count({ where: { visitId: original.id } }), 1);
  });
  await t.test("corrections preserve originals, require reason/revision and reject future, reverse, overlap and conflicts", async () => {
    const visit = await admin.attendanceVisit.findUniqueOrThrow({ where: { id: firstVisit } });
    const originalEvents = await admin.attendanceEvent.findMany({ where: { visitId: firstVisit } });
    const base = { action: "correct", visitId: firstVisit, revision: visit.revision, reason: "Synthetic clock review", arrivedAt: new Date(now.getTime() - 1000).toISOString(), departedAt: new Date(now.getTime() + 7000).toISOString(), requestId: randomUUID() };
    for (const overrides of [{ reason: "" }, { departedAt: new Date(now.getTime() - 2000).toISOString() }, { arrivedAt: new Date(now.getTime() + 100000).toISOString() }]) await assert.rejects(correctVisit(owner, { ...base, ...overrides }, at(now.getTime() + 40000)), { status: 400 });
    await assert.rejects(correctVisit(owner, { ...base, departedAt: new Date(now.getTime() + 17000).toISOString() }, at(now.getTime() + 40000)), { status: 409 });
    const corrected = await correctVisit(owner, base, at(now.getTime() + 40000));
    assert.deepEqual(await correctVisit(owner, base, at(now.getTime() + 40000)), corrected);
    assert.deepEqual(await admin.attendanceEvent.findMany({ where: { visitId: firstVisit, revision: { lte: visit.revision } } }), originalEvents);
    await assert.rejects(correctVisit(owner, { ...base, requestId: randomUUID() }, at(now.getTime() + 40000)), /Visit changed/);
    const current = await admin.attendanceVisit.findUniqueOrThrow({ where: { id: firstVisit } });
    const voidInput = { action: "void", visitId: firstVisit, revision: current.revision, reason: "Accidental synthetic visit", requestId: randomUUID() };
    const both = await Promise.allSettled([correctVisit(owner, voidInput, at(now.getTime() + 40000)), correctVisit(owner, { ...voidInput, requestId: randomUUID() }, at(now.getTime() + 40000))]);
    assert.equal(both.filter(row => row.status === "fulfilled").length, 1);
    assert.equal((await admin.attendanceVisit.findUniqueOrThrow({ where: { id: firstVisit } })).voided, true);
    await assert.rejects(admin.attendanceEvent.updateMany({ where: { visitId: firstVisit }, data: { reason: "Rewrite" } }), /immutable/);
    await assert.rejects(admin.attendanceOperation.deleteMany({ where: { gymId: gyms[0] } }), /immutable/);
  });
  await t.test("pagination, filters and audited actor/change history use tenant scope", async () => {
    const from = manilaDay(now), toDate = new Date(now); toDate.setUTCDate(toDate.getUTCDate() + 32);
    const history = await attendanceHistory(owner, { from, to: manilaDay(toDate), member: `Attendance A ${suffix}` }, at(now.getTime() + 40000));
    assert.equal(history.count, 2); assert.ok(history.visits.some(row => row.events.some(event => event.kind === "VOID" && event.reason && event.actor === "Attendance Owner")));
    assert.equal((await attendanceHistory(owners[1], { from, to: manilaDay(toDate) })).count, 0);
    assert.equal((await scanAttendance(owners[1], { code: a.qr.code, requestId: randomUUID() })).memberName, undefined);
    await assert.rejects(memberQr(owners[1], a.member.id), /Member unavailable/);
    await assert.rejects(correctVisit(owners[1], { action: "void", visitId: midnightVisit, revision: 1, reason: "Foreign", requestId: randomUUID() }), /Visit unavailable/);
  });
  await t.test("new tables FORCE RLS, missing contexts deny writes, independent overlap/open constraints hold", async () => {
    for (const table of ["member_qrs", "attendance_visits", "attendance_events", "attendance_operations"]) {
      const [flags] = await db.$queryRawUnsafe<{ relrowsecurity: boolean; relforcerowsecurity: boolean; owns: boolean }[]>(`SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner)=current_user AS owns FROM pg_class WHERE oid='${table}'::regclass`);
      assert.deepEqual(flags, { relrowsecurity: true, relforcerowsecurity: true, owns: false });
    }
    assert.equal(await db.attendanceVisit.count(), 0); assert.equal(await db.memberQr.count(), 0); assert.equal(await db.attendanceEvent.count(), 0); assert.equal(await db.attendanceOperation.count(), 0);
    const bad = { gymId: gyms[1], memberId: a.member.id, arrivedAt: now, day: new Date(manilaDay(now)) };
    await assert.rejects(db.attendanceVisit.create({ data: bad })); await assert.rejects(admin.attendanceVisit.create({ data: bad }));
    const existing = await admin.attendanceVisit.findFirstOrThrow({ where: { memberId: a.member.id, voided: false } });
    await assert.rejects(admin.attendanceVisit.create({ data: { gymId: gyms[0], memberId: a.member.id, arrivedAt: existing.arrivedAt, departedAt: existing.departedAt, day: existing.day, isOpen: existing.isOpen } }));
    const open = await admin.attendanceVisit.findFirstOrThrow({ where: { gymId: gyms[0], isOpen: true } });
    const nextDay = dayStart(manilaDay(new Date(open.arrivedAt.getTime() + 86400000)));
    await assert.rejects(admin.attendanceVisit.create({ data: { gymId: gyms[0], memberId: open.memberId, arrivedAt: nextDay, day: new Date(manilaDay(nextDay)) } }), { code: "P2002" });
    await assert.rejects(inGym(owner, "MEMBERS", tx => tx.attendanceVisit.updateMany({ data: { memberId: randomUUID() } })));
  });
  await t.test("arrival/departure pagination and current-in-gym filter cover more than one page", async () => {
    const d = await paid("Paginated D");
    for (let i=0;i<42;i++) await scan(d.qr.code,now.getTime()+i*8000);
    await scan(d.qr.code,now.getTime()+42*8000);
    const query = { from: manilaDay(now), to: manilaDay(new Date(now.getTime()+43*8000)), member: `Paginated D ${suffix}` };
    const first=await attendanceHistory(owner,query,at(now.getTime()+43*8000));
    const second=await attendanceHistory(owner,{...query,page:"2"},at(now.getTime()+43*8000));
    assert.equal(first.count,22); assert.equal(first.visits.length,20); assert.equal(second.visits.length,2); assert.equal(first.pages,2);
    assert.equal((await attendanceHistory(owner,{...query,view:"IN"},at(now.getTime()+43*8000))).count,1);
    const readTime = new Date(now.getTime()+43*8000);
    const small = await attendanceHistory(owner, { ...query, pageSize: "10" }, at(readTime));
    const last = await attendanceHistory(owner, { ...query, pageSize: "10", page: "999" }, at(readTime));
    assert.equal(small.visits.length, 10); assert.equal(small.pages, 3); assert.equal(last.page, 3); assert.equal(last.visits.length, 2);
    const finished = await attendanceHistory(owner, { ...query, view: "OUT", pageSize: "30" }, at(readTime));
    assert.equal(finished.count, 21); assert.ok(finished.visits.every(visit => visit.departedAt && !visit.voided));
    const all = await attendanceHistory(owner, { from: query.from, to: query.to }, at(readTime));
    assert.deepEqual(small.summary, all.summary); assert.deepEqual(last.summary, all.summary); assert.deepEqual(finished.summary, all.summary);
    const foreign = await attendanceHistory(owners[1], {}, at(readTime));
    assert.deepEqual([foreign.summary.checkedIn, foreign.summary.inside, foreign.summary.checkedOut], [0, 0, 0]);
    assert.ok(foreign.summary.hours.every(hour => !hour.occupancy));
    const start = dayStart(manilaDay(readTime));
    assert.equal(all.summary.checkedIn, await admin.attendanceVisit.count({ where: { gymId: gyms[0], voided: false, arrivedAt: { gte: start, lte: readTime } } }));
    assert.equal(all.summary.checkedOut, await admin.attendanceVisit.count({ where: { gymId: gyms[0], voided: false, departedAt: { gte: start, lte: readTime } } }));
    for (const pageSize of ["0", "11", "10000", ["10", "20"]]) await assert.rejects(attendanceHistory(owner, { pageSize }), { status: 400 });
  });
  await t.test("actual route boundaries deny anonymous, malformed, forged and immediately revoked staff requests", async () => {
    const payload = { code: a.qr.code, requestId: randomUUID() };
    assert.equal((await scanPost(req("/api/attendance/scan", payload))).status, 401);
    assert.equal((await historyGet(req("/api/attendance"))).status, 401);
    assert.equal((await correctionPost(req("/api/attendance", { action: "create" }, owner))).status, 400);
    assert.equal((await scanPost(req("/api/attendance/scan", { ...payload, gymId: gyms[1] }, owner))).status, 400);
    assert.equal((await historyGet(req("/api/attendance?from=2026-11-02&from=2026-11-03", undefined, owner))).status, 400);
    assert.equal((await qrPost(req(`/api/members/${a.member.id}/qr`, { action: "issue", requestId: randomUUID(), role: "OWNER" }, owner), { params: Promise.resolve({ id: a.member.id }) })).status, 400);
    const username = `att_${suffix}`; await inviteStaff(owner, { name: "Attendance Staff", email: `attendance-${suffix}@example.test`, username }, sender); await completeSetup(setup, password);
    const staff = await login(username, true), op = await admin.operator.findFirstOrThrow({ where: { gymId: gyms[0], role: "STAFF" } });
    assert.equal((await scanPost(req("/api/attendance/scan", payload, staff))).status, 403);
    await setCapabilities(owner, op.id, { canManageMembers: true, canCollectCash: false }); assert.equal((await historyGet(req("/api/attendance", undefined, staff))).status, 200);
    await setCapabilities(owner, op.id, { canManageMembers: false, canCollectCash: false }); assert.equal((await historyGet(req("/api/attendance", undefined, staff))).status, 403);
    assert.equal((await scanPost(req("/api/attendance/scan", payload, staff))).status, 403);
  });
});
