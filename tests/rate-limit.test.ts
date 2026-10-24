import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { assertSynthetic, type EmailSender } from "../src/lib/email";
import { bootstrapSyntheticOwner, completeSetup, getActor } from "../src/lib/identity";
import { POST as identityPost } from "../src/app/api/identity/[action]/route";
import { POST as memberPost } from "../src/app/api/members/route";
import { POST as plansPost } from "../src/app/api/plans/route";
import { POST as chargePost } from "../src/app/api/charges/route";
import { POST as authPost } from "../src/app/api/auth/[...all]/route";

assertSynthetic();
// Refuse fixture writes unless BOTH connections point at the isolated test database.
for (const name of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[name]!);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/gym_crm_synthetic");
}
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC" }) });
const password = "Synthetic throttle password 2026!";
const origin = process.env.BETTER_AUTH_URL!;
const owners: { email: string; headers: Headers }[] = [];
const spoof = (n: number) => ({
  "x-forwarded-for": `198.51.100.${n}`,
  "x-real-ip": `203.0.113.${n}`,
  "x-vercel-forwarded-for": `192.0.2.${n}`,
  "cf-connecting-ip": `198.51.100.${n}`,
  forwarded: `for=203.0.113.${n};proto=https`,
  "x-forwarded-host": "attacker.example.test",
  "x-forwarded-proto": "https",
});
function request(path: string, body: object, headers = new Headers(), extra: Record<string, string> = {}) {
  const h = new Headers(headers);
  h.set("content-type", "application/json"); h.set("origin", origin);
  for (const [key, value] of Object.entries(extra)) h.set(key, value);
  return new Request(`${origin}/api/${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
}
function identity(action: string, body: object, headers?: Headers, extra?: Record<string, string>) {
  return identityPost(request(`identity/${action}`, body, headers, extra), { params: Promise.resolve({ action }) });
}
async function login(email: string, extra?: Record<string, string>) {
  const response = await authPost(request("auth/sign-in/email", { email, password }, undefined, extra));
  assert.equal(response.status, 200);
  return new Headers({ cookie: response.headers.getSetCookie().map(c => c.split(";")[0]).join("; ") });
}
after(async () => { await db.$disconnect(); await admin.$disconnect(); });

test("R-03 durable actor/action limits and untrusted forwarding headers", async t => {
  await admin.rateLimit.deleteMany();
  let token = "";
  const sender: EmailSender = { async send(message) { token = new URL(message.url).hash.slice(1); } };
  for (let i = 0; i < 2; i++) {
    const email = `throttle-${randomUUID()}@example.test`;
    await bootstrapSyntheticOwner({ gymId: randomUUID(), gymName: "Synthetic throttle gym", email, name: "Synthetic Owner" }, sender, admin);
    await completeSetup(token, password);
    owners.push({ email, headers: await login(email) });
  }
  t.beforeEach(async () => { await admin.rateLimit.deleteMany(); });

  await t.test("concurrent anonymous flood is bounded and cannot exhaust an owner's allowance", async () => {
    const responses = await Promise.all(Array.from({ length: 12 }, (_, n) =>
      identity("reauthenticate", { password }, new Headers(n % 2 ? { cookie: "better-auth.session_token=forged" } : {}), spoof(n + 1))));
    assert.equal(responses.filter(r => r.status === 401).length, 5);
    assert.equal(responses.filter(r => r.status === 429).length, 7);
    for (let n = 0; n < 5; n++) assert.equal((await identity("reauthenticate", { password }, owners[0].headers)).status, 200);
    assert.equal((await identity("reauthenticate", { password }, owners[0].headers)).status, 429);
    const anonymous = await admin.rateLimit.findUniqueOrThrow({ where: { key: "identity:reauthenticate:anonymous" } });
    assert.equal(anonymous.count, 6); // Rejected requests cannot overflow the counter.
    assert.equal(await admin.rateLimit.count({ where: { key: { startsWith: "identity:reauthenticate:" } } }), 2);
  });

  await t.test("owners and actions are isolated; sessions and spoofed headers cannot reset actor limits", async () => {
    const secondSession = await login(owners[0].email, spoof(90));
    for (let n = 0; n < 5; n++) {
      assert.equal((await identity("reauthenticate", { password: "wrong password" }, n % 2 ? secondSession : owners[0].headers, spoof(n + 1))).status, 401);
    }
    assert.equal((await identity("reauthenticate", { password }, secondSession, spoof(90))).status, 429);
    assert.equal((await identity("reauthenticate", { password }, owners[1].headers, spoof(90))).status, 200);
    assert.equal((await identity("invite", {}, owners[0].headers)).status, 400);
    const actor = await getActor(owners[0].headers);
    const key = `identity:reauthenticate:actor:${actor.operator.id}`;
    assert.equal((await db.rateLimit.findUniqueOrThrow({ where: { key } })).count, 6);
    // A separate runtime client/connection observes the same durable bucket.
    const runtime = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
    try { assert.equal((await runtime.rateLimit.findUniqueOrThrow({ where: { key } })).count, 6); }
    finally { await runtime.$disconnect(); }
    const session = await auth.api.getSession({ headers: secondSession });
    assert.ok(session);
    assert.ok(![...Object.values(spoof(90)), ...Object.values(spoof(1))].includes(session.session.ipAddress!));
    // Window expiry restores only this actor/action allowance.
    await admin.rateLimit.update({ where: { key }, data: { lastRequest: BigInt(Date.now() - 60_001) } });
    assert.equal((await identity("reauthenticate", { password }, owners[0].headers)).status, 200);
  });

  await t.test("all existing application limiter callers isolate anonymous and authenticated requests", async () => {
    for (const [path, post] of [["members", memberPost], ["plans", plansPost], ["charges", chargePost]] as const) {
      for (let n = 0; n < 30; n++) assert.equal((await post(request(path, {}, undefined, spoof(n + 1)))).status, 401);
      assert.equal((await post(request(path, {}, undefined, spoof(90)))).status, 429);
      assert.equal((await post(request(path, {}, owners[0].headers))).status, 400);
    }
  });

  await t.test("public recovery stays generic and bounded across identifiers, cookies and spoofed IPs", async () => {
    let generic: unknown;
    for (let n = 0; n < 30; n++) {
      const response = await identity("reset-owner", { email: `missing-${n}@example.test` }, n % 2 ? owners[0].headers : undefined, spoof(n + 1));
      assert.equal(response.status, 200);
      const body: unknown = await response.json();
      if (n === 0) generic = body;
      assert.deepEqual(body, generic);
    }
    assert.equal((await identity("reset-owner", { email: owners[0].email }, owners[0].headers, spoof(90))).status, 429);
    assert.equal((await identity("reauthenticate", { password }, owners[0].headers)).status, 200);
    for (let n = 0; n < 30; n++) assert.equal((await identity("setup", { token: "invalid", password }, undefined, spoof(n + 1))).status, 400);
    assert.equal((await identity("setup", { token: "invalid", password }, owners[0].headers, spoof(90))).status, 429);
  });

  await t.test("provider login protections survive changing identifiers and forwarding headers", async () => {
    const errors: unknown[] = [];
    for (let n = 0; n < 5; n++) {
      const email = n % 2 ? owners[0].email : `missing-${n}@example.test`;
      const response = await authPost(request("auth/sign-in/email", { email, password: "wrong password" }, undefined, spoof(n + 1)));
      assert.equal(response.status, 401);
      errors.push(await response.json());
    }
    // Existing generic guard for unknown identities remains distinct from provider
    // invalid-password wording; neither response exposes the submitted identifier.
    for (const error of errors) assert.ok(!JSON.stringify(error).includes(owners[0].email));
    assert.equal((await authPost(request("auth/sign-in/email", { email: owners[1].email, password }, undefined, spoof(90)))).status, 429);
    assert.equal(auth.options.rateLimit?.storage, "database");
    assert.equal(auth.options.advanced?.trustedProxyHeaders, false);
    assert.deepEqual(auth.options.advanced?.ipAddress?.ipAddressHeaders, []);
  });

  await t.test("origin and revoked/disabled authorization checks still reject before sensitive writes", async () => {
    assert.equal((await identity("reauthenticate", { password }, owners[0].headers, { origin: "https://evil.example" })).status, 403);
    assert.equal(await admin.rateLimit.count(), 0);
    assert.equal((await authPost(request("auth/sign-in/email", { email: owners[0].email, password }, undefined, { origin: "https://evil.example" }))).status, 403);
    const actor = await getActor(owners[0].headers);
    await admin.operator.update({ where: { id: actor.operator.id }, data: { state: "DISABLED" } });
    try {
      assert.equal((await identity("reauthenticate", { password }, owners[0].headers, spoof(1))).status, 403);
      assert.equal(await admin.rateLimit.count({ where: { key: { contains: `actor:${actor.operator.id}` } } }), 0);
    } finally { await admin.operator.update({ where: { id: actor.operator.id }, data: { state: "ACTIVE" } }); }
    const disposable = await login(owners[0].email);
    const revoked = await getActor(disposable);
    await admin.session.delete({ where: { id: revoked.sessionId } });
    assert.equal((await identity("reauthenticate", { password }, disposable, spoof(2))).status, 401);
  });

  await t.test("invalid configuration and unverified hosted mode fail closed for application and Better Auth routes", async () => {
    const saved = assertSynthetic();
    try {
      for (const override of [
        { SYNTHETIC_DATA_ONLY: "false" },
        { BETTER_AUTH_URL: "https://unverified.example.test" },
        { DATABASE_URL: "not-a-url-CONFIG_SENTINEL" },
        { BETTER_AUTH_SECRET: "short-CONFIG_SENTINEL" },
        { BETTER_AUTH_URL: "not-a-url-CONFIG_SENTINEL" },
      ]) {
        Object.assign(process.env, saved, override);
        const response = await identity("reauthenticate", { password }, owners[0].headers, spoof(1));
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { error: "Deployment proxy trust has not been verified." });
        assert.equal((await authPost(request("auth/sign-in/email", { email: owners[0].email, password }, undefined, spoof(2)))).status, 503);
        assert.equal((await authPost(new Request(`${origin}/api/auth/get-session`, { headers: owners[0].headers }))).status, 503);
      }
      assert.equal(await admin.rateLimit.count({ where: { key: { startsWith: "identity:" } } }), 0);
    } finally {
      Object.assign(process.env, saved);
    }
  });
});
