import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { assertSynthetic, type EmailSender } from "../src/lib/email";
import { bootstrapSyntheticOwner, completeSetup, getActor, inviteStaff, reauthenticate, setCapabilities } from "../src/lib/identity";
import { setGymContext } from "../src/lib/binding";
import { createMember } from "../src/lib/members";
import { changePlans } from "../src/lib/plans";
import { confirmCash, prepareCharge } from "../src/lib/charges";
import { memberQr } from "../src/lib/attendance";
import { completeMemberSetup, issueMemberAccess, memberAccess, memberDashboard, recoverMember } from "../src/lib/member-access";
import { GET as memberGet, POST as memberPost } from "../src/app/api/member/[action]/route";
import { POST as accessPost } from "../src/app/api/members/[id]/access/route";
import { GET as directoryGet } from "../src/app/api/members/directory/route";

assertSynthetic();
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }) });
const origin = "http://127.0.0.1:3000", suffix = randomUUID().slice(0, 8), password = "Synthetic member password 2026!";
let token = "";
const sender: EmailSender = { async send(message) { token = new URL(message.url).hash.slice(1); assert.match(message.to, /\.test$/); } };
async function signIn(email: string, value = password) {
  await admin.rateLimit.deleteMany();
  return auth.handler(new Request(`${origin}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ email, password: value }) }));
}
function cookies(response: Response) { return new Headers({ cookie: response.headers.getSetCookie().map(row => row.split(";")[0]).join("; ") }); }
function request(path: string, actor?: Headers, body?: unknown, source = origin) {
  return new Request(origin + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", origin: source, ...(actor ? { cookie: actor.get("cookie")! } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const context = (action: string) => ({ params: Promise.resolve({ action }) });
after(async () => { await db.$disconnect(); await admin.$disconnect(); });

test("member login and own QR preserve provider, tenant, payment and operator boundaries", async t => {
  const gymId = randomUUID(), otherGym = randomUUID(), ownerEmail = `portal-owner-${suffix}@example.test`;
  await bootstrapSyntheticOwner({ gymId, gymName: "Synthetic Member Gym", name: "Portal Owner", email: ownerEmail }, sender, admin);
  await completeSetup(token, password);
  const ownerLogin = await signIn(ownerEmail); assert.equal(ownerLogin.status, 200); const owner = cookies(ownerLogin);
  await reauthenticate(owner, password);
  const plan = (await changePlans(owner, { action: "initialize" })).find(row => row.durationDays === 30)!;
  const email = `portal-member-${suffix}@example.test`, secondEmail = `portal-second-${suffix}@example.test`;
  await createMember(owner, { fullName: "Private Portal Member", email, phone: "09170000001" });
  await createMember(owner, { fullName: "Other Private Member", email: secondEmail, phone: "09170000002" });
  const member = await admin.member.findFirstOrThrow({ where: { gymId, email } }), second = await admin.member.findFirstOrThrow({ where: { gymId, email: secondEmail } });
  let memberHeaders: Headers, originalQr = "", accountId = "", userId = "", firstSetup = "";
  await t.test("staff-created Pending profile has no account/QR/access and cannot request member setup", async () => {
    assert.equal(await admin.memberAccount.count({ where: { memberId: member.id } }), 0);
    assert.equal(await admin.memberQr.count({ where: { memberId: member.id } }), 0);
    await assert.rejects(issueMemberAccess(owner, member.id, { action: "invite" }, sender), /Activate/);
    assert.equal((await signIn(email)).status, 401);
    assert.equal((await memberGet(request("/api/member/dashboard"), context("dashboard"))).status, 401);
    assert.equal((await memberGet(request("/api/member/dashboard", owner), context("dashboard"))).status, 403);
  });
  await t.test("full-cash activation issues one QR atomically and same-key retries retain it", async () => {
    const charge = await prepareCharge(owner, member.id, plan.id), key = randomUUID();
    await assert.rejects(confirmCash(owner, charge.id, "799.00", key));
    assert.equal(await admin.memberQr.count({ where: { memberId: member.id } }), 0);
    await admin.$executeRawUnsafe("CREATE FUNCTION public.synthetic_member_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic receipt failure'; END $$");
    await admin.$executeRawUnsafe("CREATE TRIGGER synthetic_member_receipt_failure BEFORE INSERT ON payment_receipts FOR EACH ROW EXECUTE FUNCTION public.synthetic_member_receipt_failure()");
    try { await assert.rejects(confirmCash(owner, charge.id, "800.00", randomUUID())); }
    finally {
      await admin.$executeRawUnsafe("DROP TRIGGER synthetic_member_receipt_failure ON payment_receipts");
      await admin.$executeRawUnsafe("DROP FUNCTION public.synthetic_member_receipt_failure()");
    }
    assert.equal(await admin.memberQr.count({ where: { memberId: member.id } }), 0, "A receipt failure rolls back the automatically issued QR");
    assert.equal(await admin.payment.count({ where: { memberId: member.id } }), 0);
    assert.equal(await admin.effectiveEntitlement.count({ where: { memberId: member.id } }), 0);
    await confirmCash(owner, charge.id, "800.00", randomUUID());
    const qr = await admin.memberQr.findFirstOrThrow({ where: { memberId: member.id, revokedAt: null } }); originalQr = qr.code;
    assert.match(originalQr, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(await admin.memberQr.count({ where: { memberId: member.id } }), 1);
    const payment = await admin.payment.findFirstOrThrow({ where: { memberId: member.id } });
    const operation = await admin.idempotencyOperation.findFirstOrThrow({ where: { paymentId: payment.id } });
    await confirmCash(owner, charge.id, "800.00", operation.operationKey);
    assert.equal(await admin.memberQr.count({ where: { memberId: member.id } }), 1);
  });
  await t.test("email setup rotates hashed links, requires delivery, and is single-use", async () => {
    await issueMemberAccess(owner, member.id, { action: "invite" }, sender); firstSetup = token;
    const account = await admin.memberAccount.findUniqueOrThrow({ where: { memberId: member.id } }); accountId = account.id; userId = account.userId;
    assert.equal((await signIn(email)).status, 401);
    assert.equal((await admin.user.findUniqueOrThrow({ where: { id: userId } })).emailVerified, false);
    await issueMemberAccess(owner, member.id, { action: "invite" }, sender);
    assert.notEqual(token, firstSetup);
    await assert.rejects(completeMemberSetup({ token: firstSetup, password }), /Link expired/);
    await assert.rejects(completeMemberSetup({ token, password, gymId }), /Check/);
    const current = token;
    await completeMemberSetup({ token: current, password });
    await assert.rejects(completeMemberSetup({ token: current, password }), /Link expired/);
    assert.equal((await admin.user.findUniqueOrThrow({ where: { id: userId } })).emailVerified, true);
    assert.equal(await admin.operator.count({ where: { userId } }), 0);
    const login = await signIn(email); assert.equal(login.status, 200); memberHeaders = cookies(login);
  });
  await t.test("member reads only own dashboard/QR and is denied every operator boundary", async () => {
    const own = await memberDashboard(memberHeaders); assert.equal(own.name, member.fullName); assert.ok(own.qr);
    assert.equal((await memberDashboard(memberHeaders)).qr, own.qr, "Viewing does not rotate the QR");
    assert.equal(await admin.memberQr.count({ where: { memberId: member.id } }), 1);
    await assert.rejects(getActor(memberHeaders), /unavailable/);
    assert.equal((await directoryGet(request("/api/members/directory", memberHeaders))).status, 403);
    const target = { params: Promise.resolve({ id: second.id }) };
    assert.equal((await accessPost(request(`/api/members/${second.id}/access`, memberHeaders, { action: "invite" }), target)).status, 403);
    assert.equal((await memberGet(request(`/api/member/dashboard?memberId=${second.id}`, memberHeaders), context("dashboard"))).status, 404);
    assert.equal((await memberGet(request("/api/member/arbitrary", memberHeaders), context("arbitrary"))).status, 404);
    assert.equal((await memberGet(request("/api/member/dashboard", new Headers({ cookie: `attendance=${originalQr}` })), context("dashboard"))).status, 401, "Attendance QR is not a login credential");
    const download = await memberGet(request("/api/member/qr", memberHeaders), context("qr"));
    assert.equal(download.status, 200); assert.equal(download.headers.get("content-type"), "image/png");
    assert.equal(download.headers.get("cache-control"), "no-store");
    assert.equal(download.headers.get("content-disposition"), 'attachment; filename="my-gym-qr.png"');
    assert.equal(Buffer.from(await download.arrayBuffer()).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal((await memberGet(request("/api/member/qr", owner), context("qr"))).status, 403);
  });
  await t.test("expired membership hides personal QR without denying account recovery", async () => {
    const current = await memberDashboard(memberHeaders); assert.ok(current.endsAt);
    const expired = await memberDashboard(memberHeaders, () => new Date(current.endsAt!));
    assert.equal(expired.status, "EXPIRED"); assert.equal(expired.qr, null);
    const before = token;
    const recovery = await recoverMember({ email }, sender); assert.match(recovery.status, /If a member account/); assert.notEqual(token, before);
    const reset = token;
    const unknown = await recoverMember({ email: `unknown-${suffix}@example.test` }, sender); assert.deepEqual(unknown, recovery); assert.equal(token, reset);
    await completeMemberSetup({ token: reset, password: password + "new" });
    await assert.rejects(memberDashboard(memberHeaders), /Sign in/);
    assert.equal((await signIn(email)).status, 401);
    const login = await signIn(email, password + "new"); assert.equal(login.status, 200); memberHeaders = cookies(login);
  });
  await t.test("replacement revokes the old QR and the member dashboard reflects the new image", async () => {
    const before = await memberDashboard(memberHeaders);
    const next = await memberQr(owner, member.id, { action: "replace", requestId: randomUUID() }); assert.ok(next);
    assert.notEqual(next.code, originalQr); assert.notEqual((await memberDashboard(memberHeaders)).qr, before.qr);
    assert.ok((await admin.memberQr.findUniqueOrThrow({ where: { code: originalQr } })).revokedAt);
  });
  await t.test("RLS, tenant references, immutable bindings and no dual operator/member identity", async () => {
    assert.equal(await db.memberAccount.count(), 0); assert.equal(await db.memberInvitation.count(), 0);
    await db.$transaction(async tx => {
      await setGymContext(tx, otherGym);
      assert.equal(await tx.memberAccount.count(), 0);
    });
    const actor = await getActor(owner);
    await assert.rejects(admin.memberAccount.create({ data: { gymId, memberId: second.id, userId: actor.operator.userId } }));
    await assert.rejects(admin.operator.create({ data: { gymId, userId, role: "STAFF" } }));
    await assert.rejects(db.$transaction(async tx => { await setGymContext(tx, gymId); await tx.memberAccount.update({ where: { id: accountId }, data: { gymId: otherGym } }); }));
    const flags = await db.$queryRaw<{ relrowsecurity: boolean; relforcerowsecurity: boolean; owns: boolean }[]>`SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner)=current_user AS owns FROM pg_class WHERE relname IN ('member_accounts','member_invitations')`;
    assert.equal(flags.length, 2); for (const row of flags) assert.deepEqual([row.relrowsecurity, row.relforcerowsecurity, row.owns], [true, true, false]);
    assert.equal((await memberAccess(owner, member.id))?.email, email);
    const raceEmail = `portal-race-${suffix}@example.test`;
    await createMember(owner, { fullName: "Concurrent Identity", email: raceEmail, phone: "09170000003" });
    const raceMember = await admin.member.findFirstOrThrow({ where: { gymId, email: raceEmail } });
    const raceUser = await admin.user.create({ data: { id: randomUUID(), name: "Concurrent Identity", email: raceEmail } });
    const results = await Promise.allSettled([
      admin.memberAccount.create({ data: { gymId, memberId: raceMember.id, userId: raceUser.id } }),
      admin.operator.create({ data: { gymId, userId: raceUser.id, role: "STAFF" } }),
    ]);
    assert.equal(results.filter(row => row.status === "fulfilled").length, 1, "Concurrent identity binding admits exactly one authority type");
  });
  await t.test("staff setup/reset permission is checked again on the same live session", async () => {
    const username = `portal_staff_${suffix}`;
    await inviteStaff(owner, { email: `portal-staff-${suffix}@example.test`, name: "Portal Staff", username }, sender);
    await completeSetup(token, password); await admin.rateLimit.deleteMany();
    const login = await auth.handler(new Request(`${origin}/api/auth/sign-in/username`, { method: "POST", headers: { "content-type":"application/json", origin }, body: JSON.stringify({ username, password }) })); assert.equal(login.status, 200);
    const staff = cookies(login), operator = await getActor(staff);
    await assert.rejects(issueMemberAccess(staff, member.id, { action: "reset" }, sender), /permission/);
    await setCapabilities(owner, operator.operator.id, { canManageMembers: true, canCollectCash: false });
    assert.match((await issueMemberAccess(staff, member.id, { action: "reset" }, sender)).status, /captured/);
    await setCapabilities(owner, operator.operator.id, { canManageMembers: false, canCollectCash: false });
    await assert.rejects(issueMemberAccess(staff, member.id, { action: "reset" }, sender), /permission/);
  });
  await t.test("disabled account/gym revokes existing sessions immediately", async () => {
    await admin.memberAccount.update({ where: { id: accountId }, data: { state: "DISABLED" } });
    await assert.rejects(memberDashboard(memberHeaders), /unavailable/); assert.equal((await signIn(email, password + "new")).status, 401);
    await admin.memberAccount.update({ where: { id: accountId }, data: { state: "ACTIVE" } });
    await admin.gym.update({ where: { id: gymId }, data: { state: "DISABLED" } });
    await assert.rejects(memberDashboard(memberHeaders), /unavailable/);
    await admin.gym.update({ where: { id: gymId }, data: { state: "ACTIVE" } });
  });
  await t.test("public routes reject origin/protected fields; failed delivery and expired links cannot activate", async () => {
    const charge = await prepareCharge(owner, second.id, plan.id); await confirmCash(owner, charge.id, "800.00", randomUUID());
    let failedToken = "";
    const failure = await issueMemberAccess(owner, second.id, { action: "invite" }, { async send(message) { failedToken = new URL(message.url).hash.slice(1); throw new Error("Transport failure"); } });
    assert.match(failure.status, /not confirmed/); await assert.rejects(completeMemberSetup({ token: failedToken, password }), /Link expired/);
    await issueMemberAccess(owner, second.id, { action: "invite" }, sender);
    await admin.memberInvitation.updateMany({ where: { account: { memberId: second.id }, consumedAt: null }, data: { createdAt: new Date(Date.now() - 3600_000), expiresAt: new Date(Date.now() - 1) } });
    await assert.rejects(completeMemberSetup({ token, password }), /Link expired/);
    assert.equal((await memberPost(request("/api/member/setup", undefined, { token, password }, "https://foreign.test"), context("setup"))).status, 403);
    assert.equal((await memberPost(request("/api/member/recover", undefined, { email, memberId: second.id }), context("recover"))).status, 400);
    assert.equal((await memberPost(request("/api/member/setup", undefined, { token, password, role: "OWNER" }), context("setup"))).status, 400);
  });
});
