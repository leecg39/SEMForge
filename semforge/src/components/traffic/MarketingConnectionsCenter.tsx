"use client";

import { useCallback, useEffect, useState } from "react";
import type { MarketingConnectionView, MarketingProvider } from "@/server/marketing/contracts";
import { cn } from "@/lib/utils";

const CARD = "rounded-[10px] border border-app-border bg-white shadow-[0_1px_2px_rgba(23,27,25,0.04)]";
const LABELS: Record<MarketingProvider, string> = { gsc: "Google Search Console", ga4: "Google Analytics 4", google_ads: "Google Ads", meta_ads: "Meta Ads", hubspot: "HubSpot" };

export function MarketingConnectionsCenter({ folders, initialFolderId }: { folders: Array<{ id: string; name: string; domain: string }>; initialFolderId: string }) {
  const [folderId, setFolderId] = useState(initialFolderId);
  const [connections, setConnections] = useState<MarketingConnectionView[]>([]);
  const [provider, setProvider] = useState<MarketingProvider>("gsc");
  const [propertyId, setPropertyId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!folderId) return;
    setConnections([]);
    const response = await fetch(`/api/marketing/connections/?fid=${encodeURIComponent(folderId)}`, { cache: "no-store" });
    const body = await response.json() as { data?: MarketingConnectionView[] };
    setConnections(body.data ?? []);
  }, [folderId]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const connect = async () => {
    if (!propertyId.trim()) return;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch("/api/marketing/connections/oauth/start/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fid: folderId, provider, externalPropertyId: propertyId.trim(), returnTo: `/analytics/traffic/sources-destinations/?fid=${encodeURIComponent(folderId)}` }) });
      const body = await response.json() as { data?: { redirectUrl: string }; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "연결을 시작하지 못했습니다.");
      window.location.assign(body.data.redirectUrl);
    } catch (error) { setNotice(error instanceof Error ? error.message : "연결을 시작하지 못했습니다."); setBusy(false); }
  };

  const action = async (id: string, kind: "sync" | "delete") => {
    setBusy(true); setNotice(null);
    const response = await fetch(`/api/marketing/connections/${encodeURIComponent(id)}/${kind === "sync" ? "sync/" : ""}`, { method: kind === "sync" ? "POST" : "DELETE" });
    const body = await response.json() as { error?: { message?: string } };
    setNotice(response.ok ? (kind === "sync" ? "동기화를 요청했습니다." : "연결을 삭제했습니다.") : body.error?.message ?? "요청을 처리하지 못했습니다.");
    setBusy(false); await load();
  };

  return <div className="mx-auto w-full max-w-[1320px] p-4 sm:p-6"><header><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7f46c5]">Marketing Intelligence</p><h1 className="mt-1 text-[26px] font-semibold">데이터 소스 &amp; 목적지</h1><p className="mt-1 text-[13px] text-app-text-secondary">SEMForge 워크스페이스별 Airbyte workspace와 연결별 Postgres raw namespace를 분리합니다.</p></header>
    <section className={cn(CARD, "mt-5 p-4")}><div className="grid gap-3 lg:grid-cols-[minmax(220px,.7fr)_minmax(220px,.7fr)_minmax(280px,1fr)_auto]"><label className="text-[11px] font-semibold text-app-text-secondary">프로젝트<select value={folderId} onChange={(event) => setFolderId(event.target.value)} className="mt-1.5 h-10 w-full rounded-[7px] border border-app-border bg-white px-3 text-[12px]">{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><label className="text-[11px] font-semibold text-app-text-secondary">데이터 소스<select value={provider} onChange={(event) => setProvider(event.target.value as MarketingProvider)} className="mt-1.5 h-10 w-full rounded-[7px] border border-app-border bg-white px-3 text-[12px]">{Object.entries(LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="text-[11px] font-semibold text-app-text-secondary">속성·사이트·계정 ID<input value={propertyId} onChange={(event) => setPropertyId(event.target.value)} placeholder={provider === "gsc" ? "sc-domain:example.com" : provider === "ga4" ? "properties/123456" : "공급자 계정 ID"} className="mt-1.5 h-10 w-full rounded-[7px] border border-app-border bg-white px-3 text-[12px]" /></label><button type="button" disabled={busy || !folderId || !propertyId.trim()} onClick={connect} className="mt-auto h-10 rounded-[7px] bg-app-blue px-5 text-[12px] font-semibold text-white disabled:opacity-40">OAuth 연결</button></div><p className="mt-3 text-[10px] text-app-text-secondary">OAuth 토큰과 Airbyte secretId는 응답·로그·SQLite에 저장하지 않습니다. 개발 환경의 HTTP 주소에서는 Airbyte OAuth가 시작되지 않습니다.</p></section>
    {notice ? <p role="status" className="mt-4 rounded-[8px] border border-app-border bg-white px-4 py-3 text-[12px]">{notice}</p> : null}
    <section className="mt-4 grid gap-3">{connections.length ? connections.map((connection) => <article key={connection.id} className={cn(CARD, "flex flex-wrap items-center gap-4 p-4")}><div className="min-w-[220px] flex-1"><h2 className="text-[13px] font-semibold">{LABELS[connection.provider]}</h2><p className="mt-1 text-[10px] text-app-text-secondary">{connection.lastSucceededAt ? `마지막 성공 ${new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(connection.lastSucceededAt))}` : "아직 성공한 동기화 없음"}</p></div><span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold", connection.status === "active" && connection.cache === "fresh" ? "border-[#a7dccd] bg-[#effaf6] text-[#087a5b]" : "border-[#e9c46a] bg-[#fff9e8] text-[#946200]")}>{connection.status} · {connection.cache}</span><button type="button" disabled={busy} onClick={() => action(connection.id, "sync")} className="h-9 rounded-[7px] border border-app-border px-3 text-[11px] font-semibold">지금 동기화</button><button type="button" disabled={busy} onClick={() => action(connection.id, "delete")} className="h-9 rounded-[7px] border border-[#f2b8b5] px-3 text-[11px] font-semibold text-[#a4002a]">연결 삭제</button></article>) : <div className={cn(CARD, "p-10 text-center text-[12px] text-app-text-secondary")}>이 프로젝트에 연결된 마케팅 데이터 소스가 없습니다.</div>}</section>
  </div>;
}
