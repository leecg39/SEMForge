// @TASK P4-F1-T1 - Product UI public behavior contracts
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST This file
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  parseBillingSummary,
  parseReportDetail,
  parseSiteDetail,
  productAccessFor,
} from "./contracts";
import { loadApiResource } from "./api-client";
import { BillingSummaryView } from "./billing-workspace";
import { OverviewReadyView } from "./overview-dashboard";
import {
  ReportPdfDownload,
  ReportSnapshotView,
  openReportPdf,
  parseReportPdfDownload,
  reserveReportPdfPopup,
} from "./report-detail-workspace";
import { GscConnectionsReadyView } from "./settings-workspace";
import { SiteDetailView } from "./site-detail-workspace";
import { SitesReadyView } from "./sites-workspace";

function render(node: React.ReactNode) {
  return renderToStaticMarkup(createElement("div", null, node));
}

test("구현된 읽기 API의 404는 미구현 대기 상태가 아니라 실제 오류로 표시한다", async () => {
  const state = await loadApiResource(
    "/api/v1/sites/0198a219-4d49-7dce-9d9a-536822c04da8",
    parseSiteDetail,
    undefined,
    async () => Response.json(
      {
        data: null,
        error: { code: "NOT_FOUND", message: "사이트를 찾을 수 없습니다." },
        requestId: "site-not-found",
      },
      { status: 404 },
    ),
  );

  assert.deepEqual(state, {
    status: "error",
    message: "사이트를 찾을 수 없습니다.",
    requestId: "site-not-found",
  });
});

const site = {
  id: "0198a219-4d49-7dce-9d9a-536822c04da8",
  workspaceId: "0198a219-0000-7000-8000-000000000001",
  name: "서울 공방",
  domain: "atelier.example",
  timezone: "Asia/Seoul",
  active: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
} as const;

test("사이트 목록은 실제 레코드와 3개 한도를 보여 주되 workspace 식별자는 노출하지 않는다", () => {
  const html = render(
    createElement(SitesReadyView, {
      sites: [site, { ...site, id: "0198a219-4d49-7dce-9d9a-536822c04da9", name: "중지된 쇼핑몰", active: false }],
      canWrite: true,
      pendingId: null,
      onToggle: () => undefined,
    }),
  );

  assert.match(html, /서울 공방/);
  assert.match(html, /atelier\.example/);
  assert.match(html, /활성 1\s*\/\s*3/);
  assert.match(html, /중지됨/);
  assert.match(html, /href="\/app\/sites\/0198a219-4d49-7dce-9d9a-536822c04da8"/);
  assert.doesNotMatch(html, /0198a219-0000-7000-8000-000000000001/);
});

test("사이트 상세 계약은 rank/AIO 추적과 GSC binding을 읽고 tenant override를 버린다", () => {
  const detail = parseSiteDetail({
    site,
    tracking: {
      rank: [{
        id: "0198a219-4d49-7dce-9d9a-536822c04db0",
        workspaceId: site.workspaceId,
        siteId: site.id,
        type: "rank",
        query: "성수 수제 가구",
        normalizedQuery: "성수 수제 가구",
        active: true,
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
        collection: { engine: "google", country: "KR", language: "ko", device: "desktop", depth: 100 },
      }],
      aio: [],
    },
    gscBinding: {
      id: "0198a219-4d49-7dce-9d9a-536822c04db1",
      workspaceId: site.workspaceId,
      siteId: site.id,
      connectionId: "0198a219-4d49-7dce-9d9a-536822c04db2",
      propertyUri: "sc-domain:atelier.example",
      createdAt: "2026-08-03T00:00:00.000Z",
    },
  });

  assert.ok(detail);
  assert.equal(detail.site.name, "서울 공방");
  assert.equal(detail.tracking.rank[0]?.query, "성수 수제 가구");
  assert.equal(detail.gscBinding?.propertyUri, "sc-domain:atelier.example");
  assert.equal("workspaceId" in detail.site, false);
  assert.equal("workspaceId" in detail.tracking.rank[0]!, false);

  const html = render(
    createElement(SiteDetailView, {
      detail,
      canWrite: false,
      pendingId: null,
      onToggleSite: () => undefined,
      onToggleTracking: () => undefined,
    }),
  );
  assert.match(html, /성수 수제 가구/);
  assert.match(html, /1\s*\/\s*20/);
  assert.match(html, /0\s*\/\s*20/);
  assert.match(html, /sc-domain:atelier\.example/);
  assert.match(html, /읽기 전용/);
  assert.match(html, /disabled=""/);
});

