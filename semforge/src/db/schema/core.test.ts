// @TASK P1-D1-T1 - Canonical PostgreSQL schema contract
// @SPEC docs/planning/06-tasks.md#p1-d1-t1--postgresql-16-핵심-스키마와-암호화-기반
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { getTableConfig } from "drizzle-orm/pg-core";

import {
  authActionThrottles,
  aioPresenceEnum,
  gscObservations,
  jobs,
  jobStatusEnum,
  invites,
  naverObservationSources,
  naverObservations,
  outbox,
  providerCalls,
  reportStatusEnum,
  subscriptionStatusEnum,
  tenantTables,
  trackedQueries,
  usageReservations,
  workspacePrivacyControls,
} from "@/db/schema/core";

const requiredTenantTables = [
  "memberships",
  "audit_events",
  "legal_acceptances",
  "privacy_requests",
  "privacy_request_steps",
  "privacy_billing_tombstones",
  "backup_deletion_markers",
  "workspace_privacy_controls",
  "sites",
  "tracked_queries",
  "gsc_connections",
  "oauth_states",
  "gsc_property_bindings",
  "provider_calls",
  "usage_reservations",
  "jobs",
  "outbox",
  "rank_observations",
  "aio_observations",
  "aio_citations",
  "naver_observations",
  "naver_observation_sources",
  "gsc_observations",
  "weekly_reports",
  "report_sections",
  "report_assets",
  "deliveries",
  "billing_customers",
  "payment_methods",
  "subscriptions",
  "payments",
  "provider_events",
  "billing_ledger_events",
] as const;

test("공개 상태 enum은 제품 계약과 정확히 일치한다", () => {
  assert.deepEqual(aioPresenceEnum.enumValues, ["present", "absent", "unknown"]);
  assert.deepEqual(jobStatusEnum.enumValues, [
    "queued",
    "leased",
    "succeeded",
    "retryable",
    "dead",
  ]);
  assert.deepEqual(reportStatusEnum.enumValues, [
    "collecting",
    "snapshot_ready",
    "rendering",
    "delivered",
    "partial",
    "failed",
  ]);
  assert.deepEqual(subscriptionStatusEnum.enumValues, [
    "invited",
    "account_created",
    "billing_authorized",
    "charge_pending",
    "active",
    "past_due",
    "cancel_at_period_end",
    "canceled",
  ]);
});

// @TASK P1-FINAL-PRIVACY - Workspace privacy fence state contract
// @SPEC final_privacy_fence#workspace-privacy-controls
test("workspace privacy control은 tenant별 active→blocking→erased 계약을 표현한다", () => {
  const config = getTableConfig(workspacePrivacyControls);
  assert.deepEqual(
    config.columns.map((column) => column.name),
    [
      "workspace_id",
      "state",
      "generation",
      "deletion_request_id",
      "blocked_at",
      "erased_at",
      "created_at",
      "updated_at",
    ],
  );
  assert.equal(config.primaryKeys[0]?.name, "workspace_privacy_controls_pk");
  assert.ok(config.checks.some((constraint) => constraint.name === "workspace_privacy_controls_state_ck"));
  assert.ok(config.checks.some((constraint) => constraint.name === "workspace_privacy_controls_transition_ck"));

  const snapshot = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "src", "db", "migrations", "meta", "0000_snapshot.json"),
      "utf8",
    ),
  ) as { tables: Record<string, { columns: Record<string, unknown> }> };
  assert.deepEqual(
    Object.keys(snapshot.tables["public.workspace_privacy_controls"]!.columns),
    ["workspace_id", "state", "generation", "deletion_request_id", "blocked_at", "erased_at", "created_at", "updated_at"],
  );
});

