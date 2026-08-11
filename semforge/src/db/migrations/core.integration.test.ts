// @TASK P1-D1-T1 - PostgreSQL migration, tenant limit, and RLS integration contract
// @SPEC docs/planning/06-tasks.md#p1-d1-t1--postgresql-16-핵심-스키마와-암호화-기반
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const pg = new PGlite();
const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");

before(async () => {
  await pg.waitReady;
  await migrate(drizzle(pg), { migrationsFolder });
});

after(async () => pg.close());

test("fresh migration과 두 번째 migration 실행이 모두 성공한다", async () => {
  await migrate(drizzle(pg), { migrationsFolder });
  const result = await pg.query<{ count: number }>(
    "select count(*)::int as count from information_schema.tables where table_schema = 'public'",
  );
  assert.ok(result.rows[0]!.count >= 30);
});

test("workspace당 네 번째 site를 거부한다", async () => {
  const workspaceId = "00000000-0000-4000-8000-000000000001";
  await pg.query("insert into workspaces (id, name, slug) values ($1, 'Agency', 'agency')", [
    workspaceId,
  ]);
  for (let index = 1; index <= 3; index += 1) {
    await pg.query(
      "insert into sites (workspace_id, name, domain) values ($1, $2, $3)",
      [workspaceId, `Site ${index}`, `site-${index}.example`],
    );
  }
  await assert.rejects(
    pg.query("insert into sites (workspace_id, name, domain) values ($1, 'Site 4', 'site-4.example')", [
      workspaceId,
    ]),
    /site limit exceeded/i,
  );
});

test("site당 active rank와 aio query를 각각 20개까지만 허용한다", async () => {
  const workspaceId = "00000000-0000-4000-8000-000000000002";
  const siteId = "00000000-0000-4000-8000-000000000020";
  await pg.query("insert into workspaces (id, name, slug) values ($1, 'Limits', 'limits')", [
    workspaceId,
  ]);
  await pg.query("insert into sites (id, workspace_id, name, domain) values ($1, $2, 'Limit', 'limit.example')", [
    siteId,
    workspaceId,
  ]);

  for (const type of ["rank", "aio"] as const) {
    for (let index = 1; index <= 20; index += 1) {
      await pg.query(
        "insert into tracked_queries (workspace_id, site_id, type, query, normalized_query) values ($1, $2, $3, $4, $5)",
        [workspaceId, siteId, type, `${type} query ${index}`, `${type}-query-${index}`],
      );
    }
    await assert.rejects(
      pg.query(
        "insert into tracked_queries (workspace_id, site_id, type, query, normalized_query) values ($1, $2, $3, 'overflow', $4)",
        [workspaceId, siteId, type, `${type}-overflow`],
      ),
      /tracked query limit exceeded/i,
    );
  }
});

test("web role은 transaction-local workspace 밖의 row를 볼 수 없다", async () => {
  const tenantA = "00000000-0000-4000-8000-00000000000a";
  const tenantB = "00000000-0000-4000-8000-00000000000b";
  await pg.query(
    "insert into workspaces (id, name, slug) values ($1, 'Tenant A', 'tenant-a'), ($2, 'Tenant B', 'tenant-b')",
    [tenantA, tenantB],
  );
  await pg.query(
    "insert into sites (workspace_id, name, domain) values ($1, 'A', 'a.example'), ($2, 'B', 'b.example')",
    [tenantA, tenantB],
  );

  await pg.query("begin");
  try {
    await pg.query("set local role semforge_web");
    await pg.query("select set_config('app.workspace_id', $1, true)", [tenantA]);
    const visible = await pg.query<{ workspace_id: string }>("select workspace_id from sites");
    assert.deepEqual(visible.rows.map((row) => row.workspace_id), [tenantA]);
    await assert.rejects(
      pg.query("insert into sites (workspace_id, name, domain) values ($1, 'Escape', 'escape.example')", [
        tenantB,
      ]),
    );
  } finally {
    await pg.query("rollback");
  }
});
