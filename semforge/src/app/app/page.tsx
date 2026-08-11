// @TASK P1-F1-T1 - Weekly visibility overview page
// @SPEC SEMForge paid beta plan#weekly-report-dashboard
// @TEST src/components/core-shell/allowed-pages.test.ts
import { AppShell } from "@/components/core-shell/app-shell";
import { ContentCard, PageHeader, SetupSteps } from "@/components/core-shell/page-structure";
import { StatusPanel } from "@/components/core-shell/status-panel";

export default function AppOverviewPage() {
  return (
    <AppShell active="overview">
      <PageHeader
        eyebrow="이번 주 관측"
        title="주간 가시성 개요"
        description="같은 기간과 기준으로 확인된 검색 신호만 보여드립니다."
      />
      <div className="sf-page-stack">
        <StatusPanel
          status="empty"
          description="사이트를 등록하고 Search Console을 연결하면 첫 수집을 준비합니다. 아직 표시할 실제 수치가 없습니다."
        />
        <ContentCard eyebrow="시작 순서" title="첫 리포트 준비">
          <SetupSteps />
        </ContentCard>
      </div>
    </AppShell>
  );
}
