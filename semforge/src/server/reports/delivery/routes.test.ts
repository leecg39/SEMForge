// @TASK P4-R1-T1 - Tenant-bound short-lived report PDF URL API contract
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import assert from "node:assert/strict";
import { test } from "node:test";

import { createReportPdfDownloadRouteHandler } from "@/server/reports/delivery/routes";
import { ReportDeliveryStoreError } from "@/server/reports/delivery/store";
import type { BillingAccessAuthorizer } from "@/server/billing/access";
import {
  WorkspacePrivacyOperationBlockedError,
  type WorkspacePrivacyOperationGuard,
} from "@/server/privacy/operation";
import { snapshotSha256 } from "@/server/reports/rendering/html";
import type { WeeklyReportSnapshot } from "@/server/reports/types";

const workspaceId = "59000000-0000-4000-8000-000000000001";
const otherWorkspaceId = "59000000-0000-4000-8000-000000000099";
const reportId = "59000000-0000-4000-8000-000000000002";

const allowBillingAccess: BillingAccessAuthorizer = async () => ({
  allowed: true,
  mode: "full",
  reason: "active",
  reportPeriodEndBefore: null,
});

const allowPrivacyOperation: WorkspacePrivacyOperationGuard = {
  async withShared(_workspaceId, operation) {
    return operation({
      async query<T>() {
        return { rows: [] as T[] };
      },
    });
  },
};

