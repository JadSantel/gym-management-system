import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { getRuntimeConfig } from "../src/lib/config";

const valid = {
  DATABASE_URL: "postgresql://runtime:CONFIG_PASSWORD_SENTINEL@127.0.0.1:55432/gym_crm_synthetic",
  BETTER_AUTH_SECRET: "CONFIG_SECRET_SENTINEL_0123456789abcdef",
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
  SYNTHETIC_DATA_ONLY: "true",
};

function assertInvalid(key: keyof typeof valid, value: unknown) {
  assert.throws(() => getRuntimeConfig({ ...valid, [key]: value }), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, `Invalid runtime configuration: ${key}.`);
    assert.equal(error.cause, undefined);
    assert.deepEqual(Object.keys(error), []);
    return true;
  });
}

test("runtime configuration preserves valid values and only returns the four application keys", () => {
  assert.deepEqual(getRuntimeConfig({ ...valid, MIGRATION_DATABASE_URL: "MIGRATION_SECRET_SENTINEL", EXTRA: "ignored" }), valid);
  assert.deepEqual(getRuntimeConfig({ ...valid, DATABASE_URL: valid.DATABASE_URL.replace("postgresql:", "postgres:") }),
    { ...valid, DATABASE_URL: valid.DATABASE_URL.replace("postgresql:", "postgres:") });
  assert.equal(getRuntimeConfig({ ...valid, BETTER_AUTH_URL: "https://127.0.0.1:3000" }).BETTER_AUTH_URL, "https://127.0.0.1:3000");
});

test("missing, empty and wrong-type configuration fails with key-only diagnostics", () => {
  for (const key of Object.keys(valid) as (keyof typeof valid)[]) {
    for (const value of [undefined, "", null, 123, true, []]) assertInvalid(key, value);
  }
  assert.throws(() => getRuntimeConfig({}), {
    message: "Invalid runtime configuration: DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, SYNTHETIC_DATA_ONLY.",
  });
});

test("database configuration rejects malformed, remote and redirected synthetic destinations", () => {
  for (const value of [
    "CONFIG_PASSWORD_SENTINEL is not a URL",
    valid.DATABASE_URL.replace("postgresql:", "https:"),
    valid.DATABASE_URL.replace("127.0.0.1", "remote.example.test"),
    valid.DATABASE_URL.replace("55432", "5432"),
    valid.DATABASE_URL.replace("gym_crm_synthetic", "other_database"),
    valid.DATABASE_URL.replace("runtime:", ":"),
    valid.DATABASE_URL.replace("CONFIG_PASSWORD_SENTINEL", ""),
    `${valid.DATABASE_URL}?host=remote.example.test`,
    `${valid.DATABASE_URL}#CONFIG_PASSWORD_SENTINEL`,
    ` ${valid.DATABASE_URL}`,
    valid.DATABASE_URL.replace("runtime", "run\ntime"),
  ]) assertInvalid("DATABASE_URL", value);
});

test("auth configuration rejects invalid secrets, non-origin URLs and unsupported live modes", () => {
  for (const value of ["short", "s".repeat(31), " ".repeat(32), ` ${valid.BETTER_AUTH_SECRET}`, "REPLACE_WITH_AT_LEAST_32_RANDOM_BYTES"]) {
    assertInvalid("BETTER_AUTH_SECRET", value);
  }
  for (const value of ["not a URL", "https://remote.example.test", "file://127.0.0.1", "http://127.0.0.1:3000/",
    "http://user:CONFIG_PASSWORD_SENTINEL@127.0.0.1:3000", `${valid.BETTER_AUTH_URL}/setup`, `${valid.BETTER_AUTH_URL}?secret=value`, `${valid.BETTER_AUTH_URL}#token`]) {
    assertInvalid("BETTER_AUTH_URL", value);
  }
  for (const value of ["false", "TRUE", "1", " true "]) assertInvalid("SYNTHETIC_DATA_ONLY", value);
});

function importInChild(modulePath: string, overrides: Record<string, string | undefined>, server = true) {
  const environment: NodeJS.ProcessEnv = { ...process.env, ...valid, ...overrides };
  delete environment.MIGRATION_DATABASE_URL;
  delete environment.NODE_OPTIONS;
  const result = spawnSync(process.execPath, [
    ...(server ? ["--conditions=react-server"] : []), "--import", "tsx", "--input-type=module", "--eval", `
      import net from 'node:net';
      let connections = 0;
      net.Socket.prototype.connect = function () { connections++; throw new Error('Unexpected connection attempt.'); };
      try {
        await import(${JSON.stringify(modulePath)});
        console.log(JSON.stringify({ imported: true, connections }));
      } catch (error) {
        console.log(JSON.stringify({ imported: false, connections, message: error.message }));
      }
    `,
  ], { env: environment, encoding: "utf8", timeout: 30_000, windowsHide: true });
  assert.equal(result.status, 0, "Configuration import probe must exit cleanly.");
  for (const sentinel of ["CONFIG_PASSWORD_SENTINEL", valid.BETTER_AUTH_SECRET, "MIGRATION_SECRET_SENTINEL"]) {
    assert.equal(`${result.stdout}${result.stderr}`.includes(sentinel), false, "Probe output must not contain configuration values.");
  }
  return JSON.parse(result.stdout);
}

test("database and auth reject invalid configuration before any network connection", () => {
  for (const modulePath of ["./src/lib/db.ts", "./src/lib/auth.ts"]) {
    for (const key of Object.keys(valid) as (keyof typeof valid)[]) {
      assert.deepEqual(importInChild(modulePath, { [key]: undefined }), {
        imported: false, connections: 0, message: `Invalid runtime configuration: ${key}.`,
      });
    }
    assert.deepEqual(importInChild(modulePath, { DATABASE_URL: valid.DATABASE_URL.replace("127.0.0.1", "remote.example.test") }), {
      imported: false, connections: 0, message: "Invalid runtime configuration: DATABASE_URL.",
    });
  }
});

test("configuration imports require the server-only condition outside Next.js", () => {
  const result = importInChild("./src/lib/config.ts", {}, false);
  assert.equal(result.imported, false);
  assert.equal(result.connections, 0);
  assert.match(result.message, /cannot be imported from a Client Component/);
});
