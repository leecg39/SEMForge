"use client";

// @TASK P4-F1-T1 - Sites list and creation wired to API v1
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/components/product/product-ui.test.tsx
import Link from "next/link";
import { useState } from "react";

import { ContentCard } from "@/components/core-shell/page-structure";
import { StatusPanel } from "@/components/core-shell/status-panel";

import { mutateApi, useApiResource } from "./api-client";
import { useBillingAccess } from "./billing-access";
import { parseSite, parseSitesPage, type SiteView } from "./contracts";
import { formatDateKo } from "./format";
import { ResourcePanel } from "./resource-panel";

const SITE_LIMIT = 3;

function mutationMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

export function SitesReadyView({
  sites,
  canWrite,
  pendingId,
  onToggle,
}: {
  sites: readonly SiteView[];
  canWrite: boolean;
  pendingId: string | null;
  onToggle: (site: SiteView) => void;
}) {
  const activeCount = sites.filter((site) => site.active).length;
  if (sites.length === 0) {
    return (
      <StatusPanel
        status="empty"
        title="등록된 사이트가 없습니다"
        description="실제 고객 도메인을 등록하면 추적 항목 설정을 시작할 수 있습니다."
      />
    );
  }
  return (
    <ContentCard eyebrow="실제 등록 데이터" title={`사이트 · 활성 ${activeCount} / ${SITE_LIMIT}`}>
      <ul className="sf-record-list" aria-label="등록된 사이트">
        {sites.map((site) => {
          const atLimit = !site.active && activeCount >= SITE_LIMIT;
          return (
            <li className="sf-record" key={site.id}>
              <div className="sf-record__main">
                <div className="sf-record__title-row">
                  <h3>{site.name}</h3>
                  <span className={`sf-state-chip ${site.active ? "sf-state-chip--success" : "sf-state-chip--muted"}`}>
                    {site.active ? "활성" : "중지됨"}
                  </span>
                </div>
                <p className="sf-record__domain">{site.domain}</p>
                <small>등록 {formatDateKo(site.createdAt)} · 시간대 {site.timezone}</small>
              </div>
              <div className="sf-record__actions">
                <Link className="sf-button sf-button--secondary" href={`/app/sites/${site.id}`}>상세 설정</Link>
                <button
                  className="sf-button sf-button--quiet"
                  type="button"
                  disabled={!canWrite || pendingId === site.id || atLimit}
                  onClick={() => onToggle(site)}
                  aria-describedby={atLimit ? `site-limit-${site.id}` : undefined}
                >
                  {pendingId === site.id ? "처리 중…" : site.active ? "추적 중지" : "다시 활성화"}
                </button>
                {atLimit ? <small id={`site-limit-${site.id}`}>활성 사이트 3개 한도에 도달했습니다.</small> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </ContentCard>
  );
}

export function SitesWorkspace() {
  const { access } = useBillingAccess();
  const { state, reload } = useApiResource("/api/v1/sites", parseSitesPage);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "status" | "error"; text: string } | null>(null);
  const sites = state.status === "ready" ? state.data.items : [];
  const activeCount = sites.filter((site) => site.active).length;
  const createDisabled = !access.canWrite || activeCount >= SITE_LIMIT || pendingId === "create";

  async function createSite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createDisabled) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = data.get("name");
    const domain = data.get("domain");
    if (typeof name !== "string" || typeof domain !== "string") return;
    setPendingId("create");
    setMessage(null);
    try {
      await mutateApi("/api/v1/sites", "POST", { name, domain }, parseSite);
      form.reset();
      setMessage({ kind: "status", text: "사이트를 등록했습니다." });
      reload();
    } catch (error) {
      setMessage({ kind: "error", text: mutationMessage(error) });
    } finally {
      setPendingId(null);
    }
  }

  async function toggleSite(site: SiteView) {
    if (!access.canWrite) return;
    setPendingId(site.id);
    setMessage(null);
    try {
      await mutateApi(`/api/v1/sites/${site.id}`, "PATCH", { active: !site.active }, parseSite);
      setMessage({ kind: "status", text: site.active ? "사이트 추적을 중지했습니다." : "사이트 추적을 다시 활성화했습니다." });
      reload();
    } catch (error) {
      setMessage({ kind: "error", text: mutationMessage(error) });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="sf-page-stack">
      <ContentCard eyebrow="사이트 추가" title="실제 도메인 등록">
        <form className="sf-inline-form" onSubmit={createSite} data-endpoint="/api/v1/sites">
          <label className="sf-field">
            <span>사이트 이름</span>
            <input name="name" type="text" required maxLength={120} autoComplete="organization" disabled={createDisabled} />
          </label>
          <label className="sf-field">
            <span>도메인</span>
            <input name="domain" type="text" required maxLength={253} inputMode="url" placeholder="example.com" disabled={createDisabled} />
          </label>
          <button className="sf-button sf-button--primary" type="submit" disabled={createDisabled} aria-busy={pendingId === "create"}>
            {pendingId === "create" ? "등록 중…" : "사이트 등록"}
          </button>
        </form>
        <p className="sf-form-hint">
          활성 사이트 {activeCount} / {SITE_LIMIT} · 공개 인터넷에서 접근 가능한 도메인만 등록할 수 있습니다.
        </p>
        {!access.canWrite ? <p className="sf-form-message" role="status">현재 구독 상태에서는 읽기 전용입니다.</p> : null}
        {message ? <p className={message.kind === "error" ? "sf-form-message sf-form-message--error" : "sf-form-message"} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p> : null}
      </ContentCard>
      <ResourcePanel state={state} label="사이트" onRetry={reload}>
        {(page) => <SitesReadyView sites={page.items} canWrite={access.canWrite} pendingId={pendingId} onToggle={toggleSite} />}
      </ResourcePanel>
    </div>
  );
}