test("erased/missing workspace write fence는 전체 durable mutation 표면을 canonical migration에서 차단한다", () => {
  const migration = readFileSync(
    path.join(process.cwd(), "src", "db", "migrations", "0000_core.sql"),
    "utf8",
  );
  assert.match(migration, /workspace is unavailable by privacy control[^]+ERRCODE = '55000'/u);
  assert.match(migration, /BEFORE INSERT OR UPDATE ON %I/u);
  for (const table of [
    "workspaces",
    "invites",
    "memberships",
    "legal_acceptances",
    "sessions",
    "audit_events",
    "jobs",
    "outbox",
    "sites",
    "tracked_queries",
    "gsc_connections",
    "gsc_property_bindings",
    "oauth_states",
    "provider_calls",
    "usage_reservations",
    "rank_observations",
    "aio_observations",
    "aio_citations",
    "naver_observations",
    "naver_observation_sources",
    "gsc_observations",
    "weekly_reports",
    "report_sections",
    "report_assets",
    "deliveries",
    "billing_customers",
    "payment_methods",
    "subscriptions",
    "payments",
    "provider_events",
    "billing_ledger_events",
  ]) {
    assert.match(migration, new RegExp(`'${table}'`, "u"), `${table} privacy fence missing`);
  }
});

test("모든 tenant domain table은 non-null workspace_id를 가진다", () => {
  const byName = new Map(tenantTables.map((table) => [getTableConfig(table).name, table]));
  assert.deepEqual([...requiredTenantTables].filter((name) => !byName.has(name)), []);

  for (const name of requiredTenantTables) {
    const workspaceColumn = getTableConfig(byName.get(name)!).columns.find(
      (column) => column.name === "workspace_id",
    );
    assert.ok(workspaceColumn, `${name}.workspace_id missing`);
    assert.equal(workspaceColumn.notNull, true, `${name}.workspace_id must be NOT NULL`);
  }
});

test("tracked_queries는 workspace와 site를 함께 참조한다", () => {
  const foreignKeys = getTableConfig(trackedQueries).foreignKeys.map((key) => key.reference());
  assert.ok(
    foreignKeys.some(
      (key) =>
        getTableConfig(key.foreignTable).name === "sites" &&
        key.columns.map((column) => column.name).join(",") === "workspace_id,site_id" &&
        key.foreignColumns.map((column) => column.name).join(",") === "workspace_id,id",
    ),
  );
});

test("usage reservation은 provider call을 같은 workspace 복합 FK로 고정한다", () => {
  const config = getTableConfig(usageReservations);
  assert.equal(config.columns.find((column) => column.name === "provider_call_id")?.notNull, true);
  assert.ok(
    config.foreignKeys.some((key) => {
      const reference = key.reference();
      return (
        getTableConfig(reference.foreignTable).name === getTableConfig(providerCalls).name &&
        reference.columns.map((column) => column.name).join(",") ===
          "workspace_id,provider_call_id" &&
        reference.foreignColumns.map((column) => column.name).join(",") === "workspace_id,id"
      );
    }),
  );
});

test("migration snapshot도 provider call 연결 컬럼을 usage reservation에 기록한다", () => {
  const snapshot = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "src", "db", "migrations", "meta", "0000_snapshot.json"),
      "utf8",
    ),
  ) as { tables: Record<string, { columns: Record<string, unknown> }> };
  assert.equal(
    Object.hasOwn(snapshot.tables["public.usage_reservations"]!.columns, "provider_call_id"),
    true,
  );
  assert.equal(
    Object.hasOwn(snapshot.tables["public.provider_calls"]!.columns, "provider_call_id"),
    false,
  );
});

test("job/outbox canonical request hash는 schema와 migration snapshot에 함께 존재한다", () => {
  assert.equal(
    getTableConfig(jobs).columns.find((column) => column.name === "request_hash")?.notNull,
    true,
  );
  assert.equal(
    getTableConfig(outbox).columns.find((column) => column.name === "request_hash")?.notNull,
    true,
  );
  const snapshot = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "src", "db", "migrations", "meta", "0000_snapshot.json"),
      "utf8",
    ),
  ) as { tables: Record<string, { columns: Record<string, unknown> }> };
  assert.equal(Object.hasOwn(snapshot.tables["public.jobs"]!.columns, "request_hash"), true);
  assert.equal(Object.hasOwn(snapshot.tables["public.outbox"]!.columns, "request_hash"), true);
});

