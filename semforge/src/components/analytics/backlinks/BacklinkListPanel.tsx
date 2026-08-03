"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client-api";
import type {
  BacklinkDataset,
  BacklinkFilters,
  BacklinkListResult,
  BacklinkRow,
  BacklinkScope,
} from "@/server/backlinks/contracts";

const EMPTY_FILTERS: BacklinkFilters = {
  status: "all",
  attribute: "all",
  linkType: "all",
  search: "",
  dateFrom: null,
  dateTo: null,
};

const DEFAULT_SORT: Record<BacklinkDataset, string> = {
  links: "page_score",
  ref_domains: "backlinks_count",
  anchors: "domains_count",
  pages: "domains_count",
};

const SORT_LABELS: Record<string, { ko: string; en: string }> = {
  page_score: { ko: "페이지 점수", en: "Page score" },
  domain_score: { ko: "도메인 점수", en: "Domain score" },
  backlinks_count: { ko: "백링크", en: "Backlinks" },
  domains_count: { ko: "추천 도메인", en: "Ref. domains" },
  first_seen_at: { ko: "최초 발견", en: "First seen" },
  last_seen_at: { ko: "최근 확인", en: "Last seen" },
};

function number(value: number | null, locale: "ko" | "en"): string {
  return value === null ? "—" : new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US").format(value);
}

function date(value: string | null, locale: "ko" | "en"): string {
  if (!value) return "—";
  const parsed = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { year: "numeric", month: "short", day: "numeric" }).format(parsed)
    : value.slice(0, 10);
}

function safeHref(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return new Set(["http:", "https:"]).has(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function ExternalValue({ value, secondary }: { value: string; secondary?: string | null }) {
  const href = safeHref(value);
  return (
    <div className="min-w-[220px] max-w-[420px]">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="block truncate font-medium text-app-blue hover:underline" title={value}>{value}</a>
      ) : (
        <span className="block truncate" title={value}>{value || "—"}</span>
      )}
      {secondary && <span className="mt-0.5 block truncate text-[11px] text-app-text-secondary" title={secondary}>{secondary}</span>}
    </div>
  );
}

function Badges({ row, locale }: { row: Extract<BacklinkRow, { kind: "links" }>; locale: "ko" | "en" }) {
  const values = [
    row.nofollow ? "Nofollow" : "Follow",
    row.sponsored ? "Sponsored" : null,
    row.ugc ? "UGC" : null,
    row.image ? (locale === "ko" ? "이미지" : "Image") : null,
    row.form ? (locale === "ko" ? "폼" : "Form") : null,
    row.frame ? (locale === "ko" ? "프레임" : "Frame") : null,
    row.isNew ? (locale === "ko" ? "신규" : "New") : null,
    row.isLost ? (locale === "ko" ? "누락" : "Lost") : null,
  ].filter((value): value is string => Boolean(value));
  return <div className="flex min-w-[160px] flex-wrap gap-1">{values.map((value) => <span key={value} className="rounded-full bg-[#f0f2f5] px-2 py-0.5 text-[10px] text-app-text-secondary">{value}</span>)}</div>;
}

