import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { setGymContext } from "../src/lib/binding";
import { bootstrapSyntheticOwner, completeSetup, getActor, inviteStaff, reauthenticate, setCapabilities } from "../src/lib/identity";
import { authorize, inGym } from "../src/lib/tenant";
import { assertSynthetic, type EmailSender } from "../src/lib/email";

assertSynthetic();
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC" }) });
// One physical connection forces tenant A/B transaction reuse rather than merely hoping pooling occurs.
const pooled = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1, options: "-c timezone=UTC" }) });
const password = "Synthetic tenant password 2026!";
const suffix = randomUUID().slice(0, 8);
let link = "";
const sender: EmailSender = { async send(message) { link = new URL(message.url).hash.slice(1); } };
async function login(email: string, mode = "email") {
  const response = await auth.handler(new Request("http://127.0.0.1:3000/api/auth/sign-in/" + mode, { method: "POST", headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" }, body: JSON.stringify({ [mode]: email, password }) }));
  assert.equal(response.status, 200);
  return new Headers({ cookie: response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ") });
}
after(async () => { await Promise.all([db.$disconnect(), admin.$disconnect(), pooled.$disconnect()]); });

test("S-01b restricted PostgreSQL RLS, scoped transactions and live capability checks", async t => {
  await admin.rateLimit.deleteMany();
  const gyms = [randomUUID(), randomUUID()];
  const owners: Headers[] = [];
  for (let index = 0; index < 2; index++) {
    const email = `tenant-${index}-${suffix}@example.test`;
    await bootstrapSyntheticOwner({ gymId: gyms[index], gymName: `Tenant ${index}`, email, name: "Synthetic Tenant Owner" }, sender, admin);
    await completeSetup(link, password);
    owners.push(await login(email));
    await reauthenticate(owners[index], password);
  }
  await t.test("all tenant tables FORCE RLS; runtime owns no tables; timestamps are UTC instants", async () => {
    const rows = await db.$queryRaw<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; owns: boolean }[]>`
      SELECT relname, relrowsecurity, relforcerowsecurity, pg_get_userbyid(relowner)=current_user AS owns FROM pg_class
      WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname IN ('gyms','gym_operators','identity_invitations','identity_audit')`;
    assert.equal(rows.length, 4);
    for (const row of rows) assert.deepEqual([row.relrowsecurity, row.relforcerowsecurity, row.owns], [true, true, false]);
    const [timezone] = await db.$queryRaw<{ timezone: string }[]>`SELECT current_setting('TimeZone') AS timezone`;
    assert.equal(timezone.timezone, "UTC");
    const [times] = await db.$queryRaw<{ delta: number }[]>`SELECT abs(extract(epoch FROM (CURRENT_TIMESTAMP - ${new Date()}::timestamptz)))::float AS delta`;
    assert.ok(times.delta < 2, "Application/database instants must agree even on a Manila host");
  });
  await t.test("missing context fails closed for reads and writes; runtime cannot bootstrap a gym", async () => {
    assert.equal(await db.operator.count(), 0);
    assert.equal(await db.gym.count(), 0);
    assert.equal(await db.invitation.count(), 0);
    assert.equal(await db.identityAudit.count(), 0);
    await assert.rejects(db.gym.create({ data: { name: "Unauthorized gym" } }));
    await assert.rejects(db.identityAudit.create({ data: { gymId: gyms[0], initiatorId: "test", subjectId: "test", action: "MISSING_CONTEXT" } }));
    assert.equal((await db.operator.updateMany({ data: { canCollectCash: true } })).count, 0);
  });
  await t.test("gym A cannot read/update gym B or move a row into B", async () => {
    const foreignOwner = await admin.operator.findFirstOrThrow({ where: { gymId: gyms[1] } });
    await db.$transaction(async tx => {
      await setGymContext(tx, gyms[0]);
      assert.equal(await tx.operator.count(), 1);
      assert.equal(await tx.operator.findUnique({ where: { id: foreignOwner.id } }), null);
      assert.equal((await tx.operator.updateMany({ where: { id: foreignOwner.id }, data: { state: "DISABLED" } })).count, 0);
    });
    await assert.rejects(db.$transaction(async tx => {
      await setGymContext(tx, gyms[0]);
      const own = await tx.operator.findFirstOrThrow();
      await tx.operator.update({ where: { id: own.id }, data: { gymId: gyms[1] } });
    }));
    await assert.rejects(db.$transaction(async tx => {
      await setGymContext(tx, gyms[0]);
      await tx.invitation.create({ data: { gymId: gyms[0], operatorId: foreignOwner.id, purpose: "STAFF_SETUP", tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600_000) } });
    }));
    await assert.rejects(setCapabilities(owners[0], foreignOwner.id, { canCollectCash: true, canManageMembers: true }));
  });
  await t.test("pooled concurrent tenants and rollback never retain transaction-local context", async () => {
    const visits = await Promise.all(Array.from({ length: 10 }, (_, i) => pooled.$transaction(async tx => {
      await setGymContext(tx, gyms[i % 2]);
      const rows = await tx.operator.findMany();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].gymId, gyms[i % 2]);
      const [connection] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      return connection.pid;
    })));
    assert.equal(new Set(visits).size, 1);
    assert.equal(await pooled.operator.count(), 0);
    await assert.rejects(pooled.$transaction(async tx => { await setGymContext(tx, gyms[0]); throw new Error("Synthetic rollback"); }));
    assert.equal(await pooled.operator.count(), 0);
    await inGym(owners[0], "OWNER", async tx => {
      assert.equal(await tx.operator.count(), 1);
      // A nested helper receives tx; the root client cannot see this transaction's context.
      assert.equal(await db.operator.count(), 0);
    });
  });
  await t.test("least privilege, owner-only grants, immediate revocation, no staff financial corrections", async () => {
    await inviteStaff(owners[1], { email: `foreign-staff-${suffix}@example.test`, username: `foreign_${suffix}`, name: "Foreign Staff" }, sender);
    await completeSetup(link, password);
    const foreign = await admin.operator.findFirstOrThrow({ where: { gymId: gyms[1], role: "STAFF" } });
    await assert.rejects(setCapabilities(owners[0], foreign.id, { canManageMembers: true, canCollectCash: true }));
    await inviteStaff(owners[0], { email: `tenant-staff-${suffix}@example.test`, username: `tenant_${suffix}`, name: "Tenant Staff" }, sender);
    await completeSetup(link, password);
    const staffHeaders = await login(`tenant_${suffix}`, "username");
    const staff = await getActor(staffHeaders);
    assert.equal(staff.operator.canCollectCash, false);
    await assert.rejects(inGym(staffHeaders, "MEMBERS", async () => true));
    await assert.rejects(inGym(staffHeaders, "CASH", async () => true));
    await assert.rejects(setCapabilities(staffHeaders, staff.operator.id, { canManageMembers: true, canCollectCash: true }));
    await setCapabilities(owners[0], staff.operator.id, { canManageMembers: true, canCollectCash: true });
    assert.equal(await inGym(staffHeaders, "MEMBERS", async tx => tx.operator.count()), 2);
    assert.equal(await inGym(staffHeaders, "CASH", async () => "authorized"), "authorized");
    assert.throws(() => authorize({ role: "STAFF", canManageMembers: true, canCollectCash: true }, "OWNER"));
    await setCapabilities(owners[0], staff.operator.id, { canManageMembers: false, canCollectCash: false });
    await assert.rejects(inGym(staffHeaders, "CASH", async () => true));
    await assert.rejects(inGym(staffHeaders, "MEMBERS", async () => true));
    assert.equal(await inGym(owners[0], "CASH", async () => true), true);
    const [functions] = await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef`;
    assert.equal(Number(functions.count), 2);
  });
});
