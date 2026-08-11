// @TASK P1-F1-T1 - Weekly report detail API boundary
// @SPEC SEMForge paid beta plan#immutable-weekly-reports
import { AppShell } from "@/components/core-shell/app-shell";
import { DataEndpointBoundary } from "@/components/core-shell/data-endpoint-boundary";
import { Breadcrumb, PageHeader } from "@/components/core-shell/page-structure";

export default async function ReportDetailPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const endpoint = `/api/v1/reports/${encodeURIComponent(reportId)}` as `/api/v1/${string}`;

  return (
    <AppShell active="reports">
      <Breadcrumb href="/app/reports" label="리포트 목록" />
      <PageHeader
        eyebrow="발행된 스냅샷"
        title="주간 리포트 상세"
        description="Google 순위, AI Overview, Search Console, NAVER 수요의 확인 상태를 같은 시점 기준으로 보여드립니다."
      />
      <div className="sf-page-stack">
        <DataEndpointBoundary
          endpoint={endpoint}
          resourceLabel="리포트 상세"
          emptyTitle="리포트를 찾을 수 없습니다"
          emptyDescription="주소가 올바른지 확인하거나 리포트 목록에서 다시 선택해 주세요."
        />
      </div>
    </AppShell>
  );
}
