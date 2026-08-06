"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { MagnifyingGlassIcon, OpenInNewWindowIcon } from "@radix-ui/react-icons";
import { api } from "@/lib/client-api";
import type {
  AuditLinkItem,
  AuditReviewStatus,
  AuditRiskLevel,
  AuditStatus,
} from "@/server/backlink-audit/contracts";

interface ListResult {
  rows: AuditLinkItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  comparableChanges: boolean;
}

const riskTone: Record<AuditRiskLevel, string> = {
  high: "bg-[#fff0f1] text-[#b42332] border-[#f3c6cb]",
  medium: "bg-[#fff7e8] text-[#8a5a00] border-[#efd59b]",
  low: "bg-[#eaf9f3] text-[#167456] border-[#bce8d7]",
  unscored: "bg-[#f2f3f5] text-[#656b76] border-[#dfe2e7]",
};

function copy(locale: "ko" | "en") {
  const ko = locale === "ko";
  return {
    risk: { high: ko ? "높음" : "High", medium: ko ? "중간" : "Medium", low: ko ? "낮음" : "Low", unscored: ko ? "미평가" : "Unscored" },
    audit: { active: ko ? "활성" : "Active", missing: ko ? "링크 없음" : "Missing", unavailable: ko ? "확인 불가" : "Unavailable", unverified: ko ? "확인 전" : "Unverified" },
    review: { pending: ko ? "미검토" : "Pending", safe: ko ? "정상" : "Safe", watch: ko ? "주의" : "Watch", remove: ko ? "삭제 요청" : "Removal", disavow: ko ? "거부 후보" : "Disavow", ignore: ko ? "무시" : "Ignore" },
  } as const;
}