test("불변 리포트는 확인된 값과 누락 section을 한글로 렌더하고 workspace ID를 숨긴다", () => {
  const detail = parseReportDetail({
    id: "0198a219-4d49-7dce-9d9a-536822c04dc0",
    workspaceId: site.workspaceId,
    siteId: site.id,
    status: "partial",
    period: { start: "2026-08-01", end: "2026-08-07", comparisonStart: "2026-07-25", comparisonEnd: "2026-07-31" },
    brand: { name: "서울 공방 SEO", logoUrl: null, accentColor: "#0f675f" },
    snapshotReadyAt: "2026-08-10T23:00:00.000Z",
    deliveredAt: null,
    createdAt: "2026-08-10T23:00:00.000Z",
    updatedAt: "2026-08-10T23:00:00.000Z",
    snapshot: {
      version: 1,
      capturedAt: "2026-08-10T23:00:00.000Z",
      schedule: {
        timezone: "Asia/Seoul",
        collectionAt: "2026-08-10T09:00:00.000Z",
        retryCutoffAt: "2026-08-10T22:00:00.000Z",
        snapshotAt: "2026-08-10T23:00:00.000Z",
      },
      period: {
        timezone: "America/Los_Angeles",
        current: { start: "2026-08-01", end: "2026-08-07" },
        comparison: { start: "2026-07-25", end: "2026-07-31" },
      },
      brand: { name: "서울 공방 SEO", logoUrl: null, accentColor: "#0f675f" },
      sections: {
        rank: {
          key: "rank",
          available: true,
          unavailableReason: null,
          capturedAt: "2026-08-10T09:20:00.000Z",
          data: { observations: [{ query: "성수 공방", observedAt: "2026-08-10T09:20:00.000Z", position: 7, resultUrl: "https://atelier.example", resultTitle: "서울 공방" }] },
        },
        aio: { key: "aio", available: false, unavailableReason: "provider_data_missing", capturedAt: "2026-08-10T23:00:00.000Z", data: { observations: [] } },
        naver: { key: "naver", available: false, unavailableReason: "provider_data_missing", capturedAt: "2026-08-10T23:00:00.000Z", data: { observations: [] } },
        gsc: { key: "gsc", available: false, unavailableReason: "provider_data_missing", capturedAt: "2026-08-10T23:00:00.000Z", data: { current: [], comparison: [] } },
      },
    },
    sections: [],
  });

  assert.ok(detail);
  const html = render(createElement(ReportSnapshotView, { report: detail }));
  assert.match(html, /발행 후 변경되지 않는 스냅샷/);
  assert.match(html, /Google 순위/);
  assert.match(html, /성수 공방/);
  assert.match(html, />7위</);
  assert.match(html, /AI Overview/);
  assert.match(html, /공급자 데이터가 확인되지 않았습니다/);
  assert.match(html, /일부 데이터/);
  assert.doesNotMatch(html, /0198a219-0000-7000-8000-000000000001|workspaceId|undefined/);
  assert.doesNotMatch(html, /<input|<textarea/);
});

test("past_due 구독은 과거 리포트 외 화면을 읽기 전용으로 만들고 결제 복구는 허용한다", () => {
  const summary = parseBillingSummary({
    status: "past_due",
    amountKrw: 49000,
    currentPeriodStart: "2026-08-01T00:00:00.000Z",
    currentPeriodEnd: "2026-09-01T00:00:00.000Z",
    graceEndsAt: "2026-08-08T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    nextRetryAt: "2026-08-06T00:00:00.000Z",
    policy: {
      timing: "period_end",
      proratedRefund: false,
      statutoryExceptionsApply: true,
      notice: "일할 환불은 제공하지 않으며 법정 예외는 적용됩니다.",
    },
  });

  assert.ok(summary);
  assert.deepEqual(productAccessFor(summary), {
    canWrite: false,
    pastReportsOnly: true,
    reason: "past_due",
  });

  const html = render(
    createElement(BillingSummaryView, {
      summary,
      pendingAction: null,
      onRetry: () => undefined,
      onCancel: () => undefined,
    }),
  );
  assert.match(html, /미납/);
  assert.match(html, /과거 리포트만 읽을 수 있습니다/);
  assert.match(html, /결제 다시 시도/);
  assert.match(html, /49,000원/);
});

test("결제 대기 구독은 이미 제공되는 Toss 연결 화면을 정확히 안내한다", () => {
  const summary = parseBillingSummary({
    status: "account_created",
    amountKrw: 49000,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    graceEndsAt: null,
    cancelAtPeriodEnd: false,
    nextRetryAt: null,
    policy: {
      timing: "period_end",
      proratedRefund: false,
      statutoryExceptionsApply: true,
      notice: "일할 환불은 제공하지 않으며 법정 예외는 적용됩니다.",
    },
  });

  assert.ok(summary);
  const html = render(
    createElement(BillingSummaryView, {
      summary,
      pendingAction: null,
      onRetry: () => undefined,
      onCancel: () => undefined,
    }),
  );
  assert.match(html, /위 결제 수단 연결 카드에서 Toss 자동결제 인증을 완료하세요/);
  assert.doesNotMatch(html, /결제 수단 연결 화면을 준비 중입니다/);
});

test("계약 파서는 임의 KPI·잘못된 색상·불완전 tenant 응답을 수용하지 않는다", () => {
  assert.equal(parseSiteDetail({ site: { name: "ID 없음" }, tracking: { rank: [], aio: [] }, gscBinding: null }), null);
  assert.equal(parseReportDetail({ status: "partial", snapshot: { version: 2 } }), null);
  assert.equal(parseBillingSummary({ status: "premium", amountKrw: 0 }), null);
});

