"use client";

// @TASK P4-F1-T1 - Honest multi-resource product overview
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/components/product/product-ui.test.tsx
import Link from "next/link";

import { ContentCard, SetupSteps } from "@/components/core-shell/page-structure";
import { StatusPanel } from "@/components/core-shell/status-panel";

import { useApiResource } from "./api-client";
import {
  parseGscConnections,
  parseReportsPage,
  parseSitesPage,
  type GscConnectionsView,
  type ReportsPageView,
  type SitesPageView,
} from "./contracts";
import { formatDateTimeKo, formatPeriodKo } from "./format";
import { ResourcePanel } from "./resource-panel";

export function OverviewReadyView({
  sites,
  reports,
  connections,
}: {
  sites: SitesPageView;
  reports: ReportsPageView;
  connections: GscConnectionsView;
}) {
  const activeSites = sites.items.filter((site) => site.active).length;
  const partialReports = reports.items.filter((report) => report.status === "partial").length;
  const latest = reports.items[0];
  return (
    <div className="sf-page-stack">
      <section className="sf-observation-strip" aria-label="실제 등록 및 발행 현황">
        <Link href="/app/sites">
          <small>활성 사이트</small>
          <strong>{activeSites} / 3</strong>
          <span>등록 전체 {sites.items.length}개</span>
        </Link>
        <Link href="/app/reports">
          <small>발행 리포트</small>
          <strong>{reports.items.length}건</strong>
          <span>{partialReports > 0 ? `일부 데이터 ${partialReports}건` : "누락 표시 원칙 적용"}</span>
        </Link>
        <Link href="/app/settings">
          <small>Search Console 연결</small>
          <strong>{connections.items.length}개</strong>
          <span>webmasters.readonly</span>
        </Link>
      </section>
      {latest ? (
        <ContentCard eyebrow="가장 최근 불변 스냅샷" title={formatPeriodKo(latest.period.start, latest.period.end)}>
          <div className="sf-latest-report">
            <div>
              <span className={`sf-state-chip ${latest.status === "partial" ? "sf-state-chip--warning" : "sf-state-chip--success"}`}>{latest.status === "partial" ? "일부 데이터" : "스냅샷 준비됨"}</span>
              <p>{latest.snapshotReadyAt ? `${formatDateTimeKo(latest.snapshotReadyAt)} 고정` : "고정 시각 확인 불가"}</p>
              <small>{latest.brand.name} 브랜드 스냅샷</small>
            </div>
            <Link className="sf-button sf-button--primary" href={`/app/reports/${latest.id}`}>리포트 열기</Link>
          </div>
        </ContentCard>
      ) : (
        <StatusPanel status="empty" title="아직 발행된 리포트가 없습니다" description="등록·연결·추적 항목을 준비하면 월요일 오전에 확인 가능한 값으로 첫 스냅샷을 만듭니다." />
      )}
      {(activeSites === 0 || connections.items.length === 0 || reports.items.length === 0) ? (
        <ContentCard eyebrow="시작 순서" title="첫 리포트 준비"><SetupSteps /></ContentCard>
      ) : null}
    </div>
  );
}

export function OverviewDashboard() {
  const sites = useApiResource("/api/v1/sites", parseSitesPage);
  const reports = useApiResource("/api/v1/reports", parseReportsPage);
  const connections = useApiResource("/api/v1/integrations/gsc/connections", parseGscConnections);
  const states = [sites.state, reports.state, connections.state] as const;
  const allReady = states.every((state) => state.status === "ready");
  const allLoading = states.every((state) => state.status === "loading");

  if (allReady) {
    return (
      <div data-endpoints="/api/v1/sites /api/v1/reports /api/v1/integrations/gsc/connections">
        <OverviewReadyView
          sites={sites.state.status === "ready" ? sites.state.data : { items: [], nextCursor: null }}
          reports={reports.state.status === "ready" ? reports.state.data : { items: [], nextCursor: null }}
          connections={connections.state.status === "ready" ? connections.state.data : { items: [] }}
        />
      </div>
    );
  }
  if (allLoading) return <div data-endpoints="/api/v1/sites /api/v1/reports /api/v1/integrations/gsc/connections"><StatusPanel status="loading" title="주간 관측 현황을 확인하고 있습니다" /></div>;
  return (
    <div className="sf-page-stack" data-endpoints="/api/v1/sites /api/v1/reports /api/v1/integrations/gsc/connections">
      <StatusPanel status="partial" title="일부 현황만 확인되었습니다" description="불러온 실제 응답만 표시하며 실패한 영역은 임의 값으로 채우지 않습니다." />
      <ResourcePanel state={sites.state} label="사이트" onRetry={sites.reload}>{(value) => <p className="sf-resource-confirmed">사이트 응답 확인 · {value.items.length}개</p>}</ResourcePanel>
      <ResourcePanel state={reports.state} label="리포트" onRetry={reports.reload}>{(value) => <p className="sf-resource-confirmed">리포트 응답 확인 · {value.items.length}건</p>}</ResourcePanel>
      <ResourcePanel state={connections.state} label="Search Console 연결" onRetry={connections.reload}>{(value) => <p className="sf-resource-confirmed">Search Console 응답 확인 · {value.items.length}개</p>}</ResourcePanel>
    </div>
  );
}