test("worker report outbox INSERT tenant policy는 schema와 canonical snapshot에 고정된다", () => {
  const config = getTableConfig(outbox);
  assert.equal(config.enableRLS, true);
  assert.ok(config.policies.some((policy) =>
    policy.name === "outbox_worker_insert" &&
    policy.for === "insert" &&
    policy.to === "semforge_worker" &&
    policy.using === undefined &&
    policy.withCheck !== undefined));

  const snapshot = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "src", "db", "migrations", "meta", "0000_snapshot.json"),
      "utf8",
    ),
  ) as {
    tables: Record<string, {
      isRLSEnabled: boolean;
      policies: Record<string, { for: string; to: string[]; withCheck?: string }>;
    }>;
  };
  const snapshotOutbox = snapshot.tables["public.outbox"]!;
  assert.equal(snapshotOutbox.isRLSEnabled, true);
  assert.deepEqual(snapshotOutbox.policies.outbox_worker_insert?.to, ["semforge_worker"]);
  assert.equal(snapshotOutbox.policies.outbox_worker_insert?.for, "INSERT");
  assert.match(
    snapshotOutbox.policies.outbox_worker_insert?.withCheck ?? "",
    /workspace_id.*current_setting.*topic.*report\.pdf\.render.*report\.email\.deliver/u,
  );
});

test("NAVER와 GSC 관측값은 수집 provenance를 tenant 복합 FK로 고정한다", () => {
  const naverConfig = getTableConfig(naverObservations);
  const naverCollectedAt = naverConfig.columns.find((column) => column.name === "collected_at");
  assert.equal(naverCollectedAt?.notNull, true);

  const sourcesConfig = getTableConfig(naverObservationSources);
  assert.deepEqual(
    sourcesConfig.columns.map((column) => column.name),
    [
      "workspace_id",
      "observation_id",
      "source",
      "status",
      "provider_call_id",
      "collected_at",
      "error_code",
      "metadata",
    ],
  );
  assert.ok(
    sourcesConfig.foreignKeys.some((key) => {
      const reference = key.reference();
      return (
        getTableConfig(reference.foreignTable).name === "naver_observations" &&
        reference.columns.map((column) => column.name).join(",") ===
          "workspace_id,observation_id" &&
        reference.foreignColumns.map((column) => column.name).join(",") === "workspace_id,id"
      );
    }),
  );
  assert.ok(
    sourcesConfig.foreignKeys.some((key) => {
      const reference = key.reference();
      return (
        getTableConfig(reference.foreignTable).name === "provider_calls" &&
        reference.columns.map((column) => column.name).join(",") ===
          "workspace_id,provider_call_id" &&
        reference.foreignColumns.map((column) => column.name).join(",") === "workspace_id,id"
      );
    }),
  );
  assert.deepEqual(
    sourcesConfig.checks.map((constraint) => constraint.name).sort(),
    ["naver_observation_sources_source_ck", "naver_observation_sources_status_ck"],
  );

  const gscConfig = getTableConfig(gscObservations);
  assert.equal(gscConfig.columns.find((column) => column.name === "provider_call_id")?.notNull, true);
  assert.equal(gscConfig.columns.find((column) => column.name === "collected_at")?.notNull, true);
  assert.ok(
    gscConfig.foreignKeys.some((key) => {
      const reference = key.reference();
      return (
        getTableConfig(reference.foreignTable).name === "provider_calls" &&
        reference.columns.map((column) => column.name).join(",") ===
          "workspace_id,provider_call_id" &&
        reference.foreignColumns.map((column) => column.name).join(",") === "workspace_id,id"
      );
    }),
  );
});

test("auth_action_throttles는 workspace 없이 action과 SHA-256 hash만 저장한다", () => {
  const config = getTableConfig(authActionThrottles);
  assert.equal(config.name, "auth_action_throttles");
  assert.equal(config.columns.some((column) => column.name === "workspace_id"), false);
  assert.deepEqual(
    config.columns.map((column) => column.name),
    ["action", "key_hash", "window_started_at", "attempt_count", "blocked_until", "updated_at"],
  );
});

