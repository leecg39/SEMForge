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

test("web과 worker role은 BYPASSRLS가 아니며 web 정책은 명시적으로 role에 한정된다", async () => {
  const roles = await pg.query<{ rolname: string; rolbypassrls: boolean }>(
    "select rolname, rolbypassrls from pg_roles where rolname in ('semforge_web', 'semforge_worker') order by rolname",
  );
  assert.deepEqual(roles.rows, [
    { rolname: "semforge_web", rolbypassrls: false },
    { rolname: "semforge_worker", rolbypassrls: false },
  ]);

  const policies = await pg.query<{ policyname: string; roles: string[] }>(
    "select policyname, roles from pg_policies where tablename = 'sites' order by policyname",
  );
  assert.ok(
    policies.rows.some(
      (policy) => policy.policyname === "sites_tenant_isolation" && policy.roles.includes("semforge_web"),
    ),
  );
});

test("DB도 GSC token과 Toss billing key의 평문 저장을 거부한다", async () => {
  const workspaceId = "00000000-0000-4000-8000-000000000090";
  await pg.query("insert into workspaces (id, name, slug) values ($1, 'Secrets', 'secrets')", [
    workspaceId,
  ]);

  await assert.rejects(
    pg.query(
      "insert into gsc_connections (workspace_id, label, access_token_encrypted, refresh_token_encrypted, token_expires_at) values ($1, 'GSC', 'plain', 'plain', now())",
      [workspaceId],
    ),
  );
});

test("auth role은 pre-tenant 인증 트랜잭션에 필요한 최소 권한과 RLS 정책만 가진다", async () => {
  const role = await pg.query<{
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolbypassrls: boolean;
  }>(
    "select rolsuper, rolcreatedb, rolcreaterole, rolbypassrls from pg_roles where rolname = 'semforge_auth'",
  );
  assert.deepEqual(role.rows[0], {
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolbypassrls: false,
  });

  const grants = await pg.query<{ table_name: string; privilege_type: string }>(
    "select table_name, privilege_type from information_schema.role_table_grants where grantee = 'semforge_auth' and table_schema = 'public' order by table_name, privilege_type",
  );
  const actual = grants.rows.map((grant) => `${grant.table_name}:${grant.privilege_type}`);
  assert.deepEqual(actual, [
    "auth_action_throttles:DELETE",
    "auth_action_throttles:INSERT",
    "auth_action_throttles:SELECT",
    "auth_action_throttles:UPDATE",
    "invites:SELECT",
    "invites:UPDATE",
    "memberships:INSERT",
    "memberships:SELECT",
    "password_resets:INSERT",
    "password_resets:SELECT",
    "password_resets:UPDATE",
    "sessions:DELETE",
    "sessions:INSERT",
    "sessions:SELECT",
    "sessions:UPDATE",
    "users:INSERT",
    "users:SELECT",
    "users:UPDATE",
    "workspaces:INSERT",
    "workspaces:SELECT",
  ]);

  const policies = await pg.query<{ tablename: string; roles: string[] }>(
    "select distinct tablename, roles from pg_policies where 'semforge_auth' = any(roles) order by tablename",
  );
  assert.deepEqual(
    policies.rows.map((policy) => policy.tablename),
    [
      "auth_action_throttles",
      "invites",
      "memberships",
      "password_resets",
      "sessions",
      "users",
      "workspaces",
    ],
  );
});

test("auth role은 초대 수락·세션·비밀번호 재설정은 수행하지만 사이트와 결제에는 접근하지 못한다", async () => {
  const workspaceId = "00000000-0000-4000-8000-0000000000a1";
  const userId = "00000000-0000-4000-8000-0000000000a2";
  const inviteId = "00000000-0000-4000-8000-0000000000a3";
  await pg.query("insert into workspaces (id, name, slug) values ($1, 'Auth', 'auth-boundary')", [
    workspaceId,
  ]);
  await pg.query(
    "insert into invites (id, workspace_id, email, token_hash, expires_at) values ($1, $2, 'member@example.com', 'invite-auth-boundary', now() + interval '1 day')",
    [inviteId, workspaceId],
  );

  await pg.query("begin");
  try {
    await pg.query("set local role semforge_auth");
    await pg.query(
      "insert into users (id, email, password_hash) values ($1, 'member@example.com', 'password-hash')",
      [userId],
    );
    await pg.query("insert into memberships (workspace_id, user_id) values ($1, $2)", [
      workspaceId,
      userId,
    ]);
    await pg.query("update invites set accepted_at = now(), accepted_by_user_id = $1 where id = $2", [
      userId,
      inviteId,
    ]);
    await pg.query(
      "insert into sessions (workspace_id, user_id, token_hash, expires_at) values ($1, $2, 'session-auth-boundary', now() + interval '1 day')",
      [workspaceId, userId],
    );
    await pg.query(
      "insert into password_resets (user_id, token_hash, expires_at) values ($1, 'reset-auth-boundary', now() + interval '1 hour')",
      [userId],
    );
    await pg.query(
      "insert into auth_action_throttles (action, key_hash, attempt_count) values ('login', $1, 1) on conflict (action, key_hash) do update set attempt_count = auth_action_throttles.attempt_count + 1, updated_at = now()",
      ["a".repeat(64)],
    );

    await pg.query("savepoint invalid_throttle_hash");
    await assert.rejects(
      pg.query(
        "insert into auth_action_throttles (action, key_hash) values ('forgot_password', 'member@example.com')",
      ),
    );
    await pg.query("rollback to savepoint invalid_throttle_hash");

    for (const [name, statement] of [
      ["sites", "select * from sites"],
      ["payments", "select * from payments"],
      ["invite creation", "insert into invites (workspace_id, email, token_hash, expires_at) values ('00000000-0000-4000-8000-0000000000a1', 'other@example.com', 'forbidden-invite', now())"],
      ["user deletion", "delete from users where id = '00000000-0000-4000-8000-0000000000a2'"],
    ] as const) {
      await pg.query(`savepoint auth_denied_${name.replace(/[^a-z]/g, "_")}`);
      await assert.rejects(pg.query(statement));
      await pg.query(`rollback to savepoint auth_denied_${name.replace(/[^a-z]/g, "_")}`);
    }
  } finally {
    await pg.query("rollback");
  }
});
