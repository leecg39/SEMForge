"use client";

// @TASK P4-F1-T1 - Subscription-aware read-only product UX
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/components/product/product-ui.test.tsx
import { createContext, useContext, useMemo } from "react";
import Link from "next/link";

import {
  parseBillingSummary,
  productAccessFor,
  type BillingSummaryViewModel,
  type ProductAccess,
} from "./contracts";
import { useApiResource, type ResourceState } from "./api-client";
import { formatDateTimeKo } from "./format";

type BillingAccessContextValue = {
  readonly summaryState: ResourceState<BillingSummaryViewModel>;
  readonly access: ProductAccess;
  readonly reload: () => void;
};

const unavailableAccess: ProductAccess = {
  canWrite: false,
  pastReportsOnly: false,
  reason: "subscription_unavailable",
};

const BillingAccessContext = createContext<BillingAccessContextValue>({
  summaryState: { status: "loading" },
  access: unavailableAccess,
  reload: () => undefined,
});

function AccessNotice({ summary, access }: { summary: BillingSummaryViewModel; access: ProductAccess }) {
  if (access.canWrite) return null;
  if (summary.status === "past_due") {
    return (
      <aside className="sf-access-notice sf-access-notice--warning" role="alert">
        <div>
          <strong>결제가 미납되어 읽기 전용입니다.</strong>
          <p>
            기존 리포트만 확인할 수 있습니다.
            {summary.graceEndsAt ? ` 유예 종료: ${formatDateTimeKo(summary.graceEndsAt)}` : ""}
          </p>
        </div>
        <Link className="sf-button sf-button--secondary" href="/app/billing">결제 복구</Link>
      </aside>
    );
  }
  return (
    <aside className="sf-access-notice" role="status">
      <div>
        <strong>구독 활성화 전에는 설정을 변경할 수 없습니다.</strong>
        <p>결제 상태를 확인하거나 결제 수단 연결을 완료해 주세요.</p>
      </div>
      <Link className="sf-button sf-button--secondary" href="/app/billing">결제 확인</Link>
    </aside>
  );
}

export function BillingAccessProvider({ children }: React.PropsWithChildren) {
  const { state, reload } = useApiResource(
    "/api/v1/billing/subscription",
    parseBillingSummary,
  );
  const summary = state.status === "ready" ? state.data : null;
  const access = useMemo(() => productAccessFor(summary), [summary]);
  const value = useMemo(() => ({ summaryState: state, access, reload }), [access, reload, state]);

  return (
    <BillingAccessContext value={value}>
      {summary ? <AccessNotice summary={summary} access={access} /> : null}
      {children}
    </BillingAccessContext>
  );
}

export function useBillingAccess() {
  return useContext(BillingAccessContext);
}
