// @TASK P5-SEC-ROLES - Tenant-scoped billing store transaction boundary
// @SPEC docs/planning/06-tasks.md#p2-b1-t1--toss-자동결제-상태-머신과-ledger
import assert from "node:assert/strict";
import { test } from "node:test";

import type { Pool } from "pg";

import {
  billingDatabaseRole,
  canSettlePaymentStatus,
  createPostgresBillingStore,
} from "@/server/billing/postgres-store";

const workspaceId = "65000000-0000-4000-8000-000000000001";

test("billing store 기본 pool 역할은 required scope에 따라 분리된다", () => {
  assert.equal(billingDatabaseRole("tenant"), "billingTenant");
  assert.equal(billingDatabaseRole("global"), "billing");
});

function poolBoundary() {
  const statements: string[] = [];
  const values: Array<readonly unknown[] | undefined> = [];
  let released = false;
  const pool = {
    async connect() {
      return {
        async query<T>(text: string, queryValues?: readonly unknown[]) {
          statements.push(text);
          values.push(queryValues);
          return { rows: [] as T[], rowCount: 0 };
        },
        release() {
          released = true;
        },
      };
    },
  } as unknown as Pool;
  return { pool, statements, values, released: () => released };
}

test("tenant billing store는 각 workspace 요청을 SET LOCAL과 같은 transaction에 묶는다", async () => {
  const boundary = poolBoundary();
  const store = createPostgresBillingStore({
    pool: boundary.pool,
    fingerprintSecret: "billing-store-fingerprint-secret-32-bytes",
    scope: "tenant",
  });

  assert.equal(await store.getAccount(workspaceId), null);
  assert.equal(boundary.statements[0], "begin");
  assert.equal(boundary.statements[1], "select set_config('app.workspace_id', $1, true)");
  assert.deepEqual(boundary.values[1], [workspaceId]);
  assert.match(boundary.statements[2]!, /from billing_customers/u);
  assert.equal(boundary.statements.at(-1), "commit");
  assert.equal(boundary.released(), true);
});

test("tenant billing store는 workspace 없는 webhook/reconcile 조회를 fail-closed 거부한다", async () => {
  const boundary = poolBoundary();
  const store = createPostgresBillingStore({
    pool: boundary.pool,
    fingerprintSecret: "billing-store-fingerprint-secret-32-bytes",
    scope: "tenant",
  });

  await assert.rejects(
    store.findPaymentByOrderId("order-global-only"),
    /global billing store/u,
  );
  assert.deepEqual(boundary.statements, []);
});

test("billing settlement 상태 전이는 provider replay가 terminal 상태를 되돌리지 못하게 제한한다", () => {
  const statuses = ["pending", "authorized", "paid", "failed", "refunded", "canceled"] as const;
  const allowed = new Set([
    "pending->pending",
    "pending->authorized",
    "pending->paid",
    "pending->failed",
    "pending->refunded",
    "pending->canceled",
    "authorized->authorized",
    "authorized->paid",
    "authorized->failed",
    "authorized->refunded",
    "authorized->canceled",
    "paid->paid",
    "paid->refunded",
    "paid->canceled",
    "failed->failed",
    "refunded->refunded",
    "refunded->canceled",
    "canceled->canceled",
  ]);

  for (const current of statuses) {
    for (const next of statuses) {
      assert.equal(
        canSettlePaymentStatus(current, next),
        allowed.has(`${current}->${next}`),
        `${current}->${next}`,
      );
    }
  }
});
