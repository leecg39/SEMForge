// @TASK P1-F1-T1 - Toss billing boundary page
// @SPEC SEMForge paid beta plan#toss-recurring-billing
import { AppShell } from "@/components/core-shell/app-shell";
import { BillingCheckout } from "@/components/core-shell/billing-checkout";
import { DataEndpointBoundary } from "@/components/core-shell/data-endpoint-boundary";
import { ContentCard, PageHeader } from "@/components/core-shell/page-structure";

export default function BillingPage() {
  return (
    <AppShell active="billing">
      <PageHeader
        eyebrow="구독과 결제"
        title="결제"
        description="Toss 자동결제 상태와 다음 청구 준비 상태를 확인합니다."
      />
      <div className="sf-page-grid">
        <ContentCard eyebrow="비공개 베타" title="주간 가시성 리포트">
          <div className="sf-price">
            <strong>49,000원</strong>
            <span>월 · VAT 포함</span>
          </div>
          <p className="sf-body-copy">사이트 3개와 사이트별 순위 키워드·AI Overview 프롬프트 각 20개가 포함됩니다.</p>
        </ContentCard>
        <BillingCheckout />
        <DataEndpointBoundary
          endpoint="/api/v1/billing/subscription"
          resourceLabel="구독"
          emptyTitle="결제 수단 연결이 필요합니다"
          emptyDescription="Toss 결제창에서 자동결제를 인증한 후 첫 결제가 성공하면 구독이 활성화됩니다."
        />
      </div>
    </AppShell>
  );
}
