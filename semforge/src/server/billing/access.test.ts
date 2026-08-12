import assert from "node:assert/strict";
import { test } from "node:test";

import type { Pool } from "pg";

import {
  createBillingAccessAuthorizer,
  createRuntimeBillingAccessAuthorizer,
  type BillingAccessSqlSource,
} from "@/server/billing/access";

const workspaceId = "61000000-0000-4000-8000-000000000001";

function billingSource(
  row: Readonly<Record<string, unknown>> | undefined,
  calls: Array<{ text: string; values: readonly unknown[] | undefined }>,
): BillingAccessSqlSource {
  return {
    async query<T>(text: string, values?: readonly unknown[]) {
      calls.push({ text, values });
      return { rows: (row ? [row] : []) as T[] };
    },
  };
}

test("서버 청구 authorizer는 인증 workspace 하나만 조회하고 client 상태 없이 실제 구독으로 판정한다", async () => {
  const calls: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
  const authorize = createBillingAccessAuthorizer({
    database: billingSource({
      status: "account_created",
      current_period_start: null,
      current_period_end: null,
      grace_ends_at: null,
    }, calls),
    clock: () => new Date("2026-08-12T00:00:00.000Z"),
  });

  const decision = await authorize({ workspaceId, capability: "workspace:write" });

  assert.deepEqual(decision, {
    allowed: false,
    mode: "billing_only",
    reason: "payment_required",
    reportPeriodEndBefore: null,
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.text, /from subscriptions[\s\S]*where workspace_id = \$1/u);
  assert.deepEqual(calls[0]!.values, [workspaceId]);
});

test("past_due grace는 현재 청구기간 전 report만 허용하고 목록 SQL cutoff를 제공한다", async () => {
  const authorize = createBillingAccessAuthorizer({
    database: billingSource({
      status: "past_due",
      current_period_start: "2026-08-01T00:00:00.000Z",
      current_period_end: "2026-09-01T00:00:00.000Z",
      grace_ends_at: "2026-08-15T00:00:00.000Z",
    }, []),
    clock: () => new Date("2026-08-12T00:00:00.000Z"),
  });

  const listScope = await authorize({ workspaceId, capability: "report:read" });
  const oldReport = await authorize({
    workspaceId,
    capability: "report:read",
    reportPeriodEnd: new Date("2026-07-31T00:00:00.000Z"),
  });
  const currentReport = await authorize({
    workspaceId,
    capability: "report:read",
    reportPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
  });

  assert.equal(listScope.mode, "past_reports_only");
  assert.equal(listScope.allowed, false);
  assert.equal(listScope.reportPeriodEndBefore?.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(oldReport.allowed, true);
  assert.equal(currentReport.allowed, false);
});

test("production authorizer는 tenant billing pool과 transaction-local workspace만 사용한다", async () => {
  const roles: string[] = [];
  const statements: string[] = [];
  const values: Array<readonly unknown[] | undefined> = [];
  const authorize = createRuntimeBillingAccessAuthorizer({
    getPool(role) {
      roles.push(role);
      return {
        async connect() {
          return {
            async query<T>(text: string, queryValues?: readonly unknown[]) {
              statements.push(text);
              values.push(queryValues);
              return {
                rows: (/from subscriptions/u.test(text)
                  ? [{
                      status: "active",
                      current_period_start: "2026-08-01T00:00:00.000Z",
                      current_period_end: "2026-09-01T00:00:00.000Z",
                      grace_ends_at: null,
                    }]
                  : []) as T[],
              };
            },
            release() {},
          };
        },
      } as unknown as Pick<Pool, "connect">;
    },
    clock: () => new Date("2026-08-12T00:00:00.000Z"),
  });

  assert.equal((await authorize({ workspaceId, capability: "workspace:read" })).allowed, true);
  assert.deepEqual(roles, ["billingTenant"]);
  assert.equal(statements[0], "begin");
  assert.equal(statements[1], "select set_config('app.workspace_id', $1, true)");
  assert.match(statements[2]!, /from subscriptions/u);
  assert.equal(statements[3], "commit");
  assert.deepEqual(values[1], [workspaceId]);
});

test("서버 authorizer는 paid-beta 상태 전체를 단일 domain policy로 강제한다", async () => {
  const cases = [
    { status: "invited", allowed: false },
    { status: "account_created", allowed: false },
    { status: "canceled", allowed: false },
    {
      status: "past_due",
      grace_ends_at: "2026-08-12T00:00:00.000Z",
      allowed: false,
    },
    {
      status: "cancel_at_period_end",
      current_period_end: "2026-08-12T00:00:00.000Z",
      allowed: false,
    },
    { status: "active", allowed: true },
    {
      status: "cancel_at_period_end",
      current_period_end: "2026-08-13T00:00:00.000Z",
      allowed: true,
    },
    {
      status: "cancel_at_period_end",
      current_period_end: "2026-08-13T00:00:00.000Z",
      grace_ends_at: "2026-08-15T00:00:00.000Z",
      allowed: false,
    },
    {
      status: "cancel_at_period_end",
      current_period_end: "2026-08-20T00:00:00.000Z",
      grace_ends_at: "2026-08-11T00:00:00.000Z",
      allowed: false,
    },
  ] as const;

  for (const value of cases) {
    const authorize = createBillingAccessAuthorizer({
      database: billingSource({
        status: value.status,
        current_period_start: "2026-08-01T00:00:00.000Z",
        current_period_end: "current_period_end" in value
          ? value.current_period_end
          : "2026-09-01T00:00:00.000Z",
        grace_ends_at: "grace_ends_at" in value ? value.grace_ends_at : null,
      }, []),
      clock: () => new Date("2026-08-12T00:00:00.000Z"),
    });
    assert.equal(
      (await authorize({ workspaceId, capability: "workspace:read" })).allowed,
      value.allowed,
      value.status,
    );
  }
});

test("손상된 billing row는 허용으로 강등되지 않고 안전하게 실패한다", async () => {
  for (const row of [
    {
      status: "forged_active",
      current_period_start: null,
      current_period_end: null,
      grace_ends_at: null,
    },
    {
      status: "active",
      current_period_start: "not-a-date",
      current_period_end: null,
      grace_ends_at: null,
    },
  ]) {
    const authorize = createBillingAccessAuthorizer({
      database: billingSource(row, []),
    });
    await assert.rejects(
      authorize({ workspaceId, capability: "workspace:read" }),
      /청구 구독 (상태|날짜)가 올바르지 않습니다/u,
    );
  }
});
