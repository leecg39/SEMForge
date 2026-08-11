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

  const inviteUpdateColumns = await pg.query<{ column_name: string }>(
    "select column_name from information_schema.role_column_grants where grantee = 'semforge_auth' and table_schema = 'public' and table_name = 'invites' and privilege_type = 'UPDATE' order by column_name",
  );
  assert.deepEqual(
    inviteUpdateColumns.rows.map((grant) => grant.column_name),
    ["accepted_at", "accepted_by_user_id", "accepted_workspace_id"],
  );

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

test("auth role은 초대 intent에서 신규 workspace·owner membership·session을 원자 생성한다", async () => {
  const workspaceId = "00000000-0000-4000-8000-0000000000a1";
  const userId = "00000000-0000-4000-8000-0000000000a2";
  const inviteId = "00000000-0000-4000-8000-0000000000a3";
  await pg.query(
    "insert into invites (id, email, token_hash, workspace_name, workspace_slug, role, expires_at) values ($1, 'owner@example.com', repeat('a', 64), 'Auth Agency', 'auth-boundary', 'owner', now() + interval '1 day')",
    [inviteId],
  );

  await pg.query("begin");
  try {
    await pg.query("set local role semforge_auth");
    const intent = await pg.query<{ workspace_name: string; workspace_slug: string }>(
      "select workspace_name, workspace_slug from invites where id = $1",
      [inviteId],
    );
    assert.deepEqual(intent.rows, [{ workspace_name: "Auth Agency", workspace_slug: "auth-boundary" }]);
    await pg.query(
      "insert into users (id, email, password_hash) values ($1, 'owner@example.com', 'password-hash')",
      [userId],
    );
    await pg.query("insert into workspaces (id, name, slug) values ($1, $2, $3)", [
      workspaceId,
      intent.rows[0]!.workspace_name,
      intent.rows[0]!.workspace_slug,
    ]);
    await pg.query(
      "insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')",
      [workspaceId, userId],
    );
    await pg.query(
      "update invites set accepted_at = now(), accepted_workspace_id = $1, accepted_by_user_id = $2 where id = $3 and accepted_at is null and superseded_at is null and expires_at >= now()",
      [workspaceId, userId, inviteId],
    );
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
      ["invite creation", "insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at) values ('other@example.com', repeat('b', 64), 'Other', 'other', now() + interval '1 day')"],
      ["user deletion", "delete from users where id = '00000000-0000-4000-8000-0000000000a2'"],
    ] as const) {
      await pg.query(`savepoint auth_denied_${name.replace(/[^a-z]/g, "_")}`);
      await assert.rejects(pg.query(statement));
      await pg.query(`rollback to savepoint auth_denied_${name.replace(/[^a-z]/g, "_")}`);
    }
    await pg.query("commit");
  } catch (error) {
    await pg.query("rollback");
    throw error;
  }

  const accepted = await pg.query<{
    accepted_workspace_id: string;
    accepted_by_user_id: string;
    role: string;
  }>(
    "select accepted_workspace_id::text, accepted_by_user_id::text, role::text from invites where id = $1",
    [inviteId],
  );
  assert.deepEqual(accepted.rows, [
    { accepted_workspace_id: workspaceId, accepted_by_user_id: userId, role: "owner" },
  ]);

  await pg.query("begin");
  try {
    await pg.query("set local role semforge_auth");
    const reused = await pg.query<{ id: string }>(
      "update invites set accepted_at = now(), accepted_workspace_id = $1, accepted_by_user_id = $2 where id = $3 returning id::text",
      [workspaceId, userId, inviteId],
    );
    assert.deepEqual(reused.rows, []);
  } finally {
    await pg.query("rollback");
  }
});

