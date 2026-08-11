// @TASK P1-D1-T1 - Canonical PostgreSQL schema contract
// @SPEC docs/planning/06-tasks.md#p1-d1-t1--postgresql-16-핵심-스키마와-암호화-기반
import assert from "node:assert/strict";
import { test } from "node:test";

import { getTableConfig } from "drizzle-orm/pg-core";

import {
  authActionThrottles,
  aioPresenceEnum,
  gscObservations,
  jobStatusEnum,
  invites,
  naverObservationSources,
  naverObservations,
  reportStatusEnum,
  subscriptionStatusEnum,
  tenantTables,
  trackedQueries,
} from "@/db/schema/core";

const requiredTenantTables = [
  "memberships",
  "audit_events",
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
      "role",
      "expires_at",
      "accepted_at",
      "superseded_at",
      "accepted_workspace_id",
      "accepted_by_user_id",
      "created_at",
    ],
  );

  const checks = config.checks.map((constraint) => constraint.name);
  assert.ok(checks.includes("invites_token_hash_ck"));
  assert.ok(checks.includes("invites_owner_role_ck"));
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
