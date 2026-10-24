import { defineConfig, env } from "prisma/config";

try { process.loadEnvFile(".env.migration.local"); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("MIGRATION_DATABASE_URL") },
});
