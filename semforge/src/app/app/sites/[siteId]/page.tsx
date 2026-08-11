// @TASK P1-F1-T1 - Site detail API boundary
// @SPEC SEMForge paid beta plan#site-tracking
import { AppShell } from "@/components/core-shell/app-shell";
import { DataEndpointBoundary } from "@/components/core-shell/data-endpoint-boundary";
import { Breadcrumb, PageHeader } from "@/components/core-shell/page-structure";
import { ProductLimitSummary } from "@/components/core-shell/product-limit-summary";

export default async function SiteDetailPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const endpoint = `/api/v1/sites/${encodeURIComponent(siteId)}` as `/api/v1/${string}`;

  return (
    <AppShell active="sites">
      <Breadcrumb href="/app/sites" label="사이트 목록" />
      <PageHeader
        eyebrow="사이트 관측 설정"
        title="사이트 상세"
        description="Google 순위 키워드, AI Overview 프롬프트와 Search Console 속성 연결 상태를 확인합니다."
      />
      <div className="sf-page-stack">
        <DataEndpointBoundary
          endpoint={endpoint}
          resourceLabel="사이트 상세"
          emptyTitle="사이트 설정을 찾을 수 없습니다"
          emptyDescription="주소가 올바른지 확인하거나 사이트 목록에서 다시 선택해 주세요."
        />
        <ProductLimitSummary />
      </div>
    </AppShell>
  );
}
