// @TASK P4-R1-T1 - Report render and delivery worker contracts
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import assert from "node:assert/strict";
import { test } from "node:test";

import type { JobExecutionContext } from "@/server/jobs/contracts";
import {
  createReportEmailDeliveryJobHandler,
  createReportPdfRenderJobHandler,
  REPORT_EMAIL_DELIVERY_JOB,
  REPORT_PDF_RENDER_JOB,
} from "@/server/reports/delivery/job-handler";
import {
  ReportDeliveryError,
  type ReportDeliveryService,
} from "@/server/reports/delivery/service";

const workspaceId = "58000000-0000-4000-8000-000000000001";
const reportId = "58000000-0000-4000-8000-000000000002";

function context(audits: unknown[] = []): JobExecutionContext {
  return {
    workspaceId,
    jobId: "job-delivery-1",
    attempt: 1,
    maxAttempts: 5,
    lease: {
      owner: "worker-delivery",
      token: "lease-delivery",
      generation: 1,
      expiresAt: new Date("2026-08-12T01:01:00.000Z"),
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
    now: () => new Date("2026-08-12T01:00:00.000Z"),
    audit: async (action, metadata) => { audits.push({ action, metadata }); },
  };
}

function service(overrides: Partial<ReportDeliveryService> = {}): ReportDeliveryService {
  return {
    renderPdf: async () => ({
      asset: { id: "asset-1", workspaceId, reportId, storageKey: "reports/key.pdf", checksumSha256: "a".repeat(64), sizeBytes: 100 },
      snapshotSha256: "b".repeat(64),
    }),
    ensurePdf: async () => { throw new Error("not used"); },
    deliverEmail: async () => ({
      status: "delivered",
      deliveryId: "delivery-1",
      pdfAssetId: "asset-1",
      snapshotSha256: "b".repeat(64),
    }),
    ...overrides,
  };
}

test("PDF와 email jobs는 같은 report snapshot hash를 결과·audit에 기록하고 recipient PII는 남기지 않는다", async () => {
  const audits: unknown[] = [];
  const pdf = await createReportPdfRenderJobHandler(service())(
    {
      id: "job-pdf-1",
      workspaceId,
      type: REPORT_PDF_RENDER_JOB,
      payload: { reportId },
      idempotencyKey: `report-pdf:${reportId}`,
      attempt: 1,
      maxAttempts: 5,
    },
    context(audits),
  );
  const email = await createReportEmailDeliveryJobHandler(service())(
    {
      id: "job-email-1",
      workspaceId,
      type: REPORT_EMAIL_DELIVERY_JOB,
      payload: { reportId, recipient: "customer@example.test" },
      idempotencyKey: `report-email:${reportId}`,
      attempt: 1,
      maxAttempts: 5,
    },
    context(audits),
  );

  assert.deepEqual(pdf, {
    status: "succeeded",
    metadata: { reportId, assetId: "asset-1", snapshotSha256: "b".repeat(64) },
  });
  assert.deepEqual(email, {
    status: "succeeded",
    metadata: { reportId, deliveryId: "delivery-1", deliveryStatus: "delivered", snapshotSha256: "b".repeat(64) },
  });
  assert.doesNotMatch(JSON.stringify(audits), /customer@example\.test/);
});

test("24시간 provider 멱등 창이 끝난 delivery는 중복 위험 없이 terminal 처리한다", async () => {
  const handler = createReportEmailDeliveryJobHandler(service({
    deliverEmail: async () => { throw new ReportDeliveryError("EMAIL_IDEMPOTENCY_EXPIRED"); },
  }));
  const result = await handler(
    {
      id: "job-email-expired",
      workspaceId,
      type: REPORT_EMAIL_DELIVERY_JOB,
      payload: { reportId, recipient: "customer@example.test" },
      idempotencyKey: `report-email:${reportId}`,
      attempt: 5,
      maxAttempts: 5,
    },
    context(),
  );
  assert.deepEqual(result, { status: "dead", error: "REPORT_EMAIL_IDEMPOTENCY_EXPIRED" });
});

test("Resend idempotency payload 충돌은 재시도하지 않고 terminal 처리한다", async () => {
  const handler = createReportEmailDeliveryJobHandler(service({
    deliverEmail: async () => { throw new ReportDeliveryError("EMAIL_PROVIDER_REJECTED"); },
  }));
  const result = await handler(
    {
      id: "job-email-rejected",
      workspaceId,
      type: REPORT_EMAIL_DELIVERY_JOB,
      payload: { reportId, recipient: "customer@example.test" },
      idempotencyKey: `report-email:${reportId}`,
      attempt: 1,
      maxAttempts: 5,
    },
    context(),
  );
  assert.deepEqual(result, { status: "dead", error: "REPORT_EMAIL_PROVIDER_REJECTED" });
});

test("suppressed report email은 worker가 재시도하지 않고 terminal 처리한다", async () => {
  const handler = createReportEmailDeliveryJobHandler(service({
    deliverEmail: async () => { throw new ReportDeliveryError("EMAIL_SUPPRESSED"); },
  }));
  const result = await handler(
    {
      id: "job-email-suppressed",
      workspaceId,
      type: REPORT_EMAIL_DELIVERY_JOB,
      payload: { reportId, recipient: "customer@example.test" },
      idempotencyKey: `report-email:${reportId}`,
      attempt: 1,
      maxAttempts: 5,
    },
    context(),
  );
  assert.deepEqual(result, { status: "dead", error: "REPORT_EMAIL_SUPPRESSED" });
});