test("개요는 실제 API 건수와 준비 순서만 표시하고 임의 성과 KPI를 만들지 않는다", () => {
  const html = render(createElement(OverviewReadyView, {
    sites: { items: [site], nextCursor: null },
    reports: { items: [], nextCursor: null },
    connections: { items: [] },
  }));

  assert.match(html, /활성 사이트/);
  assert.match(html, /1\s*\/\s*3/);
  assert.match(html, /발행 리포트/);
  assert.match(html, /0건/);
  assert.match(html, /Search Console 연결/);
  assert.match(html, /첫 리포트 준비/);
  assert.doesNotMatch(html, /가시성 점수|예상 트래픽|\+\d+%/);
});

test("GSC 연결 목록은 readonly scope와 실제 만료 시각만 보여 주고 tenant ID를 숨긴다", () => {
  const html = render(createElement(GscConnectionsReadyView, {
    connections: [{
      id: "0198a219-4d49-7dce-9d9a-536822c04de0",
      label: "고객사 Search Console",
      tokenExpiresAt: "2026-08-13T00:00:00.000Z",
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    }],
    canWrite: false,
    pendingId: null,
    onSelect: () => undefined,
    onDisconnect: () => undefined,
  }));

  assert.match(html, /고객사 Search Console/);
  assert.match(html, /읽기 전용/);
  assert.match(html, /disabled=""/);
  assert.doesNotMatch(html, /workspaceId|0198a219-0000-7000-8000-000000000001/);
});

test("리포트 PDF 다운로드는 signed URL을 메모리에만 두고 새 창에서 연다", async () => {
  const signedUrl = "https://objects.example.test/report.pdf?X-Amz-Signature=short-lived";
  assert.deepEqual(parseReportPdfDownload({
    url: signedUrl,
    expiresAt: "2026-08-12T01:01:00.000Z",
    snapshotSha256: "a".repeat(64),
  }), { url: signedUrl, expiresAt: "2026-08-12T01:01:00.000Z" });
  assert.equal(parseReportPdfDownload({ url: "javascript:alert(1)", expiresAt: "2026-08-12T01:01:00.000Z" }), null);

  const fetchCalls: Array<{ input: string; init?: RequestInit }> = [];
  const opened: Array<{ url: string; target: string }> = [];
  const navigated: string[] = [];
  let closed = 0;
  const popup = {
    opener: {} as unknown,
    location: { replace: (url: string) => navigated.push(url) },
    close: () => { closed += 1; },
  };
  const reserved = reserveReportPdfPopup((url, target) => {
    opened.push({ url, target });
    return popup;
  });
  await openReportPdf(
    "0198a219-4d49-7dce-9d9a-536822c04dc0",
    reserved,
    async (input, init) => {
      fetchCalls.push({ input: String(input), init });
      return Response.json({ data: { url: signedUrl, expiresAt: "2026-08-12T01:01:00.000Z", snapshotSha256: "a".repeat(64) }, error: null, requestId: "pdf-1" });
    },
  );

  assert.equal(fetchCalls[0]?.input, "/api/v1/reports/0198a219-4d49-7dce-9d9a-536822c04dc0/pdf");
  assert.equal(fetchCalls[0]?.init?.credentials, "same-origin");
  assert.equal(fetchCalls[0]?.init?.cache, "no-store");
  assert.deepEqual(opened, [{ url: "about:blank", target: "_blank" }]);
  assert.equal(popup.opener, null);
  assert.deepEqual(navigated, [signedUrl]);
  assert.equal(closed, 0);
});

test("리포트 PDF 팝업은 차단 또는 준비 실패를 성공으로 오인하지 않는다", async () => {
  assert.throws(
    () => reserveReportPdfPopup(() => null),
    /새 창을 열지 못했습니다/,
  );

  let closed = 0;
  const popup = {
    opener: null,
    location: { replace: () => assert.fail("준비되지 않은 PDF로 이동하면 안 됩니다") },
    close: () => { closed += 1; },
  };
  await assert.rejects(
    () => openReportPdf(
      "0198a219-4d49-7dce-9d9a-536822c04dc0",
      popup,
      async () => Response.json(
        { data: null, error: { code: "not_found", message: "not ready" }, requestId: "pdf-404" },
        { status: 404 },
      ),
    ),
    /PDF 파일을 준비하고 있습니다/,
  );
  assert.equal(closed, 1);
});

test("리포트 PDF 버튼은 준비·로딩·미납 차단 상태를 명확히 렌더한다", () => {
  const ready = render(createElement(ReportPdfDownload, {
    reportId: "0198a219-4d49-7dce-9d9a-536822c04dc0",
    blockedByPastDue: false,
  }));
  const blocked = render(createElement(ReportPdfDownload, {
    reportId: "0198a219-4d49-7dce-9d9a-536822c04dc0",
    blockedByPastDue: true,
  }));

  assert.match(ready, /PDF 열기/);
  assert.match(ready, /min-height/);
  assert.match(blocked, /PDF는 과거 리포트에서만 열 수 있습니다/);
  assert.match(blocked, /disabled=""/);
});