function ListTable({ result, locale }: { result: BacklinkListResult; locale: "ko" | "en" }) {
  const ko = locale === "ko";
  const th = "border-b border-[#e8eaee] bg-[#f8f9fb] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.25px] text-app-text-secondary";
  const td = "border-b border-[#eef0f2] px-3 py-3 align-top text-[12px] text-app-text";
  return (
    <div className="overflow-x-auto rounded-[9px] border border-app-border bg-white">
      <table className="w-full min-w-[900px] border-collapse">
        <thead>
          {result.dataset === "links" ? (
            <tr><th className={th}>{ko ? "소스 페이지" : "Source page"}</th><th className={th}>{ko ? "대상 URL / 앵커" : "Target / anchor"}</th><th className={th}>{ko ? "속성" : "Attributes"}</th><th className={`${th} text-right`}>AS</th><th className={`${th} text-right`}>PS</th><th className={th}>{ko ? "발견일" : "Seen"}</th></tr>
          ) : result.dataset === "ref_domains" ? (
            <tr><th className={th}>{ko ? "추천 도메인" : "Referring domain"}</th><th className={`${th} text-right`}>AS</th><th className={`${th} text-right`}>{ko ? "백링크" : "Backlinks"}</th><th className={th}>IP</th><th className={th}>{ko ? "속성" : "Attribute"}</th><th className={th}>{ko ? "발견일" : "Seen"}</th></tr>
          ) : result.dataset === "anchors" ? (
            <tr><th className={th}>{ko ? "앵커 텍스트" : "Anchor text"}</th><th className={`${th} text-right`}>{ko ? "백링크" : "Backlinks"}</th><th className={`${th} text-right`}>{ko ? "추천 도메인" : "Ref. domains"}</th><th className={th}>{ko ? "최초 발견" : "First seen"}</th><th className={th}>{ko ? "최근 확인" : "Last seen"}</th></tr>
          ) : (
            <tr><th className={th}>{ko ? "인덱싱 페이지" : "Indexed page"}</th><th className={`${th} text-right`}>{ko ? "상태" : "Status"}</th><th className={`${th} text-right`}>{ko ? "백링크" : "Backlinks"}</th><th className={`${th} text-right`}>{ko ? "추천 도메인" : "Ref. domains"}</th><th className={th}>{ko ? "발견일" : "Seen"}</th></tr>
          )}
        </thead>
        <tbody>
          {result.rows.map((row, index) => {
            if (row.kind === "links") return <tr key={`${row.sourceUrl}|${row.targetUrl}|${index}`} className="hover:bg-[#fafbfc]"><td className={td}><ExternalValue value={row.sourceUrl} secondary={row.sourceTitle ?? row.sourceDomain} /></td><td className={td}><ExternalValue value={row.targetUrl} secondary={row.anchor} /></td><td className={td}><Badges row={row} locale={locale} /></td><td className={`${td} text-right`}>{number(row.domainScore, locale)}</td><td className={`${td} text-right`}>{number(row.pageScore, locale)}</td><td className={td}><span className="block whitespace-nowrap">{date(row.firstSeenAt, locale)}</span><span className="mt-1 block whitespace-nowrap text-[11px] text-app-text-secondary">{date(row.lastSeenAt, locale)}</span></td></tr>;
            if (row.kind === "ref_domains") return <tr key={`${row.domain}|${index}`} className="hover:bg-[#fafbfc]"><td className={td}><ExternalValue value={row.domain} secondary={row.country} /></td><td className={`${td} text-right`}>{number(row.domainScore, locale)}</td><td className={`${td} text-right font-medium`}>{number(row.backlinks, locale)}</td><td className={td}>{row.ipAddress ?? "—"}</td><td className={td}><div className="flex flex-wrap gap-1"><span>{row.follow === null ? "—" : row.follow ? "Follow" : "Nofollow"}</span>{row.isNew && <span className="rounded-full bg-[#eaf8f2] px-1.5 text-[10px] text-[#147a58]">{ko ? "신규" : "New"}</span>}{row.isLost && <span className="rounded-full bg-[#fff0f0] px-1.5 text-[10px] text-[#a12828]">{ko ? "누락" : "Lost"}</span>}</div></td><td className={td}><span className="block whitespace-nowrap">{date(row.firstSeenAt, locale)}</span><span className="mt-1 block whitespace-nowrap text-[11px] text-app-text-secondary">{date(row.lastSeenAt, locale)}</span></td></tr>;
            if (row.kind === "anchors") return <tr key={`${row.anchor}|${index}`} className="hover:bg-[#fafbfc]"><td className={`${td} max-w-[440px] font-medium`}>{row.anchor || (ko ? "앵커 없음" : "No anchor")}</td><td className={`${td} text-right`}>{number(row.backlinks, locale)}</td><td className={`${td} text-right`}>{number(row.referringDomains, locale)}</td><td className={td}>{date(row.firstSeenAt, locale)}</td><td className={td}>{date(row.lastSeenAt, locale)}</td></tr>;
            return <tr key={`${row.url}|${index}`} className="hover:bg-[#fafbfc]"><td className={td}><ExternalValue value={row.url} secondary={row.title} /></td><td className={`${td} text-right`}>{number(row.responseCode, locale)}</td><td className={`${td} text-right`}>{number(row.backlinks, locale)}</td><td className={`${td} text-right`}>{number(row.referringDomains, locale)}</td><td className={td}><span className="block whitespace-nowrap">{date(row.firstSeenAt, locale)}</span><span className="mt-1 block whitespace-nowrap text-[11px] text-app-text-secondary">{date(row.lastSeenAt, locale)}</span></td></tr>;
          })}
        </tbody>
      </table>
      {result.rows.length === 0 && <div className="flex h-[180px] items-center justify-center text-[13px] text-app-text-secondary">{ko ? "조건에 맞는 실제 데이터가 없습니다." : "No live data matches these filters."}</div>}
    </div>
  );
}

