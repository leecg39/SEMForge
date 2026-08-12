// @TASK P5-PRIVACY-FIX - Tenant-pinned report email suppression enforcement
// @SPEC docs/ops/privacy-erasure-runbook.md
// @TEST src/server/reports/delivery/store.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { PostgresReportDeliveryStore } from "@/server/reports/delivery/store";
import type { WeeklyReportSnapshot } from "@/server/reports/types";

const workspaceId = "57000000-0000-4000-8000-000000000001";
const reportId = "57000000-0000-4000-8000-000000000003";
const deliveryId = "57000000-0000-4000-8000-000000000004";

function snapshot(): WeeklyReportSnapshot {
  const unavailable = (key: "aio" | "naver" | "gsc") => ({
    key,
    available: false as const,
    unavailableReason: "provider_data_missing",
    capturedAt: "2026-08-09T23:00:00.000Z",
    data: {},
  });
  return {
    version: 1,
    capturedAt: "2026-08-09T23:00:00.000Z",
    schedule: {
      timezone: "Asia/Seoul",
      collectionAt: "2026-08-09T09:00:00.000Z",
      retryCutoffAt: "2026-08-09T22:00:00.000Z",
      snapshotAt: "2026-08-09T23:00:00.000Z",
    },
    period: {
      timezone: "America/Los_Angeles",
      current: { start: "2026-07-31", end: "2026-08-06" },
      comparison: { start: "2026-07-24", end: "2026-07-30" },
    },
    brand: { name: "서울 검색 연구소", logoUrl: null, accentColor: "#123456" },
    sections: {
      rank: {
        key: "rank",
        available: true,
        unavailableReason: null,
        capturedAt: "2026-08-09T09:30:00.000Z",
        data: { observations: [{ query: "주간 SEO", position: 2 }] },
      },
      aio: unavailable("aio"),
      naver: unavailable("naver"),
      gsc: unavailable("gsc"),
    },
  };
}

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

test("report email delivery fence는 recipient shared lock 뒤 suppression을 재확인하고 provider 작업 commit 전까지 같은 connection을 pin한다", async () => {
  const statements: Array<{ text: string; values?: readonly unknown[] }> = [];
  const insideOperationStatements: number[] = [];
  let released = false;
  const value = snapshot();
  const store = new PostgresReportDeliveryStore({
    async query() { throw new Error("pool query must not be used"); },
    async connect() {
      return {
        async query<T = unknown>(text: string, values?: readonly unknown[]) {
          statements.push({ text, values });
          if (text.includes("email_suppressions")) {
            return { rows: [{ suppressed: false }] as T[] };
          }
          if (text.includes("from weekly_reports")) {
            return { rows: [{ id: reportId, snapshot: value }] as T[] };
          }
          if (text.includes("from deliveries")) {
            return {
              rows: [{
                id: deliveryId,
                report_id: reportId,
                recipient: "customer@example.test",
                status: "queued",
                attempts: 0,
                created_at: new Date("2026-08-12T01:00:00.000Z"),
              }] as T[],
            };
          }
          if (text.includes("set status = 'sending'")) {
            return { rows: [{ attempts: 1 }] as T[] };
          }
          if (text.includes("set status = 'delivered'")) {
            return { rows: [{ report_id: reportId }] as T[] };
          }
          return { rows: [] as T[] };
        },
        release() { released = true; },
      };
    },
  });

  const result = await store.withEmailDeliveryFence({
    workspaceId,
    reportId,
    recipient: "customer@example.test",
    recipientHash: "06c3645baad7d2fd6661e4dce43692e8b0fc79133fbd1582bad9235e7ea668da",
    idempotencyKey: "report-email:test",
    now: new Date("2026-08-12T01:00:00.000Z"),
  }, async (prepared, transaction) => {
    assert.equal(prepared.id, deliveryId);
    insideOperationStatements.push(statements.length);
    assert.equal(statements.some((statement) => statement.text === "commit"), false);
    await transaction.markEmailDelivered({
      workspaceId,
      deliveryId: prepared.id,
      deliveredAt: new Date("2026-08-12T01:01:00.000Z"),
    });
    return "provider-finished";
  });

  assert.equal(result.disposition, "executed");
  assert.equal(released, true);
  const texts = statements.map((statement) => statement.text);
  const lockIndex = texts.findIndex((text) => text.includes("privacy_lock_recipient_email_shared"));
  const suppressionIndex = texts.findIndex((text) => text.includes("email_suppressions"));
  const insertDeliveryIndex = texts.findIndex((text) => text.includes("insert into deliveries"));
  const deliveredIndex = texts.findIndex((text) => text.includes("set status = 'delivered'"));
  const commitIndex = texts.findIndex((text) => text === "commit");
  assert.deepEqual(statements[1]?.values, [workspaceId]);
  assert.deepEqual(statements[2]?.values, [
    workspaceId,
    "06c3645baad7d2fd6661e4dce43692e8b0fc79133fbd1582bad9235e7ea668da",
  ]);
  assert.ok(lockIndex > -1);
  assert.ok(suppressionIndex > lockIndex);
  assert.ok(insertDeliveryIndex > suppressionIndex);
  assert.ok(deliveredIndex >= insideOperationStatements[0]!);
  assert.ok(commitIndex > deliveredIndex);
});
