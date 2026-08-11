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
import { BillingSummaryView } from "./billing-workspace";
import { OverviewReadyView } from "./overview-dashboard";
import { ReportSnapshotView } from "./report-detail-workspace";
import { GscConnectionsReadyView } from "./settings-workspace";
import { SiteDetailView } from "./site-detail-workspace";
import { SitesReadyView } from "./sites-workspace";

function render(node: React.ReactNode) {
  return renderToStaticMarkup(createElement("div", null, node));
}

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