test("auth 수락 트랜잭션 중간 실패는 account와 workspace 생성을 전부 rollback한다", async () => {
  const workspaceId = "00000000-0000-4000-8000-0000000000a4";
  const userId = "00000000-0000-4000-8000-0000000000a5";
  const inviteId = "00000000-0000-4000-8000-0000000000a6";
  await pg.query(
    "insert into invites (id, email, token_hash, workspace_name, workspace_slug, expires_at) values ($1, 'rollback@example.com', repeat('b', 64), 'Rollback Agency', 'rollback-agency', now() + interval '1 day')",
    [inviteId],
  );

  await pg.query("begin");
  try {
    await pg.query("set local role semforge_auth");
    await pg.query(
      "select id from invites where id = $1 and accepted_at is null and superseded_at is null and expires_at >= now() for update",
      [inviteId],
    );
    await pg.query(
      "insert into users (id, email, password_hash) values ($1, 'rollback@example.com', 'password-hash')",
      [userId],
    );
    await pg.query(
      "insert into workspaces (id, name, slug) values ($1, 'Rollback Agency', 'rollback-agency')",
      [workspaceId],
    );
    await pg.query(
      "insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')",
      [workspaceId, userId],
    );
    await pg.query(
      "update invites set accepted_at = now(), accepted_workspace_id = $1, accepted_by_user_id = $2 where id = $3 and accepted_at is null and superseded_at is null and expires_at >= now()",
      [workspaceId, userId, inviteId],
    );
    await assert.rejects(
      pg.query(
        "insert into sessions (workspace_id, user_id, token_hash, expires_at) values ('00000000-0000-4000-8000-0000000000af', $1, 'rollback-session', now() + interval '1 day')",
        [userId],
      ),
    );
  } finally {
    await pg.query("rollback");
  }

  const [user, workspace, membership, session, invite] = await Promise.all([
    pg.query<{ count: number }>("select count(*)::int as count from users where id = $1", [userId]),
    pg.query<{ count: number }>("select count(*)::int as count from workspaces where id = $1", [
      workspaceId,
    ]),
    pg.query<{ count: number }>(
      "select count(*)::int as count from memberships where workspace_id = $1 and user_id = $2",
      [workspaceId, userId],
    ),
    pg.query<{ count: number }>("select count(*)::int as count from sessions where user_id = $1", [
      userId,
    ]),
    pg.query<{ accepted_at: Date | null; accepted_workspace_id: string | null }>(
      "select accepted_at, accepted_workspace_id::text from invites where id = $1",
      [inviteId],
    ),
  ]);
  assert.equal(user.rows[0]!.count, 0);
  assert.equal(workspace.rows[0]!.count, 0);
  assert.equal(membership.rows[0]!.count, 0);
  assert.equal(session.rows[0]!.count, 0);
  assert.deepEqual(invite.rows, [{ accepted_at: null, accepted_workspace_id: null }]);
});

test("invite provisioning 제약은 잘못된 상태·역할·해시와 pending 중복을 거부한다", async () => {
  const workspaceId = "00000000-0000-4000-8000-0000000000c1";
  const userId = "00000000-0000-4000-8000-0000000000c2";
  await pg.query(
    "insert into workspaces (id, name, slug) values ($1, 'Constraint Owner', 'constraint-owner')",
    [workspaceId],
  );
  await pg.query(
    "insert into users (id, email, password_hash) values ($1, 'constraint-owner@example.com', 'password-hash')",
    [userId],
  );
  await pg.query(
    "insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')",
    [workspaceId, userId],
  );
  await pg.query(
    "insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at) values ('constraints@example.com', repeat('1', 64), 'Constraints', 'constraints', now() + interval '1 day')",
  );

  for (const statement of [
    "insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at) values ('plain-token@example.com', 'not-a-sha256', 'Plain', 'plain', now() + interval '1 day')",
    "insert into invites (email, token_hash, workspace_name, workspace_slug, role, expires_at) values ('member-role@example.com', repeat('2', 64), 'Member', 'member-role', 'member', now() + interval '1 day')",
    "insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at, accepted_workspace_id) values ('bad-state@example.com', repeat('3', 64), 'Bad State', 'bad-state', now() + interval '1 day', '00000000-0000-4000-8000-0000000000c1')",
    "insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at) values ('CONSTRAINTS@example.com', repeat('4', 64), 'Duplicate Email', 'duplicate-email', now() + interval '1 day')",
    "insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at) values ('duplicate-slug@example.com', repeat('5', 64), 'Duplicate Slug', 'CONSTRAINTS', now() + interval '1 day')",
    "insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at) values ('blank@example.com', repeat('6', 64), '', 'blank', now() + interval '1 day')",
    `insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at, accepted_at, accepted_workspace_id, accepted_by_user_id) values ('late-acceptance@example.com', repeat('7', 64), 'Late Acceptance', 'late-acceptance', now() + interval '1 day', now() + interval '2 days', '${workspaceId}', '${userId}')`,
    "insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at, superseded_at) values ('early-supersede@example.com', repeat('70', 32), 'Early Supersede', 'early-supersede', now() + interval '1 day', now())",
    `insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at, accepted_at, superseded_at, accepted_workspace_id, accepted_by_user_id) values ('mixed-state@example.com', repeat('71', 32), 'Mixed State', 'mixed-state', now() + interval '1 day', now(), now() + interval '1 day', '${workspaceId}', '${userId}')`,
  ]) {
    await assert.rejects(pg.query(statement));
  }
});

