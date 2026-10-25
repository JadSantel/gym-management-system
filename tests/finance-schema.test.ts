import assert from "node:assert/strict";
import { test } from "node:test";
import { cashAmountSchema, cashConfirmationSchema, chargePrepareSchema, idempotencyKeySchema, pendingCashSchema, planChangeSchema, priceSchema } from "../src/lib/finance-schema";
import { authEndpointSchema, loginQuerySchema, memberQuerySchema, recordParamsSchema } from "../src/lib/route-schema";
import { identityMutationActionSchema, identityReadActionSchema } from "../src/lib/identity-schema";
import { parsePesos } from "../src/lib/money";

const id = "ABCDEF01-2345-0000-0000-123456789ABC";
const uuid = "abcdef01-2345-4234-8234-123456789abc";

test("finance schemas preserve exact decimal text and enforce integer-centavo bounds", () => {
  for (const [text, cents] of [["0.01", 1], ["800", 80000], ["0800.0", 80000], ["21474836.47", 2147483647]] as const) {
    assert.equal(priceSchema.parse(text), text);
    assert.equal(cashAmountSchema.parse(text), text);
    assert.equal(parsePesos(text), cents);
  }
  for (const value of [undefined, null, 800, NaN, Infinity, {}, [], "", "0", "0.00", "-1", "+1", "1e3", "1,000", "1.001", "21474836.48", "99999999.99", "000000001", " 800", "800 ", "800\n", "800.00\n", "800\r", "800\u2028", "a".repeat(4096)]) {
    assert.equal(priceSchema.safeParse(value).success, false);
    assert.equal(cashAmountSchema.safeParse(value).success, false);
    if (typeof value === "string") assert.equal(parsePesos(value), null);
  }
});

test("plan changes accept only catalogue initialization or bounded versioned price updates", () => {
  const update = { action: "update", planId: id, price: "800.00", version: 1 };
  assert.deepEqual(planChangeSchema.parse({ action: "initialize" }), { action: "initialize" });
  assert.deepEqual(planChangeSchema.parse(update), update);
  assert.equal(planChangeSchema.safeParse({ ...update, version: 2147483646 }).success, true);
  for (const version of [undefined, null, "1", true, 0, -1, 1.1, 2147483647, Number.MAX_SAFE_INTEGER, Infinity]) {
    assert.equal(planChangeSchema.safeParse({ ...update, version }).success, false);
  }
  for (const body of [null, [], {}, { action: "create" }, { action: "initialize", price: "1" }, { ...update, durationDays: 31 }, { ...update, gymId: uuid }]) {
    assert.equal(planChangeSchema.safeParse(body).success, false);
  }
});

test("charge, cash and saved-operation schemas reject protected fields without coercing IDs or amounts", () => {
  const prepare = { memberId: id, planId: id };
  const cash = { chargeId: id, cashReceived: "800.00" };
  assert.deepEqual(chargePrepareSchema.parse(prepare), prepare);
  assert.deepEqual(cashConfirmationSchema.parse(cash), cash);
  for (const value of [undefined, null, "", 123, [id], `${id}\n`, ` ${id}`, id.slice(1)]) {
    assert.equal(chargePrepareSchema.safeParse({ ...prepare, planId: value }).success, false);
    assert.equal(cashConfirmationSchema.safeParse({ ...cash, chargeId: value }).success, false);
    assert.equal(idempotencyKeySchema.safeParse(value).success, false);
  }
  assert.equal(idempotencyKeySchema.parse(id), id);
  for (const key of ["gymId", "actorId", "amountCentavos", "durationDays", "verifiedAt", "method", "operationKey"]) {
    assert.equal(chargePrepareSchema.safeParse({ ...prepare, [key]: "private" }).success, false);
    assert.equal(cashConfirmationSchema.safeParse({ ...cash, [key]: "private" }).success, false);
  }
  const pending = { key: uuid, amount: "0800.0", chargeId: uuid, memberId: uuid };
  assert.deepEqual(pendingCashSchema.parse(pending), pending);
  assert.equal(pendingCashSchema.safeParse({ ...pending, amount: 800 }).success, false);
  assert.equal(pendingCashSchema.safeParse({ ...pending, gymId: uuid }).success, false);
});

test("consumed route/query fields reject repeated or malformed values and preserve optional navigation", () => {
  assert.deepEqual(recordParamsSchema.parse({ id }), { id });
  for (const value of [undefined, null, "", [id], `${id}\n`, "bad"]) assert.equal(recordParamsSchema.safeParse({ id: value }).success, false);
  for (const value of [undefined, "", id]) assert.equal(memberQuerySchema.safeParse({ charge: value }).success, true);
  for (const value of [null, [id], [id, id], "bad"]) assert.equal(memberQuerySchema.safeParse({ charge: value }).success, false);
  for (const value of [undefined, "true", "false"]) assert.equal(loginQuerySchema.safeParse({ signedOut: value }).success, true);
  for (const value of [null, true, ["true"], "bad"]) assert.equal(loginQuerySchema.safeParse({ signedOut: value }).success, false);
  assert.equal(identityReadActionSchema.safeParse("session").success, true);
  assert.equal(identityMutationActionSchema.safeParse("capabilities").success, true);
  assert.equal(authEndpointSchema.safeParse("sign-in/username").success, true);
  assert.equal(authEndpointSchema.safeParse("sign-up/email").success, false);
  assert.equal(authEndpointSchema.safeParse("sign-in/email\n").success, false);
  for (const value of [undefined, null, [], "unknown", "session\n", "setup\n"]) {
    assert.equal(identityReadActionSchema.safeParse(value).success, false);
    assert.equal(identityMutationActionSchema.safeParse(value).success, false);
  }
});
