import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { bootstrapSyntheticOwner, completeSetup, inviteStaff, reauthenticate, setCapabilities, IdentityError } from "../src/lib/identity";
import { apiResponse } from "../src/lib/http";
import { POST as identityPost } from "../src/app/api/identity/[action]/route";
import { assertSynthetic, type EmailSender } from "../src/lib/email";
import { inGym } from "../src/lib/tenant";
import { setGymContext } from "../src/lib/binding";
import { createMember, findMembers } from "../src/lib/members";
import { memberCreateSchema, memberSearchSchema } from "../src/lib/member-schema";
import { GET as memberGet, POST as memberPost } from "../src/app/api/members/route";
import { GET as plansGet, POST as plansPost } from "../src/app/api/plans/route";
import { GET as chargeGet, POST as chargePost } from "../src/app/api/charges/route";
import { POST as paymentPost } from "../src/app/api/payments/route";
import { proposedPeriod } from "../src/lib/charges";
import { parsePesos, formatPhp } from "../src/lib/money";
import { assessEligibility, remainingActiveTime } from "../src/lib/eligibility";

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
function paymentReq(headers: Headers, chargeId: string, amount: string, key: string) {
  const h = new Headers(headers); h.set("origin", "http://127.0.0.1:3000"); h.set("content-type", "application/json"); h.set("idempotency-key", key);
  return new Request("http://127.0.0.1:3000/api/payments", { method: "POST", headers: h, body: JSON.stringify({ chargeId, cashReceived: amount }) });
}
after(async () => { await db.$disconnect(); await admin.$disconnect(); });

test("Z-02 member schemas preserve normalization and reject malformed or expanded names", () => {
  assert.deepEqual(memberCreateSchema.parse({ fullName: "  Ｍｅｍｂｅｒ　 Name  " }), { fullName: "Member Name", confirmDuplicate: false });
  assert.equal(memberCreateSchema.safeParse({ fullName: "a".repeat(100), confirmDuplicate: true }).success, true);
  for (const fullName of [undefined, null, 123, [], {}, "", "   ", "a".repeat(101), "Hidden\u0000Name", "Hidden\u200bName", "ﷺ".repeat(6)]) {
    assert.equal(memberCreateSchema.safeParse({ fullName }).success, false);
  }
  assert.equal(memberSearchSchema.parse("  Synthetic  "), "Synthetic");
  assert.equal(memberSearchSchema.parse(""), "");
  assert.equal(memberSearchSchema.safeParse("a".repeat(100)).success, true);
  for (const search of [null, 1, ["Synthetic"], "a".repeat(101)]) assert.equal(memberSearchSchema.safeParse(search).success, false);
});

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

test("S-01g eligibility uses verified half-open paid intervals", () => {
  const start = new Date("2028-02-28T16:00:00.000Z");
  const boundary = new Date("2028-03-29T16:00:00.000Z");
  const end = new Date("2028-04-28T16:00:00.000Z");
  const first = { startsAt: start, endsAt: boundary };
  const second = { startsAt: boundary, endsAt: end };
  assert.equal(assessEligibility([first], start).status, "ELIGIBLE");
  assert.equal(assessEligibility([first], new Date(boundary.getTime() - 1)).status, "ELIGIBLE");
  assert.deepEqual(assessEligibility([first, second], boundary), { status: "ELIGIBLE", interval: second, reason: "A verified paid period is in effect." });
  assert.equal(assessEligibility([first], boundary).status, "EXPIRED");
  assert.equal(assessEligibility([second], new Date(boundary.getTime() - 1)).status, "SCHEDULED");
  assert.equal(assessEligibility([], boundary).status, "NOT_ELIGIBLE");
  assert.equal(assessEligibility([first], end).status, "EXPIRED");
});

test("S-02 all approved durations preserve early time, restart late at Manila midnight and gate queued terms", () => {
  for (const [date, ends] of [
    ["2027-01-31", ["2027-03-02", "2027-05-01", "2027-07-30"]],
    ["2028-01-31", ["2028-03-01", "2028-04-30", "2028-07-29"]],
    ["2027-04-15", ["2027-05-15", "2027-07-14", "2027-10-12"]],
  ] as const) {
    for (const [index, days] of [30, 90, 180].entries()) {
      const now = new Date(`${date}T18:30:00+08:00`);
      const join = proposedPeriod(now, days);
      assert.equal(join.intendedStart.toISOString(), new Date(`${date}T00:00:00+08:00`).toISOString());
      assert.equal(join.intendedEnd.toISOString(), new Date(`${ends[index]}T00:00:00+08:00`).toISOString());
      const current = { startsAt: join.intendedStart, endsAt: join.intendedEnd };
      const early = proposedPeriod(now, days, [current]);
      assert.equal(early.intendedStart.getTime(), current.endsAt.getTime());
      assert.equal(early.intendedEnd.getTime() - early.intendedStart.getTime(), days * 86_400_000);
      const queued = { startsAt: early.intendedStart, endsAt: early.intendedEnd };
      assert.equal(assessEligibility([queued, current], now).interval, current);
      assert.equal(assessEligibility([queued], now).status, "SCHEDULED");
      assert.throws(() => proposedPeriod(now, days, [current, queued]), /future paid period/);
      assert.equal(assessEligibility([current, queued], queued.startsAt).interval, queued);
      assert.equal(proposedPeriod(queued.startsAt, days, [current, queued]).intendedStart.getTime(), queued.endsAt.getTime(), "Another advance term is allowed once the queued term starts");
      const lateAt = new Date(queued.endsAt.getTime() + 2 * 86_400_000 + 18.5 * 3_600_000);
      const late = proposedPeriod(lateAt, days, [current, queued]);
      assert.equal(late.intendedStart.getTime(), queued.endsAt.getTime() + 2 * 86_400_000);
      assert.equal(late.intendedEnd.getTime() - late.intendedStart.getTime(), days * 86_400_000);
      assert.equal(assessEligibility([current, queued], lateAt).status, "EXPIRED");
    }
  }
});

