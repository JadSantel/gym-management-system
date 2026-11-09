import test from "node:test";
import assert from "node:assert/strict";
import { membershipProgress } from "../src/lib/membership-progress";

const interval = { startsAt: new Date("2028-02-28T16:00:00Z"), endsAt: new Date("2028-03-29T16:00:00Z") };
test("membership progress respects 24-hour days across leap day and exclusive expiry", () => {
  assert.deepEqual(membershipProgress(interval, interval.startsAt), { percent: 0, usedDays: 0, daysLeft: 30 });
  const partial = membershipProgress(interval, new Date("2028-02-29T22:00:00Z"));
  assert.equal(partial.usedDays, 1); assert.equal(partial.daysLeft, 28); assert.ok(Math.abs(partial.percent - 100 * 1.25 / 30) < 1e-10);
  assert.deepEqual(membershipProgress(interval, interval.endsAt), { percent: 100, usedDays: 30, daysLeft: 0 });
});
test("membership progress clamps scheduled/expired terms and never rounds up remaining time", () => {
  assert.deepEqual(membershipProgress(interval, new Date("2028-02-01T00:00:00Z")), { percent: 0, usedDays: 0, daysLeft: 30 });
  assert.deepEqual(membershipProgress(interval, new Date("2028-04-01T00:00:00Z")), { percent: 100, usedDays: 30, daysLeft: 0 });
  const lastHour = membershipProgress(interval, new Date(interval.endsAt.getTime() - 3_599_999));
  assert.equal(lastHour.usedDays, 29); assert.equal(lastHour.daysLeft, 0); assert.ok(lastHour.percent < 100);
});
