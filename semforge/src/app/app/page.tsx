// @TASK P4-F1-T1 - Live weekly visibility overview page
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/components/core-shell/allowed-pages.test.ts
import { AppShell } from "@/components/core-shell/app-shell";
import { PageHeader } from "@/components/core-shell/page-structure";
import { OverviewDashboard } from "@/components/product/overview-dashboard";

export default function AppOverviewPage() {
  return (
    <AppShell active="overview">
      <PageHeader
        eyebrow="이번 주 관측"
        title="주간 가시성 개요"
        description="같은 기간과 기준으로 확인된 검색 신호만 보여드립니다."
      />
      <OverviewDashboard />
    </AppShell>
  );
}
