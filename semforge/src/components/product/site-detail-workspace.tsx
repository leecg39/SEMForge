"use client";

// @TASK P4-F1-T1 - Site tracking detail wired to API v1
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/components/product/product-ui.test.tsx
import { useState } from "react";

import { ContentCard } from "@/components/core-shell/page-structure";
import { StatusPanel } from "@/components/core-shell/status-panel";

import { mutateApi, useApiResource } from "./api-client";
import { useBillingAccess } from "./billing-access";
import {
  parseSite,
  parseSiteDetail,
  parseTrackingContract,
  type SiteDetailViewModel,
  type TrackingType,
  type TrackingView,
} from "./contracts";
import { formatDateKo } from "./format";
import { ResourcePanel } from "./resource-panel";

const TRACKING_LIMIT = 20;

function TrackingGroup({
  type,
  items,
  canWrite,
  pendingId,
  onToggle,
}: {
  type: TrackingType;
  items: readonly TrackingView[];
  canWrite: boolean;
  pendingId: string | null;
  onToggle: (item: TrackingView) => void;
}) {
  const activeCount = items.filter((item) => item.active).length;
  const title = type === "rank" ? "Google 순위 키워드" : "AI Overview 프롬프트";
  return (
    <section className="sf-tracking-group" aria-labelledby={`tracking-${type}`}>
      <div className="sf-section-heading sf-section-heading--compact">
        <div>
          <h3 id={`tracking-${type}`}>{title}</h3>
          <p>활성 {activeCount} / {TRACKING_LIMIT}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="sf-empty-inline">등록된 {title}가 없습니다.</p>
      ) : (
        <ul className="sf-query-list">
          {items.map((item) => {
            const atLimit = !item.active && activeCount >= TRACKING_LIMIT;
            return (
              <li key={item.id}>
                <div>
                  <strong>{item.query}</strong>
                  <small>{item.active ? "수집 중" : "중지됨"} · {formatDateKo(item.createdAt)}</small>
                </div>
                <button
                  className="sf-button sf-button--quiet"
                  type="button"
                  disabled={!canWrite || pendingId === item.id || atLimit}
                  onClick={() => onToggle(item)}
                >
                  {pendingId === item.id ? "처리 중…" : item.active ? "중지" : "활성화"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function SiteDetailView({
  detail,
  canWrite,
  pendingId,
  onToggleSite,
  onToggleTracking,
}: {
  detail: SiteDetailViewModel;
  canWrite: boolean;
  pendingId: string | null;
  onToggleSite: () => void;
  onToggleTracking: (item: TrackingView) => void;
}) {
  return (
    <div className="sf-page-stack">
      {!canWrite ? <StatusPanel status="partial" title="읽기 전용" description="현재 결제 상태에서는 사이트와 추적 항목을 변경할 수 없습니다." /> : null}
      <ContentCard eyebrow="사이트" title={detail.site.name}>
        <div className="sf-site-identity">
          <div>
            <p className="sf-record__domain">{detail.site.domain}</p>
            <small>한국 표준시 · {detail.site.active ? "주간 수집 활성" : "수집 중지"}</small>
          </div>
          <button className="sf-button sf-button--secondary" type="button" disabled={!canWrite || pendingId === detail.site.id} onClick={onToggleSite}>
            {pendingId === detail.site.id ? "처리 중…" : detail.site.active ? "사이트 추적 중지" : "사이트 다시 활성화"}
          </button>
        </div>
      </ContentCard>
      <ContentCard eyebrow="고정 수집 조건" title="추적 항목">
        <p className="sf-body-copy">Google · 한국 · 한국어 · 데스크톱 · 상위 100개 결과 기준으로만 수집합니다.</p>
        <div className="sf-tracking-grid">
          <TrackingGroup type="rank" items={detail.tracking.rank} canWrite={canWrite && detail.site.active} pendingId={pendingId} onToggle={onToggleTracking} />
          <TrackingGroup type="aio" items={detail.tracking.aio} canWrite={canWrite && detail.site.active} pendingId={pendingId} onToggle={onToggleTracking} />
        </div>
      </ContentCard>
      <ContentCard eyebrow="읽기 전용 연결" title="Google Search Console 속성">
        {detail.gscBinding ? (
          <div className="sf-connection-line">
            <span className="sf-state-chip sf-state-chip--success">연결됨</span>
            <strong>{detail.gscBinding.propertyUri}</strong>
            <small>{formatDateKo(detail.gscBinding.createdAt)} 연결</small>
          </div>
        ) : (
          <StatusPanel status="empty" title="연결된 Search Console 속성이 없습니다" description="설정에서 Google 계정을 연결한 뒤 이 사이트의 속성을 선택해 주세요." />
        )}
      </ContentCard>
    </div>
  );
}

export function SiteDetailWorkspace({ siteId }: { siteId: string }) {
  const endpoint = `/api/v1/sites/${encodeURIComponent(siteId)}` as `/api/v1/${string}`;
  const { access } = useBillingAccess();
  const { state, reload } = useApiResource(endpoint, parseSiteDetail);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "status" | "error"; text: string } | null>(null);
  const detail = state.status === "ready" ? state.data : null;

  async function toggleSite() {
    if (!access.canWrite || !detail) return;
    setPendingId(detail.site.id);
    setMessage(null);
    try {
      await mutateApi(endpoint, "PATCH", { active: !detail.site.active }, parseSite);
      setMessage({ kind: "status", text: detail.site.active ? "사이트 추적을 중지했습니다." : "사이트를 다시 활성화했습니다." });
      reload();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "요청을 처리하지 못했습니다." });
    } finally {
      setPendingId(null);
    }
  }

  async function toggleTracking(item: TrackingView) {
    if (!access.canWrite) return;
    setPendingId(item.id);
    setMessage(null);
    try {
      await mutateApi(`/api/v1/tracking/${item.id}`, "PATCH", { active: !item.active }, parseTrackingContract);
      setMessage({ kind: "status", text: item.active ? "추적 항목을 중지했습니다." : "추적 항목을 다시 활성화했습니다." });
      reload();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "요청을 처리하지 못했습니다." });
    } finally {
      setPendingId(null);
    }
  }

  async function createTracking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!access.canWrite || !detail?.site.active) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const type = data.get("type");
    const query = data.get("query");
    if ((type !== "rank" && type !== "aio") || typeof query !== "string") return;
    const activeCount = detail.tracking[type].filter((item) => item.active).length;
    if (activeCount >= TRACKING_LIMIT) return;
    setPendingId("create-tracking");
    setMessage(null);
    try {
      await mutateApi("/api/v1/tracking", "POST", { siteId, type, query }, parseTrackingContract);
      form.reset();
      setMessage({ kind: "status", text: "추적 항목을 등록했습니다." });
      reload();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "요청을 처리하지 못했습니다." });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="sf-page-stack">
      {detail ? (
        <ContentCard eyebrow="추적 추가" title="순위 키워드 또는 AI Overview 프롬프트">
          <form className="sf-inline-form sf-inline-form--tracking" onSubmit={createTracking} data-endpoint="/api/v1/tracking">
            <label className="sf-field">
              <span>유형</span>
              <select name="type" defaultValue="rank" disabled={!access.canWrite || !detail.site.active || pendingId === "create-tracking"}>
                <option value="rank">Google 순위 키워드</option>
                <option value="aio">AI Overview 프롬프트</option>
              </select>
            </label>
            <label className="sf-field">
              <span>검색어 또는 질문</span>
              <input name="query" type="text" required maxLength={200} disabled={!access.canWrite || !detail.site.active || pendingId === "create-tracking"} />
            </label>
            <button className="sf-button sf-button--primary" type="submit" disabled={!access.canWrite || !detail.site.active || pendingId === "create-tracking"}>
              {pendingId === "create-tracking" ? "등록 중…" : "추적 추가"}
            </button>
          </form>
        </ContentCard>
      ) : null}
      {message ? <p className={message.kind === "error" ? "sf-form-message sf-form-message--error" : "sf-form-message"} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p> : null}
      <ResourcePanel state={state} label="사이트 상세" onRetry={reload}>
        {(value) => <SiteDetailView detail={value} canWrite={access.canWrite} pendingId={pendingId} onToggleSite={toggleSite} onToggleTracking={toggleTracking} />}
      </ResourcePanel>
    </div>
  );
}
