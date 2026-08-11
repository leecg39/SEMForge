// @TASK P4-F1-T1 - Korean immutable weekly report detail
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
import { AppShell } from "@/components/core-shell/app-shell";
import { Breadcrumb, PageHeader } from "@/components/core-shell/page-structure";
import { ReportDetailWorkspace } from "@/components/product/report-detail-workspace";

export default async function ReportDetailPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;

  return (
    <AppShell active="reports">
      <Breadcrumb href="/app/reports" label="리포트 목록" />
      <PageHeader
        eyebrow="발행된 스냅샷"
        title="주간 리포트 상세"
        description="Google 순위, AI Overview, Search Console, NAVER 수요의 확인 상태를 같은 시점 기준으로 보여드립니다."
      />
      <div className="sf-page-stack">
        <ReportDetailWorkspace reportId={reportId} />
      </div>
    </AppShell>
  );
}
