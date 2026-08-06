"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MarketingSection, MarketingTrafficReport } from "@/server/marketing/contracts";
import type { TrafficGscRow } from "@/lib/traffic-market";
import { cn } from "@/lib/utils";

const CARD = "rounded-[10px] border border-app-border bg-white shadow-[0_1px_2px_rgba(23,27,25,0.04)]";

function defaultRange() {
  const end = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 27 * 24 * 60 * 60 * 1000);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function number(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat("ko-KR", options).format(value);
}

function Metadata({ section }: { section: MarketingSection<MarketingTrafficReport> }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px] text-app-text-secondary">
      <span className={cn("rounded-full border px-2 py-1 font-semibold", section.cache === "fresh" ? "border-[#a7dccd] bg-[#effaf6] text-[#087a5b]" : "border-[#e9c46a] bg-[#fff9e8] text-[#946200]")}>{section.cache === "fresh" ? "최신" : "지연 데이터"}</span>
      <span>{section.measurement === "calculated" ? "계산 지표 포함" : section.measurement}</span>
      <span>출처 {section.source.join(" · ")}</span>
      <time dateTime={section.fetchedAt}>수집 {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(section.fetchedAt))}</time>
    </div>
  );
}

export function MarketingTrafficDashboard({
  folders,
  initialFolderId,
  fallbackSiteUrl,
}: {
  folders: Array<{ id: string; name: string; domain: string }>;
  initialFolderId: string;
  fallbackSiteUrl: string;
}) {
  const [folderId, setFolderId] = useState(initialFolderId);
  const [range, setRange] = useState(defaultRange);
  const [result, setResult] = useState<MarketingSection<MarketingTrafficReport> | null>(null);
  const [gscFallback, setGscFallback] = useState<{ clicks: number; impressions: number; pages: TrafficGscRow[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!folderId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ fid: folderId, from: range.from, to: range.to, view: "overview" });
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      return fetch(`/api/marketing/traffic/?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.json() as Promise<MarketingSection<MarketingTrafficReport>>)
      .then((body) => { if (!controller.signal.aborted) setResult(body); })
      .catch(() => { if (!controller.signal.aborted) setResult(null); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    });
    return () => controller.abort();
  }, [folderId, range]);

  const resultStatus = result?.status;
  useEffect(() => {
    if (!resultStatus || resultStatus === "live" || !fallbackSiteUrl) return;
    const controller = new AbortController();
    const query = (dimensions: "date" | "page", rowLimit: number) => {
      const params = new URLSearchParams({
        siteUrl: fallbackSiteUrl, startDate: range.from, endDate: range.to, dimensions, rowLimit: String(rowLimit),
      });
      return fetch(`/api/gsc/query/?${params}`, { cache: "no-store", signal: controller.signal })
        .then((response) => response.json() as Promise<{ status?: string; data?: { rows?: TrafficGscRow[] } }>);
    };
    void Promise.all([query("date", 120), query("page", 20)])
      .then(([trend, pages]) => {
        if (controller.signal.aborted || trend.status !== "live") return;
        const totals = (trend.data?.rows ?? []).reduce((sum, row) => ({
          clicks: sum.clicks + row.clicks, impressions: sum.impressions + row.impressions,
        }), { clicks: 0, impressions: 0 });
        setGscFallback({ ...totals, pages: pages.status === "live" ? pages.data?.rows ?? [] : [] });
      })
      .catch(() => { if (!controller.signal.aborted) setGscFallback(null); });
    return () => controller.abort();
  }, [fallbackSiteUrl, range, resultStatus]);

  const rows = useMemo(() => result?.data?.pages ?? [], [result]);
  if (folders.length === 0) return <div className={cn(CARD, "mt-5 p-10 text-center text-[12px] text-app-text-secondary")}>먼저 프로젝트를 만들어 GA4·GSC 속성을 연결해 주세요.</div>;
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold">통합 검색 → 방문 → 전환</h2>
          <p className="mt-1 text-[11px] text-app-text-secondary">Airbyte 마트의 GSC 클릭과 GA4 세션·참여·key events를 URL별로 연결합니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="프로젝트" value={folderId} onChange={(event) => { setResult(null); setGscFallback(null); setFolderId(event.target.value); }} className="h-9 rounded-[7px] border border-app-border bg-white px-3 text-[11px]">
            {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name} · {folder.domain}</option>)}
          </select>
          <input aria-label="시작일" type="date" value={range.from} max={range.to} onChange={(event) => { setResult(null); setGscFallback(null); setRange((value) => ({ ...value, from: event.target.value })); }} className="h-9 rounded-[7px] border border-app-border bg-white px-2 text-[11px]" />
          <input aria-label="종료일" type="date" value={range.to} min={range.from} onChange={(event) => { setResult(null); setGscFallback(null); setRange((value) => ({ ...value, to: event.target.value })); }} className="h-9 rounded-[7px] border border-app-border bg-white px-2 text-[11px]" />
        </div>
      </div>

      {loading && !result ? <div className={cn(CARD, "mt-4 p-12 text-center text-[12px] text-app-text-secondary")}>통합 마트를 불러오는 중…</div> : null}
      {result?.status !== "live" || !result.data ? gscFallback ? (
        <section className={cn(CARD, "mt-4 overflow-hidden")}>
          <div className="border-b border-[#e9c46a] bg-[#fff9e8] px-4 py-3">
            <h3 className="text-[14px] font-semibold text-[#7a5700]">GSC 직접 조회 폴백</h3>
            <p className="mt-1 text-[10px] text-[#7a5700]">{result?.reason ?? "Airbyte 마트를 사용할 수 없습니다."} GA4 결합값 없이 Search Console 실측만 표시합니다.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4 sm:max-w-[520px]">
            <article><p className="text-[10px] text-app-text-secondary">검색 클릭</p><p className="mt-1 text-[22px] font-semibold">{number(gscFallback.clicks)}</p></article>
            <article><p className="text-[10px] text-app-text-secondary">검색 노출</p><p className="mt-1 text-[22px] font-semibold">{number(gscFallback.impressions)}</p></article>
          </div>
          <div className="border-t border-app-border px-4 py-3 text-[10px] text-app-text-secondary">출처 Google Search Console 직접 조회 · 측정 absolute · GA4 세션·참여·전환 사용 불가</div>
        </section>
      ) : (
        <section className={cn(CARD, "mt-4 p-8 text-center")}>
          <h3 className="text-[15px] font-semibold">통합 마케팅 데이터가 아직 없습니다</h3>
          <p className="mx-auto mt-2 max-w-[620px] text-[12px] leading-5 text-app-text-secondary">{result?.reason ?? "Airbyte와 분석 Postgres 구성을 확인해 주세요."} 기존 Search Console 실시간 탭은 계속 사용할 수 있습니다.</p>
          <Link href={`/analytics/traffic/sources-destinations/?fid=${encodeURIComponent(folderId)}`} className="mt-5 inline-flex h-10 items-center rounded-[7px] bg-app-blue px-5 text-[12px] font-semibold text-white">데이터 소스 연결</Link>
        </section>
      ) : (
        <>
          <div className="mt-4"><Metadata section={result} /></div>
          {result.reason ? <p role="status" className="mt-3 rounded-[8px] border border-[#e9c46a] bg-[#fff9e8] px-4 py-3 text-[11px] text-[#7a5700]">{result.reason}</p> : null}
          <section className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              ["GSC 검색 클릭", number(result.data.overview.clicks), "absolute"],
              ["GA4 세션", number(result.data.overview.sessions), "absolute"],
              ["참여율", result.data.overview.engagementRate === null ? "—" : `${(result.data.overview.engagementRate * 100).toFixed(1)}%`, "calculated"],
              ["Key events", number(result.data.overview.keyEvents), "absolute"],
            ].map(([label, value, measurement]) => <article key={label} className={cn(CARD, "p-4")}><p className="text-[10px] font-medium text-app-text-secondary">{label}</p><p className="mt-1 text-[24px] font-semibold">{value}</p><p className="mt-2 text-[9px] text-app-text-secondary">{measurement === "calculated" ? "계산값" : "실측 합계"}</p></article>)}
          </section>
          <section className={cn(CARD, "mt-4 overflow-hidden")}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-app-border px-4 py-3"><div><h3 className="text-[14px] font-semibold">페이지 퍼널</h3><p className="mt-1 text-[10px] text-app-text-secondary">클릭 대비 세션 비율은 전환율이 아닙니다.</p></div><span className="text-[10px] text-app-text-secondary">{rows.length}개 페이지</span></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-[11px]"><thead className="bg-[#f7f8f8] text-app-text-secondary"><tr><th className="px-4 py-3 font-medium">페이지</th><th className="px-3 py-3 font-medium">검색 클릭</th><th className="px-3 py-3 font-medium">노출</th><th className="px-3 py-3 font-medium">세션</th><th className="px-3 py-3 font-medium">참여율</th><th className="px-3 py-3 font-medium">Key events</th><th className="px-3 py-3 font-medium">매출</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.date}-${row.url}`} className="border-t border-app-border"><td className="max-w-[380px] truncate px-4 py-3 font-medium" title={row.url}>{row.url}</td><td className="px-3 py-3">{number(row.clicks)}</td><td className="px-3 py-3">{number(row.impressions)}</td><td className="px-3 py-3">{number(row.sessions)}</td><td className="px-3 py-3">{row.engagementRate === null ? "—" : `${(row.engagementRate * 100).toFixed(1)}%`}</td><td className="px-3 py-3">{number(row.keyEvents)}</td><td className="px-3 py-3">{number(row.revenue, { style: "currency", currency: "KRW", maximumFractionDigits: 0 })}</td></tr>)}</tbody></table></div>
          </section>
        </>
      )}
    </div>
  );
}
