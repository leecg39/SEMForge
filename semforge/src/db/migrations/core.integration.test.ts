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

test("모든 runtime, privacy, tenant billing과 secret scrubber role은 BYPASSRLS가 아니다", async () => {
  const roles = await pg.query<{ rolname: string; rolbypassrls: boolean }>(
    "select rolname, rolbypassrls from pg_roles where rolname in ('semforge_billing', 'semforge_billing_tenant', 'semforge_dispatcher', 'semforge_privacy', 'semforge_privacy_owner', 'semforge_retention', 'semforge_retention_owner', 'semforge_scheduler', 'semforge_secret_scrubber', 'semforge_web', 'semforge_worker') order by rolname",
  );
  assert.deepEqual(roles.rows, [
    { rolname: "semforge_billing", rolbypassrls: false },
    { rolname: "semforge_billing_tenant", rolbypassrls: false },
    { rolname: "semforge_dispatcher", rolbypassrls: false },
    { rolname: "semforge_privacy", rolbypassrls: false },
    { rolname: "semforge_privacy_owner", rolbypassrls: false },
    { rolname: "semforge_retention", rolbypassrls: false },
    { rolname: "semforge_retention_owner", rolbypassrls: false },
    { rolname: "semforge_scheduler", rolbypassrls: false },
    { rolname: "semforge_secret_scrubber", rolbypassrls: false },
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

test("tenant billing role은 app.workspace_id 밖 결제 row를 보거나 변경할 수 없고 global billing만 대사할 수 있다", async () => {
  const grants = await pg.query<{
    grantee: string;
    table_name: string;
    privilege_type: string;
  }>(
    `select grantee, table_name, privilege_type
       from information_schema.role_table_grants
      where grantee in ('semforge_billing', 'semforge_billing_tenant')
        and table_schema = 'public'
      order by grantee, table_name, privilege_type`,
  );
  const expectedGlobalTables = [
    "billing_customers:SELECT",
    "payment_methods:SELECT",
    "payments:SELECT",
    "provider_events:SELECT",
    "subscriptions:SELECT",
    "workspace_privacy_controls:SELECT",
  ];
  assert.deepEqual(
    grants.rows
      .filter((grant) => grant.grantee === "semforge_billing")
      .map((grant) => `${grant.table_name}:${grant.privilege_type}`),
    expectedGlobalTables,
  );
  assert.deepEqual(
    grants.rows
      .filter((grant) => grant.grantee === "semforge_billing_tenant")
      .map((grant) => `${grant.table_name}:${grant.privilege_type}`),
    expectedGlobalTables.filter((grant) => grant !== "provider_events:SELECT"),
  );

  const mutationColumns = await pg.query<{
    grantee: string;
    table_name: string;
    column_name: string;
    privilege_type: string;
  }>(
    `select grantee, table_name, column_name, privilege_type
       from information_schema.role_column_grants
      where grantee in ('semforge_billing', 'semforge_billing_tenant')
        and table_schema = 'public'
        and privilege_type in ('INSERT', 'UPDATE')
      order by grantee, table_name, privilege_type, column_name`,
  );
  const formattedMutations = (role: string) => mutationColumns.rows
    .filter((grant) => grant.grantee === role)
    .map((grant) => `${grant.table_name}:${grant.privilege_type}:${grant.column_name}`);
  const sharedMutations = [
    "billing_ledger_events:INSERT:actor_user_id",
    "billing_ledger_events:INSERT:amount_krw",
    "billing_ledger_events:INSERT:entity_id",
    "billing_ledger_events:INSERT:id",
    "billing_ledger_events:INSERT:occurred_at",
    "billing_ledger_events:INSERT:order_id",
    "billing_ledger_events:INSERT:payment_status",
    "billing_ledger_events:INSERT:provider_code",
    "billing_ledger_events:INSERT:request_id",
    "billing_ledger_events:INSERT:type",
    "billing_ledger_events:INSERT:workspace_id",
    "payment_methods:UPDATE:active",
    "payment_methods:UPDATE:replaced_at",
    "payment_methods:UPDATE:updated_at",
    "payments:UPDATE:failure_code",
    "payments:UPDATE:failure_message",
    "payments:UPDATE:paid_at",
    "payments:UPDATE:status",
    "payments:UPDATE:toss_payment_key",
    "payments:UPDATE:updated_at",
    "subscriptions:UPDATE:canceled_at",
    "subscriptions:UPDATE:current_period_end",
    "subscriptions:UPDATE:current_period_start",
    "subscriptions:UPDATE:grace_ends_at",
    "subscriptions:UPDATE:payment_method_id",
    "subscriptions:UPDATE:status",
    "subscriptions:UPDATE:updated_at",
  ];
  const globalOnlyMutations = [
    "provider_events:INSERT:event_type",
    "provider_events:INSERT:id",
    "provider_events:INSERT:payload",
    "provider_events:INSERT:provider",
    "provider_events:INSERT:provider_event_id",
    "provider_events:INSERT:received_at",
    "provider_events:INSERT:workspace_id",
    "provider_events:UPDATE:processed_at",
    "provider_events:UPDATE:processing_error",
  ];
  const tenantOnlyMutations = [
    "payment_methods:INSERT:active",
    "payment_methods:INSERT:billing_customer_id",
    "payment_methods:INSERT:billing_key_encrypted",
    "payment_methods:INSERT:billing_key_fingerprint",
    "payment_methods:INSERT:card_brand",
    "payment_methods:INSERT:card_last4",
    "payment_methods:INSERT:id",
    "payment_methods:INSERT:replaced_at",
    "payment_methods:INSERT:workspace_id",
    "payments:INSERT:amount_krw",
    "payments:INSERT:attempt",
    "payments:INSERT:billing_period_end",
    "payments:INSERT:billing_period_start",
    "payments:INSERT:failure_code",
    "payments:INSERT:failure_message",
    "payments:INSERT:id",
    "payments:INSERT:idempotency_key",
    "payments:INSERT:order_id",
    "payments:INSERT:paid_at",
    "payments:INSERT:status",
    "payments:INSERT:subscription_id",
    "payments:INSERT:toss_payment_key",
    "payments:INSERT:workspace_id",
  ];
  assert.deepEqual(
    formattedMutations("semforge_billing"),
    [...sharedMutations, ...globalOnlyMutations].sort(),
  );
  assert.deepEqual(
    formattedMutations("semforge_billing_tenant"),
    [...sharedMutations, ...tenantOnlyMutations].sort(),
  );

  const billingPolicies = await pg.query<{ role_name: string; tablename: string }>(
    `select role_name, tablename
       from (
         select 'semforge_billing' as role_name, tablename
           from pg_policies where 'semforge_billing' = any(roles)
         union all
         select 'semforge_billing_tenant' as role_name, tablename
           from pg_policies where 'semforge_billing_tenant' = any(roles)
       ) policies
      order by role_name, tablename`,
  );
  assert.deepEqual(
    billingPolicies.rows.filter((policy) => policy.role_name === "semforge_billing")
      .map((policy) => policy.tablename),
    [
      "billing_customers",
      "billing_ledger_events",
      "payment_methods",
      "payments",
      "provider_events",
      "subscriptions",
      "workspace_privacy_controls",
    ],
  );
  assert.deepEqual(
    billingPolicies.rows.filter((policy) => policy.role_name === "semforge_billing_tenant")
      .map((policy) => policy.tablename),
    [
      "billing_customers",
      "billing_ledger_events",
      "payment_methods",
      "payments",
      "subscriptions",
      "workspace_privacy_controls",
    ],
  );

  const tenantA = "00000000-0000-4000-8000-00000000f5b1";
  const tenantB = "00000000-0000-4000-8000-00000000f5b2";
  const customerA = "00000000-0000-4000-8000-00000000f5b3";
  const customerB = "00000000-0000-4000-8000-00000000f5b4";
  await pg.query(
    "insert into workspaces (id, name, slug) values ($1, 'Billing Tenant A', 'billing-tenant-a'), ($2, 'Billing Tenant B', 'billing-tenant-b')",
    [tenantA, tenantB],
  );
  await pg.query(
    "insert into billing_customers (id, workspace_id, toss_customer_key) values ($1, $2, 'billing-tenant-a'), ($3, $4, 'billing-tenant-b')",
    [customerA, tenantA, customerB, tenantB],
  );
  await pg.query(
    "insert into subscriptions (workspace_id, billing_customer_id, status) values ($1, $2, 'account_created'), ($3, $4, 'account_created')",
    [tenantA, customerA, tenantB, customerB],
  );

  await pg.query("begin");
  try {
    await pg.query("set local role semforge_billing_tenant");
    assert.deepEqual((await pg.query("select workspace_id from subscriptions")).rows, []);
    await pg.query("select set_config('app.workspace_id', $1, true)", [tenantA]);
    assert.deepEqual(
      (await pg.query<{ workspace_id: string }>("select workspace_id from subscriptions")).rows,
      [{ workspace_id: tenantA }],
    );
    assert.deepEqual(
      (await pg.query("update subscriptions set status = 'billing_authorized' where workspace_id = $1 returning id", [tenantB])).rows,
      [],
    );
    await pg.query("savepoint billing_tenant_escape");
    await assert.rejects(
      pg.query(
        `insert into payment_methods
          (id, workspace_id, billing_customer_id, billing_key_encrypted, billing_key_fingerprint)
         values ('00000000-0000-4000-8000-00000000f5b5', $1, $2,
           'enc:v1:key:iviviviviviviviv:tagtagtagtagtagtagta:cipher', repeat('b', 64))`,
        [tenantB, customerB],
      ),
      /row-level security/i,
    );
    await pg.query("rollback to savepoint billing_tenant_escape");
    await pg.query("rollback");
  } catch (error) {
    await pg.query("rollback");
    throw error;
  }

  await pg.query("begin");
  try {
    await pg.query("set local role semforge_billing");
    const visible = await pg.query<{ workspace_id: string }>(
      "select workspace_id from subscriptions where workspace_id in ($1, $2) order by workspace_id",
      [tenantA, tenantB],
    );
    assert.deepEqual(visible.rows, [{ workspace_id: tenantA }, { workspace_id: tenantB }]);
    await assert.rejects(pg.query("select token_hash from sessions"), /permission denied/i);
  } finally {
    await pg.query("rollback");
  }
});

test("privacy erasure만 immutable report 삭제를 수행하고 billing ledger는 tombstone으로 보존한다", async () => {
  const workspaceId = "00000000-0000-4000-8000-00000000e501";
  const siteId = "00000000-0000-4000-8000-00000000e502";
  const reportId = "00000000-0000-4000-8000-00000000e503";
  const customerId = "00000000-0000-4000-8000-00000000e504";
  const privacyRequestId = "00000000-0000-4000-8000-00000000e505";
  await pg.query("insert into workspaces (id, name, slug) values ($1, 'Privacy Tenant', 'privacy-tenant')", [
    workspaceId,
  ]);
  await pg.query("insert into sites (id, workspace_id, name, domain) values ($1, $2, 'Privacy Site', 'privacy.example')", [
    siteId,
    workspaceId,
  ]);
  await pg.query(
    `insert into weekly_reports
       (id, workspace_id, site_id, status, period_start, period_end, comparison_start, comparison_end, snapshot, brand_name, accent_color, snapshot_ready_at)
     values
       ($1, $2, $3, 'delivered', '2026-08-03', '2026-08-09', '2026-07-27', '2026-08-02', '{"pii":"subject"}'::jsonb, 'Privacy', '#2563EB', now())`,
    [reportId, workspaceId, siteId],
  );
  await pg.query(
    "insert into report_assets (workspace_id, report_id, kind, storage_key, content_type, checksum_sha256, size_bytes) values ($1, $2, 'pdf', 'reports/privacy.pdf', 'application/pdf', repeat('a', 64), 10)",
    [workspaceId, reportId],
  );
  await pg.query(
    "insert into deliveries (workspace_id, report_id, channel, recipient, status, idempotency_key) values ($1, $2, 'email', 'owner@privacy.example', 'delivered', 'privacy-delivery')",
    [workspaceId, reportId],
  );
  await pg.query(
    "insert into billing_customers (id, workspace_id, toss_customer_key) values ($1, $2, 'customer-privacy')",
    [customerId, workspaceId],
  );
  await pg.query(
    `insert into billing_ledger_events
       (workspace_id, type, entity_id, request_id, occurred_at, amount_krw, order_id, payment_status, metadata)
     values
       ($1, 'charge.succeeded', 'payment-privacy', 'charge-privacy', now(), 49000, 'order-privacy', 'paid', '{"email":"owner@privacy.example"}'::jsonb)`,
    [workspaceId],
  );
  await pg.query(
    "insert into privacy_requests (id, workspace_id, request_id, type, status, operator_id, requested_at) values ($1, $2, 'req-privacy', 'workspace_deletion', 'running', 'operator@example.com', now())",
    [privacyRequestId, workspaceId],
  );

  await pg.query("begin");
  try {
    await pg.query("set local role semforge_worker");
    await pg.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
    await pg.query("select set_config('app.privacy_erasure_request_id', $1, true)", [privacyRequestId]);
    await pg.query("select set_config('app.privacy_erasure_procedure', 'privacy_erase_workspace', true)");
    await assert.rejects(pg.query("delete from weekly_reports where workspace_id = $1", [workspaceId]));
  } finally {
    await pg.query("rollback");
  }

  await pg.query("begin");
  try {
    await pg.query("set local role semforge_privacy");
    await pg.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
    await pg.query("select privacy_block_workspace($1::uuid, $2::uuid, 'operator@example.com', now())", [
      workspaceId,
      privacyRequestId,
    ]);
    await pg.query("select privacy_erase_workspace($1::uuid, $2::uuid, 'operator@example.com')", [
      workspaceId,
      privacyRequestId,
    ]);
    await pg.query("commit");
  } catch (error) {
    await pg.query("rollback");
    throw error;
  }

  const reportRows = await pg.query<{ count: number }>(
    "select count(*)::int as count from weekly_reports where workspace_id = $1",
    [workspaceId],
  );
  assert.equal(reportRows.rows[0]!.count, 0);

  const ledger = await pg.query<{ count: number; erased: boolean }>(
    "select count(*)::int as count, bool_and((metadata->>'privacyErased')::boolean) as erased from billing_ledger_events where workspace_id = $1",
    [workspaceId],
  );
  assert.deepEqual(ledger.rows[0], { count: 1, erased: true });

  const tombstone = await pg.query<{ count: number; legal_hold: boolean }>(
    "select count(*)::int as count, bool_and(legal_hold) as legal_hold from privacy_billing_tombstones where workspace_id = $1 and request_id = $2",
    [workspaceId, privacyRequestId],
  );
  assert.deepEqual(tombstone.rows[0], { count: 1, legal_hold: true });
});

test("web role은 billing 고객·결제수단·구독 테이블 권한을 전혀 갖지 않는다", async () => {
  const grants = await pg.query<{ table_name: string; privilege_type: string }>(
    `select table_name, privilege_type
       from information_schema.role_table_grants
      where grantee = 'semforge_web'
        and table_schema = 'public'
        and table_name in ('billing_customers', 'payment_methods', 'subscriptions')
      order by table_name, privilege_type`,
  );
  assert.deepEqual(grants.rows, []);

  const workspaceId = "00000000-0000-4000-8000-0000000000f1";
  const customerId = "00000000-0000-4000-8000-0000000000f2";
  const subscriptionId = "00000000-0000-4000-8000-0000000000f3";
  await pg.query(
    "insert into workspaces (id, name, slug) values ($1, 'Web Billing Denied', 'web-billing-denied')",
    [workspaceId],
  );
  await pg.query(
    "insert into billing_customers (id, workspace_id, toss_customer_key) values ($1, $2, 'web-denied')",
    [customerId, workspaceId],
  );
  await pg.query(
    "insert into subscriptions (id, workspace_id, billing_customer_id, status) values ($1, $2, $3, 'active')",
    [subscriptionId, workspaceId, customerId],
  );

  await pg.query("begin");
  try {
    await pg.query("set local role semforge_web");
    await pg.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
    const statements = [
      "select status from subscriptions",
      `insert into subscriptions (workspace_id, billing_customer_id, status)
       values ('${workspaceId}', '${customerId}', 'active')`,
      `update subscriptions set status = 'past_due' where id = '${subscriptionId}'`,
      `delete from subscriptions where id = '${subscriptionId}'`,
    ];
    for (const [index, statement] of statements.entries()) {
      await pg.query(`savepoint web_billing_denied_${index}`);
      await assert.rejects(pg.query(statement), /permission denied/i);
      await pg.query(`rollback to savepoint web_billing_denied_${index}`);
    }
  } finally {
    await pg.query("rollback");
  }
});

test("scheduler role은 최소 subscription/outbox 컬럼과 제한된 topic 정책만 가진다", async () => {
  const subscriptionColumns = await pg.query<{ column_name: string }>(
    `select column_name from information_schema.role_column_grants
      where grantee = 'semforge_scheduler' and table_schema = 'public'
        and table_name = 'subscriptions' and privilege_type = 'SELECT'
      order by column_name`,
  );
  assert.deepEqual(subscriptionColumns.rows.map((row) => row.column_name), [
    "current_period_end",
    "status",
    "workspace_id",
  ]);

  const outboxSelectColumns = await pg.query<{ column_name: string }>(
    `select column_name from information_schema.role_column_grants
      where grantee = 'semforge_scheduler' and table_schema = 'public'
        and table_name = 'outbox' and privilege_type = 'SELECT'
      order by column_name`,
  );
  assert.deepEqual(outboxSelectColumns.rows.map((row) => row.column_name), [
    "idempotency_key",
    "topic",
    "workspace_id",
  ]);

  const policies = await pg.query<{ policyname: string; cmd: string }>(
    `select policyname, cmd from pg_policies
      where 'semforge_scheduler' = any(roles)
        and tablename in ('outbox', 'subscriptions', 'workspace_privacy_controls')
      order by policyname`,
  );
  assert.deepEqual(policies.rows, [
    { policyname: "outbox_scheduler_insert", cmd: "INSERT" },
    { policyname: "outbox_scheduler_select", cmd: "SELECT" },
    { policyname: "subscriptions_scheduler_read", cmd: "SELECT" },
    { policyname: "workspace_privacy_controls_pipeline_select", cmd: "SELECT" },
  ]);
});

test("worker role은 audit_events에 INSERT만 허용하고 기록을 읽을 수 없다", async () => {
  const workspaceId = "00000000-0000-4000-8000-0000000000cb";
  await pg.query(
    "insert into workspaces (id, name, slug) values ($1, 'Worker Audit', 'worker-audit')",
    [workspaceId],
  );

  const grants = await pg.query<{ privilege_type: string }>(
    "select privilege_type from information_schema.role_table_grants where grantee = 'semforge_worker' and table_schema = 'public' and table_name = 'audit_events' order by privilege_type",
  );
  assert.deepEqual(grants.rows.map((row) => row.privilege_type), ["INSERT"]);

  const policies = await pg.query<{ policyname: string; cmd: string }>(
    "select policyname, cmd from pg_policies where tablename = 'audit_events' and 'semforge_worker' = any(roles) order by policyname",
  );
  assert.deepEqual(policies.rows, [
    { policyname: "audit_events_worker_insert", cmd: "INSERT" },
  ]);

  await pg.query("begin");
  try {
    await pg.query("set local role semforge_worker");
    await pg.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
    await pg.query(
      `insert into audit_events (workspace_id, action, entity_type, entity_id, request_id, metadata)
       values ($1, 'job.leased', 'job', 'job-1', 'worker-1', '{"attempt":1}'::jsonb)`,
      [workspaceId],
    );
    await pg.query("savepoint audit_select_denied");
    await assert.rejects(pg.query("select metadata from audit_events where workspace_id = $1", [workspaceId]));
    await pg.query("rollback to savepoint audit_select_denied");
    await pg.query("commit");
  } catch (error) {
    await pg.query("rollback");
    throw error;
  }

  const stored = await pg.query<{ action: string }>(
    "select action from audit_events where workspace_id = $1 and entity_id = 'job-1'",
    [workspaceId],
  );
  assert.deepEqual(stored.rows, [{ action: "job.leased" }]);
});

test("worker role은 transaction-local workspace 밖 tenant row와 global queue에 접근하지 못한다", async () => {
  const tenantA = "00000000-0000-4000-8000-000000000111";
  const tenantB = "00000000-0000-4000-8000-000000000112";
  await pg.query(
    "insert into workspaces (id, name, slug) values ($1, 'Worker A', 'worker-rls-a'), ($2, 'Worker B', 'worker-rls-b')",
    [tenantA, tenantB],
  );
  await pg.query(
    "insert into sites (workspace_id, name, domain) values ($1, 'A', 'worker-a.example'), ($2, 'B', 'worker-b.example')",
    [tenantA, tenantB],
  );
  await pg.query(
    `insert into jobs (workspace_id, type, payload, idempotency_key)
     values ($1, 'collect.test', '{}'::jsonb, 'worker-rls-job')`,
    [tenantB],
  );

  await pg.query("begin");
  try {
    await pg.query("set local role semforge_worker");
    await pg.query("select set_config('app.workspace_id', $1, true)", [tenantA]);
    const visible = await pg.query<{ workspace_id: string }>("select workspace_id from sites");
    assert.deepEqual(visible.rows, [{ workspace_id: tenantA }]);
    await pg.query("savepoint worker_cross_workspace");
    await assert.rejects(
      pg.query(
        "insert into sites (workspace_id, name, domain) values ($1, 'Escape', 'worker-escape.example')",
        [tenantB],
      ),
    );
    await pg.query("rollback to savepoint worker_cross_workspace");
    await pg.query("savepoint worker_global_queue");
    await assert.rejects(pg.query("select id from jobs"));
    await pg.query("rollback to savepoint worker_global_queue");
  } finally {
    await pg.query("rollback");
  }
});

test("worker role은 자기 workspace report outbox 최소 컬럼만 INSERT하고 조회·수정·tenant 이탈은 거부된다", async () => {
  const tenantA = "00000000-0000-4000-8000-000000000121";
  const tenantB = "00000000-0000-4000-8000-000000000122";
  await pg.query(
    "insert into workspaces (id, name, slug) values ($1, 'Report Outbox A', 'report-outbox-a'), ($2, 'Report Outbox B', 'report-outbox-b')",
    [tenantA, tenantB],
  );

  const insertColumns = await pg.query<{ column_name: string }>(
    "select column_name from information_schema.role_column_grants where grantee = 'semforge_worker' and table_schema = 'public' and table_name = 'outbox' and privilege_type = 'INSERT' order by column_name",
  );
  assert.deepEqual(insertColumns.rows.map(({ column_name }) => column_name), [
    "idempotency_key",
    "payload",
    "topic",
    "workspace_id",
  ]);
  const tablePrivileges = await pg.query<{ privilege_type: string }>(
    "select privilege_type from information_schema.role_table_grants where grantee = 'semforge_worker' and table_schema = 'public' and table_name = 'outbox' order by privilege_type",
  );
  assert.deepEqual(tablePrivileges.rows, []);
  const policies = await pg.query<{ policyname: string; cmd: string; with_check: string | null }>(
    "select policyname, cmd, with_check from pg_policies where tablename = 'outbox' and 'semforge_worker' = any(roles) order by policyname",
  );
  assert.equal(policies.rows.length, 1);
  assert.equal(policies.rows[0]!.policyname, "outbox_worker_insert");
  assert.equal(policies.rows[0]!.cmd, "INSERT");
  assert.match(
    policies.rows[0]!.with_check ?? "",
    /workspace_id.*current_setting.*topic.*report\.pdf\.render.*report\.email\.deliver/u,
  );

  await pg.query("begin");
  try {
    await pg.query("set local role semforge_worker");
    await pg.query("select set_config('app.workspace_id', $1, true)", [tenantA]);
    await pg.query(
      `insert into outbox (workspace_id, topic, payload, idempotency_key)
       values ($1, 'report.pdf.render', '{"reportId":"00000000-0000-4000-8000-000000000123"}'::jsonb, 'report-outbox-own')`,
      [tenantA],
    );
    await pg.query(
      `insert into outbox (workspace_id, topic, payload, idempotency_key)
       values ($1, 'report.email.deliver', '{"reportId":"00000000-0000-4000-8000-000000000123","recipient":"owner@example.test"}'::jsonb, 'report-outbox-email-own')`,
      [tenantA],
    );
    await pg.query("savepoint worker_outbox_arbitrary_topic");
    await assert.rejects(
      pg.query(
        `insert into outbox (workspace_id, topic, payload, idempotency_key)
         values ($1, 'arbitrary.worker.topic', '{}'::jsonb, 'report-outbox-arbitrary')`,
        [tenantA],
      ),
    );
    await pg.query("rollback to savepoint worker_outbox_arbitrary_topic");
    await pg.query("savepoint worker_outbox_cross_tenant");
    await assert.rejects(
      pg.query(
        `insert into outbox (workspace_id, topic, payload, idempotency_key)
         values ($1, 'report.pdf.render', '{}'::jsonb, 'report-outbox-cross')`,
        [tenantB],
      ),
    );
    await pg.query("rollback to savepoint worker_outbox_cross_tenant");
    await pg.query("savepoint worker_outbox_select");
    await assert.rejects(pg.query("select payload from outbox where workspace_id = $1", [tenantA]));
    await pg.query("rollback to savepoint worker_outbox_select");
    await pg.query("savepoint worker_outbox_update");
    await assert.rejects(
      pg.query(
        "update outbox set last_error = 'forbidden' where workspace_id = $1 and idempotency_key = 'report-outbox-own'",
        [tenantA],
      ),
    );
    await pg.query("rollback to savepoint worker_outbox_update");
    await pg.query("commit");
  } catch (error) {
    await pg.query("rollback");
    throw error;
  }

  const stored = await pg.query<{ workspace_id: string; idempotency_key: string }>(
    "select workspace_id, idempotency_key from outbox where idempotency_key like 'report-outbox-%' order by idempotency_key",
  );
  assert.deepEqual(stored.rows, [{
    workspace_id: tenantA,
    idempotency_key: "report-outbox-email-own",
  }, {
    workspace_id: tenantA,
    idempotency_key: "report-outbox-own",
  }]);
});

test("dispatcher role은 jobs/outbox만 전역 처리하고 tenant domain row는 읽지 못한다", async () => {
  await pg.query("begin");
  try {
    await pg.query("set local role semforge_dispatcher");
    const jobs = await pg.query<{ count: number }>("select count(*)::int as count from jobs");
    assert.ok(jobs.rows[0]!.count >= 1);
    await pg.query("savepoint dispatcher_payload_denied");
    await assert.rejects(pg.query("update jobs set payload = '{}'::jsonb"));
    await pg.query("rollback to savepoint dispatcher_payload_denied");
    await pg.query("savepoint dispatcher_hash_denied");
    await assert.rejects(pg.query("update jobs set request_hash = repeat('0', 64)"));
    await pg.query("rollback to savepoint dispatcher_hash_denied");
    await pg.query("savepoint dispatcher_site_denied");
    await assert.rejects(pg.query("select id from sites"));
    await pg.query("rollback to savepoint dispatcher_site_denied");
    await pg.query("savepoint dispatcher_provider_denied");
    await assert.rejects(pg.query("select id from provider_calls"));
    await pg.query("rollback to savepoint dispatcher_provider_denied");
    const controls = await pg.query<{ count: number }>(
      "select count(*)::int as count from workspace_privacy_controls",
    );
    assert.ok(controls.rows[0]!.count >= 1);
    await pg.query("savepoint dispatcher_control_update_denied");
    await assert.rejects(
      pg.query("update workspace_privacy_controls set generation = generation + 1"),
      /permission denied/i,
    );
    await pg.query("rollback to savepoint dispatcher_control_update_denied");
  } finally {
    await pg.query("rollback");
  }
});

test("dispatcher는 임의 payload UPDATE 없이 password reset 전용 scrub 함수만 실행한다", async () => {
  const workspaceId = "00000000-0000-4000-8000-000000000211";
  const jobId = "00000000-0000-4000-8000-000000000212";
  const resetId = "00000000-0000-4000-8000-000000000213";
  const encrypted = {
    kind: "password_reset",
    resetId,
    encryptedDelivery: "enc:v1:test:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:YWJj",
    expiresAt: "2026-08-12T06:00:00.000Z",
  };
  await pg.query(
    "insert into workspaces (id, name, slug) values ($1, 'Reset Scrub', 'reset-scrub')",
    [workspaceId],
  );
  await pg.query(
    `insert into jobs (id, workspace_id, type, payload, idempotency_key)
     values ($1, $2, 'email.password_reset', $3::jsonb, $4)`,
    [jobId, workspaceId, JSON.stringify(encrypted), `outbox:email.password_reset:password-reset:${resetId}`],
  );
  await pg.query(
    `insert into outbox (workspace_id, topic, payload, idempotency_key)
     values ($1, 'email.password_reset', $2::jsonb, $3)`,
    [workspaceId, JSON.stringify(encrypted), `password-reset:${resetId}`],
  );

  await pg.query("begin");
  try {
    await pg.query("set local role semforge_dispatcher");
    await pg.query("savepoint password_reset_payload_denied");
    await assert.rejects(pg.query("update jobs set payload = '{}'::jsonb where id = $1", [jobId]));
    await pg.query("rollback to savepoint password_reset_payload_denied");
    const result = await pg.query<{ scrubbed: boolean }>(
      "select scrub_password_reset_delivery($1, $2, $3, 'delivered', $4, $5) as scrubbed",
      [workspaceId, jobId, resetId, "2026-08-12T05:10:00.000Z", "resend-message-1"],
    );
    assert.equal(result.rows[0]?.scrubbed, true);
    const payloads = await pg.query<{ payload: Record<string, unknown> }>(
      `select payload from jobs where id = $1
       union all
       select payload from outbox where workspace_id = $2 and idempotency_key = $3`,
      [jobId, workspaceId, `password-reset:${resetId}`],
    );
    assert.equal(payloads.rows.length, 2);
    for (const row of payloads.rows) {
      assert.equal(row.payload.kind, "password_reset_scrubbed");
      assert.equal(row.payload.state, "delivered");
      assert.equal(Object.hasOwn(row.payload, "encryptedDelivery"), false);
    }
  } finally {
    await pg.query("rollback");
  }
});

test("auth role은 plaintext password reset outbox를 DB 제약에서 거부한다", async () => {
  const workspaceId = "00000000-0000-4000-8000-000000000221";
  const resetId = "00000000-0000-4000-8000-000000000222";
  await pg.query("insert into workspaces (id, name, slug) values ($1, 'Plain Reset', 'plain-reset')", [workspaceId]);
  await pg.query("begin");
  try {
    await pg.query("set local role semforge_auth");
    await pg.query("savepoint plaintext_rejected");
    await assert.rejects(
      pg.query(
        `insert into outbox (workspace_id, topic, payload, idempotency_key)
         values ($1, 'email.password_reset', '{"kind":"password_reset","email":"owner@example.com","resetUrl":"https://example.com/reset/raw"}'::jsonb, 'plaintext-reset')`,
        [workspaceId],
      ),
    );
    await pg.query("rollback to savepoint plaintext_rejected");
    await pg.query("savepoint malformed_envelope_rejected");
    await assert.rejects(
      pg.query(
        `insert into outbox (workspace_id, topic, payload, idempotency_key)
         values ($1, 'email.password_reset', $2::jsonb, $3)`,
        [workspaceId, JSON.stringify({
          kind: "password_reset",
          resetId,
          encryptedDelivery: "enc:v1:key:owner@example.com:https_reset",
          expiresAt: "2030-08-12T06:00:00.000Z",
        }), `password-reset:${resetId}`],
      ),
    );
    await pg.query("rollback to savepoint malformed_envelope_rejected");
    await pg.query("savepoint mismatched_identity_rejected");
    await assert.rejects(
      pg.query(
        `insert into outbox (workspace_id, topic, payload, idempotency_key)
         values ($1, 'email.password_reset', $2::jsonb, 'password-reset:different')`,
        [workspaceId, JSON.stringify({
          kind: "password_reset",
          resetId,
          encryptedDelivery: "enc:v1:test:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:YWJj",
          expiresAt: "2030-08-12T06:00:00.000Z",
        })],
      ),
    );
  } finally {
    await pg.query("rollback");
  }
});

test("scheduler role은 canonical collection outbox 입력 컬럼만 사용한다", async () => {
  const workspaceId = "00000000-0000-4000-8000-000000000114";
  const siteId = "00000000-0000-4000-8000-000000000115";
  const otherWorkspaceId = "00000000-0000-4000-8000-000000000116";
  const otherSiteId = "00000000-0000-4000-8000-000000000117";
  await pg.query(
    `insert into workspaces (id, name, slug)
     values ($1, 'Scheduler Guard', 'scheduler-guard'),
            ($2, 'Scheduler Other', 'scheduler-other')`,
    [workspaceId, otherWorkspaceId],
  );
  await pg.query(
    `insert into sites (id, workspace_id, name, domain)
     values ($1, $2, 'Scheduler Guard', 'scheduler-guard.example'),
            ($3, $4, 'Scheduler Other', 'scheduler-other.example')`,
    [siteId, workspaceId, otherSiteId, otherWorkspaceId],
  );
  await pg.query("begin");
  try {
    await pg.query("set local role semforge_scheduler");
    await pg.query(
      `insert into outbox (workspace_id, topic, payload, idempotency_key)
       values ($1, 'collection.google.weekly', jsonb_build_object('siteId', $2::text), 'scheduler-valid')`,
      [workspaceId, siteId],
    );
    await pg.query("savepoint scheduler_published_denied");
    await assert.rejects(
      pg.query(
        `insert into outbox (workspace_id, topic, payload, idempotency_key, published_at)
         values ($1, 'collection.google.weekly', '{}'::jsonb, 'scheduler-forged', now())`,
        [workspaceId],
      ),
    );
    await pg.query("rollback to savepoint scheduler_published_denied");
    await pg.query("savepoint scheduler_non_collection_denied");
    await assert.rejects(
      pg.query(
        `insert into outbox (workspace_id, topic, payload, idempotency_key)
         values ($1, 'email.password_reset', '{}'::jsonb, 'scheduler-wrong-topic')`,
        [workspaceId],
      ),
    );
    await pg.query("rollback to savepoint scheduler_non_collection_denied");
    await pg.query("savepoint scheduler_cross_tenant_denied");
    await assert.rejects(
      pg.query(
        `insert into outbox (workspace_id, topic, payload, idempotency_key)
         values ($1, 'report.snapshot', jsonb_build_object('siteId', $2::text, 'cycleMonday', '2026-08-17'), 'scheduler-cross-tenant')`,
        [workspaceId, otherSiteId],
      ),
    );
    await pg.query("rollback to savepoint scheduler_cross_tenant_denied");
  } finally {
    await pg.query("rollback");
  }
});

test("job/outbox request hash는 직접 변조해도 canonical 중요 필드에서 다시 계산된다", async () => {
  const workspaceId = "00000000-0000-4000-8000-000000000113";
  await pg.query(
    "insert into workspaces (id, name, slug) values ($1, 'Hash Guard', 'hash-guard')",
    [workspaceId],
  );
  await pg.query(
    `insert into jobs (workspace_id, type, payload, idempotency_key, max_attempts, priority)
     values ($1, 'hash.guard', '{"canonical":true}'::jsonb, 'hash-job', 7, 42)`,
    [workspaceId],
  );
  await pg.query(
    `insert into outbox (workspace_id, topic, payload, idempotency_key, max_attempts)
     values ($1, 'hash.guard', '{"canonical":true}'::jsonb, 'hash-outbox', 7)`,
    [workspaceId],
  );
  const before = await pg.query<{ job_hash: string; outbox_hash: string }>(
    `select
       (select request_hash from jobs where workspace_id = $1 and idempotency_key = 'hash-job') as job_hash,
       (select request_hash from outbox where workspace_id = $1 and idempotency_key = 'hash-outbox') as outbox_hash`,
    [workspaceId],
  );
  await pg.query(
    "update jobs set request_hash = repeat('0', 64) where workspace_id = $1 and idempotency_key = 'hash-job'",
    [workspaceId],
  );
  await pg.query(
    "update outbox set request_hash = repeat('0', 64) where workspace_id = $1 and idempotency_key = 'hash-outbox'",
    [workspaceId],
  );
  const after = await pg.query<{ job_hash: string; outbox_hash: string }>(
    `select
       (select request_hash from jobs where workspace_id = $1 and idempotency_key = 'hash-job') as job_hash,
       (select request_hash from outbox where workspace_id = $1 and idempotency_key = 'hash-outbox') as outbox_hash`,
    [workspaceId],
  );
  assert.deepEqual(after.rows, before.rows);
  assert.match(after.rows[0]!.job_hash, /^[0-9a-f]{64}$/);
  assert.match(after.rows[0]!.outbox_hash, /^[0-9a-f]{64}$/);
});

test("NAVER/GSC provenance schema는 source/status와 tenant 복합 FK를 실제 DB에서 강제한다", async () => {
  const columns = await pg.query<{ table_name: string; column_name: string; is_nullable: string }>(
    `select table_name, column_name, is_nullable
       from information_schema.columns
      where table_schema = 'public'
        and ((table_name = 'naver_observations' and column_name = 'collected_at')
          or (table_name = 'gsc_observations' and column_name in ('provider_call_id', 'collected_at')))
      order by table_name, column_name`,
  );
  assert.deepEqual(columns.rows, [
    { table_name: "gsc_observations", column_name: "collected_at", is_nullable: "NO" },
    { table_name: "gsc_observations", column_name: "provider_call_id", is_nullable: "NO" },
    { table_name: "naver_observations", column_name: "collected_at", is_nullable: "NO" },
  ]);

  const sourceChecks = await pg.query<{ conname: string }>(
    "select conname from pg_constraint where conrelid = 'naver_observation_sources'::regclass and contype = 'c' order by conname",
  );
  assert.deepEqual(sourceChecks.rows.map((row) => row.conname), [
    "naver_observation_sources_source_ck",
    "naver_observation_sources_status_ck",
  ]);
});

test("tenant billing role은 fingerprint 결제수단과 append-only ledger만 변경한다", async () => {
  const workspaceId = "00000000-0000-4000-8000-0000000000d1";
  const customerId = "00000000-0000-4000-8000-0000000000d2";
  const subscriptionId = "00000000-0000-4000-8000-0000000000d3";
  const paymentMethodId = "00000000-0000-4000-8000-0000000000d4";
  const ledgerId = "00000000-0000-4000-8000-0000000000d5";
  await pg.query("insert into workspaces (id, name, slug) values ($1, 'Billing', 'billing')", [
    workspaceId,
  ]);
  await pg.query(
    "insert into billing_customers (id, workspace_id, toss_customer_key) values ($1, $2, 'customer_billing')",
    [customerId, workspaceId],
  );
  await pg.query(
    "insert into subscriptions (id, workspace_id, billing_customer_id, status) values ($1, $2, $3, 'account_created')",
    [subscriptionId, workspaceId, customerId],
  );

  await pg.query("begin");
  try {
    await pg.query("set local role semforge_billing_tenant");
    await pg.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
    await pg.query(
      `insert into payment_methods
        (id, workspace_id, billing_customer_id, billing_key_encrypted, billing_key_fingerprint, card_last4)
       values ($1, $2, $3, 'enc:v1:key:iviviviviviviviv:tagtagtagtagtagtagta:cipher', repeat('a', 64), '1234')`,
      [paymentMethodId, workspaceId, customerId],
    );
    await pg.query("savepoint billing_plain_key_rejected");
    await assert.rejects(
      pg.query(
        `insert into payment_methods
          (workspace_id, billing_customer_id, billing_key_encrypted, billing_key_fingerprint)
         values ($1, $2, 'plain-billing-key', repeat('b', 64))`,
        [workspaceId, customerId],
      ),
    );
    await pg.query("rollback to savepoint billing_plain_key_rejected");
    await pg.query(
      `insert into billing_ledger_events
        (id, workspace_id, type, entity_id, occurred_at, amount_krw, payment_status)
       values ($1, $2, 'payment_method.authorized', $3, now(), 49000, 'authorized')`,
      [ledgerId, workspaceId, paymentMethodId],
    );
    await pg.query("savepoint billing_ledger_update_rejected");
    await assert.rejects(
      pg.query("update billing_ledger_events set provider_code = 'changed' where id = $1", [
        ledgerId,
      ]),
    );
    await pg.query("rollback to savepoint billing_ledger_update_rejected");
    await pg.query("savepoint billing_ledger_delete_rejected");
    await assert.rejects(
      pg.query("delete from billing_ledger_events where id = $1", [ledgerId]),
    );
    await pg.query("rollback to savepoint billing_ledger_delete_rejected");
    await pg.query("commit");
  } catch (error) {
    await pg.query("rollback");
    throw error;
  }
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
    "billing_customers:INSERT",
    "invites:SELECT",
    "legal_acceptances:INSERT",
    "memberships:INSERT",
    "memberships:SELECT",
    "password_resets:INSERT",
    "password_resets:SELECT",
    "password_resets:UPDATE",
    "sessions:DELETE",
    "sessions:INSERT",
    "sessions:SELECT",
    "sessions:UPDATE",
    "subscriptions:INSERT",
    "users:INSERT",
    "users:SELECT",
    "users:UPDATE",
    "workspace_privacy_controls:SELECT",
    "workspaces:INSERT",
    "workspaces:SELECT",
  ]);

  const authBillingSelectColumns = await pg.query<{ table_name: string; column_name: string }>(
    "select table_name, column_name from information_schema.role_column_grants where grantee = 'semforge_auth' and table_schema = 'public' and table_name in ('billing_customers', 'subscriptions') and privilege_type = 'SELECT' order by table_name, column_name",
  );
  assert.deepEqual(
    authBillingSelectColumns.rows.map((grant) => `${grant.table_name}.${grant.column_name}`),
    [],
  );

  const inviteUpdateColumns = await pg.query<{ column_name: string }>(
    "select column_name from information_schema.role_column_grants where grantee = 'semforge_auth' and table_schema = 'public' and table_name = 'invites' and privilege_type = 'UPDATE' order by column_name",
  );
  assert.deepEqual(
    inviteUpdateColumns.rows.map((grant) => grant.column_name),
    ["accepted_at", "accepted_by_user_id", "accepted_workspace_id"],
  );

  const outboxInsertColumns = await pg.query<{ column_name: string }>(
    "select column_name from information_schema.role_column_grants where grantee = 'semforge_auth' and table_schema = 'public' and table_name = 'outbox' and privilege_type = 'INSERT' order by column_name",
  );
  assert.deepEqual(
    outboxInsertColumns.rows.map((grant) => grant.column_name),
    ["available_at", "created_at", "idempotency_key", "payload", "topic", "workspace_id"],
  );

  const policies = await pg.query<{ policyname: string; cmd: string; roles: string[] }>(
    "select policyname, cmd, roles from pg_policies where 'semforge_auth' = any(roles) order by policyname",
  );
  assert.deepEqual(
    policies.rows.map((policy) => `${policy.policyname}:${policy.cmd}`),
    [
      "auth_action_throttles_auth_delete:DELETE",
      "auth_action_throttles_auth_insert:INSERT",
      "auth_action_throttles_auth_select:SELECT",
      "auth_action_throttles_auth_update:UPDATE",
      "billing_customers_auth_insert:INSERT",
      "invites_auth_select:SELECT",
      "invites_auth_update:UPDATE",
      "legal_acceptances_auth_insert:INSERT",
      "memberships_auth_insert:INSERT",
      "memberships_auth_select:SELECT",
      "outbox_auth_insert:INSERT",
      "password_resets_auth_insert:INSERT",
      "password_resets_auth_select:SELECT",
      "password_resets_auth_update:UPDATE",
      "sessions_auth_delete:DELETE",
      "sessions_auth_insert:INSERT",
      "sessions_auth_select:SELECT",
      "sessions_auth_update:UPDATE",
      "subscriptions_auth_insert:INSERT",
      "users_auth_insert:INSERT",
      "users_auth_select:SELECT",
      "users_auth_update:UPDATE",
      "workspace_privacy_controls_tenant_select:SELECT",
      "workspaces_auth_insert:INSERT",
      "workspaces_auth_select:SELECT",
    ],
  );

  const fenceFunction = await pg.query<{ can_execute: boolean }>(
    `select has_function_privilege(
       (select oid from pg_roles where rolname = 'semforge_auth'),
       'public.privacy_workspace_lock_key(uuid)'::regprocedure,
       'EXECUTE'
     ) as can_execute`,
  );
  assert.deepEqual(fenceFunction.rows, [{ can_execute: true }]);
});

test("auth role은 password reset outbox를 INSERT만 할 수 있고 tenant outbox payload를 SELECT할 수 없다", async () => {
  const workspaceId = "00000000-0000-4000-8000-0000000000e1";
  const userId = "00000000-0000-4000-8000-0000000000e2";
  const otherWorkspaceId = "00000000-0000-4000-8000-0000000000e3";
  await pg.query(
    "insert into workspaces (id, name, slug) values ($1, 'Auth Outbox', 'auth-outbox'), ($2, 'Other Outbox', 'other-outbox')",
    [workspaceId, otherWorkspaceId],
  );
  await pg.query(
    "insert into users (id, email, password_hash) values ($1, 'reset-outbox-auth@example.com', 'password-hash')",
    [userId],
  );
  await pg.query(
    "insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')",
    [workspaceId, userId],
  );
  await pg.query(
    `insert into outbox (workspace_id, topic, payload, idempotency_key)
     values ($1, 'report.email.deliver', '{"secret":"other-workspace"}'::jsonb, 'other-secret')`,
    [otherWorkspaceId],
  );

  await pg.query("begin");
  try {
    await pg.query("set local role semforge_auth");
    await pg.query(
      `insert into password_resets (user_id, token_hash, expires_at)
       values ($1, repeat('c', 64), now() + interval '1 hour')`,
      [userId],
    );
    await pg.query(
      `insert into outbox (workspace_id, topic, payload, idempotency_key)
       values ($1, 'email.password_reset',
         '{"kind":"password_reset","resetId":"00000000-0000-4000-8000-0000000000e5","encryptedDelivery":"enc:v1:test:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:YWJj","expiresAt":"2030-08-12T06:00:00.000Z"}'::jsonb,
         'password-reset:00000000-0000-4000-8000-0000000000e5')`,
      [workspaceId],
    );

    await pg.query("savepoint outbox_wrong_topic_denied");
    await assert.rejects(
      pg.query(
        `insert into outbox (workspace_id, topic, payload, idempotency_key)
         values ($1, 'billing.charge', '{"kind":"wrong_topic"}'::jsonb, 'wrong-topic')`,
        [workspaceId],
      ),
    );
    await pg.query("rollback to savepoint outbox_wrong_topic_denied");

    await pg.query("savepoint outbox_select_denied");
    await assert.rejects(
      pg.query("select payload from outbox where workspace_id in ($1, $2)", [
        workspaceId,
        otherWorkspaceId,
      ]),
    );
    await pg.query("rollback to savepoint outbox_select_denied");
    await pg.query("commit");
  } catch (error) {
    await pg.query("rollback");
    throw error;
  }

  const visibleToOwner = await pg.query<{ idempotency_key: string }>(
    "select idempotency_key from outbox where workspace_id = $1 and idempotency_key = 'password-reset:00000000-0000-4000-8000-0000000000e5'",
    [workspaceId],
  );
  assert.deepEqual(visibleToOwner.rows, [{
    idempotency_key: "password-reset:00000000-0000-4000-8000-0000000000e5",
  }]);
});

test("auth role은 billing provisioning INSERT만 허용하고 billing SELECT를 노출하지 않는다", async () => {
  const authWorkspaceId = "00000000-0000-4000-8000-0000000000e4";
  const otherWorkspaceId = "00000000-0000-4000-8000-0000000000e5";
  const billingCustomerId = "00000000-0000-4000-8000-0000000000e6";
  const subscriptionId = "00000000-0000-4000-8000-0000000000e7";
  await pg.query(
    "insert into workspaces (id, name, slug) values ($1, 'Auth Billing', 'auth-billing'), ($2, 'Other Billing', 'other-billing')",
    [authWorkspaceId, otherWorkspaceId],
  );
  await pg.query(
    "insert into billing_customers (workspace_id, toss_customer_key) values ($1, 'customer_other_billing')",
    [otherWorkspaceId],
  );

  await pg.query("begin");
  try {
    await pg.query("set local role semforge_auth");

    await pg.query("savepoint auth_billing_returning_rejected");
    await assert.rejects(
      pg.query(
        "insert into billing_customers (workspace_id, toss_customer_key) values ($1, 'customer_auth_billing_returning') returning id::text",
        [authWorkspaceId],
      ),
    );
    await pg.query("rollback to savepoint auth_billing_returning_rejected");

    await pg.query(
      "insert into billing_customers (id, workspace_id, toss_customer_key) values ($1, $2, 'customer_auth_billing')",
      [billingCustomerId, authWorkspaceId],
    );
    await pg.query(
      "insert into subscriptions (id, workspace_id, billing_customer_id, status, amount_krw) values ($1, $2, $3, 'account_created', 49000)",
      [subscriptionId, authWorkspaceId, billingCustomerId],
    );

    await pg.query("savepoint auth_billing_other_tenant_select");
    await assert.rejects(
      pg.query("select id::text from billing_customers where workspace_id = $1", [
        otherWorkspaceId,
      ]),
    );
    await pg.query("rollback to savepoint auth_billing_other_tenant_select");

    await pg.query("savepoint auth_billing_own_id_select");
    await assert.rejects(
      pg.query("select id::text from billing_customers"),
    );
    await pg.query("rollback to savepoint auth_billing_own_id_select");

    await pg.query("savepoint auth_billing_subscription_id_select");
    await assert.rejects(
      pg.query("select id::text from subscriptions"),
    );
    await pg.query("rollback to savepoint auth_billing_subscription_id_select");

    await pg.query("savepoint auth_billing_sensitive_customer_select");
    await assert.rejects(
      pg.query("select workspace_id, toss_customer_key from billing_customers"),
    );
    await pg.query("rollback to savepoint auth_billing_sensitive_customer_select");

    await pg.query("savepoint auth_billing_sensitive_subscription_select");
    await assert.rejects(
      pg.query("select workspace_id, billing_customer_id, status, amount_krw from subscriptions"),
    );
    await pg.query("rollback to savepoint auth_billing_sensitive_subscription_select");
  } finally {
    await pg.query("rollback");
  }
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
    ["email", "expires_at", "release_target", "token_hash", "workspace_name", "workspace_slug"],
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
      "insert into invites (email, token_hash, workspace_name, workspace_slug, release_target, expires_at) values ('design-partner@example.com', repeat('c', 64), 'Design Partner', 'design-partner', 'paid-production', now() + interval '7 days')",
    );
    const visible = await pg.query<{
      email: string;
      workspace_name: string;
      workspace_slug: string;
      release_target: string;
      role: string;
      accepted_at: Date | null;
    }>(
      "select email, workspace_name, workspace_slug, release_target, role::text, accepted_at from invites where token_hash = repeat('c', 64)",
    );
    assert.deepEqual(visible.rows, [
      {
        email: "design-partner@example.com",
        workspace_name: "Design Partner",
        workspace_slug: "design-partner",
        release_target: "paid-production",
        role: "owner",
        accepted_at: null,
      },
    ]);

    for (const [name, statement] of [
      ["eight day invite", "insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at) values ('late@example.com', repeat('d', 64), 'Late', 'late', now() + interval '8 days')"],
      ["accepted field injection", `insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at, accepted_at, accepted_workspace_id, accepted_by_user_id) values ('forged@example.com', repeat('e', 64), 'Forged', 'forged', now() + interval '1 day', now(), '${workspaceId}', '${userId}')`],
      ["created at injection", "insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at, created_at) values ('future@example.com', repeat('f', 64), 'Future', 'future', now() + interval '14 days', now() + interval '7 days')"],
      ["member role injection", "insert into invites (email, token_hash, workspace_name, workspace_slug, role, expires_at) values ('member@example.com', repeat('0', 64), 'Member', 'member', 'member', now() + interval '1 day')"],
      ["bad release target", "insert into invites (email, token_hash, workspace_name, workspace_slug, release_target, expires_at) values ('bad-target@example.com', repeat('1a', 32), 'Bad Target', 'bad-target', 'demo', now() + interval '1 day')"],
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