test("auth role은 만료된 invite intent를 잠그거나 수락하지 못한다", async () => {
  const inviteId = "00000000-0000-4000-8000-0000000000c3";
  await pg.query(
    "insert into invites (id, email, token_hash, workspace_name, workspace_slug, created_at, expires_at) values ($1, 'expired@example.com', repeat('8', 64), 'Expired', 'expired', now() - interval '2 days', now() - interval '1 day')",
    [inviteId],
  );

  await pg.query("begin");
  try {
    await pg.query("set local role semforge_auth");
    const lockable = await pg.query<{ id: string }>(
      "select id::text from invites where id = $1 and accepted_at is null and superseded_at is null and expires_at >= now() for update",
      [inviteId],
    );
    assert.deepEqual(lockable.rows, []);
    const accepted = await pg.query<{ id: string }>(
      "update invites set accepted_at = now(), accepted_workspace_id = '00000000-0000-4000-8000-0000000000ce', accepted_by_user_id = '00000000-0000-4000-8000-0000000000cf' where id = $1 returning id::text",
      [inviteId],
    );
    assert.deepEqual(accepted.rows, []);
  } finally {
    await pg.query("rollback");
  }
});

test("operator는 만료 intent만 supersede하고 경쟁 재발급에서 pending 하나만 남긴다", async () => {
  const expiredInviteId = "00000000-0000-4000-8000-0000000000d1";
  const validInviteId = "00000000-0000-4000-8000-0000000000d2";
  const acceptedInviteId = "00000000-0000-4000-8000-0000000000d3";
  const acceptedWorkspaceId = "00000000-0000-4000-8000-0000000000d4";
  const acceptedUserId = "00000000-0000-4000-8000-0000000000d5";

  await pg.query(
    "insert into workspaces (id, name, slug) values ($1, 'Accepted Invite', 'accepted-invite')",
    [acceptedWorkspaceId],
  );
  await pg.query(
    "insert into users (id, email, password_hash) values ($1, 'accepted-invite@example.com', 'password-hash')",
    [acceptedUserId],
  );
  await pg.query(
    "insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')",
    [acceptedWorkspaceId, acceptedUserId],
  );
  await pg.query(
    "insert into invites (id, email, token_hash, workspace_name, workspace_slug, created_at, expires_at) values ($1, 'reissue@example.com', repeat('9', 64), 'Reissue', 'reissue', now() - interval '2 days', now() - interval '1 day')",
    [expiredInviteId],
  );
  await pg.query(
    "insert into invites (id, email, token_hash, workspace_name, workspace_slug, expires_at) values ($1, 'valid-invite@example.com', repeat('ef', 32), 'Valid Invite', 'valid-invite', now() + interval '1 day')",
    [validInviteId],
  );
  await pg.query(
    "insert into invites (id, email, token_hash, workspace_name, workspace_slug, expires_at, accepted_at, accepted_workspace_id, accepted_by_user_id) values ($1, 'accepted-invite@example.com', repeat('de', 32), 'Accepted Invite', 'accepted-invite', now() + interval '1 day', now(), $2, $3)",
    [acceptedInviteId, acceptedWorkspaceId, acceptedUserId],
  );

  await pg.query("set role semforge_operator");
  try {
    const superseded = await pg.query<{ id: string }>(
      "update invites set superseded_at = now() where id = $1 returning id::text",
      [expiredInviteId],
    );
    assert.deepEqual(superseded.rows, [{ id: expiredInviteId }]);

    for (const inviteId of [validInviteId, acceptedInviteId]) {
      const denied = await pg.query<{ id: string }>(
        "update invites set superseded_at = now() where id = $1 returning id::text",
        [inviteId],
      );
      assert.deepEqual(denied.rows, []);
    }
    await assert.rejects(
      pg.query("update invites set workspace_name = 'Forged' where id = $1", [expiredInviteId]),
    );

    const attempts = await Promise.allSettled([
      pg.query(
        "insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at) values ('reissue@example.com', repeat('ab', 32), 'Reissue', 'reissue', now() + interval '1 day')",
      ),
      pg.query(
        "insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at) values ('REISSUE@example.com', repeat('cd', 32), 'Reissue Two', 'REISSUE', now() + interval '1 day')",
      ),
    ]);
    assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
    assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 1);
  } finally {
    await pg.query("reset role");
  }

  const state = await pg.query<{ active: number; superseded: number }>(
    "select count(*) filter (where accepted_at is null and superseded_at is null)::int as active, count(*) filter (where superseded_at is not null)::int as superseded from invites where lower(email) = 'reissue@example.com'",
  );
  assert.deepEqual(state.rows, [{ active: 1, superseded: 1 }]);
});

