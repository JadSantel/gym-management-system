import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { assertSynthetic } from "../src/lib/email";

assertSynthetic();
const email = process.env.SYNTHETIC_PLATFORM_ADMIN_EMAIL ?? "";
const name = process.env.SYNTHETIC_PLATFORM_ADMIN_NAME ?? "Synthetic Platform Administrator";
const password = process.env.SYNTHETIC_PLATFORM_ADMIN_PASSWORD ?? "";
const url = process.env.MIGRATION_DATABASE_URL;
if (!url || !email || !password) throw new Error("Set the synthetic platform admin email, password, and migration database configuration.");
process.env.DATABASE_URL = url;
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, options: "-c timezone=UTC" }) });
const { bootstrapSyntheticPlatformAdmin } = await import("../src/lib/onboarding");
try {
  const result = await bootstrapSyntheticPlatformAdmin(email, name, password, admin);
  console.log(`Synthetic platform administrator ${result.status}. No password or email link was logged.`);
} finally {
  await admin.$disconnect();
}