test("password reset scrub은 dispatcher의 임의 payload UPDATE 없이 제한 SECURITY DEFINER 함수만 허용한다", () => {
  const migration = readFileSync(
    path.join(process.cwd(), "src", "db", "migrations", "0000_core.sql"),
    "utf8",
  );
  assert.match(migration, /CREATE ROLE semforge_secret_scrubber[^;]+NOLOGIN[^;]+NOBYPASSRLS/iu);
  assert.match(migration, /CREATE FUNCTION scrub_password_reset_delivery\([^]+SECURITY DEFINER/iu);
  assert.match(migration, /ALTER FUNCTION scrub_password_reset_delivery[^]+OWNER TO semforge_secret_scrubber/iu);
  assert.match(migration, /REVOKE ALL ON FUNCTION scrub_password_reset_delivery[^]+FROM PUBLIC/iu);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION scrub_password_reset_delivery[^]+TO semforge_dispatcher/iu);
  assert.doesNotMatch(
    migration,
    /GRANT UPDATE \([^)]*payload[^)]*\) ON jobs TO semforge_dispatcher/iu,
  );
  assert.match(migration, /valid_password_reset_payload\([^]+jsonb_object_keys/iu);
  assert.match(migration, /outbox_password_reset_payload_ck[^]+valid_password_reset_payload/iu);
  assert.match(migration, /jobs_password_reset_payload_ck[^]+valid_password_reset_payload/iu);
  assert.match(migration, /outbox_auth_insert[^]+valid_password_reset_payload\(payload\)/iu);
  assert.match(migration, /encryptedDelivery[^]+\{16\}[^]+\{22\}[^]+\{4\}[^]+\{2\}/u);
  assert.match(migration, /idempotency_key = 'password-reset:' \|\| \(payload->>'resetId'\)/u);
  assert.match(migration, /CREATE TRIGGER jobs_scrub_dead_password_reset/iu);
  assert.match(migration, /CREATE TRIGGER outbox_scrub_dead_password_reset/iu);
});

test("invites는 생성 시점부터 최대 7일까지만 유효하다", () => {
  const checks = getTableConfig(invites).checks.map((constraint) => constraint.name);
  assert.ok(checks.includes("invites_expiry_window_ck"));
});

test("invites는 신규 workspace intent와 수락한 owner membership을 명시적으로 연결한다", () => {
  const config = getTableConfig(invites);
  assert.deepEqual(
    config.columns.map((column) => column.name),
    [
      "id",
      "email",
      "token_hash",
      "workspace_name",
      "workspace_slug",
      "release_target",
      "role",
      "expires_at",
      "accepted_at",
      "superseded_at",
      "accepted_workspace_id",
      "accepted_by_user_id",
      "accepted_erased_at",
      "created_at",
    ],
  );

  const checks = config.checks.map((constraint) => constraint.name);
  assert.ok(checks.includes("invites_token_hash_ck"));
  assert.ok(checks.includes("invites_owner_role_ck"));
  assert.ok(checks.includes("invites_release_target_ck"));
  assert.ok(checks.includes("invites_provisioning_state_ck"));
  assert.ok(checks.includes("invites_intent_text_ck"));
  assert.ok(checks.includes("invites_acceptance_time_ck"));
  assert.ok(checks.includes("invites_superseded_time_ck"));

  const acceptedMembership = config.foreignKeys
    .map((key) => key.reference())
    .find(
      (key) =>
        key.columns.map((column) => column.name).join(",") ===
        "accepted_workspace_id,accepted_by_user_id,role",
    );
  assert.ok(acceptedMembership);
  assert.equal(getTableConfig(acceptedMembership.foreignTable).name, "memberships");
  assert.equal(
    acceptedMembership.foreignColumns.map((column) => column.name).join(","),
    "workspace_id,user_id,role",
  );

  const indexNames = config.indexes.map((index) => index.config.name);
  assert.ok(indexNames.includes("invites_pending_email_uq"));
  assert.ok(indexNames.includes("invites_pending_workspace_slug_uq"));
});
