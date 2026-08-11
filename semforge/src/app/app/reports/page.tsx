// @TASK P1-F1-T1 - Weekly reports collection page
// @SPEC SEMForge paid beta plan#immutable-weekly-reports
// @TEST src/components/core-shell/allowed-pages.test.ts
import { AppShell } from "@/components/core-shell/app-shell";
import { DataEndpointBoundary } from "@/components/core-shell/data-endpoint-boundary";
import { ContentCard, PageHeader } from "@/components/core-shell/page-structure";

export default function ReportsPage() {
  return (
    <AppShell active="reports">
      <PageHeader
        eyebrow="불변 스냅샷"
        title="주간 리포트"
        description="웹·이메일·PDF가 공유하는 동일한 주간 스냅샷을 확인합니다."
      />
      <div className="sf-page-stack">
        <DataEndpointBoundary
          endpoint="/api/v1/reports"
          resourceLabel="주간 리포트"
          emptyTitle="아직 발행된 리포트가 없습니다"
          emptyDescription="첫 수집이 완료되면 월요일 오전에 확인 가능한 데이터로 주간 리포트를 만듭니다."
        />
        <ContentCard eyebrow="발행 원칙" title="발송 후 조용히 바뀌지 않습니다">
          <p className="sf-body-copy">
            늦게 도착한 데이터는 이미 발행된 스냅샷을 변경하지 않습니다. 누락된 공급자 영역은
            확인 불가 상태와 수집 시각을 함께 기록합니다.
          </p>
        </ContentCard>
      </div>
    </AppShell>
  );
}
