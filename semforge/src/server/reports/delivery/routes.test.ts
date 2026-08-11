// @TASK P4-R1-T1 - Tenant-bound short-lived report PDF URL API contract
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import assert from "node:assert/strict";
import { test } from "node:test";

import { createReportPdfDownloadRouteHandler } from "@/server/reports/delivery/routes";
import { ReportDeliveryStoreError } from "@/server/reports/delivery/store";
import { snapshotSha256 } from "@/server/reports/rendering/html";
import type { WeeklyReportSnapshot } from "@/server/reports/types";

const workspaceId = "59000000-0000-4000-8000-000000000001";
const otherWorkspaceId = "59000000-0000-4000-8000-000000000099";
const reportId = "59000000-0000-4000-8000-000000000002";

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
    resolveSession: async () => ({
      userId: "user-1",
      workspaceId,
      role: "owner",
      sessionId: "session-1",
      requestId: "request-1",
    }),
    store: {
      async loadReportSnapshot(input) {
        lookups.push(input);
        return value;
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
    resolveSession: async () => ({
      userId: "user-2",
      workspaceId: otherWorkspaceId,
      role: "member",
      sessionId: "session-2",
      requestId: "request-2",
    }),
    store: {
      async loadReportSnapshot() { throw new ReportDeliveryStoreError("NOT_FOUND"); },
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
