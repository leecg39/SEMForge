// @TASK P1-D1-T1 - Canonical PostgreSQL schema contract
// @SPEC docs/planning/06-tasks.md#p1-d1-t1--postgresql-16-핵심-스키마와-암호화-기반
import assert from "node:assert/strict";
import { test } from "node:test";

import { getTableConfig } from "drizzle-orm/pg-core";

import {
  aioPresenceEnum,
  jobStatusEnum,
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
