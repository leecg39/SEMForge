"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CampaignPerformanceReport, MarketingSection } from "@/server/marketing/contracts";
import { cn } from "@/lib/utils";

const CARD = "rounded-[10px] border border-app-border bg-white shadow-[0_1px_2px_rgba(23,27,25,0.04)]";

export function MarketingPaidPerformanceDashboard({ provider, folders, initialFolderId }: {
  provider: "google_ads" | "meta_ads";
  folders: Array<{ id: string; name: string; domain: string }>;
  initialFolderId: string;
}) {
  const [folderId, setFolderId] = useState(initialFolderId);
  const [result, setResult] = useState<MarketingSection<CampaignPerformanceReport> | null>(null);
  const [range] = useState(() => {
    const now = Date.now();
    return {
      to: new Date(now - 86400000).toISOString().slice(0, 10),
      from: new Date(now - 28 * 86400000).toISOString().slice(0, 10),
    };
  });
  useEffect(() => {
    if (!folderId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ fid: folderId, from: range.from, to: range.to, provider });
    fetch(`/api/marketing/campaigns/?${params}`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.json() as Promise<MarketingSection<CampaignPerformanceReport>>)
      .then((body) => { if (!controller.signal.aborted) setResult(body); })
      .catch(() => { if (!controller.signal.aborted) setResult(null); });
    return () => controller.abort();
  }, [folderId, provider, range]);
  const rows = result?.data?.rows ?? [];
  const totals = rows.reduce((sum, row) => ({ cost: sum.cost + row.cost, clicks: sum.clicks + row.clicks, conversions: sum.conversions + row.conversions, revenue: sum.revenue + row.revenue }), { cost: 0, clicks: 0, conversions: 0, revenue: 0 });
  const fmt = (value: number) => new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value);
  return <div className="mx-auto w-full max-w-[1400px] p-4 sm:p-6"><header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#7f46c5]">Read-only ad performance</p><h1 className="mt-1 text-[26px] font-semibold">{provider === "google_ads" ? "유료 검색" : "유료 소셜"} 성과</h1><p className="mt-1 text-[12px] text-app-text-secondary">외부 캠페인을 읽기 전용으로 분석하며 예산·캠페인을 변경하지 않습니다.</p></div><select aria-label="프로젝트" value={folderId} onChange={(event) => { setResult(null); setFolderId(event.target.value); }} className="h-9 rounded-[7px] border border-app-border bg-white px-3 text-[11px]">{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></header>
    {result?.status !== "live" ? <section className={cn(CARD, "mt-5 p-10 text-center")}><h2 className="text-[15px] font-semibold">광고 성과 데이터가 없습니다</h2><p className="mt-2 text-[12px] text-app-text-secondary">{result?.reason ?? "연결 상태를 확인해 주세요."}</p><Link href={`/analytics/traffic/sources-destinations/?fid=${encodeURIComponent(folderId)}`} className="mt-5 inline-flex h-10 items-center rounded-[7px] bg-app-blue px-5 text-[12px] font-semibold text-white">광고 소스 연결</Link></section> : <><div className="mt-5 flex flex-wrap gap-2 text-[10px] text-app-text-secondary"><span className="rounded-full border border-[#a7dccd] bg-[#effaf6] px-2 py-1 text-[#087a5b]">{result.cache}</span><span>{result.source.join(" · ")}</span><span>수집 {new Date(result.fetchedAt).toLocaleString("ko-KR")}</span></div><section className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">{[["비용", `${fmt(totals.cost)}원`], ["클릭", fmt(totals.clicks)], ["전환", fmt(totals.conversions)], ["ROAS", totals.cost ? `${(totals.revenue / totals.cost).toFixed(2)}x` : "—"]].map(([label, value]) => <article key={label} className={cn(CARD, "p-4")}><p className="text-[10px] text-app-text-secondary">{label}</p><p className="mt-1 text-[23px] font-semibold">{value}</p><p className="mt-2 text-[9px] text-app-text-secondary">{label === "ROAS" ? "계산값" : "절대값"}</p></article>)}</section><section className={cn(CARD, "mt-4 overflow-x-auto")}><table className="w-full min-w-[900px] text-left text-[11px]"><thead className="bg-[#f7f8f8] text-app-text-secondary"><tr><th className="px-4 py-3">캠페인</th><th className="px-3 py-3">비용</th><th className="px-3 py-3">노출</th><th className="px-3 py-3">클릭</th><th className="px-3 py-3">전환</th><th className="px-3 py-3">CPA</th><th className="px-3 py-3">ROAS</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.date}-${row.externalCampaignId}`} className="border-t border-app-border"><td className="px-4 py-3 font-medium">{row.campaign ?? row.externalCampaignId}</td><td className="px-3 py-3">{fmt(row.cost)}원</td><td className="px-3 py-3">{fmt(row.impressions)}</td><td className="px-3 py-3">{fmt(row.clicks)}</td><td className="px-3 py-3">{fmt(row.conversions)}</td><td className="px-3 py-3">{row.cpa === null ? "—" : `${fmt(row.cpa)}원`}</td><td className="px-3 py-3">{row.roas === null ? "—" : `${row.roas.toFixed(2)}x`}</td></tr>)}</tbody></table></section></>}
  </div>;
}