export function BacklinkListPanel({
  target,
  scope,
  dataset,
  locale,
  initialPage = 1,
  initialSort,
  initialDirection = "desc",
  onQueryState,
}: {
  target: string;
  scope: BacklinkScope;
  dataset: BacklinkDataset;
  locale: "ko" | "en";
  initialPage?: number;
  initialSort?: string;
  initialDirection?: "asc" | "desc";
  onQueryState: (state: { page: number; sort: string; direction: "asc" | "desc" }) => void;
}) {
  const ko = locale === "ko";
  const [draft, setDraft] = useState<BacklinkFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<BacklinkFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(Math.max(1, initialPage));
  const [sort, setSort] = useState(initialSort || DEFAULT_SORT[dataset]);
  const [direction, setDirection] = useState<"asc" | "desc">(initialDirection);
  const [result, setResult] = useState<BacklinkListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportLimit, setExportLimit] = useState<100 | 500 | 1000>(100);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.post<BacklinkListResult>("/api/analytics/backlinks/list/", {
      target,
      scope,
      dataset,
      page,
      pageSize: 25,
      sort,
      direction,
      filters,
    }).then(({ data }) => {
      if (active) setResult(data);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : (ko ? "목록을 불러오지 못했습니다." : "Could not load the list."));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [dataset, direction, filters, ko, page, scope, sort, target]);

  const sortOptions = useMemo(() => {
    if (dataset === "links") return ["page_score", "domain_score", "first_seen_at", "last_seen_at"];
    if (dataset === "ref_domains") return ["backlinks_count", "domain_score", "first_seen_at", "last_seen_at"];
    return dataset === "anchors"
      ? ["domains_count", "backlinks_count", "first_seen_at", "last_seen_at"]
      : ["domains_count", "backlinks_count", "first_seen_at", "last_seen_at"];
  }, [dataset]);

  const updateQuery = (next: { page?: number; sort?: string; direction?: "asc" | "desc" }) => {
    const nextPage = next.page ?? page;
    const nextSort = next.sort ?? sort;
    const nextDirection = next.direction ?? direction;
    setPage(nextPage);
    setSort(nextSort);
    setDirection(nextDirection);
    setLoading(true);
    setError(null);
    onQueryState({ page: nextPage, sort: nextSort, direction: nextDirection });
  };

  const exportCsv = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const response = await fetch("/api/analytics/backlinks/export/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, scope, dataset, page: 1, pageSize: 25, sort, direction, filters, limit: exportLimit }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? (ko ? "CSV를 만들지 못했습니다." : "Could not create CSV."));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `backlinks-${dataset}-${Date.now()}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setExportOpen(false);
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : (ko ? "CSV를 만들지 못했습니다." : "Could not create CSV."));
    } finally {
      setExporting(false);
    }
  };

  const unitEstimate = exportLimit * (dataset === "links" ? 45 : 40);
  return (
    <section className="space-y-3">
      <div className="rounded-[9px] border border-app-border bg-white p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[190px] flex-1 sm:max-w-[320px]"><span className="mb-1 block text-[11px] font-medium text-app-text-secondary">{ko ? "URL·도메인·앵커 검색" : "URL, domain or anchor"}</span><input value={draft.search} onChange={(event) => setDraft({ ...draft, search: event.target.value })} className="h-9 w-full rounded-[7px] border border-app-border px-3 text-[12px] outline-none focus:border-app-blue" placeholder={ko ? "포함할 텍스트" : "Contains text"} /></label>
          {(dataset === "links" || dataset === "ref_domains") && <label><span className="mb-1 block text-[11px] font-medium text-app-text-secondary">{ko ? "상태" : "Status"}</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as BacklinkFilters["status"] })} className="h-9 rounded-[7px] border border-app-border bg-white px-2.5 text-[12px]"><option value="all">{ko ? "전체" : "All"}</option><option value="new">{ko ? "신규" : "New"}</option><option value="lost">{ko ? "누락" : "Lost"}</option></select></label>}
          {(dataset === "links" || dataset === "ref_domains") && <label><span className="mb-1 block text-[11px] font-medium text-app-text-secondary">{ko ? "속성" : "Attribute"}</span><select value={draft.attribute} onChange={(event) => setDraft({ ...draft, attribute: event.target.value as BacklinkFilters["attribute"] })} className="h-9 rounded-[7px] border border-app-border bg-white px-2.5 text-[12px]"><option value="all">{ko ? "전체" : "All"}</option><option value="follow">Follow</option><option value="nofollow">Nofollow</option>{dataset === "links" && <><option value="sponsored">Sponsored</option><option value="ugc">UGC</option></>}</select></label>}
          {dataset === "links" && <label><span className="mb-1 block text-[11px] font-medium text-app-text-secondary">{ko ? "유형" : "Type"}</span><select value={draft.linkType} onChange={(event) => setDraft({ ...draft, linkType: event.target.value as BacklinkFilters["linkType"] })} className="h-9 rounded-[7px] border border-app-border bg-white px-2.5 text-[12px]"><option value="all">{ko ? "전체" : "All"}</option><option value="text">{ko ? "텍스트" : "Text"}</option><option value="image">{ko ? "이미지" : "Image"}</option><option value="form">{ko ? "폼" : "Form"}</option><option value="frame">{ko ? "프레임" : "Frame"}</option></select></label>}
          <label><span className="mb-1 block text-[11px] font-medium text-app-text-secondary">{ko ? "시작일" : "From"}</span><input type="date" value={draft.dateFrom ?? ""} onChange={(event) => setDraft({ ...draft, dateFrom: event.target.value || null })} className="h-9 rounded-[7px] border border-app-border px-2 text-[12px]" /></label>
          <label><span className="mb-1 block text-[11px] font-medium text-app-text-secondary">{ko ? "종료일" : "To"}</span><input type="date" value={draft.dateTo ?? ""} onChange={(event) => setDraft({ ...draft, dateTo: event.target.value || null })} className="h-9 rounded-[7px] border border-app-border px-2 text-[12px]" /></label>
          <button type="button" onClick={() => { setLoading(true); setError(null); setFilters({ ...draft }); updateQuery({ page: 1 }); }} className="h-9 rounded-[7px] bg-[#171a26] px-4 text-[12px] font-semibold text-white">{ko ? "적용" : "Apply"}</button>
          <button type="button" onClick={() => { setLoading(true); setError(null); setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); updateQuery({ page: 1 }); }} className="h-9 rounded-[7px] border border-app-border px-3 text-[12px]">{ko ? "초기화" : "Reset"}</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-app-text-secondary">{result ? `${number(result.total, locale)} ${ko ? "개 결과" : "results"}` : ""}</span>
        <div className="ml-auto flex items-center gap-2">
          <select value={sort} onChange={(event) => updateQuery({ page: 1, sort: event.target.value })} className="h-8 rounded-[6px] border border-app-border bg-white px-2 text-[11px]">{sortOptions.map((value) => <option key={value} value={value}>{SORT_LABELS[value]?.[locale] ?? value}</option>)}</select>
          <button type="button" onClick={() => updateQuery({ page: 1, direction: direction === "desc" ? "asc" : "desc" })} className="h-8 rounded-[6px] border border-app-border bg-white px-2.5 text-[11px]">{direction === "desc" ? "↓ DESC" : "↑ ASC"}</button>
          <button type="button" onClick={() => setExportOpen(true)} className="h-8 rounded-[6px] border border-app-border bg-white px-3 text-[11px] font-medium">CSV</button>
        </div>
      </div>

      {error && <div className="rounded-[8px] border border-[#f1c3c3] bg-[#fff6f6] p-4 text-[13px] text-[#a12828]">{error}</div>}
      {loading && <div className="flex h-[260px] items-center justify-center rounded-[9px] border border-app-border bg-white text-[13px] text-app-text-secondary">{ko ? "Semrush 데이터를 불러오는 중…" : "Loading Semrush data…"}</div>}
      {!loading && result && <ListTable result={result} locale={locale} />}

      {result && result.totalPages > 1 && <div className="flex items-center justify-center gap-3"><button type="button" disabled={page <= 1 || loading} onClick={() => updateQuery({ page: page - 1 })} className="h-8 rounded-[6px] border border-app-border bg-white px-3 text-[11px] disabled:opacity-40">{ko ? "이전" : "Previous"}</button><span className="text-[12px] text-app-text-secondary">{page.toLocaleString()} / {result.totalPages.toLocaleString()}</span><button type="button" disabled={page >= result.totalPages || loading} onClick={() => updateQuery({ page: page + 1 })} className="h-8 rounded-[6px] border border-app-border bg-white px-3 text-[11px] disabled:opacity-40">{ko ? "다음" : "Next"}</button></div>}

      {exportOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-labelledby="backlink-export-title"><div className="w-full max-w-[430px] rounded-[12px] bg-white p-5 shadow-xl"><div className="flex items-start justify-between gap-3"><div><h2 id="backlink-export-title" className="text-[16px] font-semibold">{ko ? "CSV 내보내기" : "Export CSV"}</h2><p className="mt-1 text-[12px] leading-5 text-app-text-secondary">{ko ? "현재 필터와 정렬을 적용해 첫 N개 행을 내보냅니다." : "Exports the first N rows with the current filters and sort."}</p></div><button type="button" onClick={() => setExportOpen(false)} className="h-7 w-7 rounded-full bg-app-bg text-[14px]">×</button></div><label className="mt-4 block text-[12px] font-medium">{ko ? "행 수" : "Rows"}<select value={exportLimit} onChange={(event) => setExportLimit(Number(event.target.value) as 100 | 500 | 1000)} className="mt-1.5 h-10 w-full rounded-[7px] border border-app-border bg-white px-3"><option value={100}>100</option><option value={500}>500</option><option value={1000}>1,000</option></select></label><div className="mt-3 rounded-[8px] bg-[#fff8e8] p-3 text-[12px] leading-5 text-[#725317]">{ko ? `캐시가 없으면 Semrush API 유닛이 최대 약 ${unitEstimate.toLocaleString()}개 사용됩니다.` : `A cache miss may use up to about ${unitEstimate.toLocaleString()} Semrush API units.`}</div>{exportError && <p className="mt-3 text-[12px] text-[#b3261e]">{exportError}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setExportOpen(false)} className="h-9 rounded-[7px] border border-app-border px-4 text-[12px]">{ko ? "취소" : "Cancel"}</button><button type="button" disabled={exporting} onClick={() => void exportCsv()} className="h-9 rounded-[7px] bg-[#171a26] px-4 text-[12px] font-semibold text-white disabled:opacity-50">{exporting ? (ko ? "생성 중…" : "Exporting…") : (ko ? "CSV 생성" : "Create CSV")}</button></div></div></div>}
    </section>
  );
}