function snapshot(): WeeklyReportSnapshot {
  const section = (key: "rank" | "aio" | "naver" | "gsc") => ({
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
    brand: { name: "SEMForge", logoUrl: null, accentColor: "#155eef" },
    sections: { rank: section("rank"), aio: section("aio"), naver: section("naver"), gsc: section("gsc") },
  };
}

test("인증 tenant의 PDF asset만 60초 signed URL로 반환하고 응답을 캐시하지 않는다", async () => {
  const value = snapshot();
  const hash = snapshotSha256(value);
  const lookups: unknown[] = [];
  const handler = createReportPdfDownloadRouteHandler({
    authorizeBilling: allowBillingAccess,
    privacyOperation: allowPrivacyOperation,
    resolveSession: async () => ({
      userId: "user-1",
      workspaceId,
      role: "owner",
      sessionId: "session-1",
      requestId: "request-1",
    }),
    store: {
      async loadReportForAccess(input) {
        lookups.push(input);
        return { snapshot: value, periodEnd: "2026-08-06" };
      },
      async findPdfAsset(input) {
        lookups.push(input);
        return {
          id: "asset-1",
          workspaceId,
          reportId,
          storageKey: input.storageKey,
          checksumSha256: "a".repeat(64),
          sizeBytes: 123,
        };
      },
    },
    storage: {
      async createSignedGetUrl(key, input) {
        assert.equal(input.expiresInSeconds, 60);
        return {
          url: `https://objects.example.test/${key}?X-Amz-Expires=60&X-Amz-Signature=signed`,
          expiresAt: new Date("2026-08-12T01:01:00.000Z"),
        };
      },
    },
  });

  const response = await handler(
    new Request(`https://app.semforge.example/api/v1/reports/${reportId}/pdf`),
    { params: Promise.resolve({ reportId }) },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.deepEqual(body.data, {
    url: `https://objects.example.test/reports/${workspaceId}/${reportId}/${hash}.pdf?X-Amz-Expires=60&X-Amz-Signature=signed`,
    expiresAt: "2026-08-12T01:01:00.000Z",
    snapshotSha256: hash,
  });
  assert.deepEqual(lookups, [
    { workspaceId, reportId },
    { workspaceId, reportId, storageKey: `reports/${workspaceId}/${reportId}/${hash}.pdf` },
  ]);
});

test("다른 tenant session은 asset 존재 여부와 signed URL을 알 수 없다", async () => {
  let signed = false;
  const handler = createReportPdfDownloadRouteHandler({
    authorizeBilling: allowBillingAccess,
    privacyOperation: allowPrivacyOperation,
    resolveSession: async () => ({
      userId: "user-2",
      workspaceId: otherWorkspaceId,
      role: "member",
      sessionId: "session-2",
      requestId: "request-2",
    }),
    store: {
      async loadReportForAccess() { throw new ReportDeliveryStoreError("NOT_FOUND"); },
      async findPdfAsset() { return null; },
    },
    storage: {
      async createSignedGetUrl() {
        signed = true;
        throw new Error("must not sign");
      },
    },
  });
  const response = await handler(
    new Request(`https://app.semforge.example/api/v1/reports/${reportId}/pdf`),
    { params: Promise.resolve({ reportId }) },
  );
  assert.equal(response.status, 404);
  assert.equal(signed, false);
});

test("past_due grace PDF는 tenant-loaded 실제 periodEnd가 현재기간 전일 때만 서명한다", async () => {
  let periodEnd = "2026-07-31";
  let signed = 0;
  const handler = createReportPdfDownloadRouteHandler({
    privacyOperation: allowPrivacyOperation,
    resolveSession: async () => ({
      userId: "user-1",
      workspaceId,
      role: "member",
      requestId: "past-due-pdf",
    }),
    authorizeBilling: async ({ reportPeriodEnd }) => ({
      allowed: reportPeriodEnd!.getTime() < Date.parse("2026-08-01T00:00:00.000Z"),
      mode: "past_reports_only",
      reason: "past_due_grace",
      reportPeriodEndBefore: new Date("2026-08-01T00:00:00.000Z"),
    }),
    store: {
      async loadReportForAccess() {
        return { snapshot: snapshot(), periodEnd };
      },
      async findPdfAsset(input) {
        return {
          id: "asset-1",
          workspaceId,
          reportId,
          storageKey: input.storageKey,
          checksumSha256: "a".repeat(64),
          sizeBytes: 123,
        };
      },
    },
    storage: {
      async createSignedGetUrl(key) {
        signed += 1;
        return {
          url: `https://objects.example.test/${key}`,
          expiresAt: new Date("2026-08-12T01:01:00.000Z"),
        };
      },
    },
  });
  const request = () => new Request(`https://app.semforge.example/api/v1/reports/${reportId}/pdf`);
  const context = () => ({ params: Promise.resolve({ reportId }) });

  assert.equal((await handler(request(), context())).status, 200);
  periodEnd = "2026-08-01";
  assert.equal((await handler(request(), context())).status, 403);
  assert.equal(signed, 1);
});

for (const scenario of [
  { label: "blocking", state: "blocking" as const },
  { label: "erased", state: "erased" as const },
  { label: "missing control", state: "blocking" as const },
]) {
  test(`${scenario.label} workspace PDF 접근은 report/billing/storage delegate를 0회 호출하고 409다`, async () => {
    let reportLoads = 0;
    let billingCalls = 0;
    let signedUrls = 0;
    const handler = createReportPdfDownloadRouteHandler({
      privacyOperation: {
        async withShared() {
          throw new WorkspacePrivacyOperationBlockedError(scenario.state);
        },
      },
      authorizeBilling: async () => {
        billingCalls += 1;
        return allowBillingAccess({ workspaceId, capability: "report:read" });
      },
      resolveSession: async () => ({
        userId: "user-1",
        workspaceId,
        role: "owner",
        requestId: `privacy-${scenario.label}`,
      }),
      store: {
        async loadReportForAccess() {
          reportLoads += 1;
          return { snapshot: snapshot(), periodEnd: "2026-08-06" };
        },
        async findPdfAsset() {
          throw new Error("must not load asset");
        },
      },
      storage: {
        async createSignedGetUrl() {
          signedUrls += 1;
          throw new Error("must not sign");
        },
      },
    });

    const response = await handler(
      new Request(`https://app.semforge.example/api/v1/reports/${reportId}/pdf`),
      { params: Promise.resolve({ reportId }) },
    );
    assert.equal(response.status, 409);
    assert.equal((await response.json() as { error: { code: string } }).error.code, "CONFLICT");
    assert.equal(reportLoads, 0);
    assert.equal(billingCalls, 0);
    assert.equal(signedUrls, 0);
  });
}

test("active workspace PDF signed URL 생성이 끝날 때까지 shared privacy fence를 유지한다", async () => {
  const events: string[] = [];
  const value = snapshot();
  const hash = snapshotSha256(value);
  const handler = createReportPdfDownloadRouteHandler({
    privacyOperation: {
      async withShared(_workspaceId, operation) {
        events.push("fence-enter");
        const result = await operation({
          async query<T>() {
            return { rows: [] as T[] };
          },
        });
        events.push("fence-exit");
        return result;
      },
    },
    authorizeBilling: allowBillingAccess,
    resolveSession: async () => ({
      userId: "user-1",
      workspaceId,
      role: "owner",
      requestId: "privacy-active-pdf",
    }),
    store: {
      async loadReportForAccess() {
        events.push("report-load");
        return { snapshot: value, periodEnd: "2026-08-06" };
      },
      async findPdfAsset(input) {
        events.push("asset-load");
        return {
          id: "asset-1",
          workspaceId,
          reportId,
          storageKey: input.storageKey,
          checksumSha256: "a".repeat(64),
          sizeBytes: 123,
        };
      },
    },
    storage: {
      async createSignedGetUrl(key) {
        events.push("signed-url");
        assert.equal(key, `reports/${workspaceId}/${reportId}/${hash}.pdf`);
        return {
          url: `https://objects.example.test/${key}`,
          expiresAt: new Date("2026-08-12T01:01:00.000Z"),
        };
      },
    },
  });

  const response = await handler(
    new Request(`https://app.semforge.example/api/v1/reports/${reportId}/pdf`),
    { params: Promise.resolve({ reportId }) },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(events, [
    "fence-enter",
    "report-load",
    "asset-load",
    "signed-url",
    "fence-exit",
  ]);
});
