import assert from "node:assert/strict";
import { test } from "node:test";
import { directoryMembership, type DirectoryMember } from "../src/lib/member-directory";

test("Members filters use the active interval, exact seven-day boundary and independent Pending semantics", () => {
  const now = new Date("2026-11-02T04:00:00Z");
  const member = (remaining: number, extra: DirectoryMember["entitlements"] = []): DirectoryMember => ({
    id: "synthetic", fullName: "Synthetic Member", email: null, phone: null, hasVerifiedMembership: true,
    entitlements: [{ startsAt: new Date(now.getTime() - 86_400_000).toISOString(), endsAt: new Date(now.getTime() + remaining).toISOString(), legacyRecordId: null }, ...extra],
  });
  for (const remaining of [1, 7 * 86_400_000]) {
    const result = directoryMembership(member(remaining), now.toISOString());
    assert.equal(result.active, true); assert.equal(result.expiringSoon, true); assert.equal(result.pending, false);
  }
  assert.equal(directoryMembership(member(7 * 86_400_000 + 1), now.toISOString()).expiringSoon, false);
  for (const remaining of [0, -1]) {
    const result = directoryMembership(member(remaining), now.toISOString());
    assert.equal(result.label, "Expired"); assert.equal(result.expiringSoon, false); assert.equal(result.pending, false);
  }
  const next = { startsAt: new Date(now.getTime() + 86_400_000).toISOString(), endsAt: new Date(now.getTime() + 31 * 86_400_000).toISOString(), legacyRecordId: null };
  const renewed = directoryMembership(member(86_400_000, [next]), now.toISOString());
  assert.equal(renewed.expiringSoon, true); assert.equal(renewed.interval?.endsAt.toISOString(), next.startsAt);
  const scheduled = directoryMembership({ ...member(0), entitlements: [next] }, now.toISOString());
  assert.equal(scheduled.label, "Scheduled"); assert.equal(scheduled.active, false); assert.equal(scheduled.pending, false);
  const pending = directoryMembership({ ...member(0), hasVerifiedMembership: false, entitlements: [] }, now.toISOString());
  assert.equal(pending.label, "Pending"); assert.equal(pending.interval, null); assert.equal(pending.active, false);
  const withdrawn = directoryMembership({ ...member(0), entitlements: [] }, now.toISOString());
  assert.equal(withdrawn.pending, false); assert.equal(withdrawn.label, "No current membership");
});
