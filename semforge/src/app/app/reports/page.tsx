// @TASK P4-F1-T1 - Immutable weekly reports collection page
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/components/core-shell/allowed-pages.test.ts
import { AppShell } from "@/components/core-shell/app-shell";
import { ContentCard, PageHeader } from "@/components/core-shell/page-structure";
import { ReportsWorkspace } from "@/components/product/reports-workspace";

export default function ReportsPage() {
  return (
    <AppShell active="reports">
      <PageHeader
        eyebrow="불변 스냅샷"
        title="주간 리포트"
        description="웹·이메일·PDF가 공유하는 동일한 주간 스냅샷을 확인합니다."
      />
      <div className="sf-page-stack">
        <ReportsWorkspace />
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