export function BacklinkAuditLinks({ projectId, locale, mode = "audit", onChanged }: {
  projectId: string;
  locale: "ko" | "en";
  mode?: "audit" | "changes";
  onChanged?: () => void;
}) {
  const ko = locale === "ko";
  const labels = copy(locale);
  const [result, setResult] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [risk, setRisk] = useState<AuditRiskLevel | "">("");
  const [auditStatus, setAuditStatus] = useState<AuditStatus | "">("");
  const [review, setReview] = useState<AuditReviewStatus | "">("");
  const [change, setChange] = useState<"new" | "lost">("new");
  const [sort, setSort] = useState("risk");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "25", sort, direction });
    if (appliedSearch) params.set("search", appliedSearch);
    if (risk) params.set("riskLevel", risk);
    if (auditStatus) params.set("auditStatus", auditStatus);
    if (review) params.set("reviewStatus", review);
    if (mode === "changes") params.set("change", change);
    return params;
  }, [appliedSearch, auditStatus, change, direction, mode, page, review, risk, sort]);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await api.get<ListResult>(`/api/backlink-audits/projects/${projectId}/links/?${query}`);
      setResult(data); setSelected(new Set());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (ko ? "백링크 목록을 불러오지 못했습니다." : "Could not load backlinks."));
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [projectId, query.toString()]); // eslint-disable-line react-hooks/exhaustive-deps

  const applySearch = (event: FormEvent) => { event.preventDefault(); setPage(1); setAppliedSearch(search.trim()); };
  const reviewSelected = async (decision: AuditReviewStatus) => {
    if (selected.size === 0) return;
    setBusy(true); setError(null);
    try {
      await api.patch(`/api/backlink-audits/projects/${projectId}/reviews/`, { linkIds: [...selected], decision });
      await load(); onChanged?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : (ko ? "검토 상태를 저장하지 못했습니다." : "Could not save the review.")); }
    finally { setBusy(false); }
  };
  const allSelected = Boolean(result?.rows.length) && result!.rows.every((row) => selected.has(row.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(result?.rows.map((row) => row.id) ?? []));

  return <section className="overflow-hidden rounded-[9px] border border-app-border bg-white">
    <div className="border-b border-app-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        {mode === "changes" && <div className="flex rounded-[7px] border border-app-border bg-[#f8f9fb] p-0.5">{(["new", "lost"] as const).map((value) => <button key={value} type="button" onClick={() => { setChange(value); setPage(1); }} className={`rounded-[5px] px-3 py-1.5 text-[10px] font-semibold ${change === value ? "bg-white text-[#6557e8] shadow-sm" : "text-app-text-secondary"}`}>{value === "new" ? (ko ? "신규" : "New") : (ko ? "누락" : "Lost")}</button>)}</div>}
        <form onSubmit={applySearch} className="flex min-w-[230px] flex-1"><div className="relative w-full"><MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-app-text-secondary" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ko ? "URL·도메인·앵커 검색" : "Search URL, domain or anchor"} className="h-9 w-full rounded-l-[7px] border border-app-border pl-9 pr-3 text-[11px] outline-none focus:border-[#6557e8]" /></div><button className="h-9 rounded-r-[7px] bg-[#171a26] px-3 text-[10px] font-semibold text-white">{ko ? "검색" : "Search"}</button></form>
        <select value={risk} onChange={(event) => { setRisk(event.target.value as AuditRiskLevel | ""); setPage(1); }} className="h-9 rounded-[7px] border border-app-border bg-white px-2 text-[10px]"><option value="">{ko ? "모든 위험도" : "All risk"}</option>{(["high", "medium", "low", "unscored"] as const).map((value) => <option key={value} value={value}>{labels.risk[value]}</option>)}</select>
        <select value={auditStatus} onChange={(event) => { setAuditStatus(event.target.value as AuditStatus | ""); setPage(1); }} className="h-9 rounded-[7px] border border-app-border bg-white px-2 text-[10px]"><option value="">{ko ? "모든 확인 상태" : "All checks"}</option>{(["active", "missing", "unavailable", "unverified"] as const).map((value) => <option key={value} value={value}>{labels.audit[value]}</option>)}</select>
        <select value={review} onChange={(event) => { setReview(event.target.value as AuditReviewStatus | ""); setPage(1); }} className="h-9 rounded-[7px] border border-app-border bg-white px-2 text-[10px]"><option value="">{ko ? "모든 검토 상태" : "All reviews"}</option>{(["pending", "safe", "watch", "remove", "disavow", "ignore"] as const).map((value) => <option key={value} value={value}>{labels.review[value]}</option>)}</select>
        <select value={`${sort}:${direction}`} onChange={(event) => { const [nextSort, nextDirection] = event.target.value.split(":"); setSort(nextSort); setDirection(nextDirection as "asc" | "desc"); setPage(1); }} className="h-9 rounded-[7px] border border-app-border bg-white px-2 text-[10px]"><option value="risk:desc">{ko ? "위험도 높은 순" : "Highest risk"}</option><option value="risk:asc">{ko ? "위험도 낮은 순" : "Lowest risk"}</option><option value="domain:asc">{ko ? "도메인순" : "Domain"}</option><option value="checked:desc">{ko ? "최근 확인순" : "Recently checked"}</option></select>
      </div>
      {selected.size > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[7px] bg-[#f4f2ff] px-3 py-2"><span className="mr-1 text-[10px] font-semibold text-[#5c4fd2]">{selected.size}{ko ? "개 선택" : " selected"}</span>{(["safe", "watch", "remove", "disavow", "ignore"] as const).map((decision) => <button key={decision} type="button" disabled={busy} onClick={() => void reviewSelected(decision)} className={`h-7 rounded-[6px] px-2.5 text-[10px] font-semibold ${decision === "disavow" ? "bg-[#171a26] text-white" : decision === "remove" ? "bg-[#fff0f1] text-[#b42332]" : "border border-[#d8d5ef] bg-white text-app-text"}`}>{labels.review[decision]}</button>)}</div>}
      {error && <p role="alert" className="mt-3 rounded-[7px] bg-[#fff0f1] px-3 py-2 text-[11px] text-[#a12828]">{error}</p>}
    </div>

    <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-[11px]"><thead className="bg-[#f8f9fb] text-[10px] text-app-text-secondary"><tr><th className="w-10 px-3 py-2.5"><input aria-label={ko ? "전체 선택" : "Select all"} type="checkbox" checked={allSelected} onChange={toggleAll} /></th><th className="px-3 py-2.5">{ko ? "출처 페이지" : "Source page"}</th><th className="px-3 py-2.5">{ko ? "대상 페이지" : "Target page"}</th><th className="px-3 py-2.5">{ko ? "앵커" : "Anchor"}</th><th className="px-3 py-2.5">{ko ? "확인" : "Check"}</th><th className="px-3 py-2.5">{ko ? "속성" : "Attributes"}</th><th className="px-3 py-2.5">{ko ? "우선순위" : "Priority"}</th><th className="px-3 py-2.5">{ko ? "검토" : "Review"}</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={8} className="px-4 py-16 text-center text-app-text-secondary">{ko ? "실제 링크 데이터를 불러오는 중…" : "Loading real link data…"}</td></tr> : result?.rows.map((row) => <tr key={row.id} className="border-t border-[#eef0f2] align-top hover:bg-[#fbfbfd]">
        <td className="px-3 py-3"><input aria-label={row.sourceUrl} type="checkbox" checked={selected.has(row.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })} /></td>
        <td className="max-w-[265px] px-3 py-3"><a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 truncate font-medium text-[#285fca] hover:underline"><span className="truncate">{row.sourceDomain}</span><OpenInNewWindowIcon className="shrink-0" /></a><p className="mt-1 truncate text-[9px] text-app-text-secondary" title={row.sourceUrl}>{row.sourceUrl}</p>{row.fetchError && <p className="mt-1 line-clamp-2 text-[9px] text-[#a15a24]">{row.fetchError}</p>}</td>
        <td className="max-w-[280px] px-3 py-3"><a href={row.targetUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-[#285fca] hover:underline" title={row.targetUrl}>{row.targetUrl}</a><p className={`mt-1 text-[9px] ${row.targetStatus && row.targetStatus >= 400 ? "text-[#b42332]" : "text-app-text-secondary"}`}>HTTP {row.targetStatus ?? "—"}</p></td>
        <td className="max-w-[180px] px-3 py-3"><p className="line-clamp-2 text-app-text">{row.observedAnchor ?? row.providerAnchor ?? "—"}</p><p className="mt-1 text-[9px] text-app-text-secondary">{row.linkType}</p></td>
        <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-semibold ${row.auditStatus === "active" ? "bg-[#eaf9f3] text-[#167456]" : row.auditStatus === "missing" ? "bg-[#fff7e8] text-[#8a5a00]" : "bg-[#f2f3f5] text-[#656b76]"}`}>{labels.audit[row.auditStatus]}</span><p className="mt-1 text-[9px] text-app-text-secondary">HTTP {row.sourceStatus ?? "—"}</p></td>
        <td className="px-3 py-3 text-[9px] text-app-text-secondary"><div className="flex max-w-[120px] flex-wrap gap-1">{row.isFollow && <span className="rounded bg-[#eaf9f3] px-1.5 py-0.5 text-[#167456]">follow</span>}{row.isNofollow && <span className="rounded bg-[#eeeefe] px-1.5 py-0.5 text-[#5547c8]">nofollow</span>}{row.isSponsored && <span className="rounded bg-[#fff7e8] px-1.5 py-0.5 text-[#8a5a00]">sponsored</span>}{row.isUgc && <span className="rounded bg-[#fff7e8] px-1.5 py-0.5 text-[#8a5a00]">ugc</span>}{row.isFollow === null && <span>—</span>}</div></td>
        <td className="max-w-[210px] px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold ${riskTone[row.riskLevel]}`}>{labels.risk[row.riskLevel]} {row.riskLevel !== "unscored" && row.riskScore}</span>{row.signals.map((signal) => <p key={signal.code} className="mt-1 line-clamp-2 text-[9px] text-app-text-secondary" title={signal.evidence}>• {signal.label}</p>)}</td>
        <td className="px-3 py-3"><span className="whitespace-nowrap rounded-[5px] bg-[#f2f3f5] px-2 py-1 text-[9px] font-medium text-app-text">{labels.review[row.reviewStatus]}</span></td>
      </tr>)}{!loading && result?.rows.length === 0 && <tr><td colSpan={8} className="px-4 py-16 text-center text-app-text-secondary">{mode === "changes" && !result.comparableChanges ? (ko ? "신규·누락은 감사 실행이 2회 이상 쌓인 뒤 계산됩니다." : "New and lost links require at least two audit runs.") : (ko ? "조건에 맞는 실제 백링크가 없습니다." : "No real backlinks match these filters.")}</td></tr>}
    </tbody></table></div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-app-border px-4 py-3 text-[10px] text-app-text-secondary"><span>{result ? `${result.total.toLocaleString()} ${ko ? "개" : "links"}` : "—"}</span><div className="flex items-center gap-2"><button type="button" disabled={!result || result.page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="h-8 rounded-[6px] border border-app-border px-3 disabled:opacity-35">{ko ? "이전" : "Previous"}</button><span>{result?.page ?? 1} / {result?.totalPages ?? 1}</span><button type="button" disabled={!result || result.page >= result.totalPages || loading} onClick={() => setPage((value) => value + 1)} className="h-8 rounded-[6px] border border-app-border px-3 disabled:opacity-35">{ko ? "다음" : "Next"}</button></div></div>
  </section>;
}
