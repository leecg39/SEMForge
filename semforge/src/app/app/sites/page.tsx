// @TASK P1-F1-T1 - Sites collection page
// @SPEC SEMForge paid beta plan#sites
// @TEST src/components/core-shell/allowed-pages.test.ts
import { AppShell } from "@/components/core-shell/app-shell";
import { DataEndpointBoundary } from "@/components/core-shell/data-endpoint-boundary";
import { PageHeader } from "@/components/core-shell/page-structure";
import { ProductLimitSummary } from "@/components/core-shell/product-limit-summary";

export default function SitesPage() {
  return (
    <AppShell active="sites">
      <PageHeader
        eyebrow="측정 대상"
        title="사이트"
        description="고객 도메인과 사이트별 추적 항목을 관리합니다. 실제 연결 전에는 수치를 표시하지 않습니다."
      />
      <div className="sf-page-stack">
        <DataEndpointBoundary
          endpoint="/api/v1/sites"
          resourceLabel="사이트"
          emptyTitle="등록된 사이트가 없습니다"
          emptyDescription="초대 온보딩에서 첫 고객 사이트를 등록하면 추적 항목 설정을 시작할 수 있습니다."
        />
        <ProductLimitSummary />
      </div>
    </AppShell>
  );
}