test("S-02 remaining time rounds down within only the current paid period", () => {
  const interval = { startsAt: new Date("2028-02-28T16:00:00Z"), endsAt: new Date("2028-03-29T16:00:00Z") };
  const at = (remaining: number) => new Date(interval.endsAt.getTime() - remaining);
  assert.equal(remainingActiveTime(interval, interval.startsAt), "30 days 0 hours");
  assert.equal(remainingActiveTime(interval, at(25 * 3_600_000 + 59 * 60_000)), "1 day 1 hour");
  assert.equal(remainingActiveTime(interval, at(24 * 3_600_000 - 1)), "0 days 23 hours");
  assert.equal(remainingActiveTime(interval, at(3_600_000)), "0 days 1 hour");
  assert.equal(remainingActiveTime(interval, at(3_600_000 - 1)), "less than 1 hour");
  assert.equal(remainingActiveTime(interval, at(1)), "less than 1 hour");
  assert.equal(remainingActiveTime(interval, interval.endsAt), null);
  assert.equal(remainingActiveTime(interval, at(-1)), null);
  assert.equal(remainingActiveTime(interval, new Date(interval.startsAt.getTime() - 1)), null);
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
  await t.test("R-10 authenticated endpoint denials survive rollback with tenant-safe attribution and no domain writes", async () => {
    const counts = async () => Promise.all([admin.member.count(), admin.plan.count(), admin.charge.count(), admin.payment.count(),
      admin.membershipPeriod.count(), admin.paymentReceipt.count(), admin.idempotencyOperation.count(), admin.invitation.count()]);
    const before = await counts();
    const requests = [
      () => identityPost(req("/api/identity/invite", staffHeaders, { name: "Denied Invitation", email: `denied-${suffix}@example.test`, username: `denied_${suffix}` }), { params: Promise.resolve({ action: "invite" }) }),
      () => plansPost(req("/api/plans", staffHeaders, { action: "initialize" })),
      () => memberPost(req("/api/members", staffHeaders, { fullName: "Denied Member" })),
      () => chargePost(req("/api/charges", staffHeaders, { memberId: randomUUID(), planId: randomUUID() })),
      () => paymentPost(paymentReq(staffHeaders, randomUUID(), "800", randomUUID())),
    ];
    for (const denied of requests) {
      const response = await denied();
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("cash-confirmation-outcome"), null, "Authorization cannot settle a prior collection");
      const body = await response.json();
      assert.match(body.errorReference, /^[0-9a-f-]{36}$/);
      assert.ok(body.error.includes(body.errorReference));
      const row = await admin.identityAudit.findFirstOrThrow({ where: { action: { endsWith: body.errorReference } } });
      assert.equal(row.gymId, gyms[0]); assert.equal(row.initiatorId, staff.userId); assert.equal(row.subjectId, staff.userId);
      assert.match(row.action, /^ACCESS_DENIED POST \/api\/(identity\/invite|plans|members|charges|payments) 403 /);
      assert.equal(await inGym(owners[1], "OWNER", tx => tx.identityAudit.count({ where: { id: row.id } })), 0);
      await assert.rejects(inGym(owners[0], "OWNER", tx => tx.identityAudit.update({ where: { id: row.id }, data: { action: "rewritten" } })));
      await assert.rejects(inGym(owners[0], "OWNER", tx => tx.identityAudit.delete({ where: { id: row.id } })));
    }
    assert.deepEqual(await counts(), before);
    const auditCount = await admin.identityAudit.count();
    assert.equal((await memberGet(req("/api/members", new Headers()))).status, 401);
    assert.equal((await memberPost(req("/api/members", staffHeaders, { fullName: null }))).status, 400);
    assert.equal(await admin.identityAudit.count(), auditCount, "No fabricated actor for anonymous/input denials");
  });
  await t.test("R-10 unexpected failures redact payloads/errors and retain rollback; audit failure preserves denial", async t => {
    const sentinel = "SENSITIVE-password-token-cookie-db-url-member";
    const logs: string[] = [];
    t.mock.method(console, "error", (value: string) => logs.push(value));
    const before = await admin.member.count();
    const response = await apiResponse(req(`/api/${sentinel}?token=${sentinel}`, owners[0], { password: sentinel }), () =>
      inGym(owners[0], "MEMBERS", async (tx, actor) => {
        await tx.member.create({ data: { gymId: gyms[0], fullName: "Rolled Back Diagnostic Member", nameKey: "rolled back diagnostic member", createdBy: actor.operator.id } });
        throw Object.assign(new Error(sentinel, { cause: new Error(sentinel) }), { code: sentinel });
      }));
    assert.equal(response.status, 500); assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.error, `Request could not be completed. Try again. Reference: ${body.errorReference}.`);
    assert.deepEqual(JSON.parse(logs[0]), { event: "REQUEST_FAILED", reference: body.errorReference, method: "POST", route: "/api/other", status: 500 });
    assert.equal(await admin.member.count(), before);
    const next = await apiResponse(req("/api/members", new Headers()), async () => { throw new Error(sentinel); });
    assert.notEqual((await next.json()).errorReference, body.errorReference);
    await admin.$executeRawUnsafe(`CREATE FUNCTION public.synthetic_denial_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.gym_id = '${gyms[0]}'::uuid AND NEW.action LIKE 'ACCESS_DENIED %' THEN RAISE EXCEPTION 'SENSITIVE-password-token-cookie-db-url-member'; END IF;
      RETURN NEW; END $$`);
    try {
      await admin.$executeRawUnsafe("CREATE TRIGGER synthetic_denial_failure BEFORE INSERT ON identity_audit FOR EACH ROW EXECUTE FUNCTION public.synthetic_denial_failure()");
      const failedAudit = await apiResponse(req("/api/payments", staffHeaders, {}), async () => { throw new IdentityError(403, "Your account does not have permission for this action."); });
      assert.equal(failedAudit.status, 403); assert.equal(failedAudit.headers.get("cash-confirmation-outcome"), null);
      const denial = await failedAudit.json();
      assert.deepEqual(JSON.parse(logs[2]), { event: "DENIAL_AUDIT_FAILED", reference: denial.errorReference, method: "POST", route: "/api/payments", status: 403 });
      assert.ok(!JSON.stringify([body, denial, logs]).includes(sentinel));
      assert.ok(!logs.join("").includes(staff.userId)); assert.ok(!logs.join("").includes(gyms[0]));
      for (const secret of [password, process.env.DATABASE_URL!, owners[0].get("cookie")!]) assert.ok(!logs.join("").includes(secret));
    } finally {
      await admin.$executeRawUnsafe("DROP TRIGGER IF EXISTS synthetic_denial_failure ON identity_audit");
      await admin.$executeRawUnsafe("DROP FUNCTION public.synthetic_denial_failure()");
    }
  });
  await t.test("S-01c member create/search validate inputs and deny anonymous/ungranted staff endpoints", async () => {
    await createMember(owners[0], { fullName: "Direct service check" });
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
  await t.test("R-09 runtime can lock members with only UPDATE(id); IDs and all member edits stay protected", async () => {
    const member = await createMember(owners[0], { fullName: "Immutable Lock Member" });
    const [privileges] = await db.$queryRaw<{ update: boolean; delete: boolean; truncate: boolean; rolsuper: boolean; rolbypassrls: boolean; owns: boolean }[]>`SELECT
      has_table_privilege(current_user, 'members', 'UPDATE') AS update,
      has_table_privilege(current_user, 'members', 'DELETE') AS delete,
      has_table_privilege(current_user, 'members', 'TRUNCATE') AS truncate,
      rolsuper, rolbypassrls, pg_get_userbyid(c.relowner) = current_user AS owns
      FROM pg_roles r CROSS JOIN pg_class c WHERE r.rolname = current_user AND c.oid = 'members'::regclass`;
    assert.deepEqual(privileges, { update: false, delete: false, truncate: false, rolsuper: false, rolbypassrls: false, owns: false });
    const columns = await db.$queryRaw<{ attname: string }[]>`SELECT attname FROM pg_attribute
      WHERE attrelid = 'members'::regclass AND attnum > 0 AND NOT attisdropped
      AND has_column_privilege(current_user, 'members', attname, 'UPDATE') ORDER BY attname`;
    assert.deepEqual(columns.map(column => column.attname), ["id"]);
    assert.deepEqual(await inGym(owners[0], "CASH", tx => tx.$queryRaw`SELECT id FROM members
      WHERE id = ${member.id}::uuid AND gym_id = ${gyms[0]}::uuid FOR UPDATE`), [{ id: member.id }]);
    for (const id of [randomUUID(), member.id]) {
      await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.$executeRaw`UPDATE members SET id = ${id}::uuid
        WHERE id = ${member.id}::uuid`), /Member IDs are immutable/);
    }
    for (const data of [{ fullName: "Changed" }, { nameKey: "changed" }, { gymId: gyms[1] },
      { createdBy: staff.id }, { createdAt: new Date(0) }]) {
      await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.member.update({ where: { id: member.id }, data })), /permission denied for table members/);
    }
    await assert.rejects(inGym(owners[0], "MEMBERS", tx => tx.member.delete({ where: { id: member.id } })), /permission denied for table members/);
    await assert.rejects(inGym(owners[0], "OWNER", tx => tx.$executeRawUnsafe("ALTER TABLE members DISABLE TRIGGER immutable_member_id")), /must be owner of table members/);
    assert.deepEqual(await admin.member.findUniqueOrThrow({ where: { id: member.id } }), member);
  });
  await t.test("R-09 row locks fail closed without tenant context and pooled context expires after commit and rollback", async () => {
    const members = await Promise.all(owners.map((owner, index) => createMember(owner, { fullName: `Pooled Lock Member ${index}` })));
    const pooled = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1, options: "-c timezone=UTC" }) });
    try {
      assert.deepEqual(await pooled.$queryRaw`SELECT id FROM members WHERE id = ${members[0].id}::uuid FOR UPDATE`, []);
      const pids: number[] = [];
      for (const index of [0, 1, 0, 1]) {
        await pooled.$transaction(async tx => {
          await setGymContext(tx, gyms[index]);
          const [connection] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
          pids.push(connection.pid);
          // RLS must protect the row even if the caller omits an explicit gym predicate.
          assert.deepEqual(await tx.$queryRaw`SELECT id FROM members WHERE id = ${members[index].id}::uuid FOR UPDATE`, [{ id: members[index].id }]);
          assert.deepEqual(await tx.$queryRaw`SELECT id FROM members WHERE id = ${members[1 - index].id}::uuid FOR UPDATE`, []);
          assert.deepEqual(await tx.$queryRaw`SELECT id FROM members WHERE id = ${randomUUID()}::uuid FOR UPDATE`, []);
          assert.equal(await tx.$executeRaw`UPDATE members SET id = ${randomUUID()}::uuid WHERE id = ${members[1 - index].id}::uuid`, 0);
        });
        assert.deepEqual(await pooled.$queryRaw`SELECT id FROM members FOR UPDATE`, []);
        await assert.rejects(pooled.$transaction(async tx => {
          await setGymContext(tx, gyms[index]);
          await tx.$queryRaw`SELECT id FROM members WHERE id = ${members[index].id}::uuid FOR UPDATE`;
          throw new Error("Synthetic lock rollback");
        }), /Synthetic lock rollback/);
        assert.deepEqual(await pooled.$queryRaw`SELECT id FROM members FOR UPDATE`, []);
        assert.equal(await pooled.$executeRaw`UPDATE members SET id = ${randomUUID()}::uuid WHERE id = ${members[index].id}::uuid`, 0);
        await inGym(owners[index], "CASH", tx => tx.$queryRaw`SELECT id FROM members WHERE id = ${members[index].id}::uuid FOR UPDATE NOWAIT`);
      }
      assert.equal(new Set(pids).size, 1, "Both tenants must reuse one physical runtime connection");
    } finally { await pooled.$disconnect(); }
  });
  await t.test("Z-02 direct member input failures reject protected fields without writes or raw-input disclosure", async () => {
    const beforeMembers = await admin.member.count();
    const beforeAudit = await admin.identityAudit.count({ where: { action: "MEMBER_CREATED" } });
    const forbidden = "DO_NOT_ECHO_SYNTHETIC_INPUT";
    const invalidBodies: unknown[] = [null, [], {}, { fullName: null }, { fullName: 1 }, { fullName: [] },
      { fullName: "   " }, { fullName: "a".repeat(101) }, { fullName: "Hidden\u0000Name" }, { fullName: "ﷺ".repeat(6) },
      { fullName: "Synthetic", confirmDuplicate: "true" }, { fullName: "Synthetic", confirmDuplicate: null },
      ...["gymId", "createdBy", "role", "canManageMembers", forbidden].map(key => ({ fullName: "Synthetic", [key]: forbidden }))];
    for (const body of invalidBodies) {
      const headers = new Headers(owners[0]); headers.set("origin", "http://127.0.0.1:3000"); headers.set("content-type", "application/json");
      const response = await memberPost(new Request("http://127.0.0.1:3000/api/members", { method: "POST", headers, body: JSON.stringify(body) }));
      assert.equal(response.status, 400);
      const result = await response.json();
      assert.equal(typeof result.error, "string");
      assert.equal(JSON.stringify(result).includes(forbidden), false);
      assert.equal("issues" in result, false);
      assert.equal("stack" in result, false);
      if (body && typeof body === "object" && "fullName" in body && body.fullName === null) {
        assert.equal(result.fieldErrors.fullName, "Enter a member name with 1–100 visible characters.");
      }
    }
    for (const query of [`q=${"a".repeat(101)}`, "q=Synthetic&q=Other"]) {
      const response = await memberGet(req(`/api/members?${query}`, owners[0]));
      assert.equal(response.status, 400);
      assert.equal(typeof (await response.json()).fieldErrors.q, "string");
    }
    await assert.rejects(createMember(owners[0], { fullName: "Synthetic", gymId: gyms[1] }), { status: 400 });
    await assert.rejects(findMembers(owners[0], ["Synthetic"]), { status: 400 });
    assert.equal(await admin.member.count(), beforeMembers);
    assert.equal(await admin.identityAudit.count({ where: { action: "MEMBER_CREATED" } }), beforeAudit);
    assert.equal((await memberPost(req("/api/members", new Headers(), { fullName: "Anonymous" }))).status, 401);
    assert.equal((await memberPost(req("/api/members", owners[1], { fullName: "  Ｍｅｍｂｅｒ　 Name  " }))).status, 200);
    const found = await (await memberGet(req("/api/members?q=%20Member%20Name%20", owners[1]))).json();
    assert.equal(found.length, 1); assert.equal(found[0].fullName, "Member Name"); assert.equal(found[0].gymId, gyms[1]);
    assert.equal((await (await memberGet(req("/api/members?q=Member%20Name", owners[0]))).json()).length, 0);
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
    memberId = (await createMember(owners[0], { fullName: "Charge Preview Member" })).id;
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
    const foreignMember = await createMember(owners[1], { fullName: "Other Gym Member" });
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
  await t.test("S-01e rejects short, stale, unauthorized and malformed cash confirmations", async () => {
    const member = await createMember(owners[0], { fullName: "Short Payment Member" });
    const plan = await admin.plan.findFirstOrThrow({ where: { gymId: gyms[0], durationDays: 30 } });
    const charge = await (await chargePost(req("/api/charges", owners[0], { memberId: member.id, planId: plan.id }))).json();
    assert.equal((await paymentPost(paymentReq(owners[0], chargeId, "800", randomUUID()))).status, 409);
    const short = await paymentPost(paymentReq(owners[0], charge.id, "900", randomUUID()));
    assert.equal(short.status, 400);
    assert.equal(short.headers.get("cash-confirmation-outcome"), "not-confirmed");
    assert.equal((await paymentPost(paymentReq(owners[0], charge.id, "900.001", randomUUID()))).status, 400);
    assert.equal((await paymentPost(paymentReq(owners[0], charge.id, "900.25", "bad-key"))).status, 400);
    const anonymous = await paymentPost(paymentReq(new Headers(), charge.id, "900.25", randomUUID()));
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.headers.get("cash-confirmation-outcome"), null);
    await setCapabilities(owners[0], staff.id, { canManageMembers: true, canCollectCash: false });
    assert.equal((await paymentPost(paymentReq(staffHeaders, charge.id, "900.25", randomUUID()))).status, 403);
    await setCapabilities(owners[0], staff.id, { canManageMembers: true, canCollectCash: true });
    assert.equal(await admin.payment.count({ where: { memberId: member.id } }), 0);
    assert.equal(await admin.membershipPeriod.count({ where: { memberId: member.id } }), 0);
  });
  await t.test("S-01e payment, paid period, projection, receipt and audit roll back together on a failed write", async () => {
    const member = await createMember(owners[0], { fullName: "Rollback Member" });
    const plan = await admin.plan.findFirstOrThrow({ where: { gymId: gyms[0], durationDays: 90 } });
    const charge = await (await chargePost(req("/api/charges", owners[0], { memberId: member.id, planId: plan.id }))).json();
    const key = randomUUID();
    const receiptsBefore = await admin.paymentReceipt.count();
    const operationsBefore = await admin.idempotencyOperation.count();
    const auditBefore = await admin.identityAudit.count({ where: { gymId: gyms[0], action: "CASH_PAYMENT_CONFIRMED" } });
    await admin.$executeRawUnsafe(`CREATE FUNCTION public.fail_period_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic period write failure'; END $$`);
    await admin.$executeRawUnsafe("CREATE TRIGGER synthetic_period_failure BEFORE INSERT ON membership_periods FOR EACH ROW EXECUTE FUNCTION public.fail_period_insert()");
    try { assert.equal((await paymentPost(paymentReq(owners[0], charge.id, "2100", key))).status, 500); }
    finally {
      await admin.$executeRawUnsafe("DROP TRIGGER synthetic_period_failure ON membership_periods");
      await admin.$executeRawUnsafe("DROP FUNCTION public.fail_period_insert()");
    }
    assert.equal(await admin.payment.count({ where: { memberId: member.id } }), 0);
    assert.equal(await admin.membershipPeriod.count({ where: { memberId: member.id } }), 0);
    assert.equal(await admin.effectiveEntitlement.count({ where: { memberId: member.id } }), 0);
    assert.equal(await admin.paymentReceipt.count(), receiptsBefore);
    assert.equal(await admin.idempotencyOperation.count(), operationsBefore);
    assert.equal(await admin.identityAudit.count({ where: { gymId: gyms[0], action: "CASH_PAYMENT_CONFIRMED" } }), auditBefore);
    const retried = await paymentPost(paymentReq(owners[0], charge.id, "2100", key));
    assert.equal(retried.status, 200);
    assert.equal((await retried.json()).payment.amountCentavos, 210_000);
  });
  await t.test("R-01 lost response survives price changes and permission denial; same-key retry retrieves the original", async () => {
    const member = await createMember(owners[0], { fullName: "Recovery Regression Member" });
    const plan = await admin.plan.findFirstOrThrow({ where: { gymId: gyms[0], durationDays: 30 } });
    const charge = await (await chargePost(req("/api/charges", owners[0], { memberId: member.id, planId: plan.id }))).json();
    const cash = `${Math.floor(plan.priceCentavos / 100)}.${String(plan.priceCentavos % 100).padStart(2, "0")}`;
    const key = randomUUID();
    const lost = await paymentPost(paymentReq(staffHeaders, charge.id, cash, key));
    assert.equal(lost.status, 200); // Discard the committed response as if the connection was lost.
    const original = await admin.payment.findFirstOrThrow({ where: { memberId: member.id } });
    await setCapabilities(owners[0], staff.id, { canManageMembers: true, canCollectCash: false });
    const denied = await paymentPost(paymentReq(staffHeaders, charge.id, cash, key));
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("cash-confirmation-outcome"), null, "403 cannot settle the prior commit");
    await setCapabilities(owners[0], staff.id, { canManageMembers: true, canCollectCash: true });
    const priceChange = await plansPost(req("/api/plans", owners[0], { action: "update", planId: plan.id, version: plan.version, price: "950.25" }));
    assert.equal(priceChange.status, 200);
    const retry = await paymentPost(paymentReq(staffHeaders, charge.id, cash, key));
    assert.equal(retry.status, 200, "Replay must precede current catalogue validation");
    const result = await retry.json();
    assert.equal(result.payment.id, original.id);
    assert.equal(result.payment.reference, original.reference);
    assert.equal(result.receipt.paymentId, original.id);
    assert.equal(await admin.payment.count({ where: { memberId: member.id } }), 1);
    assert.equal(await admin.membershipPeriod.count({ where: { memberId: member.id } }), 1);
    // A different, uncommitted stale operation can be released only after serialized lookup.
    const stale = await paymentPost(paymentReq(staffHeaders, charge.id, cash, randomUUID()));
    assert.equal(stale.status, 409);
    assert.equal(stale.headers.get("cash-confirmation-outcome"), "not-confirmed");
  });
  await t.test("S-01e same-key concurrent retry returns one immutable confirmed result", async () => {
    const member = await createMember(owners[0], { fullName: "Confirmed Cash Member" });
    const plan = await admin.plan.findFirstOrThrow({ where: { gymId: gyms[0], durationDays: 30 } });
    const charge = await (await chargePost(req("/api/charges", owners[0], { memberId: member.id, planId: plan.id }))).json();
    const cash = `${Math.floor(plan.priceCentavos / 100)}.${String(plan.priceCentavos % 100).padStart(2, "0")}`;
    const key = randomUUID();
    const [first, retry] = await Promise.all([paymentPost(paymentReq(owners[0], charge.id, cash, key)), paymentPost(paymentReq(owners[0], charge.id, cash, key))]);
    assert.deepEqual([first.status, retry.status], [200, 200]);
    const results = await Promise.all([first.json(), retry.json()]);
    assert.equal(results[0].payment.id, results[1].payment.id);
    assert.equal(results[0].payment.reference, results[1].payment.reference);
    assert.equal(results[0].payment.amountCentavos, plan.priceCentavos);
    assert.equal(results[0].payment.method, "CASH");
    const owner = await admin.operator.findFirstOrThrow({ where: { gymId: gyms[0], role: "OWNER" } });
    assert.equal(results[0].payment.collectedBy, owner.id);
    assert.equal(results[0].payment.verifiedBy, owner.id);
    assert.equal(new Date(results[0].period.endsAt).getTime() - new Date(results[0].period.startsAt).getTime(), 30 * 86_400_000);
    assert.equal(new Date(results[0].period.startsAt).getTime(), proposedPeriod(new Date(results[0].payment.collectedAt), 30).intendedStart.getTime());
    assert.equal(results[0].receipt.paymentId, results[0].payment.id);
    assert.equal(await inGym(owners[1], "MEMBERS", tx => tx.paymentReceipt.findUnique({ where: { id: results[0].receipt.id } })), null);
    assert.equal(await admin.identityAudit.count({ where: { gymId: gyms[0], action: "CASH_PAYMENT_CONFIRMED", subjectId: results[0].payment.id } }), 1);
    assert.equal(await admin.payment.count({ where: { memberId: member.id } }), 1);
    assert.equal(await admin.membershipPeriod.count({ where: { memberId: member.id } }), 1);
    assert.equal(await admin.effectiveEntitlement.count({ where: { memberId: member.id } }), 1);
    assert.equal(await admin.paymentReceipt.count({ where: { paymentId: results[0].payment.id } }), 1);
    const conflictAmount = `${Math.floor((plan.priceCentavos + 1) / 100)}.${String((plan.priceCentavos + 1) % 100).padStart(2, "0")}`;
    const conflict = await paymentPost(paymentReq(owners[0], charge.id, conflictAmount, key));
    assert.equal(conflict.status, 409);
    assert.equal(conflict.headers.get("cash-confirmation-outcome"), null);
    assert.equal((await paymentPost(paymentReq(owners[1], charge.id, cash, randomUUID()))).status, 404);
    assert.equal((await paymentPost(paymentReq(owners[0], charge.id, cash, randomUUID()))).status, 409);
    assert.equal(await admin.payment.count({ where: { memberId: member.id } }), 1);
    await assert.rejects(inGym(owners[0], "CASH", tx => tx.payment.update({ where: { id: results[0].payment.id }, data: { amountCentavos: 1 } })));
    await assert.rejects(admin.payment.update({ where: { id: results[0].payment.id }, data: { amountCentavos: 1 } }));
    await assert.rejects(admin.membershipPeriod.delete({ where: { id: results[0].period.id } }));
    await assert.rejects(admin.paymentReceipt.update({ where: { id: results[0].receipt.id }, data: { reference: "rewritten" } }));
    await assert.rejects(admin.effectiveEntitlement.create({ data: { gymId: gyms[0], memberId: member.id, periodId: results[0].period.id, startsAt: new Date(results[0].period.startsAt), endsAt: new Date(results[0].period.endsAt) } }));
    const advanceCharge = await (await chargePost(req("/api/charges", owners[0], { memberId: member.id, planId: plan.id }))).json();
    const competingAdvance = await (await chargePost(req("/api/charges", owners[0], { memberId: member.id, planId: plan.id }))).json();
    assert.equal(advanceCharge.intendedStart, results[0].period.endsAt);
    const advanceResponse = await paymentPost(paymentReq(owners[0], advanceCharge.id, cash, randomUUID()));
    assert.equal(advanceResponse.status, 200);
    const advance = await advanceResponse.json();
    assert.equal(new Date(advance.period.startsAt).getTime(), new Date(results[0].period.endsAt).getTime());
    assert.equal(advance.period.startsAt, advanceCharge.intendedStart);
    assert.equal(advance.period.endsAt, advanceCharge.intendedEnd);
    const previewsBefore = await admin.charge.count({ where: { memberId: member.id } });
    const auditsBefore = await admin.identityAudit.count({ where: { gymId: gyms[0], action: "CHARGE_PREVIEW_PREPARED" } });
    const blockedPreview = await chargePost(req("/api/charges", owners[0], { memberId: member.id, planId: plan.id }));
    assert.equal(blockedPreview.status, 409);
    assert.match((await blockedPreview.json()).error, /future paid period/);
    assert.equal(await admin.charge.count({ where: { memberId: member.id } }), previewsBefore);
    assert.equal(await admin.identityAudit.count({ where: { gymId: gyms[0], action: "CHARGE_PREVIEW_PREPARED" } }), auditsBefore);
    const blockedConfirmation = await paymentPost(paymentReq(owners[0], competingAdvance.id, cash, randomUUID()));
    assert.equal(blockedConfirmation.status, 409);
    assert.equal(blockedConfirmation.headers.get("cash-confirmation-outcome"), "not-confirmed");
    assert.match((await blockedConfirmation.json()).error, /future paid period/);
    // Committed-key recovery still precedes the new queued-term/date gates.
    const replay = await paymentPost(paymentReq(owners[0], charge.id, cash, key));
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).payment.id, results[0].payment.id);
    await assert.rejects(admin.payment.create({ data: { gymId: gyms[0], memberId: member.id, chargeId: competingAdvance.id, reference: `BAD-${randomUUID()}`, amountCentavos: 1, collectedBy: owner.id, collectedAt: new Date(), verifiedBy: owner.id } }));
    const operation = await admin.idempotencyOperation.findUniqueOrThrow({ where: { gymId_operationType_operationKey: { gymId: gyms[0], operationType: "CASH_CONFIRMATION", operationKey: key } } });
    await assert.rejects(admin.idempotencyOperation.update({ where: { id: operation.id }, data: { requestFingerprint: "tampered" } }));
    await assert.rejects(admin.idempotencyOperation.delete({ where: { id: operation.id } }));
    const projection = await admin.effectiveEntitlement.findFirstOrThrow({ where: { periodId: advance.period.id } });
    await assert.rejects(admin.effectiveEntitlement.update({ where: { id: projection.id }, data: { startsAt: new Date(new Date(projection.startsAt).getTime() - 1000) } }));
    assert.equal(await admin.payment.count({ where: { memberId: member.id } }), 2);
    const policies = await db.$queryRaw<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('payments','membership_periods','effective_entitlement_intervals','idempotency_operations','payment_receipts') AND relnamespace='public'::regnamespace`;
    assert.equal(policies.length, 5); for (const policy of policies) assert.deepEqual(policy, { relrowsecurity: true, relforcerowsecurity: true });
  });
  // Isolate added scenarios from earlier actor-scoped preview attempts.
  await admin.rateLimit.deleteMany({ where: { key: { startsWith: "identity:charge-preview:" } } });
  await t.test("R-02 late renewal and midnight rollover require a fresh review before charging", async t => {
    const plan = await admin.plan.findFirstOrThrow({ where: { gymId: gyms[0], durationDays: 30 } });
    const cash = (plan.priceCentavos / 100).toFixed(2);
    const member = await createMember(owners[0], { fullName: "Late Renewal Midnight Member" });
    const midnight = proposedPeriod(new Date(), 30).intendedStart.getTime() + 86_400_000;
    t.mock.timers.enable({ apis: ["Date"], now: midnight - 32 * 86_400_000 });
    const preview = async (memberId = member.id) => {
      const response = await chargePost(req("/api/charges", owners[0], { memberId, planId: plan.id }));
      assert.equal(response.status, 200);
      return response.json();
    };
    const original = await preview();
    const originalResponse = await paymentPost(paymentReq(owners[0], original.id, cash, randomUUID()));
    assert.equal(originalResponse.status, 200);
    const originalPaid = await originalResponse.json();
    const rolloverMember = await createMember(owners[0], { fullName: "Rollover Review Member" });
    const oldRollover = await preview(rolloverMember.id);
    assert.equal((await paymentPost(paymentReq(owners[0], oldRollover.id, cash, randomUUID()))).status, 200);
    t.mock.timers.setTime(midnight - 1);
    const late = await preview();
    assert.equal(late.intendedStart, new Date(midnight - 86_400_000).toISOString());
    assert.notEqual(late.intendedStart, originalPaid.period.endsAt, "Late renewal never backdates to old expiry");
    const onTime = await paymentPost(paymentReq(owners[0], late.id, cash, randomUUID()));
    assert.equal(onTime.status, 200);
    const latePaid = await onTime.json();
    assert.equal(latePaid.period.startsAt, late.intendedStart);
    assert.equal(latePaid.period.endsAt, late.intendedEnd);

    const early = await preview();
    // A separate expired member reviews before midnight and confirms after it.
    const stale = await preview(rolloverMember.id);
    t.mock.timers.tick(1);
    const unchanged = await paymentPost(paymentReq(owners[0], early.id, cash, randomUUID()));
    assert.equal(unchanged.status, 200, "Midnight alone does not invalidate an unchanged early-renewal interval");
    const earlyPaid = await unchanged.json();
    assert.equal(earlyPaid.period.startsAt, early.intendedStart);
    assert.equal(earlyPaid.period.endsAt, early.intendedEnd);
    const key = randomUUID();
    const operationsBefore = await admin.idempotencyOperation.count();
    const auditBefore = await admin.identityAudit.count({ where: { gymId: gyms[0], action: "CASH_PAYMENT_CONFIRMED" } });
    for (let retry = 0; retry < 2; retry++) {
      const rejected = await paymentPost(paymentReq(owners[0], stale.id, cash, key));
      assert.equal(rejected.status, 409);
      assert.equal(rejected.headers.get("cash-confirmation-outcome"), "not-confirmed");
      assert.match((await rejected.json()).error, /Prepare and review a new charge/);
    }
    assert.equal(await admin.payment.count({ where: { memberId: rolloverMember.id } }), 1);
    assert.equal(await admin.membershipPeriod.count({ where: { memberId: rolloverMember.id } }), 1);
    assert.equal(await admin.effectiveEntitlement.count({ where: { memberId: rolloverMember.id } }), 1);
    assert.equal(await admin.idempotencyOperation.count(), operationsBefore);
    assert.equal(await admin.identityAudit.count({ where: { gymId: gyms[0], action: "CASH_PAYMENT_CONFIRMED" } }), auditBefore);
    const freshResponse = await chargePost(req("/api/charges", owners[0], { memberId: rolloverMember.id, planId: plan.id }));
    assert.equal(freshResponse.status, 200);
    const fresh = await freshResponse.json();
    assert.equal(fresh.intendedStart, new Date(midnight).toISOString());
    assert.notEqual(fresh.id, stale.id);
    const freshKey = randomUUID();
    const accepted = await paymentPost(paymentReq(owners[0], fresh.id, cash, freshKey));
    assert.equal(accepted.status, 200);
    const paid = await accepted.json();
    const stored = await admin.membershipPeriod.findUniqueOrThrow({ where: { id: paid.period.id } });
    assert.equal(stored.startsAt.toISOString(), fresh.intendedStart);
    assert.equal(stored.endsAt.toISOString(), fresh.intendedEnd);
    t.mock.timers.tick(86_400_000);
    const replay = await paymentPost(paymentReq(owners[0], fresh.id, cash, freshKey));
    assert.equal(replay.status, 200, "A committed result survives date rollover");
    assert.equal((await replay.json()).payment.id, paid.payment.id);
    assert.equal(await admin.payment.count({ where: { memberId: rolloverMember.id } }), 2);
  });
  await t.test("R-09/R-02 distinct-key joins and renewals wait on member row locks, then recheck dates after commit/rollback", async () => {
    const plan = await admin.plan.findFirstOrThrow({ where: { gymId: gyms[0], durationDays: 90 } });
    const cash = (plan.priceCentavos / 100).toFixed(2);
    const member = await createMember(owners[0], { fullName: "Competing Review Member" });
    for (const sale of ["join", "early renewal"]) {
      const independent = await createMember(owners[0], { fullName: `Independent ${sale} Member` });
      const independentCharge = await (await chargePost(req("/api/charges", owners[0], { memberId: independent.id, planId: plan.id }))).json();
      const previews = await Promise.all([0, 1].map(async () => {
        const response = await chargePost(req("/api/charges", owners[0], { memberId: member.id, planId: plan.id }));
        assert.equal(response.status, 200);
        return response.json();
      }));
      assert.notEqual(previews[0].id, previews[1].id);
      assert.equal(previews[0].intendedStart, previews[1].intendedStart);
      const keys = [randomUUID(), randomUUID()];
      // Hold a real restricted-runtime member row lock until BOTH confirmations wait.
      let pending!: Promise<Response[]>;
      const release = inGym(owners[0], "CASH", async tx => {
        await tx.$queryRaw`SELECT id FROM members WHERE id = ${member.id}::uuid AND gym_id = ${gyms[0]}::uuid FOR UPDATE`;
        const [holder] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        pending = Promise.all(previews.map((charge, index) => paymentPost(paymentReq(owners[0], charge.id, cash, keys[index]))));
        let waiting = 0;
        for (let attempt = 0; attempt < 100 && waiting < 2; attempt++) {
          // The second row waiter may queue behind the first waiter rather than directly behind the holder.
          const rows = await admin.$queryRaw<{ count: bigint }[]>`WITH RECURSIVE blocked(pid) AS (
            SELECT pid FROM pg_stat_activity WHERE ${holder.pid} = ANY(pg_blocking_pids(pid))
            UNION SELECT a.pid FROM pg_stat_activity a JOIN blocked b ON b.pid = ANY(pg_blocking_pids(a.pid))
          ) SELECT count(*) FROM pg_stat_activity a JOIN blocked b USING (pid)
            WHERE a.usename = 'gym_runtime' AND a.wait_event_type = 'Lock' AND a.query LIKE 'SELECT id FROM members%FOR UPDATE'`;
          waiting = Number(rows[0].count);
          if (waiting < 2) await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal(waiting, 2, "Both runtime confirmations must wait on the member row lock");
        assert.equal(await admin.payment.count({ where: { memberId: member.id } }), sale === "join" ? 0 : 1);
        const independentResult = await paymentPost(paymentReq(owners[0], independentCharge.id, cash, randomUUID()));
        assert.equal(independentResult.status, 200, "A different member in the same gym must proceed while this member is locked");
        if (sale === "early renewal") throw new Error("Synthetic lock-holder rollback");
      });
      if (sale === "join") await release;
      else await assert.rejects(release, /Synthetic lock-holder rollback/);
      const responses = await pending;
      assert.deepEqual(responses.map(response => response.status).sort(), [200, 409], sale);
      const winner = responses.findIndex(response => response.status === 200);
      const loser = 1 - winner;
      const paid = await responses[winner].json();
      const rejected = await responses[loser].json();
      assert.match(rejected.error, sale === "join" ? /Membership dates changed/ : /future paid period/);
      assert.equal(responses[loser].headers.get("cash-confirmation-outcome"), "not-confirmed");
      assert.equal(paid.period.startsAt, previews[winner].intendedStart);
      assert.equal(paid.period.endsAt, previews[winner].intendedEnd);
      const stored = await admin.membershipPeriod.findUniqueOrThrow({ where: { id: paid.period.id } });
      assert.equal(stored.startsAt.toISOString(), previews[winner].intendedStart);
      assert.equal(stored.endsAt.toISOString(), previews[winner].intendedEnd);
      assert.equal(await admin.idempotencyOperation.count({ where: { gymId: gyms[0], operationKey: keys[loser] } }), 0);
      const expected = sale === "join" ? 1 : 2;
      assert.equal(await admin.payment.count({ where: { memberId: member.id } }), expected);
      assert.equal(await admin.membershipPeriod.count({ where: { memberId: member.id } }), expected);
      assert.equal(await admin.effectiveEntitlement.count({ where: { memberId: member.id } }), expected);
      assert.equal(await admin.paymentReceipt.count({ where: { payment: { memberId: member.id } } }), expected);
      const replay = await paymentPost(paymentReq(owners[0], previews[winner].id, cash, keys[winner]));
      assert.equal(replay.status, 200);
      assert.equal((await replay.json()).payment.id, paid.payment.id);
    }
    // Exclusion remains a backstop even if a caller omits the application lock.
    const projection = await admin.effectiveEntitlement.findFirstOrThrow({ where: { memberId: member.id } });
    const unusedCharge = await admin.charge.findFirstOrThrow({ where: { memberId: member.id, payment: null } });
    await assert.rejects(inGym(owners[0], "CASH", async (tx, actor) => {
      const payment = await tx.payment.create({ data: { gymId: gyms[0], memberId: member.id, chargeId: unusedCharge.id,
        reference: `OVERLAP-${randomUUID()}`, amountCentavos: plan.priceCentavos, collectedBy: actor.operator.id,
        collectedAt: new Date(), verifiedBy: actor.operator.id } });
      const period = await tx.membershipPeriod.create({ data: { gymId: gyms[0], memberId: member.id, paymentId: payment.id,
        confirmedBy: actor.operator.id, startsAt: projection.startsAt, endsAt: projection.endsAt } });
      await tx.effectiveEntitlement.create({ data: { gymId: gyms[0], memberId: member.id, periodId: period.id,
        startsAt: projection.startsAt, endsAt: projection.endsAt } });
    }), /effective_entitlement_no_overlap/);
    assert.equal(await admin.payment.count({ where: { memberId: member.id } }), 2);
  });
});
