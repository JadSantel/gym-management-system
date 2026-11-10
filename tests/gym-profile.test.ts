import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { assertSynthetic } from "../src/lib/email";
import { bootstrapSyntheticOwner, completeSetup, inviteStaff, getActor } from "../src/lib/identity";
import { readGymProfile } from "../src/lib/gym-profile";
import { setGymContext } from "../src/lib/binding";
import { POST } from "../src/app/api/settings/profile/route";
import { createMember } from "../src/lib/members";
import { changePlans } from "../src/lib/plans";
import { prepareCharge } from "../src/lib/charges";
import { manilaDay, dayStart } from "../src/lib/attendance-schema";

assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/gym_crm_synthetic");
}
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC" }) });
after(async () => { await db.$disconnect(); await admin.$disconnect(); });

test("Gym profile is owner-controlled, tenant-scoped and separate from financial rules", async t => {
  await admin.rateLimit.deleteMany();
  const password = "Synthetic profile password 2026!", suffix = randomUUID().slice(0, 8);
  let token = "";
  const sender = { async send(message: { url: string }) { token = new URL(message.url).hash.slice(1); } };
  async function login(identifier: string, mode = "email") {
    const response = await auth.handler(new Request(`http://127.0.0.1:3000/api/auth/sign-in/${mode}`, { method: "POST", headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" }, body: JSON.stringify({ [mode]: identifier, password }) }));
    assert.equal(response.status, 200);
    return new Headers({ cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") });
  }
  const gymId = randomUUID(), otherId = randomUUID();
  const owners: Headers[] = [];
  for (const [i, id] of [gymId, otherId].entries()) {
    await bootstrapSyntheticOwner({ gymId: id, gymName: "Synthetic Profile Gym", name: "Profile Owner", email: `profile-${i}-${suffix}@example.test` }, sender, admin);
    await completeSetup(token, password); owners.push(await login(`profile-${i}-${suffix}@example.test`));
  }
  const owner = owners[0];
  function post(headers: Headers, body: object, origin = "http://127.0.0.1:3000") {
    return POST(new Request("http://127.0.0.1:3000/api/settings/profile", { method: "POST", headers: { cookie: headers.get("cookie") ?? "", "content-type": "application/json", origin }, body: JSON.stringify(body) }));
  }
  const input = { name: "  Updated Synthetic Gym  ", contactEmail: "contact@example.test", phone: "+63 (912) 345-6789", address: "Synthetic Street", profileTimezone: "America/New_York", profileCountry: "United States", profileCurrency: "USD", profileVersion: 1 };
  await t.test("anonymous, staff and wrong origin cannot write", async () => {
    assert.equal((await post(new Headers(), input)).status, 401);
    assert.equal((await admin.session.findUniqueOrThrow({ where: { id: (await getActor(owner)).sessionId } })).reauthenticatedAt, null);
    assert.equal((await post(owner, input, "https://untrusted.example")).status, 403);
    await inviteStaff(owner, { name: "Profile Staff", email: `profile-staff-${suffix}@example.test`, username: `prof_${suffix}` }, sender);
    await completeSetup(token, password);
    const staff = await login(`prof_${suffix}`, "username");
    assert.equal((await readGymProfile(staff)).id, gymId);
    assert.equal((await post(staff, input)).status, 403);
    assert.equal((await admin.gym.findUniqueOrThrow({ where: { id: gymId } })).profileVersion, 1);
  });
  await t.test("strict server validation rejects malformed and injected fields", async () => {
    for (const invalid of [{ name: " " }, { contactEmail: "invalid" }, { phone: "<script>" }, { address: "x".repeat(501) }, { profileTimezone: "Invalid/Zone" }, { profileCurrency: "ZZZ" }, { profileCountry: "" }, { profileVersion: "1" }, { gymId: otherId }, { state: "DISABLED" }]) {
      assert.equal((await post(owner, { ...input, ...invalid })).status, 400);
    }
  });
  await t.test("owner saves without reauthentication, increments version and audits without changing login", async () => {
    assert.equal((await post(owner, input)).status, 200);
    const saved = await readGymProfile(owner);
    assert.equal(saved.name, input.name.trim()); assert.equal(saved.profileTimezone, input.profileTimezone);
    assert.equal(saved.contactEmail, input.contactEmail); assert.equal(saved.phone, input.phone); assert.equal(saved.address, input.address);
    assert.equal(saved.profileCurrency, "USD"); assert.equal(saved.profileCountry, "United States"); assert.equal(saved.profileVersion, 2);
    assert.equal((await admin.user.findUniqueOrThrow({ where: { email: `profile-0-${suffix}@example.test` } })).emailVerified, true);
    assert.equal(await admin.identityAudit.count({ where: { gymId, action: "GYM_PROFILE_UPDATED" } }), 1);
    assert.equal((await readGymProfile(owners[1])).name, "Synthetic Profile Gym");
    assert.equal((await post(owner, input)).status, 409);
    assert.equal(await admin.identityAudit.count({ where: { gymId, action: "GYM_PROFILE_UPDATED" } }), 1);
  });
  await t.test("concurrent versioned saves allow one writer and no lost update", async () => {
    await admin.session.update({ where: { id: (await getActor(owner)).sessionId }, data: { reauthenticatedAt: new Date(Date.now() - 300_001) } });
    const responses = await Promise.all(["A", "B"].map(name => post(owner, { ...input, name, profileVersion: 2 })));
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    assert.equal((await readGymProfile(owner)).profileVersion, 3);
    assert.equal(await admin.identityAudit.count({ where: { gymId, action: "GYM_PROFILE_UPDATED" } }), 2);
  });
  await t.test("restricted runtime RLS denies missing and cross-gym reads/writes", async () => {
    assert.equal(await db.gym.count(), 0);
    await db.$transaction(async tx => {
      await setGymContext(tx, gymId);
      assert.equal(await tx.gym.count({ where: { id: otherId } }), 0);
      assert.equal((await tx.gym.updateMany({ where: { id: otherId }, data: { name: "Forbidden" } })).count, 0);
    });
    assert.equal(await db.gym.count(), 0);
  });
  await t.test("USD/New York profile labels leave plan centavos and Manila dates unchanged", async () => {
    const [plan] = await changePlans(owner, { action: "initialize" });
    const member = await createMember(owner, { fullName: "Synthetic Profile Member" });
    const before = dayStart(manilaDay(new Date()));
    const charge = await prepareCharge(owner, member.id, plan.id);
    const after = dayStart(manilaDay(new Date()));
    assert.equal(charge.priceCentavos, 80000);
    assert.ok([before.getTime(), after.getTime()].includes(new Date(charge.intendedStart).getTime()));
    assert.equal(new Date(charge.intendedEnd).getTime() - new Date(charge.intendedStart).getTime(), 30 * 86400000);
  });
  await t.test("disabled gyms and revoked sessions cannot read or write", async () => {
    await admin.gym.update({ where: { id: gymId }, data: { state: "DISABLED" } });
    try {
      await assert.rejects(readGymProfile(owner), { status: 403 });
      assert.equal((await post(owner, { ...input, profileVersion: 3 })).status, 403);
    } finally { await admin.gym.update({ where: { id: gymId }, data: { state: "ACTIVE" } }); }
    await admin.session.delete({ where: { id: (await getActor(owner)).sessionId } });
    await assert.rejects(readGymProfile(owner), { status: 401 });
    assert.equal((await post(owner, { ...input, profileVersion: 3 })).status, 401);
  });
});
