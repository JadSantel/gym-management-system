import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeAttendance } from "../src/lib/attendance-summary";

const at = (time: string) => new Date(`2026-11-03T${time}+08:00`);
const visit = (start: string, end: string | null) => ({ arrivedAt: at(start), departedAt: end ? at(end) : null });

test("hourly occupancy counts simultaneous people, not all arrivals in the hour", () => {
  const result = summarizeAttendance([
    visit("08:00", "09:00"), visit("08:30", "09:30"), visit("09:00", "10:00"), visit("10:00", null),
    { arrivedAt: new Date("2026-11-02T23:30+08:00"), departedAt: at("00:30") },
    { arrivedAt: new Date("2026-11-02T22:00+08:00"), departedAt: null },
  ], at("10:30"));
  assert.equal(result.today, "2026-11-03");
  assert.deepEqual([result.checkedIn, result.inside, result.checkedOut], [4, 1, 4]);
  assert.deepEqual([0, 1, 8, 9, 10, 11].map(hour => result.hours[hour].occupancy), [1, 0, 2, 2, 1, null]);
  const separate = summarizeAttendance([visit("08:00", "08:10"), visit("08:20", "08:30")], at("09:00"));
  assert.equal(separate.hours[8].occupancy, 1);
});

test("exact hour, departure and midnight boundaries preserve half-open visits and unobserved future", () => {
  const result = summarizeAttendance([visit("08:00", "09:00"), visit("09:00", null), visit("10:00", null)], at("09:00"));
  assert.deepEqual([result.checkedIn, result.inside, result.checkedOut], [2, 1, 1]);
  assert.equal(result.hours[9].occupancy, 1);
  assert.equal(result.hours[10].occupancy, null);
  const midnight = summarizeAttendance([{ arrivedAt: new Date("2026-11-02T23:00+08:00"), departedAt: null }], at("00:00"));
  assert.equal(midnight.inside, 0);
  assert.equal(midnight.hours[0].occupancy, 0);
  assert.equal(midnight.hours[1].occupancy, null);
});

test("empty recorded day has zero observed occupancy and no invented future values", () => {
  const result = summarizeAttendance([], at("23:59"));
  assert.deepEqual([result.checkedIn, result.inside, result.checkedOut], [0, 0, 0]);
  assert.equal(result.hours.length, 24);
  assert.ok(result.hours.every(hour => hour.occupancy === 0));
});
