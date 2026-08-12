// @TASK P5-PRIVACY-FIX - Tenant-pinned report email suppression enforcement
// @SPEC docs/ops/privacy-erasure-runbook.md
// @TEST src/server/reports/delivery/store.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { PostgresReportDeliveryStore } from "@/server/reports/delivery/store";

const workspaceId = "57000000-0000-4000-8000-000000000001";

test("report suppression은 normalized email full SHA-256와 tenant transaction으로만 조회한다", async () => {
  const statements: Array<{ text: string; values?: readonly unknown[] }> = [];
  let released = false;
  const store = new PostgresReportDeliveryStore({
    async query() { throw new Error("pool query must not be used"); },
    async connect() {
      return {
        async query<T = unknown>(text: string, values?: readonly unknown[]) {
          statements.push({ text, values });
          return {
            rows: (text.includes("email_suppressions")
              ? [{ suppressed: true }]
              : []) as T[],
          };
        },
        release() { released = true; },
      };
    },
  });

  assert.equal(await store.isEmailSuppressed({
    workspaceId,
    recipient: "  CUSTOMER@EXAMPLE.TEST ",
  }), true);
  assert.equal(statements[0]?.text, "begin");
  assert.deepEqual(statements[1]?.values, [workspaceId]);
  assert.match(statements[2]?.text ?? "", /from email_suppressions/u);
  assert.deepEqual(statements[2]?.values, [
    workspaceId,
    "06c3645baad7d2fd6661e4dce43692e8b0fc79133fbd1582bad9235e7ea668da",
  ]);
  assert.equal(statements.at(-1)?.text, "commit");
  assert.equal(released, true);
});
