// @TASK P3-R1-T1 - Report snapshot job contract
// @SPEC docs/planning/06-tasks.md#p3-r1-t1--주간-불변-리포트-스냅샷
// @TEST src/server/reports/job-handler.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type { JobExecutionContext } from "@/server/jobs/contracts";
import { createReportGenerationJobHandler } from "@/server/reports/job-handler";
import type { ReportDetail } from "@/server/reports/types";

const workspaceId = "30000000-0000-4000-8000-000000000001";
const siteId = "30000000-0000-4000-8000-000000000002";

function context(now: string): JobExecutionContext {
  return {
    workspaceId,
    jobId: "job-report-1",
    attempt: 1,
    maxAttempts: 5,
    lease: {
      owner: "worker-1",
      token: "lease-report-1",
      generation: 1,
      expiresAt: new Date("2026-08-10T00:30:00.000Z"),
    },
    signal: new AbortController().signal,
    providerCalls: {
      reserve: async () => ({
        disposition: "execute",
        providerCallId: "provider-call-1",
        usageReservationId: "reservation-1",
        responseMetadata: null,
      }),
      succeed: async () => undefined,
      fail: async () => undefined,
    },
    now: () => new Date(now),
    audit: async () => undefined,
  };
}

test("report.snapshot 작업은 월요일 08:00 KST 전이면 정확한 snapshot 시각까지 retry한다", async () => {
  let calls = 0;
  const handler = createReportGenerationJobHandler({
    generate: async () => {
      calls += 1;
      return {} as ReportDetail;
    },
  });
  const result = await handler(
    {
      id: "job-report-1",
      workspaceId,
      type: "report.snapshot",
      payload: { siteId, cycleMonday: "2026-08-10" },
      idempotencyKey: "weekly:site:2026-08-10",
      attempt: 1,
      maxAttempts: 5,
    },
    context("2026-08-09T22:59:59.000Z"),
  );

  assert.equal(calls, 0);
  assert.deepEqual(result, {
    status: "retryable",
    error: "REPORT_SNAPSHOT_NOT_READY",
    retryAt: new Date("2026-08-09T23:00:00.000Z"),
  });
});

test("report.snapshot 작업은 기존 job 계약으로 멱등 생성기를 호출한다", async () => {
  const inputs: unknown[] = [];
  const handler = createReportGenerationJobHandler({
    generate: async (input) => {
      inputs.push(input);
      return { id: "report-1", status: "partial" } as ReportDetail;
    },
  });
  const result = await handler(
    {
      id: "job-report-1",
      workspaceId,
      type: "report.snapshot",
      payload: { siteId, cycleMonday: "2026-08-10" },
      idempotencyKey: "weekly:site:2026-08-10",
      attempt: 2,
      maxAttempts: 5,
    },
    context("2026-08-09T23:00:00.000Z"),
  );

  assert.deepEqual(inputs, [{ workspaceId, siteId, cycleMonday: "2026-08-10" }]);
  assert.deepEqual(result, {
    status: "succeeded",
    metadata: { reportId: "report-1", reportStatus: "partial" },
  });
});

test("report.snapshot 작업은 잘못된 payload와 workspace 경계를 terminal로 거부한다", async () => {
  const handler = createReportGenerationJobHandler({
    generate: async () => ({} as ReportDetail),
  });
  const invalidPayload = await handler(
    {
      id: "job-report-1",
      workspaceId,
      type: "report.snapshot",
      payload: { siteId: "not-a-uuid", cycleMonday: "2026-08-10" },
      idempotencyKey: "weekly:site:2026-08-10",
      attempt: 1,
      maxAttempts: 5,
    },
    context("2026-08-09T23:00:00.000Z"),
  );
  assert.deepEqual(invalidPayload, {
    status: "dead",
    error: "REPORT_SNAPSHOT_INVALID_PAYLOAD",
  });

  const mismatched = await handler(
    {
      id: "job-report-1",
      workspaceId: "30000000-0000-4000-8000-000000000099",
      type: "report.snapshot",
      payload: { siteId, cycleMonday: "2026-08-10" },
      idempotencyKey: "weekly:site:2026-08-10",
      attempt: 1,
      maxAttempts: 5,
    },
    context("2026-08-09T23:00:00.000Z"),
  );
  assert.deepEqual(mismatched, {
    status: "dead",
    error: "REPORT_SNAPSHOT_WORKSPACE_MISMATCH",
  });
});
