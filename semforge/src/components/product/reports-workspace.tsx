"use client";

// @TASK P4-F1-T1 - Immutable weekly reports list wired to API v1
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/components/product/product-ui.test.tsx
import Link from "next/link";

import { ContentCard } from "@/components/core-shell/page-structure";
import { StatusPanel } from "@/components/core-shell/status-panel";

import { useApiResource } from "./api-client";
import { useBillingAccess } from "./billing-access";
import { parseReportsPage, type ReportStatus, type ReportSummaryView } from "./contracts";
import { formatDateTimeKo, formatPeriodKo } from "./format";
import { ResourcePanel } from "./resource-panel";

const reportStatusCopy: Record<ReportStatus, string> = {
  collecting: "수집 중",
  snapshot_ready: "스냅샷 준비됨",
  rendering: "문서 생성 중",
  delivered: "발송 완료",
  partial: "일부 데이터",
  failed: "생성 실패",
};

export function ReportsReadyView({ reports }: { reports: readonly ReportSummaryView[] }) {
  if (reports.length === 0) {
    return (
      <StatusPanel
        status="empty"
        title="아직 발행된 리포트가 없습니다"
        description="확인 가능한 데이터가 모이면 월요일 오전에 첫 불변 스냅샷을 만듭니다."
      />
    );
  }
  return (
    <ContentCard eyebrow="발행된 실제 데이터" title={`주간 리포트 ${reports.length}건`}>
      <ol className="sf-report-list">
        {reports.map((report) => (
          <li key={report.id}>
            <div className="sf-report-list__period">
              <small>측정 기간</small>
              <strong>{formatPeriodKo(report.period.start, report.period.end)}</strong>
              <span>비교 {formatPeriodKo(report.period.comparisonStart, report.period.comparisonEnd)}</span>
            </div>
            <div className="sf-report-list__meta">
              <span className={`sf-state-chip ${report.status === "partial" || report.status === "failed" ? "sf-state-chip--warning" : "sf-state-chip--success"}`}>
                {reportStatusCopy[report.status]}
              </span>
              <strong>{report.brand.name}</strong>
              <small>{report.snapshotReadyAt ? `${formatDateTimeKo(report.snapshotReadyAt)} 스냅샷` : "스냅샷 시각 확인 불가"}</small>
            </div>
            <Link className="sf-button sf-button--secondary" href={`/app/reports/${report.id}`}>리포트 보기</Link>
          </li>
        ))}
      </ol>
    </ContentCard>
  );
}

export function ReportsWorkspace() {
  const { state, reload } = useApiResource("/api/v1/reports", parseReportsPage);
  const { summaryState, access } = useBillingAccess();

  return (
    <div data-endpoint="/api/v1/reports">
    <ResourcePanel state={state} label="주간 리포트" onRetry={reload}>
      {(page) => {
        const currentPeriodStart = summaryState.status === "ready" ? summaryState.data.currentPeriodStart : null;
        const visibleReports = access.pastReportsOnly
          ? currentPeriodStart
            ? page.items.filter((report) => report.period.end < currentPeriodStart.slice(0, 10))
            : []
          : page.items;
        return (
          <div className="sf-page-stack">
            {access.pastReportsOnly ? (
              <StatusPanel
                status="partial"
                title="과거 리포트만 표시합니다"
                description="미납 유예 기간에는 현재 청구기간보다 앞서 발행된 불변 리포트만 읽을 수 있습니다."
              />
            ) : null}
            <ReportsReadyView reports={visibleReports} />
          </div>
        );
      }}
    </ResourcePanel>
    </div>
  );
}
