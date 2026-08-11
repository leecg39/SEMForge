"use client";

// @TASK P4-F1-T1 - Billing state and recovery wired to Toss billing API v1
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/components/product/product-ui.test.tsx
import { useState } from "react";

import { ContentCard } from "@/components/core-shell/page-structure";
import { StatusPanel } from "@/components/core-shell/status-panel";

import { mutateApi } from "./api-client";
import { useBillingAccess } from "./billing-access";
import {
  parseRecordContract,
  type BillingSummaryViewModel,
  type SubscriptionStatus,
} from "./contracts";
import { formatDateTimeKo, formatKrw } from "./format";
import { ResourcePanel } from "./resource-panel";

const billingStatusCopy: Record<SubscriptionStatus, { label: string; description: string }> = {
  invited: { label: "초대됨", description: "계정 생성을 완료한 뒤 결제 수단을 연결할 수 있습니다." },
  account_created: { label: "결제 수단 필요", description: "Toss 자동결제 인증이 필요합니다." },
  billing_authorized: { label: "결제 승인됨", description: "첫 정기결제 처리를 기다리고 있습니다." },
  charge_pending: { label: "결제 처리 중", description: "Toss 결제 결과를 확인하고 있습니다." },
  active: { label: "이용 중", description: "주간 수집과 리포트 생성이 활성화되어 있습니다." },
  past_due: { label: "미납", description: "유예 기간에는 과거 리포트만 읽을 수 있습니다." },
  cancel_at_period_end: { label: "기간 말 해지", description: "현재 이용기간 종료일까지 기존 기능을 사용할 수 있습니다." },
  canceled: { label: "해지됨", description: "구독이 종료되어 결제 관리 외 기능을 사용할 수 없습니다." },
};

export function BillingSummaryView({
  summary,
  pendingAction,
  onRetry,
  onCancel,
}: {
  summary: BillingSummaryViewModel;
  pendingAction: "retry" | "cancel" | null;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const copy = billingStatusCopy[summary.status];
  const isPastDue = summary.status === "past_due";
  const canCancel = summary.status === "active" || summary.status === "past_due";
  return (
    <div className="sf-page-stack" data-endpoint="/api/v1/billing/subscription">
      {isPastDue ? <StatusPanel status="error" title="정기결제가 미납되었습니다" description="사이트와 추적 설정은 읽기 전용이며, 현재 청구기간보다 앞선 과거 리포트만 읽을 수 있습니다." /> : null}
      <ContentCard eyebrow="실제 구독 상태" title={copy.label}>
        <div className="sf-billing-summary">
          <div className="sf-billing-summary__amount"><strong>{formatKrw(summary.amountKrw)}</strong><span>월 · VAT 포함</span></div>
          <p>{copy.description}</p>
          <dl>
            <div><dt>현재 이용기간</dt><dd>{summary.currentPeriodStart && summary.currentPeriodEnd ? `${formatDateTimeKo(summary.currentPeriodStart)} – ${formatDateTimeKo(summary.currentPeriodEnd)}` : "아직 시작되지 않음"}</dd></div>
            <div><dt>다음 재시도</dt><dd>{summary.nextRetryAt ? formatDateTimeKo(summary.nextRetryAt) : "예약 없음"}</dd></div>
            <div><dt>미납 유예 종료</dt><dd>{summary.graceEndsAt ? formatDateTimeKo(summary.graceEndsAt) : "해당 없음"}</dd></div>
          </dl>
          <div className="sf-form-actions">
            {isPastDue ? <button className="sf-button sf-button--primary" type="button" disabled={pendingAction !== null} onClick={onRetry}>{pendingAction === "retry" ? "결제 확인 중…" : "결제 다시 시도"}</button> : null}
            {canCancel ? (
              <details className="sf-confirm-action">
                <summary>구독 해지</summary>
                <p>해지는 현재 이용기간 말에 적용됩니다. 일할 환불은 제공하지 않으며 법령상 예외는 적용됩니다.</p>
                <button className="sf-button sf-button--danger" type="button" disabled={pendingAction !== null} onClick={onCancel}>{pendingAction === "cancel" ? "해지 예약 중…" : "기간 말 해지 예약"}</button>
              </details>
            ) : null}
          </div>
        </div>
      </ContentCard>
      <ContentCard eyebrow="포함 한도" title="비공개 베타 · 주간 가시성 리포트">
        <dl className="sf-limit-grid">
          <div className="sf-limit"><dt>활성 사이트</dt><dd>3</dd><small>워크스페이스 기준</small></div>
          <div className="sf-limit"><dt>순위 키워드</dt><dd>20</dd><small>사이트별</small></div>
          <div className="sf-limit"><dt>AI Overview 프롬프트</dt><dd>20</dd><small>사이트별</small></div>
        </dl>
      </ContentCard>
      {summary.status === "account_created" || summary.status === "invited" ? (
        <StatusPanel status="partial" title="결제 수단 연결 화면을 준비 중입니다" description="서버는 Toss authKey 완료 계약만 제공합니다. 승인되지 않은 임의 결제 입력은 만들지 않았습니다." />
      ) : null}
      <p className="sf-policy-note">{summary.policy.notice}</p>
    </div>
  );
}

export function BillingWorkspace() {
  const { summaryState, reload } = useBillingAccess();
  const [pendingAction, setPendingAction] = useState<"retry" | "cancel" | null>(null);
  const [message, setMessage] = useState<{ kind: "status" | "error"; text: string } | null>(null);

  async function perform(action: "retry" | "cancel") {
    setPendingAction(action);
    setMessage(null);
    try {
      await mutateApi(`/api/v1/billing/${action}`, "POST", {}, parseRecordContract);
      setMessage({ kind: "status", text: action === "retry" ? "결제 재시도 결과를 반영했습니다." : "기간 말 해지를 예약했습니다." });
      reload();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "결제 요청을 처리하지 못했습니다." });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="sf-page-stack" data-endpoint="/api/v1/billing/subscription">
      {message ? <p className={message.kind === "error" ? "sf-form-message sf-form-message--error" : "sf-form-message"} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p> : null}
      <ResourcePanel state={summaryState} label="구독" onRetry={reload}>
        {(summary) => <BillingSummaryView summary={summary} pendingAction={pendingAction} onRetry={() => void perform("retry")} onCancel={() => void perform("cancel")} />}
      </ResourcePanel>
    </div>
  );
}
