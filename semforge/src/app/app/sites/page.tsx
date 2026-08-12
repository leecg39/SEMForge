// @TASK P4-F1-T1 - Live sites collection page
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/components/core-shell/allowed-pages.test.ts
import { AppShell } from "@/components/core-shell/app-shell";
import { PageHeader } from "@/components/core-shell/page-structure";
import { ProductLimitSummary } from "@/components/core-shell/product-limit-summary";
import { SitesWorkspace } from "@/components/product/sites-workspace";

export default function SitesPage() {
  return (
    <AppShell active="sites">
      <PageHeader
        eyebrow="측정 대상"
        title="사이트"
        description="고객 도메인과 사이트별 추적 항목을 관리합니다. 실제 연결 전에는 수치를 표시하지 않습니다."
      />
      <div className="sf-page-stack">
        <SitesWorkspace />
        <ProductLimitSummary />
      </div>
    </AppShell>
  );
}
