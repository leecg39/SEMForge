// @TASK P4-F1-T1 - Toss billing state and recovery page
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
import { AppShell } from "@/components/core-shell/app-shell";
import { PageHeader } from "@/components/core-shell/page-structure";
import { BillingWorkspace } from "@/components/product/billing-workspace";

export default function BillingPage() {
  return (
    <AppShell active="billing">
      <PageHeader
        eyebrow="구독과 결제"
        title="결제"
        description="Toss 자동결제 상태와 다음 청구 준비 상태를 확인합니다."
      />
      <BillingWorkspace />
    </AppShell>
  );
}
