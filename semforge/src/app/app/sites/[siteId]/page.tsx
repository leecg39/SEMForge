// @TASK P4-F1-T1 - Live site detail and tracking page
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
import { AppShell } from "@/components/core-shell/app-shell";
import { Breadcrumb, PageHeader } from "@/components/core-shell/page-structure";
import { ProductLimitSummary } from "@/components/core-shell/product-limit-summary";
import { SiteDetailWorkspace } from "@/components/product/site-detail-workspace";

export default async function SiteDetailPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;

  return (
    <AppShell active="sites">
      <Breadcrumb href="/app/sites" label="사이트 목록" />
      <PageHeader
        eyebrow="사이트 관측 설정"
        title="사이트 상세"
        description="Google 순위 키워드, AI Overview 프롬프트와 Search Console 속성 연결 상태를 확인합니다."
      />
      <div className="sf-page-stack">
        <SiteDetailWorkspace siteId={siteId} />
        <ProductLimitSummary />
      </div>
    </AppShell>
  );
}
