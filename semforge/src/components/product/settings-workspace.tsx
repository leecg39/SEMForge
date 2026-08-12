"use client";

// @TASK P4-F1-T1 - Report branding and GSC integrations settings
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/components/product/product-ui.test.tsx
import { useState } from "react";

import { ContentCard } from "@/components/core-shell/page-structure";
import { StatusPanel } from "@/components/core-shell/status-panel";
import { WorkspaceSettingsForm } from "@/components/core-shell/workspace-settings-form";

import { mutateApi, useApiResource } from "./api-client";
import { useBillingAccess } from "./billing-access";
import {
  parseBrandingContract,
  parseDisconnected,
  parseGscBindingContract,
  parseGscConnectResult,
  parseGscConnections,
  parseGscProperties,
  parseSitesPage,
  type GscConnectionView,
  type SiteView,
} from "./contracts";
import { formatDateTimeKo } from "./format";
import { ResourcePanel } from "./resource-panel";

export function GscConnectionsReadyView({
  connections,
  canWrite,
  pendingId,
  onSelect,
  onDisconnect,
}: {
  connections: readonly GscConnectionView[];
  canWrite: boolean;
  pendingId: string | null;
  onSelect: (connection: GscConnectionView) => void;
  onDisconnect: (connection: GscConnectionView) => void;
}) {
  if (connections.length === 0) {
    return <StatusPanel status="empty" title="연결된 Search Console 계정이 없습니다" description="사용자가 알아볼 수 있는 레이블로 읽기 전용 계정을 연결해 주세요." />;
  }
  return (
    <ul className="sf-connection-list" aria-label="Search Console 연결">
      {connections.map((connection) => (
        <li key={connection.id}>
          <div>
            <div className="sf-record__title-row"><h3>{connection.label}</h3><span className="sf-state-chip sf-state-chip--success">읽기 전용</span></div>
            <p>Google Search Console · webmasters.readonly</p>
            <small>토큰 만료 {formatDateTimeKo(connection.tokenExpiresAt)}</small>
          </div>
          <div className="sf-record__actions">
            <button className="sf-button sf-button--secondary" type="button" disabled={!canWrite || pendingId !== null} onClick={() => onSelect(connection)}>사이트 속성 선택</button>
            <button className="sf-button sf-button--quiet" type="button" disabled={!canWrite || pendingId === connection.id} onClick={() => onDisconnect(connection)}>{pendingId === connection.id ? "연결 해제 중…" : "연결 해제"}</button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function GscBindingPanel({
  connection,
  sites,
  canWrite,
  onComplete,
}: {
  connection: GscConnectionView;
  sites: readonly SiteView[];
  canWrite: boolean;
  onComplete: (text: string, error?: boolean) => void;
}) {
  const endpoint = `/api/v1/integrations/gsc/connections/${connection.id}/properties` as `/api/v1/${string}`;
  const { state, reload } = useApiResource(endpoint, parseGscProperties);
  const [pending, setPending] = useState(false);

  async function bind(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    const data = new FormData(event.currentTarget);
    const siteId = data.get("siteId");
    const propertyUri = data.get("propertyUri");
    if (typeof siteId !== "string" || typeof propertyUri !== "string") return;
    setPending(true);
    try {
      await mutateApi("/api/v1/integrations/gsc/bindings", "POST", {
        siteId,
        connectionId: connection.id,
        propertyUri,
      }, parseGscBindingContract);
      onComplete("Search Console 속성을 사이트에 연결했습니다.");
    } catch (error) {
      onComplete(error instanceof Error ? error.message : "속성을 연결하지 못했습니다.", true);
    } finally {
      setPending(false);
    }
  }

  return (
    <ContentCard eyebrow="속성 연결" title={connection.label}>
      <ResourcePanel state={state} label="Search Console 속성" onRetry={reload}>
        {(properties) => sites.length === 0 ? (
          <StatusPanel status="empty" title="먼저 사이트를 등록해 주세요" description="Search Console 속성을 연결할 활성 사이트가 없습니다." />
        ) : properties.items.length === 0 ? (
          <StatusPanel status="empty" title="사용 가능한 속성이 없습니다" description="Google 계정에서 Search Console 속성 권한을 확인해 주세요." />
        ) : (
          <form className="sf-inline-form" onSubmit={bind} data-endpoint="/api/v1/integrations/gsc/bindings">
            <label className="sf-field"><span>사이트</span><select name="siteId" disabled={!canWrite || pending}>{sites.filter((site) => site.active).map((site) => <option value={site.id} key={site.id}>{site.name} · {site.domain}</option>)}</select></label>
            <label className="sf-field"><span>Search Console 속성</span><select name="propertyUri" disabled={!canWrite || pending}>{properties.items.map((property) => <option value={property.siteUrl} key={property.siteUrl}>{property.siteUrl} · {property.permissionLevel}</option>)}</select></label>
            <button className="sf-button sf-button--primary" type="submit" disabled={!canWrite || pending}>{pending ? "연결 중…" : "사이트에 연결"}</button>
          </form>
        )}
      </ResourcePanel>
    </ContentCard>
  );
}

export function SettingsWorkspace() {
  const { access } = useBillingAccess();
  const branding = useApiResource("/api/v1/reports/branding", parseBrandingContract);
  const connections = useApiResource("/api/v1/integrations/gsc/connections", parseGscConnections);
  const sites = useApiResource("/api/v1/sites", parseSitesPage);
  const [selected, setSelected] = useState<GscConnectionView | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!access.canWrite) return;
    const form = event.currentTarget;
    const label = new FormData(form).get("label");
    if (typeof label !== "string") return;
    setPendingId("connect");
    setMessage(null);
    try {
      const result = await mutateApi("/api/v1/integrations/gsc/connect", "POST", {
        label,
        returnPath: "/app/settings",
      }, parseGscConnectResult);
      window.location.assign(result.data.authorizationUrl);
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "Google 연결을 시작하지 못했습니다." });
      setPendingId(null);
    }
  }

  async function disconnect(connection: GscConnectionView) {
    if (!access.canWrite) return;
    setPendingId(connection.id);
    setMessage(null);
    try {
      await mutateApi(`/api/v1/integrations/gsc/connections/${connection.id}`, "DELETE", {}, parseDisconnected);
      setSelected(null);
      setMessage({ error: false, text: "Search Console 연결을 해제했습니다." });
      connections.reload();
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "연결을 해제하지 못했습니다." });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="sf-page-stack" data-endpoint="/api/v1/reports/branding">
      <ContentCard eyebrow="고정 템플릿" title="리포트 브랜드">
        <ResourcePanel state={branding.state} label="리포트 브랜딩" onRetry={branding.reload}>
          {(value) => <WorkspaceSettingsForm initialValue={value} canWrite={access.canWrite} onSaved={branding.reload} />}
        </ResourcePanel>
      </ContentCard>
      <ContentCard eyebrow="최소 읽기 권한" title="Google Search Console">
        <p className="sf-body-copy">연결 계정은 사용자가 정한 레이블로 구분하며 Search Console 조회에 필요한 webmasters.readonly 권한만 요청합니다.</p>
        <form className="sf-inline-form sf-inline-form--connection" onSubmit={connect} data-endpoint="/api/v1/integrations/gsc/connect">
          <label className="sf-field"><span>연결 레이블</span><input name="label" type="text" required maxLength={80} placeholder="예: 고객사 운영 계정" disabled={!access.canWrite || pendingId === "connect"} /></label>
          <button className="sf-button sf-button--primary" type="submit" disabled={!access.canWrite || pendingId === "connect"}>{pendingId === "connect" ? "Google로 이동 중…" : "Google 계정 연결"}</button>
        </form>
        {!access.canWrite ? <p className="sf-form-message" role="status">현재 구독 상태에서는 연결을 변경할 수 없습니다.</p> : null}
        {message ? <p className={message.error ? "sf-form-message sf-form-message--error" : "sf-form-message"} role={message.error ? "alert" : "status"}>{message.text}</p> : null}
        <ResourcePanel state={connections.state} label="Search Console 연결" onRetry={connections.reload}>
          {(value) => <GscConnectionsReadyView connections={value.items} canWrite={access.canWrite} pendingId={pendingId} onSelect={setSelected} onDisconnect={(connection) => void disconnect(connection)} />}
        </ResourcePanel>
      </ContentCard>
      {selected ? (
        <ResourcePanel state={sites.state} label="사이트" onRetry={sites.reload}>
          {(value) => <GscBindingPanel connection={selected} sites={value.items} canWrite={access.canWrite} onComplete={(text, error = false) => setMessage({ text, error })} />}
        </ResourcePanel>
      ) : null}
    </div>
  );
}
