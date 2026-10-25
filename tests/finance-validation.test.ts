import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { bootstrapSyntheticOwner, completeSetup, reauthenticate } from "../src/lib/identity";
import { assertSynthetic, type EmailSender } from "../src/lib/email";
import { createMember } from "../src/lib/members";
import { POST as plansPost } from "../src/app/api/plans/route";
import { GET as chargeGet, POST as chargePost } from "../src/app/api/charges/route";
import { POST as paymentPost } from "../src/app/api/payments/route";
import { GET as memberGet } from "../src/app/api/members/route";
import { GET as identityGet, POST as identityPost } from "../src/app/api/identity/[action]/route";

assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/gym_crm_synthetic");
}
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }) });
const origin = process.env.BETTER_AUTH_URL!;
const gyms = [randomUUID(), randomUUID()];
const password = "Synthetic finance validation 2026!";
let token = "";
const sender: EmailSender = { async send(message) { token = new URL(message.url).hash.slice(1); } };
function request(path: string, headers: Headers, body?: unknown, key?: string) {
  const h = new Headers(headers); h.set("origin", origin); h.set("content-type", "application/json");
  if (key !== undefined) h.set("idempotency-key", key);
  return new Request(`${origin}${path}`, { method: body === undefined ? "GET" : "POST", headers: h, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function snapshot() {
  const where = { gymId: { in: gyms } };
  const orderBy = { id: "asc" as const };
  const rows = await Promise.all([
    admin.plan.findMany({ where, orderBy }), admin.charge.findMany({ where, orderBy }),
    admin.payment.findMany({ where, orderBy }), admin.membershipPeriod.findMany({ where, orderBy }),
    admin.effectiveEntitlement.findMany({ where, orderBy }), admin.paymentReceipt.findMany({ where, orderBy }),
    admin.idempotencyOperation.findMany({ where, orderBy }), admin.identityAudit.findMany({ where, orderBy }),
  ]);
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
async function invalidResponse(response: Response, status = 400) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cash-confirmation-outcome"), null, "A validation failure cannot settle an earlier operation");
  const result = await response.json();
  assert.equal(typeof result.error, "string");
  assert.equal(/PRIVATE_INPUT|issues|stack|ZodError/.test(JSON.stringify(result)), false);
  return result;
}
after(async () => { await db.$disconnect(); await admin.$disconnect(); });

test("Task 5 strict financial boundaries using actual routes and restricted PostgreSQL", async t => {
  await admin.rateLimit.deleteMany();
  const owners: Headers[] = [];
  const plans: { id: string; version: number }[] = [];
  const members: { id: string }[] = [];
  for (const gymId of gyms) {
    const email = `finance-${gymId}@example.test`;
    await bootstrapSyntheticOwner({ gymId, gymName: "Synthetic Validation Gym", email, name: "Synthetic Owner" }, sender, admin);
    await completeSetup(token, password);
    const signedIn = await auth.handler(new Request(`${origin}/api/auth/sign-in/email`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email, password }) }));
    assert.equal(signedIn.status, 200);
    const headers = new Headers({ cookie: signedIn.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") });
    owners.push(headers); await reauthenticate(headers, password);
    const catalogue = await plansPost(request("/api/plans", headers, { action: "initialize" }));
    assert.equal(catalogue.status, 200); plans.push((await catalogue.json())[0]);
    members.push(await createMember(headers, { fullName: "Synthetic Finance Member" }));
  }
  const prepared = await chargePost(request("/api/charges", owners[0], { memberId: members[0].id, planId: plans[0].id }));
  assert.equal(prepared.status, 200);
  let charge = await prepared.json();

  await t.test("plan and charge malformed/protected fields cause no domain writes and allow corrected requests", async () => {
    const before = await snapshot();
    const update = { action: "update", planId: plans[0].id, price: "800.00", version: 1 };
    const prepare = { memberId: members[0].id, planId: plans[0].id };
    for (const [path, post, valid] of [["/api/plans", plansPost, update], ["/api/charges", chargePost, prepare]] as const) {
      for (const body of [null, [], {}, ...Object.keys(valid).flatMap(field => {
        const missing = { ...valid } as Record<string, unknown>; delete missing[field];
        return [missing, ...[null, [], {}, true, "PRIVATE_INPUT", "x".repeat(200)].map(value => ({ ...valid, [field]: value }))];
      }), ...["gymId", "createdBy", "priceCentavos", "durationDays", "verifiedAt", "PRIVATE_INPUT"].map(field => ({ ...valid, [field]: "PRIVATE_INPUT" }))]) {
        await admin.rateLimit.deleteMany();
        await invalidResponse(await post(request(path, owners[0], body)));
      }
    }
    for (const body of [{ action: "initialize", gymId: gyms[1] }, { ...update, version: "1" }, { ...update, version: 2147483647 }, { ...update, price: 800 }, { ...update, price: "800\n" }]) {
      await invalidResponse(await plansPost(request("/api/plans", owners[0], body)));
    }
    assert.equal(await snapshot(), before);
    assert.equal((await plansPost(request("/api/plans", owners[0], update))).status, 200);
    const corrected = await chargePost(request("/api/charges", owners[0], prepare));
    assert.equal(corrected.status, 200); charge = await corrected.json();
  });

  await t.test("cash bodies and idempotency headers fail before operation writes with safe field errors", async () => {
    const before = await snapshot();
    const valid = { chargeId: charge.id, cashReceived: "800.00" };
    const missingAmount = await invalidResponse(await paymentPost(request("/api/payments", owners[0], { chargeId: charge.id }, randomUUID())));
    assert.equal(typeof missingAmount.fieldErrors.cashReceived, "string");
    for (const body of [null, [], {}, ...[null, 800, [], {}, "", "0", "-1", "1e3", "800.001", "21474836.48", "800\n", "PRIVATE_INPUT"].map(cashReceived => ({ ...valid, cashReceived })),
      { ...valid, chargeId: null }, { ...valid, chargeId: `${charge.id}\n` },
      ...["gymId", "verifiedAt", "amountCentavos", "method", "operationKey", "PRIVATE_INPUT"].map(field => ({ ...valid, [field]: "PRIVATE_INPUT" }))]) {
      await invalidResponse(await paymentPost(request("/api/payments", owners[0], body, randomUUID())));
    }
    for (const key of [undefined, "", "PRIVATE_INPUT", "x".repeat(200), `${randomUUID()}, ${randomUUID()}`]) {
      await invalidResponse(await paymentPost(request("/api/payments", owners[0], valid, key)));
    }
    const oversized = request("/api/payments", owners[0], { ...valid, PRIVATE_INPUT: "x".repeat(4096) }, randomUUID());
    await invalidResponse(await paymentPost(oversized), 413);
    const rawHeaders = new Headers(owners[0]); rawHeaders.set("origin", origin); rawHeaders.set("content-type", "application/json");
    await invalidResponse(await paymentPost(new Request(`${origin}/api/payments`, { method: "POST", headers: rawHeaders, body: "{" })));
    rawHeaders.set("content-type", "text/plain");
    await invalidResponse(await paymentPost(new Request(`${origin}/api/payments`, { method: "POST", headers: rawHeaders, body: "{}" })), 415);
    assert.equal(await snapshot(), before);
  });

  await t.test("read queries and dynamic identity actions reject malformed/repeated values safely", async () => {
    const before = await snapshot();
    for (const query of ["", "id=", "id=PRIVATE_INPUT", `id=${charge.id}&id=${charge.id}`, `id=${charge.id}%0A`]) {
      await invalidResponse(await chargeGet(request(`/api/charges?${query}`, owners[0])));
    }
    await invalidResponse(await memberGet(request("/api/members?q=One&q=Two", owners[0])));
    for (const action of ["PRIVATE_INPUT", "session\n", "invite\n"]) {
      const context = { params: Promise.resolve({ action }) };
      await invalidResponse(await identityGet(request("/api/identity/unknown", owners[0]), context), 404);
      await invalidResponse(await identityPost(request("/api/identity/unknown", owners[0], {}), context), 404);
    }
    assert.equal(await snapshot(), before);
    assert.equal((await chargeGet(request(`/api/charges?id=${charge.id.toUpperCase()}`, owners[0]))).status, 200);
    assert.equal((await chargeGet(request(`/api/charges?id=${charge.id}`, owners[1]))).status, 404);
  });

  await t.test("malformed retries retain unknown outcome; corrected equivalent-money retry retrieves the original result after a price change", async () => {
    const key = randomUUID().toUpperCase();
    const body = { chargeId: charge.id, cashReceived: "0800.0" };
    const confirmed = await paymentPost(request("/api/payments", owners[0], body, key));
    assert.equal(confirmed.status, 200); const original = await confirmed.json();
    const plan = await admin.plan.findUniqueOrThrow({ where: { id: plans[0].id } });
    assert.equal((await plansPost(request("/api/plans", owners[0], { action: "update", planId: plan.id, version: plan.version, price: "900.25" }))).status, 200);
    const before = await snapshot();
    await invalidResponse(await paymentPost(request("/api/payments", owners[0], { ...body, cashReceived: "800.001" }, key)));
    await invalidResponse(await paymentPost(request("/api/payments", owners[0], { ...body, gymId: gyms[1] }, key)));
    await invalidResponse(await paymentPost(request("/api/payments", owners[0], { ...body, cashReceived: "801" }, key)), 409);
    const replay = await paymentPost(request("/api/payments", owners[0], { ...body, cashReceived: "800.00" }, key));
    assert.equal(replay.status, 200);
    const result = await replay.json();
    assert.equal(result.payment.id, original.payment.id);
    assert.equal(result.payment.amountCentavos, original.payment.amountCentavos);
    assert.deepEqual(result.period, original.period); assert.deepEqual(result.receipt, original.receipt);
    const foreign = await paymentPost(request("/api/payments", owners[1], body, key));
    assert.equal(foreign.status, 404); assert.equal(foreign.headers.get("cash-confirmation-outcome"), "not-confirmed");
    assert.equal(await snapshot(), before);
    assert.equal(await admin.payment.count({ where: { memberId: members[0].id } }), 1);
    assert.equal(await admin.membershipPeriod.count({ where: { memberId: members[0].id } }), 1);
    assert.equal(await admin.effectiveEntitlement.count({ where: { memberId: members[0].id } }), 1);
    assert.equal(await admin.paymentReceipt.count({ where: { paymentId: original.payment.id } }), 1);
    assert.equal(await db.payment.count(), 0, "Runtime reads without tenant context stay empty");
  });
});
