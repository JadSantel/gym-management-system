import assert from "node:assert/strict";
import { test } from "node:test";
import { identitySchemas, identityFieldErrors, setupFormSchema, type IdentityAction } from "../src/lib/identity-schema";

const valid = {
  setup: { token: "a".repeat(64), password: " Password bytes stay exact! " },
  reauthenticate: { password: " current password " },
  invite: { name: " Synthetic Staff ", email: " STAFF@EXAMPLE.TEST ", username: " STAFF_123 " },
  "reset-owner": { email: " OWNER@EXAMPLE.TEST " },
  "reset-staff": { operatorId: "12345678-1234-1234-1234-123456789abc" },
  disable: { operatorId: "12345678-1234-1234-1234-123456789abc" },
  capabilities: { operatorId: "12345678-1234-1234-1234-123456789abc", canManageMembers: false, canCollectCash: true },
} satisfies Record<IdentityAction, object>;

test("all seven identity schemas reject missing, wrong-type, null and unexpected protected fields", () => {
  for (const action of Object.keys(valid) as IdentityAction[]) {
    const schema = identitySchemas[action];
    assert.equal(schema.safeParse(valid[action]).success, true, action);
    for (const field of ["gymId", "actorId", "role", "emailVerified", "capabilities", "__proto__"]) {
      const result = schema.safeParse({ ...valid[action], [field]: "SECRET_SENTINEL" });
      assert.equal(result.success, false, `${action}: ${field}`);
      if (!result.success) assert.deepEqual(identityFieldErrors(result.error), {});
    }
    for (const field of Object.keys(valid[action])) {
      const body = { ...valid[action] } as Record<string, unknown>;
      delete body[field];
      assert.equal(schema.safeParse(body).success, false, `${action}: missing ${field}`);
      for (const value of [null, [], {}, 42, ""]) {
        const result = schema.safeParse({ ...valid[action], [field]: value });
        assert.equal(result.success, false, `${action}: invalid ${field}`);
        if (!result.success) {
          assert.ok(identityFieldErrors(result.error)[field as keyof ReturnType<typeof identityFieldErrors>]);
          assert.ok(!JSON.stringify(identityFieldErrors(result.error)).includes("SECRET_SENTINEL"));
        }
      }
    }
  }
});

test("identity field boundaries preserve normalization, password bytes and explicit false permissions", () => {
  assert.deepEqual(identitySchemas.invite.parse(valid.invite), { name: "Synthetic Staff", email: "staff@example.test", username: "staff_123" });
  assert.equal(identitySchemas.setup.parse(valid.setup).password, valid.setup.password);
  assert.equal(identitySchemas.reauthenticate.parse(valid.reauthenticate).password, valid.reauthenticate.password);
  for (const length of [12, 128]) assert.equal(identitySchemas.setup.safeParse({ ...valid.setup, password: " ".repeat(length) }).success, true);
  for (const length of [0, 11, 129]) assert.equal(identitySchemas.setup.safeParse({ ...valid.setup, password: "x".repeat(length) }).success, false);
  for (const length of [1, 128]) assert.equal(identitySchemas.reauthenticate.safeParse({ password: "x".repeat(length) }).success, true);
  for (const length of [0, 129]) assert.equal(identitySchemas.reauthenticate.safeParse({ password: "x".repeat(length) }).success, false);
  for (const token of ["a".repeat(63), "a".repeat(65), "A".repeat(64), "g".repeat(64), ` ${valid.setup.token}`]) {
    assert.equal(identitySchemas.setup.safeParse({ ...valid.setup, token }).success, false);
  }
  for (const name of ["", "   ", "x".repeat(101)]) assert.equal(identitySchemas.invite.safeParse({ ...valid.invite, name }).success, false);
  for (const length of [1, 100]) assert.equal(identitySchemas.invite.safeParse({ ...valid.invite, name: "x".repeat(length) }).success, true);
  for (const username of ["aa", "x".repeat(31), "has space", "staff-1"]) assert.equal(identitySchemas.invite.safeParse({ ...valid.invite, username }).success, false);
  for (const length of [3, 30]) assert.equal(identitySchemas.invite.safeParse({ ...valid.invite, username: "x".repeat(length) }).success, true);
  for (const email of ["", "   ", "owner@example.com", "bad@@example.test", "a".repeat(242) + "@example.test"]) {
    assert.equal(identitySchemas["reset-owner"].safeParse({ email }).success, false);
  }
  assert.equal(identitySchemas["reset-owner"].safeParse({ email: "a".repeat(241) + "@example.test" }).success, true);
  for (const value of ["true", "false", 0, 1]) assert.equal(identitySchemas.capabilities.safeParse({ ...valid.capabilities, canCollectCash: value }).success, false);
  assert.equal(identitySchemas.capabilities.parse(valid.capabilities).canManageMembers, false);
  assert.equal(identitySchemas.disable.safeParse({ operatorId: "not-a-uuid" }).success, false);
});

test("setup confirmation is browser-only; mismatch gives a safe associated field error", () => {
  const result = setupFormSchema.safeParse({ ...valid.setup, confirmation: "MISMATCH_SECRET_SENTINEL" });
  assert.equal(result.success, false);
  if (!result.success) assert.deepEqual(identityFieldErrors(result.error), { confirmation: "Passwords must match." });
  assert.equal(setupFormSchema.safeParse({ ...valid.setup, confirmation: valid.setup.password }).success, true);
  assert.equal(identitySchemas.setup.safeParse({ ...valid.setup, confirmation: valid.setup.password }).success, false);
});
