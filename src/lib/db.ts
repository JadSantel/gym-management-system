import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { getRuntimeConfig } from "./config";

const config = getRuntimeConfig();
const globalDb = globalThis as unknown as { db?: PrismaClient };
export const db = globalDb.db ?? new PrismaClient({
  // Pinned adapter serializes DateTime parameters without an offset. Every pooled connection must use UTC.
  adapter: new PrismaPg({ connectionString: config.DATABASE_URL, options: "-c timezone=UTC" }),
});
if (process.env.NODE_ENV !== "production") globalDb.db = db;
