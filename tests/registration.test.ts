import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { setGymContext } from "../src/lib/binding";
import { auth } from "../src/lib/auth";
import { assertSynthetic } from "../src/lib/email";
import { bootstrapSyntheticOwner, completeSetup, inviteStaff, reauthenticate, setCapabilities } from "../src/lib/identity";
import { inGym } from "../src/lib/tenant";
import { createMember, memberDirectory, updateMemberContacts } from "../src/lib/members";
import { registerMember, registrationLink, registrationScope } from "../src/lib/registration";
import { contactSchema, registrationSchema } from "../src/lib/member-schema";
import { directoryMembership } from "../src/lib/member-directory";
import { changePlans } from "../src/lib/plans";
import { completeMemberSetup, memberDashboard, recoverMember } from "../src/lib/member-access";
import { GET as memberGet } from "../src/app/api/member/[action]/route";
import { prepareCharge, confirmCash } from "../src/lib/charges";
import { POST as joinPost } from "../src/app/api/join/[code]/route";
import { GET as linkGet, POST as linkPost } from "../src/app/api/registration-link/route";
import { POST as contactsPost } from "../src/app/api/members/[id]/contacts/route";
import { GET as directoryGet } from "../src/app/api/members/directory/route";

assertSynthetic();
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }) });
const origin = "http://127.0.0.1:3000";
const suffix = randomUUID().slice(0, 8);
const password = "Synthetic registration password 2026!";
let setup = "";
const sender = { async send(message: { url: string }) { setup = new URL(message.url).hash.slice(1); } };
const headers = (cookie?: Headers) => new Headers({ "content-type": "application/json", origin, ...(cookie ? { cookie: cookie.get("cookie")! } : {}) });
async function login(identifier: string, username = false) {
  const response = await auth.handler(new Request(`${origin}/api/auth/sign-in/${username ? "username" : "email"}`, {
    method: "POST", headers: headers(), body: JSON.stringify({ [username ? "username" : "email"]: identifier, password }),
  }));
  assert.equal(response.status, 200);
  return new Headers({ cookie: response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ") });
}
function request(path: string, body?: unknown, actor?: Headers, requestHeaders = headers(actor)) {
  return new Request(`${origin}${path}`, { method: body === undefined ? "GET" : "POST", headers: requestHeaders, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
let sequence = 0;
function input(overrides = {}) { const n = ++sequence; return { fullName: `Synthetic Join ${n}`, email: `join-${n}-${suffix}@example.test`, phone: `0917${String(n).padStart(7, "0")}`, password, confirmation: password, requestId: randomUUID(), ...overrides }; }
after(async () => { await db.$disconnect(); await admin.$disconnect(); });

test("FR-13 normalized required public contacts and optional operator contacts", () => {
  const parsed = registrationSchema.parse(input({ fullName: "  Ｓｙｎｔｈｅｔｉｃ  Join ", email: "  MEMBER@EXAMPLE.TEST  ", phone: "09 17-123-4567" }));
  assert.equal(parsed.fullName, "Synthetic Join"); assert.equal(parsed.email, "member@example.test"); assert.equal(parsed.phone, "+639171234567");
  assert.deepEqual(contactSchema.parse({}), { email: null, phone: null });
  for (const data of [input({ email: "" }), input({ phone: "" }), input({ phone: "+6391712345678" }), input({ phone: "639171234567" }), input({ email: "bad" }), input({ requestId: "bad" }), input({ fullName: "\u200b" }), input({ gymId: randomUUID() }), input({ role: "OWNER" }), input({ password: "short" }), input({ password: "x".repeat(129) }), input({ confirmation: "different password" }), input({ password: undefined }), input({ confirmation: undefined }), input({ emailVerified: true }), input({ state: "ACTIVE" })]) assert.equal(registrationSchema.safeParse(data).success, false);
});

test("FR-13 public registration, contact races, RLS, permissions and cash activation", async t => {
  await admin.rateLimit.deleteMany();
  const gyms = [randomUUID(), randomUUID()];
  const owners: Headers[] = [];
  const codes: string[] = [];
  for (const [i, gymId] of gyms.entries()) {
    const email = `registration-owner-${i}-${suffix}@example.test`;
    await bootstrapSyntheticOwner({ gymId, gymName: `Synthetic Registration ${i}`, name: "Registration Owner", email }, sender, admin);
    await completeSetup(setup, password); const owner = await login(email); await reauthenticate(owner, password); owners.push(owner);
    const link = await registrationLink(owner, true); assert.ok(link); codes.push(new URL(link.url).pathname.split("/").pop()!);
    // Decode the actual generated PNG using ZXing, independently of the generator.
    const require = createRequire(import.meta.url);
    const png = createRequire(require.resolve("qrcode"))("pngjs").PNG.sync.read(Buffer.from(link.qr.split(",")[1], "base64")) as { width: number; height: number; data: Uint8Array };
    const pixels = Int32Array.from({ length: png.width * png.height }, (_, index) => (png.data[index * 4] << 16) | (png.data[index * 4 + 1] << 8) | png.data[index * 4 + 2]);
    assert.equal(new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, png.width, png.height)))).getText(), link.url);
  }
  let pendingId = "";
  const first = input();
  await t.test("same-key concurrency and lost response create one login and Pending profile without operator or paid access", async () => {
    const beforeUsers = await admin.user.count();
    const results = await Promise.all([registerMember(codes[0], first), registerMember(codes[0], first)]);
    assert.deepEqual(results, [{ status: "PENDING" }, { status: "PENDING" }]);
    const rows = await admin.member.findMany({ where: { gymId: gyms[0], email: first.email } }); assert.equal(rows.length, 1);
    const member = rows[0]; pendingId = member.id;
    assert.equal(member.source, "PUBLIC_REGISTRATION"); assert.equal(member.createdBy, null);
    assert.equal(await admin.user.count(), beforeUsers + 1);
    const account = await admin.memberAccount.findUniqueOrThrow({ where: { memberId: member.id }, include: { user: true } });
    assert.equal(account.state, "ACTIVE"); assert.equal(account.user.emailVerified, false);
    assert.equal(await admin.operator.count({ where: { userId: account.userId } }), 0);
    const credential = await admin.account.findFirstOrThrow({ where: { userId: account.userId, providerId: "credential" } });
    assert.notEqual(credential.password, password);
    assert.equal(await (await auth.$context).password.verify({ hash: credential.password!, password }), true);
    assert.equal(await admin.memberInvitation.count({ where: { accountId: account.id } }), 0);
    assert.equal(await admin.payment.count({ where: { memberId: member.id } }), 0);
    assert.equal(await admin.effectiveEntitlement.count({ where: { memberId: member.id } }), 0);
    assert.deepEqual(await registerMember(codes[0], first), { status: "PENDING" });
    await assert.rejects(registerMember(codes[0], { ...first, fullName: "Different" }), /already recorded/);
    await assert.rejects(registerMember(codes[0], { ...first, password: password + "changed", confirmation: password + "changed" }), /already recorded/);
    const signedIn = await login(first.email);
    const dashboard = await memberDashboard(signedIn);
    assert.equal(dashboard.status, "NOT_ELIGIBLE"); assert.equal(dashboard.qr, null);
    assert.equal((await memberGet(request("/api/member/qr", undefined, signedIn), { params: Promise.resolve({ action: "qr" }) })).status, 409);
    assert.equal((await directoryGet(request("/api/members/directory", undefined, signedIn))).status, 403);
    const unverifiedOwner = await admin.operator.findFirstOrThrow({ where: { gymId: gyms[0], role: "OWNER" } });
    await admin.user.update({ where: { id: unverifiedOwner.userId }, data: { emailVerified: false } });
    try {
      assert.equal((await auth.handler(new Request(`${origin}/api/auth/sign-in/email`, { method: "POST", headers: headers(), body: JSON.stringify({ email: `registration-owner-0-${suffix}@example.test`, password }) }))).status, 401);
      assert.equal((await directoryGet(request("/api/members/directory", undefined, owners[0]))).status, 403);
    } finally { await admin.user.update({ where: { id: unverifiedOwner.userId }, data: { emailVerified: true } }); }
    const directory = await memberDirectory(owners[0]); const entry = directory.members.find(row => row.id === member.id)!;
    assert.equal(entry.email, first.email); assert.equal(entry.phone, first.phone.replace(/^09/, "+639")); assert.equal(directoryMembership(entry, directory.checkedAt).pending, true);
  });
  await t.test("email OR normalized phone blocks duplicates; global login collisions cannot claim another identity", async () => {
    for (const data of [input({ email: first.email.toUpperCase() }), input({ phone: first.phone.replace(/^09/, "+639") })]) {
      assert.deepEqual(await registerMember(codes[0], data), { status: "RECEPTION" });
    }
    assert.deepEqual(await registerMember(codes[1], { ...first, requestId: randomUUID() }), { status: "RECEPTION" });
    assert.equal(await admin.member.count({ where: { gymId: gyms[1], email: first.email } }), 0, "A global login collision cannot bind another gym or overwrite a password");
    await registerMember(codes[1], input());
    for (const contact of ["email", "phone"] as const) {
      const a = input(), b = input({ [contact]: a[contact] });
      const results = await Promise.all([registerMember(codes[0], a), registerMember(codes[0], b)]);
      assert.deepEqual(results.map(row => row.status).sort(), ["PENDING", "RECEPTION"]);
    }
  });
  await t.test("global email races create one member identity; operator emails and existing passwords cannot be claimed", async () => {
    const a = input(), b = input({ email: a.email });
    const results = await Promise.all([registerMember(codes[0], a), registerMember(codes[1], b)]);
    assert.deepEqual(results.map(row => row.status).sort(), ["PENDING", "RECEPTION"]);
    assert.equal(await admin.user.count({ where: { email: a.email } }), 1);
    assert.equal(await admin.member.count({ where: { email: a.email } }), 1);
    const account = await admin.user.findUniqueOrThrow({ where: { email: a.email } });
    assert.equal(await admin.account.count({ where: { userId: account.id } }), 1);
    assert.deepEqual(await registerMember(codes[0], input({ email: `registration-owner-1-${suffix}@example.test` })), { status: "RECEPTION" });
    assert.deepEqual(await registerMember(codes[0], input({ email: first.email, password: password + "attacker", confirmation: password + "attacker" })), { status: "RECEPTION" });
    await admin.rateLimit.deleteMany(); assert.ok(await login(first.email));
  });
  await t.test("failed registration rolls back the profile, identity, credential and account together", async () => {
    const data = input();
    await admin.$executeRawUnsafe("CREATE FUNCTION public.synthetic_registration_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic registration failure'; END $$");
    await admin.$executeRawUnsafe("CREATE TRIGGER synthetic_registration_failure BEFORE INSERT ON registration_attempts FOR EACH ROW EXECUTE FUNCTION public.synthetic_registration_failure()");
    try { await assert.rejects(registerMember(codes[0], data)); }
    finally {
      await admin.$executeRawUnsafe("DROP TRIGGER synthetic_registration_failure ON registration_attempts");
      await admin.$executeRawUnsafe("DROP FUNCTION public.synthetic_registration_failure()");
    }
    assert.equal(await admin.user.count({ where: { email: data.email } }), 0);
    assert.equal(await admin.member.count({ where: { email: data.email } }), 0);
    assert.equal(await admin.registrationAttempt.count({ where: { requestId: data.requestId } }), 0);
    assert.deepEqual(await registerMember(codes[0], data), { status: "PENDING" });
  });
  await t.test("staff/public contact races and edits preserve name-only records and provenance", async () => {
    const a = input(); const staffInput = { fullName: a.fullName, email: a.email, phone: a.phone };
    const results = await Promise.allSettled([registerMember(codes[0], a), createMember(owners[0], staffInput)]);
    assert.equal(await admin.member.count({ where: { gymId: gyms[0], email: a.email } }), 1);
    assert.ok(results[0].status === "fulfilled");
    const old = await createMember(owners[0], { fullName: `Name Only ${suffix}` });
    assert.equal(old.email, null); assert.equal(old.phone, null); assert.ok(old.createdBy);
    await assert.rejects(updateMemberContacts(owners[0], old.id, { email: first.email, phone: null }), /already recorded/);
    const fresh = input(); await updateMemberContacts(owners[0], old.id, { email: fresh.email, phone: fresh.phone });
    assert.equal((await admin.member.findUniqueOrThrow({ where: { id: old.id } })).source, "STAFF");
    await assert.rejects(updateMemberContacts(owners[0], old.id, { fullName: "Overwrite" }), /Check/);
    await updateMemberContacts(owners[0], old.id, { email: "", phone: "" });
    assert.equal((await admin.member.findUniqueOrThrow({ where: { id: old.id } })).email, null);
    assert.equal(await admin.identityAudit.count({ where: { gymId: gyms[0], subjectId: old.id, action: "MEMBER_CONTACTS_UPDATED_UNVERIFIED" } }), 2);
  });
  await t.test("restricted-role RLS fails closed, references are tenant-consistent and retries immutable", async () => {
    assert.equal(await db.registrationLink.count(), 0); assert.equal(await db.registrationAttempt.count(), 0);
    const flags = await db.$queryRaw<{ relrowsecurity: boolean; relforcerowsecurity: boolean; owns: boolean }[]>`SELECT relrowsecurity, relforcerowsecurity, pg_get_userbyid(relowner)=current_user AS owns FROM pg_class WHERE oid IN ('registration_links'::regclass,'registration_attempts'::regclass)`;
    assert.equal(flags.length, 2); for (const row of flags) assert.deepEqual(row, { relrowsecurity: true, relforcerowsecurity: true, owns: false });
    const foreign = await admin.member.findFirstOrThrow({ where: { gymId: gyms[1] } });
    await assert.rejects(updateMemberContacts(owners[0], foreign.id, { email: "x@example.test" }), /unavailable/);
    await db.$transaction(async tx => { await setGymContext(tx, gyms[0]); assert.equal(await tx.registrationLink.count(), 1); assert.equal((await tx.member.updateMany({ where: { id: foreign.id }, data: { email: "x@example.test" } })).count, 0); });
    const link = await admin.registrationLink.findFirstOrThrow({ where: { gymId: gyms[0], revokedAt: null } });
    const attempt = { gymId: gyms[0], linkId: link.id, requestId: randomUUID(), fingerprint: "a".repeat(64), outcome: "PENDING", memberId: foreign.id };
    await assert.rejects(db.registrationAttempt.create({ data: attempt }));
    await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.registrationAttempt.create({ data: attempt })));
    await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.registrationAttempt.updateMany({ data: { outcome: "RECEPTION" } })));
    await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.member.create({ data: { gymId: gyms[0], fullName: "Invalid", nameKey: "invalid", source: "PUBLIC_REGISTRATION", createdBy: link.createdBy } })));
    await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.member.create({ data: { gymId: gyms[0], fullName: "Duplicate SQL", nameKey: "duplicate sql", email: first.email, createdBy: link.createdBy } })));
    assert.equal(await db.registrationLink.count(), 0, "context is transaction-local after rollback");
  });
  await t.test("anonymous and revoked member-management authority denied, including direct endpoints", async () => {
    const ctx = { params: Promise.resolve({ id: pendingId }) };
    assert.equal((await contactsPost(request(`/api/members/${pendingId}/contacts`, {}, undefined), ctx)).status, 401);
    assert.equal((await linkGet(request("/api/registration-link"))).status, 401);
    assert.equal((await directoryGet(request("/api/members/directory"))).status, 401);
    const username = `reg_${suffix}`;
    await inviteStaff(owners[0], { name: "Registration Staff", username, email: `reg-staff-${suffix}@example.test` }, sender);
    await completeSetup(setup, password); const staff = await login(username, true);
    const operator = await admin.operator.findFirstOrThrow({ where: { gymId: gyms[0], role: "STAFF" } });
    assert.equal((await linkGet(request("/api/registration-link", undefined, staff))).status, 403);
    await setCapabilities(owners[0], operator.id, { canManageMembers: true, canCollectCash: false });
    assert.ok(await registrationLink(staff));
    await updateMemberContacts(staff, pendingId, { email: first.email, phone: first.phone });
    await setCapabilities(owners[0], operator.id, { canManageMembers: false, canCollectCash: false });
    assert.equal((await contactsPost(request(`/api/members/${pendingId}/contacts`, {}, staff), ctx)).status, 403);
    assert.equal((await linkPost(request("/api/registration-link", { action: "replace" }, staff))).status, 403);
  });
  await t.test("public HTTP adapters bound input, origins, retries, limiter and runtime restrictions", async () => {
    const call = (body: unknown, h = headers(), code = codes[0]) => joinPost(request(`/api/join/${code}`, body, undefined, h), { params: Promise.resolve({ code }) });
    await admin.rateLimit.deleteMany();
    for (const extra of [{ gymId: gyms[1] }, { createdBy: randomUUID() }, { role: "OWNER" }]) assert.equal((await call(input(extra))).status, 400);
    assert.equal((await call(input({ fullName: "x".repeat(5000) }))).status, 413);
    assert.equal((await call(input(), new Headers({ "content-type": "text/plain", origin }))).status, 415);
    assert.equal((await call(input(), new Headers({ "content-type": "application/json", origin: "https://foreign.test" }))).status, 403);
    const malformed = new Request(`${origin}/api/join/${codes[0]}`, { method: "POST", headers: headers(), body: "{" });
    assert.equal((await joinPost(malformed, { params: Promise.resolve({ code: codes[0] }) })).status, 400);
    const valid = input(); const response = await call(valid); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { status: "PENDING" }); assert.equal(response.headers.get("cache-control"), "no-store");
    const original = process.env.SYNTHETIC_DATA_ONLY; process.env.SYNTHETIC_DATA_ONLY = "false";
    try { assert.equal((await call(valid)).status, 503); } finally { process.env.SYNTHETIC_DATA_ONLY = original; }
    await admin.rateLimit.deleteMany();
    for (let i = 0; i < 20; i++) assert.equal((await call({})).status, 400);
    assert.equal((await call(valid, new Headers({ ...Object.fromEntries(headers()), "x-forwarded-for": "192.0.2.99" }))).status, 429);
    assert.equal((await linkGet(request("/api/registration-link", undefined, owners[0]))).status, 200, "anonymous bucket cannot throttle owner operations");
  });
  await t.test("expired, replaced and inactive-gym links reject without writes", async () => {
    const old = codes[0]; const next = await registrationLink(owners[0], true); assert.ok(next);
    codes[0] = new URL(next.url).pathname.split("/").pop()!;
    const count = await admin.member.count(); await assert.rejects(registerMember(old, input()), /unavailable/);
    await admin.registrationLink.updateMany({ where: { code: codes[0] }, data: { expiresAt: new Date() } });
    await assert.rejects(registrationScope(codes[0]), /unavailable/);
    await admin.gym.update({ where: { id: gyms[1] }, data: { state: "DISABLED" } });
    await assert.rejects(registerMember(codes[1], input()), /unavailable/);
    assert.equal(await admin.member.count(), count);
    await admin.gym.update({ where: { id: gyms[1] }, data: { state: "ACTIVE" } });
  });
  await t.test("Pending uses existing full-cash activation, receipt and current eligibility", async () => {
    const plans = await changePlans(owners[0], { action: "initialize" }); const monthly = plans.find(plan => plan.durationDays === 30)!;
    const charge = await prepareCharge(owners[0], pendingId, monthly.id);
    await assert.rejects(confirmCash(owners[0], charge.id, "799.00", randomUUID()));
    assert.equal(await admin.effectiveEntitlement.count({ where: { memberId: pendingId } }), 0);
    const key = randomUUID(); const result = await confirmCash(owners[0], charge.id, "800.00", key);
    const replay = await confirmCash(owners[0], charge.id, "800.00", key); assert.equal(result.payment.id, replay.payment.id);
    assert.equal(await admin.paymentReceipt.count({ where: { paymentId: result.payment.id } }), 1);
    const data = await memberDirectory(owners[0]); const member = data.members.find(row => row.id === pendingId)!;
    assert.equal(directoryMembership(member, data.checkedAt).active, true); assert.equal(directoryMembership(member, data.checkedAt).pending, false);
    const memberHeaders = await login(first.email);
    assert.ok((await memberDashboard(memberHeaders)).qr, "The original signup password gives QR access after cash activation");
  });
  await t.test("unverified signup email supports delivered single-use recovery without changing operator verification", async () => {
    await admin.rateLimit.deleteMany();
    const current = await login(first.email);
    await recoverMember({ email: first.email }, sender);
    const token = setup;
    await completeMemberSetup({ token, password: password + "new" });
    await assert.rejects(completeMemberSetup({ token, password }), /Link expired/);
    await assert.rejects(memberDashboard(current), /Sign in/);
    const old = await auth.handler(new Request(`${origin}/api/auth/sign-in/email`, { method: "POST", headers: headers(), body: JSON.stringify({ email: first.email, password }) }));
    assert.equal(old.status, 401);
    assert.equal((await admin.user.findUniqueOrThrow({ where: { email: first.email } })).emailVerified, true);
    const updated = await auth.handler(new Request(`${origin}/api/auth/sign-in/email`, { method: "POST", headers: headers(), body: JSON.stringify({ email: first.email, password: password + "new" }) }));
    assert.equal(updated.status, 200);
  });
});