test("operator role은 NOLOGIN 권한 그룹이며 invites SELECT/INSERT 권한만 가진다", async () => {
  const role = await pg.query<{
    rolcanlogin: boolean;
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolbypassrls: boolean;
  }>(
    "select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls from pg_roles where rolname = 'semforge_operator'",
  );
  assert.deepEqual(role.rows[0], {
    rolcanlogin: false,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolbypassrls: false,
  });
  // IaC가 만드는 semforge_operator_login은 LOGIN INHERIT 멤버여야 하며 이 그룹을 DSN으로 직접 쓰지 않는다.

  const grants = await pg.query<{ table_name: string; privilege_type: string }>(
    "select table_name, privilege_type from information_schema.role_table_grants where grantee = 'semforge_operator' and table_schema = 'public' order by table_name, privilege_type",
  );
  assert.deepEqual(
    grants.rows.map((grant) => `${grant.table_name}:${grant.privilege_type}`),
    ["invites:SELECT"],
  );

  const inviteInsertColumns = await pg.query<{ column_name: string }>(
    "select column_name from information_schema.role_column_grants where grantee = 'semforge_operator' and table_schema = 'public' and table_name = 'invites' and privilege_type = 'INSERT' order by column_name",
  );
  assert.deepEqual(
    inviteInsertColumns.rows.map((grant) => grant.column_name),
    ["email", "expires_at", "token_hash", "workspace_name", "workspace_slug"],
  );
  const inviteUpdateColumns = await pg.query<{ column_name: string }>(
    "select column_name from information_schema.role_column_grants where grantee = 'semforge_operator' and table_schema = 'public' and table_name = 'invites' and privilege_type = 'UPDATE' order by column_name",
  );
  assert.deepEqual(inviteUpdateColumns.rows.map((grant) => grant.column_name), ["superseded_at"]);

  const policies = await pg.query<{ tablename: string }>(
    "select distinct tablename from pg_policies where 'semforge_operator' = any(roles) order by tablename",
  );
  assert.deepEqual(policies.rows.map((policy) => policy.tablename), ["invites"]);
});

test("operator는 7일 초대를 발급하지만 인증·사이트·결제 데이터에는 접근하지 못한다", async () => {
  const workspaceId = "00000000-0000-4000-8000-0000000000b1";
  const userId = "00000000-0000-4000-8000-0000000000b2";
  await pg.query("insert into workspaces (id, name, slug) values ($1, 'Operator', 'operator-boundary')", [
    workspaceId,
  ]);
  await pg.query(
    "insert into users (id, email, password_hash) values ($1, 'existing-owner@example.com', 'password-hash')",
    [userId],
  );
  await pg.query(
    "insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')",
    [workspaceId, userId],
  );

  await pg.query("begin");
  try {
    await pg.query("set local role semforge_operator");
    await pg.query(
      "insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at) values ('design-partner@example.com', repeat('c', 64), 'Design Partner', 'design-partner', now() + interval '7 days')",
    );
    const visible = await pg.query<{
      email: string;
      workspace_name: string;
      workspace_slug: string;
      role: string;
      accepted_at: Date | null;
    }>(
      "select email, workspace_name, workspace_slug, role::text, accepted_at from invites where token_hash = repeat('c', 64)",
    );
    assert.deepEqual(visible.rows, [
      {
        email: "design-partner@example.com",
        workspace_name: "Design Partner",
        workspace_slug: "design-partner",
        role: "owner",
        accepted_at: null,
      },
    ]);

    for (const [name, statement] of [
      ["eight day invite", "insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at) values ('late@example.com', repeat('d', 64), 'Late', 'late', now() + interval '8 days')"],
      ["accepted field injection", `insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at, accepted_at, accepted_workspace_id, accepted_by_user_id) values ('forged@example.com', repeat('e', 64), 'Forged', 'forged', now() + interval '1 day', now(), '${workspaceId}', '${userId}')`],
      ["created at injection", "insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at, created_at) values ('future@example.com', repeat('f', 64), 'Future', 'future', now() + interval '14 days', now() + interval '7 days')"],
      ["member role injection", "insert into invites (email, token_hash, workspace_name, workspace_slug, role, expires_at) values ('member@example.com', repeat('0', 64), 'Member', 'member', 'member', now() + interval '1 day')"],
      ["invite update", "update invites set email = 'changed@example.com' where token_hash = repeat('c', 64)"],
      ["invite delete", "delete from invites where token_hash = repeat('c', 64)"],
      ["users", "select * from users"],
      ["sessions", "select * from sessions"],
      ["workspaces", "select * from workspaces"],
      ["memberships", "select * from memberships"],
      ["sites", "select * from sites"],
      ["payments", "select * from payments"],
    ] as const) {
      const savepoint = `operator_denied_${name.replace(/[^a-z]/g, "_")}`;
      await pg.query(`savepoint ${savepoint}`);
      await assert.rejects(pg.query(statement));
      await pg.query(`rollback to savepoint ${savepoint}`);
    }
  } finally {
    await pg.query("rollback");
  }
});
