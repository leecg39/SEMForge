"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, ExternalLinkIcon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { api } from "@/lib/client-api";
import type { BacklinkDataset, BacklinkListResult, BacklinkProvider, BacklinkScope } from "@/server/backlinks/contracts";

function formatNumber(value: number, locale: "ko" | "en") {
  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US").format(value);
}

export function BacklinkListPanel({ siteUrl, targetUrl, scope, provider, dataset, targetPage,
  locale, initialPage, initialSort, initialDirection, onSelectPage, onQueryState }: {
  siteUrl: string; targetUrl: string | null; scope: BacklinkScope; provider: BacklinkProvider;
  dataset: BacklinkDataset; targetPage: string; locale: "ko" | "en";
  initialPage: number; initialSort?: string; initialDirection: "asc" | "desc";
  onSelectPage: (url: string) => void;
  onQueryState: (state: { page: number; sort: string; direction: "asc" | "desc"; search: string }) => void;
}) {
  const ko = locale === "ko";
  const defaultSort = dataset === "target_pages" ? "link_count" : "source_url";
  const [page, setPage] = useState(initialPage);
  const [sort, setSort] = useState(initialSort ?? defaultSort);
  const [direction, setDirection] = useState(initialDirection);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<BacklinkListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestBody = useMemo(() => ({ siteUrl, targetUrl, scope, provider, dataset,
    targetPage: dataset === "inbound_links" ? targetPage : null, page, pageSize: 25, sort, direction,
    filters: { search } }), [siteUrl, targetUrl, scope, provider, dataset, targetPage, page, sort, direction, search]);

  useEffect(() => {
    if (dataset === "inbound_links" && !targetPage) return;
    let active = true;
    queueMicrotask(() => { if (active) { setLoading(true); setError(null); } });
    api.post<BacklinkListResult>("/api/analytics/backlinks/list/", requestBody)
      .then(({ data }) => { if (active) setResult(data); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : (ko ? "목록을 불러오지 못했습니다." : "Could not load the list.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [requestBody, ko, dataset, targetPage]);

  const changeSort = (next: string) => {
    const nextDirection = sort === next && direction === "desc" ? "asc" : "desc";
    setSort(next); setDirection(nextDirection); setPage(1);
    onQueryState({ page: 1, sort: next, direction: nextDirection, search });
  };
  const exportCsv = async () => {
    const response = await fetch("/api/analytics/backlinks/export/", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...requestBody, page: 1, limit: 100 }) });
    if (!response.ok) { setError(ko ? "CSV를 내보내지 못했습니다." : "Could not export CSV."); return; }
    const blob = await response.blob();
    const href = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = href; link.download = `backlinks-${dataset}.csv`; link.click(); URL.revokeObjectURL(href);
  };
  const submitSearch = () => { setSearch(searchInput.trim()); setPage(1); onQueryState({ page: 1, sort, direction, search: searchInput.trim() }); };

  if (dataset === "inbound_links" && !targetPage) return (
    <div className="rounded-[10px] border border-dashed border-app-border bg-white px-6 py-20 text-center">
      <p className="text-[14px] font-semibold text-app-text">{ko ? "먼저 링크된 페이지를 선택해 주세요" : "Select a linked page first"}</p>
      <p className="mt-2 text-[12px] text-app-text-secondary">{ko ? "Bing의 상세 링크는 대상 페이지를 선택할 때만 지연 조회합니다." : "Bing details are fetched only after a page is selected."}</p>
    </div>
  );

  return (
    <section className="overflow-hidden rounded-[10px] border border-app-border bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-app-border p-4">
        <div><h2 className="text-[14px] font-semibold text-app-text">{dataset === "target_pages" ? (ko ? "링크된 페이지" : "Linked pages") : (ko ? "인바운드 링크" : "Inbound links")}</h2>{targetPage && <p className="mt-1 max-w-[680px] truncate text-[11px] text-app-text-secondary">{targetPage}</p>}</div>
        <div className="flex flex-wrap gap-2">
          <div className="flex h-9 items-center rounded-[7px] border border-app-border bg-white px-2.5"><MagnifyingGlassIcon className="mr-2 h-4 w-4 text-app-text-secondary" /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitSearch(); }} placeholder={ko ? "URL·도메인·앵커 검색" : "Search URL, domain, anchor"} className="w-[220px] bg-transparent text-[12px] outline-none" /></div>
          <button type="button" onClick={submitSearch} className="h-9 rounded-[7px] border border-app-border px-3 text-[12px] font-medium">{ko ? "검색" : "Search"}</button>
          <button type="button" onClick={() => void exportCsv()} className="inline-flex h-9 items-center gap-2 rounded-[7px] border border-app-border px-3 text-[12px] font-medium"><DownloadIcon />CSV</button>
        </div>
      </div>
      {error && <div className="m-4 rounded-[7px] bg-[#fff1f1] px-3 py-2 text-[12px] text-[#a12828]">{error}</div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead className="bg-[#fafbfc] text-[10px] uppercase tracking-[0.04em] text-app-text-secondary">
            {dataset === "target_pages" ? <tr><th className="px-4 py-3"><button onClick={() => changeSort("url")}>{ko ? "대상 페이지" : "Target page"}</button></th><th className="w-[170px] px-4 py-3 text-right"><button onClick={() => changeSort("link_count")}>{ko ? "링크 수" : "Links"}</button></th><th className="w-[120px] px-4 py-3" /></tr> : <tr><th className="px-4 py-3"><button onClick={() => changeSort("source_url")}>{ko ? "출처 URL" : "Source URL"}</button></th><th className="w-[180px] px-4 py-3"><button onClick={() => changeSort("source_domain")}>{ko ? "출처 도메인" : "Source domain"}</button></th><th className="w-[220px] px-4 py-3"><button onClick={() => changeSort("anchor")}>{ko ? "앵커 텍스트" : "Anchor text"}</button></th><th className="w-[100px] px-4 py-3 text-right"><button onClick={() => changeSort("link_count")}>{ko ? "링크 수" : "Links"}</button></th></tr>}
          </thead>
          <tbody className="divide-y divide-[#eef0f2]">
            {result?.rows.map((row) => row.kind === "target_pages" ? (
              <tr key={row.url} className="hover:bg-[#fafbfc]"><td className="max-w-[720px] truncate px-4 py-3 text-[12px] font-medium text-[#285fca]">{row.url}</td><td className="px-4 py-3 text-right text-[12px] font-semibold">{formatNumber(row.linkCount, locale)}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => onSelectPage(row.url)} className="rounded-[6px] border border-app-border px-2.5 py-1.5 text-[11px] font-medium">{ko ? "링크 보기" : "View links"}</button></td></tr>
            ) : (
              <tr key={`${row.sourceUrl}|${row.targetUrl}|${row.anchor ?? ""}`} className="hover:bg-[#fafbfc]"><td className="max-w-[520px] px-4 py-3"><a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-[12px] font-medium text-[#285fca]">{row.sourceUrl}<ExternalLinkIcon className="shrink-0" /></a></td><td className="px-4 py-3 text-[12px] text-app-text-secondary">{row.sourceDomain}</td><td className="max-w-[220px] truncate px-4 py-3 text-[12px]">{row.anchor || "—"}</td><td className="px-4 py-3 text-right text-[12px] font-semibold">{formatNumber(row.linkCount, locale)}</td></tr>
            ))}
          </tbody>
        </table>
        {!loading && (!result || result.rows.length === 0) && <div className="px-6 py-16 text-center text-[12px] text-app-text-secondary">{ko ? "조건에 맞는 실제 링크 데이터가 없습니다." : "No real link data matches the current filters."}</div>}
        {loading && <div className="px-6 py-16 text-center text-[12px] text-app-text-secondary">{ko ? "불러오는 중…" : "Loading…"}</div>}
      </div>
      {result && <div className="flex items-center justify-between border-t border-app-border px-4 py-3 text-[11px] text-app-text-secondary"><span>{result.total === null ? (ko ? "Bing 제공 페이지 기준" : "Bing provider pages") : `${formatNumber(result.total, locale)}${ko ? "개" : " rows"}`}</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => { const next = page - 1; setPage(next); onQueryState({ page: next, sort, direction, search }); }} className="rounded-[6px] border border-app-border p-1.5 disabled:opacity-35"><ChevronLeftIcon /></button><span>{page} / {result.totalPages}</span><button disabled={page >= result.totalPages} onClick={() => { const next = page + 1; setPage(next); onQueryState({ page: next, sort, direction, search }); }} className="rounded-[6px] border border-app-border p-1.5 disabled:opacity-35"><ChevronRightIcon /></button></div></div>}
    </section>
  );
}
