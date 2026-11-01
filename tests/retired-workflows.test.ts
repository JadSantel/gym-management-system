import assert from "node:assert/strict";
import { after, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import * as digital from "../src/app/api/digital/route";
import * as investigations from "../src/app/api/investigations/route";
import * as outage from "../src/app/api/outage/route";
import * as closing from "../src/app/api/closing/route";

assert.equal(process.env.SYNTHETIC_DATA_ONLY, "true");
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/gym_crm_synthetic");
}

const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL!, options: "-c timezone=UTC" }) });
after(async () => { await admin.$disconnect(); });

async function retainedRecordCounts() {
  return Promise.all([
    admin.payment.count(), admin.paymentReceipt.count(), admin.membershipPeriod.count(), admin.effectiveEntitlement.count(),
    admin.digitalClaim.count(), admin.digitalSettlement.count(), admin.paymentFlag.count(),
    admin.investigationCase.count(), admin.investigationEvent.count(),
    admin.outageBook.count(), admin.outagePrice.count(), admin.outageVerifier.count(), admin.outageEntry.count(),
    admin.outageHandover.count(), admin.outageConfirmation.count(), admin.outageEvent.count(),
    admin.closingCheck.count(), admin.closingSnapshot.count(), admin.closingLine.count(), admin.closingLineCheck.count(), admin.closingApproval.count(),
  ]);
}

test("retired workflow APIs reject every operation and preserve stored history", async () => {
  const before = await retainedRecordCounts();
  const routes = [digital, investigations, outage, closing];
  const verbs = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
  for (const route of routes) {
    for (const verb of verbs) {
      const handler = route[verb];
      const response = await handler();
      assert.equal(response.status, 410, `${verb} retired route`);
      assert.match((await response.json()).error, /retired/i);
    }
  }
  assert.deepEqual(await retainedRecordCounts(), before, "retired API requests leave all financial and operational history unchanged");
});
