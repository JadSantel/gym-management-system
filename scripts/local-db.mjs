// Isolated synthetic cluster. Never connects to the machine's existing PostgreSQL service.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const root = resolve(".local");
const data = resolve(root, "postgres");
const envFile = resolve(".env.local");
const migrationFile = resolve(".env.migration.local");
mkdirSync(root, { recursive: true });
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true, stdio: command === "pg_ctl" ? "ignore" : "pipe" });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
};
if (!existsSync(envFile)) {
  if (existsSync(data)) throw new Error("Existing cluster without environment file; recover credentials manually.");
  const admin = randomBytes(32).toString("hex");
  const runtime = randomBytes(32).toString("hex");
  writeFileSync(resolve(root, "pg-password"), admin, { mode: 0o600 });
  run("initdb", ["-D", data, "-U", "gym_migrator", "--auth=scram-sha-256", "--pwfile", resolve(root, "pg-password"), "--encoding=UTF8", "--no-locale"]);
  writeFileSync(envFile, [
    `DATABASE_URL=postgresql://gym_runtime:${runtime}@127.0.0.1:55432/gym_crm_synthetic`,
    `BETTER_AUTH_SECRET=${randomBytes(48).toString("hex")}`,
    "BETTER_AUTH_URL=http://127.0.0.1:3000",
    "SYNTHETIC_DATA_ONLY=true",
    "",
  ].join("\n"), { mode: 0o600 });
  writeFileSync(migrationFile, `MIGRATION_DATABASE_URL=postgresql://gym_migrator:${admin}@127.0.0.1:55432/gym_crm_synthetic\n`, { mode: 0o600 });
}
process.loadEnvFile(envFile);
process.loadEnvFile(migrationFile);
const status = spawnSync("pg_ctl", ["-D", data, "status"], { windowsHide: true });
if (status.status !== 0) {
  run("pg_ctl", ["-D", data, "-l", resolve(root, "postgres.log"), "-o", "-h 127.0.0.1 -p 55432", "-w", "start"]);
}
const adminUrl = new URL(process.env.MIGRATION_DATABASE_URL);
if (adminUrl.hostname !== "127.0.0.1" || adminUrl.port !== "55432" || adminUrl.pathname !== "/gym_crm_synthetic") {
  throw new Error("Local setup accepts only its isolated synthetic database.");
}
adminUrl.pathname = "/postgres";
const client = new pg.Client({ connectionString: adminUrl.href });
await client.connect();
try {
  if (!(await client.query("SELECT 1 FROM pg_roles WHERE rolname='gym_runtime'")).rowCount) {
    const password = new URL(process.env.DATABASE_URL).password;
    if (!/^[a-f0-9]{64}$/.test(password)) throw new Error("Unexpected local runtime password format.");
    await client.query(`CREATE ROLE gym_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`);
  }
  if (!(await client.query("SELECT 1 FROM pg_database WHERE datname='gym_crm_synthetic'")).rowCount) {
    await client.query("CREATE DATABASE gym_crm_synthetic OWNER gym_migrator");
  }
} finally {
  await client.end();
}
console.log("Isolated synthetic PostgreSQL ready on 127.0.0.1:55432; credentials remain in ignored .env.local.");
