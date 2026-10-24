import { randomUUID } from "node:crypto";
import { assertSynthetic, localEmail } from "../src/lib/email";

assertSynthetic();
// This private local tool is never imported by a route and never accepts real recipients.
const args = process.argv.slice(2);
if (args.length < 2) throw new Error("Usage: npm run bootstrap:synthetic -- owner@example.test 'Synthetic Gym' [stable-gym-uuid]");
process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;
const { bootstrapSyntheticOwner } = await import("../src/lib/identity");
const { db } = await import("../src/lib/db");
try {
  const gymId = args[2] ?? randomUUID();
  const result = await bootstrapSyntheticOwner({ gymId, gymName: args[1], email: args[0], name: "Synthetic Owner" }, localEmail, db);
  console.log(`Synthetic bootstrap ${result.status}; gym fixture ID: ${gymId}. Read its private .local/mailbox capture. No link is logged.`);
} finally { await db.$disconnect(); }
