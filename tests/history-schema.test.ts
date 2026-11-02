import assert from "node:assert/strict";
import { test } from "node:test";
import { historyQuerySchema } from "../src/lib/history-schema";

test("payment history accepts inclusive ISO ranges and preserves legacy date/reference filters", () => {
  for (const query of [{}, { date: "2026-11-02" }, { from: "2028-02-29", to: "2028-02-29" }, { from: "2026-10-31", to: "2026-11-02", status: "CONFIRMED", method: "BANK" }, { to: "2026-11-02", status: "PENDING" }]) {
    assert.equal(historyQuerySchema.safeParse(query).success, true);
  }
  assert.equal(historyQuerySchema.parse({ reference: "  REF-01  " }).reference, "REF-01");
  for (const query of [{ from: "0000-01-01" }, { from: "2027-02-29" }, { to: "not-a-date" }, { from: "2026-11-03", to: "2026-11-02" }, { date: "2026-11-02", from: "2026-11-01" }, { status: "REFUNDED" }, { method: "CARD" }, { from: ["2026-11-02"] }, { gymId: "untrusted" }, { collectorId: "invalid" }]) {
    assert.equal(historyQuerySchema.safeParse(query).success, false, JSON.stringify(query));
  }
});

test("pagination accepts only positive page strings and 10/20/30 rows", () => {
  for (const pageSize of ["10", "20", "30"]) {
    assert.equal(historyQuerySchema.safeParse({ page: "2", pageSize }).success, true);
  }
  for (const page of ["0", "-1", "1.5", "1e2", "01", "1000000000", 1, ["1"], null]) {
    assert.equal(historyQuerySchema.safeParse({ page }).success, false);
  }
  for (const pageSize of ["5", "50", "", 10, ["10"], null]) {
    assert.equal(historyQuerySchema.safeParse({ pageSize }).success, false);
  }
});
