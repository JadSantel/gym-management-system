import assert from "node:assert/strict";
import { after, test } from "node:test";
import { db } from "../src/lib/db";
import { assertSynthetic } from "../src/lib/email";
import { DELETE, GET, PATCH, POST, PUT } from "../src/app/api/legacy/route";

assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/gym_crm_synthetic");
}
after(() => db.$disconnect());

test("FR-11 legacy entry and review routes are retired", async () => {
  const before = await db.legacyRecord.count();
  for (const handler of [GET, POST, PUT, PATCH, DELETE]) {
    const response = await handler();
    assert.equal(response.status, 410);
    assert.deepEqual(await response.json(), { error: "Legacy evidence entry and review are retired. Existing records remain read-only." });
  }
  assert.equal(await db.legacyRecord.count(), before);
});

test("runtime can read retained legacy history but cannot mutate records", async () => {
  const [privileges] = await db.$queryRaw<{ canRead: boolean; canInsert: boolean; canUpdate: boolean; canDelete: boolean }[]>`
    SELECT has_table_privilege(current_user, 'public.legacy_records', 'SELECT') AS "canRead",
           has_table_privilege(current_user, 'public.legacy_records', 'INSERT') AS "canInsert",
           has_table_privilege(current_user, 'public.legacy_records', 'UPDATE') AS "canUpdate",
           has_table_privilege(current_user, 'public.legacy_records', 'DELETE') AS "canDelete"`;
  assert.deepEqual(privileges, { canRead: true, canInsert: false, canUpdate: false, canDelete: false });
});
