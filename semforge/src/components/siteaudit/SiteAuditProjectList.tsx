"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SearchIcon } from "@/components/app/app-icons";
import {
  SeoProjectCreateDialog,
  type CreatedSeoProject,
} from "@/components/siteaudit/SeoProjectCreateDialog";
import {
  SiteAuditProjectSetupDialog,
  type SiteAuditEditableConfig,
} from "@/components/siteaudit/SiteAuditProjectSetupDialog";
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type {
  SiteAuditProjectListResult,
  SiteAuditProjectRow,
} from "@/server/siteaudit/projects";

type MetricKey = keyof NonNullable<SiteAuditProjectRow["metrics"]>;
type ProjectListMeta = SiteAuditProjectListResult["meta"];

const METRICS: { key: MetricKey; label: string; compact?: boolean; inverse?: boolean }[] = [
  { key: "crawledPages", label: "크롤링 페이지", compact: true },
  { key: "siteHealth", label: "Site Health" },
  { key: "aiSearch", label: "AI Search" },
  { key: "errors", label: "Errors", compact: true, inverse: true },
  { key: "warnings", label: "Warnings", compact: true, inverse: true },
  { key: "crawlability", label: "Crawlability" },
  { key: "https", label: "HTTPS" },
  { key: "internationalSeo", label: "International SEO" },
  { key: "performance", label: "Performance" },
  { key: "internalLinking", label: "Internal Linking" },
  { key: "markup", label: "Markup" },
  { key: "coreWebVitals", label: "Core Web Vitals" },
];

const STATE_COPY: Record<SiteAuditProjectRow["state"], string> = {
  unconfigured: "설정 필요",
  idle: "실행 전",
  queued: "대기 중",
  running: "크롤링 중",
  completed: "완료",
  failed: "실패",
};

function Spinner({ label = "처리 중" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-app-text-secondary">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#5e92ec] border-t-transparent" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function MetricCell({
  row,
  metric,
}: {
  row: SiteAuditProjectRow;
  metric: (typeof METRICS)[number];
}) {
  if (row.state === "queued" || row.state === "running") {
    if (metric.key === "crawledPages") {
      const progress = row.latestRun?.crawledPages ?? 0;
      const limit = row.latestRun?.pageLimit ?? row.config?.pageLimit ?? 0;
      return (
        <span className="inline-flex items-center gap-2 whitespace-nowrap font-medium text-[#1f64c8]">
          <Spinner /> {progress}/{limit}
        </span>
      );
    }
    return <Spinner label={`${metric.label} 계산 중`} />;
  }

  const value = row.metrics?.[metric.key] ?? null;
  const delta = row.deltas?.[metric.key] ?? null;
  if (value === null) return <span className="text-app-text-secondary">—</span>;
  const favorable = delta === null || delta === 0 ? null : metric.inverse ? delta < 0 : delta > 0;
  return (
    <span className="inline-flex flex-col items-end">
      <span className="font-medium tabular-nums text-app-text">
        {value.toLocaleString("ko-KR")}{metric.compact ? "" : "%"}
      </span>
      {delta !== null && delta !== 0 && (
        <span className={cn("text-[10px] tabular-nums", favorable ? "text-[#0a7a5a]" : "text-[#c43c4d]")}
          aria-label={`이전 실행 대비 ${delta > 0 ? "증가" : "감소"} ${Math.abs(delta)}`}
        >
          {delta > 0 ? "+" : ""}{delta.toLocaleString("ko-KR")}
        </span>
      )}
    </span>
  );
}

function stateClass(state: SiteAuditProjectRow["state"]) {
  if (state === "failed") return "bg-[#fdecef] text-[#a4002a]";
  if (state === "completed") return "bg-[#e6f5f0] text-[#08715b]";
  if (state === "running" || state === "queued") return "bg-[#e8f2ff] text-[#1f64c8]";
  if (state === "unconfigured") return "bg-[#fff3d6] text-[#7a5100]";
  return "bg-[#eef0f3] text-app-text-secondary";
}

function ProjectActions({
  row,
  canManage,
  busy,
  onSetup,
  onRun,
}: {
  row: SiteAuditProjectRow;
  canManage: boolean;
  busy: boolean;
  onSetup: () => void;
  onRun: () => void;
}) {
  if (!canManage) return null;
  if (!row.campaignId) {
    return <button type="button" onClick={onSetup} className="h-8 whitespace-nowrap rounded-[6px] bg-app-orange px-3 text-[12px] font-semibold text-white hover:bg-[#e5541f]">진단 설정</button>;
  }
  const active = row.state === "queued" || row.state === "running";
  return (
    <div className="flex items-center justify-end gap-1.5">
      <button type="button" onClick={onSetup} className="h-8 rounded-[6px] border border-app-border px-2.5 text-[12px] font-medium text-app-text hover:bg-app-bg">설정</button>
      <button type="button" disabled={active || busy} onClick={onRun} className="h-8 whitespace-nowrap rounded-[6px] bg-app-blue px-3 text-[12px] font-semibold text-white hover:bg-[#1c50c2] disabled:cursor-not-allowed disabled:opacity-50">
        {active ? "실행 중" : "크롤 실행"}
      </button>
    </div>
  );
}

export function SiteAuditProjectList({
  initialRows,
  initialMeta,
  canManage,
}: {
  initialRows: SiteAuditProjectRow[];
  initialMeta: ProjectListMeta;
  canManage: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [rows, setRows] = useState(initialRows);
  const [meta, setMeta] = useState(initialMeta);
  const [query, setQuery] = useState(initialMeta.q);
  const [createOpen, setCreateOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupProject, setSetupProject] = useState<CreatedSeoProject | null>(null);
  const [setupConfig, setSetupConfig] = useState<SiteAuditEditableConfig | null>(null);
  const [busyCampaign, setBusyCampaign] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const updateUrl = useCallback((next: { q: string; page: number; pageSize: number; sort: string }) => {
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.page > 1) params.set("page", String(next.page));
    if (next.pageSize !== 10) params.set("pageSize", String(next.pageSize));
    if (next.sort !== "updatedAt:desc") params.set("sort", next.sort);
    router.replace(`${pathname}${params.size ? `?${params.toString()}` : ""}`, { scroll: false });
  }, [pathname, router]);

  const load = useCallback(async (overrides?: Partial<Pick<ProjectListMeta, "q" | "page" | "pageSize" | "sort">>, syncUrl = false) => {
    const next = {
      q: overrides?.q ?? meta.q,
      page: overrides?.page ?? meta.page,
      pageSize: overrides?.pageSize ?? meta.pageSize,
      sort: overrides?.sort ?? meta.sort,
    };
    const params = new URLSearchParams({
      q: next.q,
      page: String(next.page),
      pageSize: String(next.pageSize),
      sort: next.sort,
    });
    try {
      const response = await api.get<SiteAuditProjectRow[]>(`/api/site-audits/projects/?${params.toString()}`);
      setRows(response.data);
      const responseMeta = response.meta as ProjectListMeta;
      setMeta(responseMeta);
      setError(null);
      if (syncUrl) updateUrl(responseMeta);
    } catch (caught) {
      setError(caught instanceof ClientApiError ? caught.message : "프로젝트 목록을 불러오지 못했습니다.");
    }
  }, [meta.page, meta.pageSize, meta.q, meta.sort, updateUrl]);

  const hasActiveRuns = useMemo(() => rows.some((row) => row.state === "queued" || row.state === "running"), [rows]);
  useEffect(() => {
    if (!hasActiveRuns) return;
    const timer = window.setInterval(() => { void load(); }, 2500);
    return () => window.clearInterval(timer);
  }, [hasActiveRuns, load]);

  const openSetup = (row: SiteAuditProjectRow) => {
    setSetupProject({ id: row.projectId, name: row.name, domain: row.domain });
    setSetupConfig(row.config as SiteAuditEditableConfig | null);
    setSetupOpen(true);
  };

  const run = async (row: SiteAuditProjectRow) => {
    if (!row.campaignId || busyCampaign) return;
    setBusyCampaign(row.campaignId);
    setError(null);
    try {
      await api.post(`/api/site-audits/${encodeURIComponent(row.campaignId)}/run/`);
      setAnnouncement(`${row.name} 크롤 실행이 백그라운드 대기열에 저장되었습니다.`);
      await load();
    } catch (caught) {
      setError(caught instanceof ClientApiError ? caught.message : "크롤 실행을 시작하지 못했습니다.");
    } finally {
      setBusyCampaign(null);
    }
  };

  const shownFrom = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const shownTo = Math.min(meta.total, meta.page * meta.pageSize);

  return (
    <div className="min-w-0 p-4 sm:p-6 lg:p-8">
      <div aria-live="polite" className="sr-only">{announcement}</div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] font-medium text-app-text-secondary">SEO Toolkit · Site Audit</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.35px] text-app-text">사이트 진단 프로젝트</h1>
          <p className="mt-1 max-w-[760px] text-[13px] leading-5 text-app-text-secondary">프로젝트별 최신 크롤 상태와 핵심 기술 SEO 지표를 비교합니다. 작은 숫자는 이전 완료 실행 대비 변화량입니다.</p>
        </div>
        {canManage && (
          <button type="button" onClick={() => setCreateOpen(true)} className="h-10 rounded-[7px] bg-app-orange px-5 text-[13px] font-semibold text-white shadow-sm hover:bg-[#e5541f]">+ SEO 프로젝트 생성</button>
        )}
      </header>

      <section className="mt-6 rounded-[10px] border border-app-border bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-app-border p-4">
          <form
            className="flex h-9 min-w-[240px] max-w-[420px] flex-1 items-center gap-2 rounded-[7px] border border-app-border px-3 focus-within:border-app-blue"
            onSubmit={(event) => {
              event.preventDefault();
              void load({ q: query.trim(), page: 1 }, true);
            }}
          >
            <SearchIcon width={15} height={15} className="text-app-text-secondary" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="프로젝트 또는 도메인 검색" aria-label="사이트 진단 프로젝트 검색" className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
          </form>
          <label className="ml-auto flex items-center gap-2 text-[12px] text-app-text-secondary">
            정렬
            <select value={meta.sort} onChange={(event) => void load({ sort: event.target.value as ProjectListMeta["sort"], page: 1 }, true)} className="h-9 rounded-[7px] border border-app-border bg-white px-2.5 text-[12px] text-app-text">
              <option value="updatedAt:desc">최근 업데이트</option>
              <option value="updatedAt:asc">오래된 업데이트</option>
              <option value="name:asc">이름 오름차순</option>
              <option value="name:desc">이름 내림차순</option>
            </select>
          </label>
        </div>

        {error && <p role="alert" className="m-4 rounded-[8px] border border-[#f5c2cd] bg-[#fdecef] px-3 py-2.5 text-[13px] text-[#a4002a]">{error}</p>}

        <div className="overflow-x-auto" tabIndex={0} aria-label="사이트 진단 프로젝트 지표 표. 가로로 스크롤할 수 있습니다.">
          <table className="w-full min-w-[1860px] border-collapse text-[12px]">
            <caption className="sr-only">사이트 진단 프로젝트별 실행 상태, 최신 지표 및 이전 실행 대비 변화량</caption>
            <thead>
              <tr className="bg-[#f7f8fa] text-left text-app-text-secondary">
                <th scope="col" className="sticky left-0 z-20 w-[270px] border-b border-r border-app-border bg-[#f7f8fa] px-4 py-3 font-medium">프로젝트</th>
                <th scope="col" className="w-[130px] border-b border-app-border px-3 py-3 font-medium">최근 업데이트</th>
                {METRICS.map((metric) => <th key={metric.key} scope="col" className="w-[112px] border-b border-app-border px-3 py-3 text-right font-medium">{metric.label}</th>)}
                <th scope="col" className="w-[180px] border-b border-app-border px-4 py-3 text-right font-medium">작업</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const active = row.state === "queued" || row.state === "running";
                return (
                  <tr key={row.projectId} className={cn("group border-b border-app-border last:border-b-0 hover:bg-[#fafbfc]", active && "bg-[#eef8fc] hover:bg-[#e8f5fa]")}>
                    <th scope="row" className={cn("sticky left-0 z-10 border-r border-app-border px-4 py-4 text-left", active ? "bg-[#eef8fc] group-hover:bg-[#e8f5fa]" : "bg-white group-hover:bg-[#fafbfc]")}>
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[#ede9ff] text-[13px] font-bold text-[#6045b8]" aria-hidden="true">S</span>
                        <span className="min-w-0">
                          {row.campaignId ? (
                            <Link href={`/siteaudit/?campaign=${encodeURIComponent(row.campaignId)}`} className="block truncate text-[13px] font-semibold text-app-blue hover:underline">{row.name}</Link>
                          ) : (
                            <button type="button" onClick={() => openSetup(row)} className="block max-w-[185px] truncate text-left text-[13px] font-semibold text-app-blue hover:underline">{row.name}</button>
                          )}
                          <span className="mt-0.5 block max-w-[185px] truncate font-normal text-app-text-secondary">{row.domain}</span>
                          <span className={cn("mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", stateClass(row.state))}>{active && <span className="mr-1"><Spinner /></span>}{STATE_COPY[row.state]}</span>
                          {row.state === "failed" && row.latestRun?.errorMessage && <span title={row.latestRun.errorMessage} className="mt-1 block max-w-[190px] truncate text-[10px] font-normal text-app-red">{row.latestRun.errorMessage}</span>}
                        </span>
                      </div>
                    </th>
                    <td className="px-3 py-4 text-app-text-secondary"><span suppressHydrationWarning>{row.lastUpdatedAt ? new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(row.lastUpdatedAt)) : "—"}</span></td>
                    {METRICS.map((metric) => <td key={metric.key} className="px-3 py-4 text-right"><MetricCell row={row} metric={metric} /></td>)}
                    <td className="px-4 py-4"><ProjectActions row={row} canManage={canManage} busy={busyCampaign === row.campaignId} onSetup={() => openSetup(row)} onRun={() => void run(row)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <div className="px-6 py-14 text-center">
            <p className="text-[15px] font-semibold text-app-text">{meta.q ? "검색 결과가 없습니다" : "아직 SEO 프로젝트가 없습니다"}</p>
            <p className="mt-1 text-[13px] text-app-text-secondary">{meta.q ? "다른 프로젝트 이름이나 도메인을 입력해 보세요." : "프로젝트를 만들고 실제 사이트 크롤을 시작하세요."}</p>
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-app-border px-4 py-3 text-[12px] text-app-text-secondary">
          <span>총 {meta.total.toLocaleString("ko-KR")}개 · {shownFrom}-{shownTo} 표시</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5">페이지당 <select value={meta.pageSize} onChange={(event) => void load({ pageSize: Number(event.target.value), page: 1 }, true)} className="h-8 rounded-[6px] border border-app-border bg-white px-2 text-[12px] text-app-text"><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label>
            <button type="button" disabled={meta.page <= 1} onClick={() => void load({ page: meta.page - 1 }, true)} className="h-8 rounded-[6px] border border-app-border px-3 text-app-text hover:bg-app-bg disabled:opacity-40">이전</button>
            <span aria-label={`전체 ${meta.totalPages}페이지 중 ${meta.page}페이지`}>{meta.page}/{meta.totalPages}</span>
            <button type="button" disabled={meta.page >= meta.totalPages} onClick={() => void load({ page: meta.page + 1 }, true)} className="h-8 rounded-[6px] border border-app-border px-3 text-app-text hover:bg-app-bg disabled:opacity-40">다음</button>
          </div>
        </footer>
      </section>

      {createOpen && (
        <SeoProjectCreateDialog
          open
          onOpenChange={setCreateOpen}
          onCreated={(project) => {
            setSetupProject(project);
            setSetupConfig(null);
            setSetupOpen(true);
            setAnnouncement(`${project.name} 프로젝트가 생성되었습니다. 사이트 진단을 설정하세요.`);
            void load({ page: 1 });
          }}
        />
      )}
      {setupOpen && (
        <SiteAuditProjectSetupDialog
          open
          onOpenChange={setSetupOpen}
          project={setupProject}
          config={setupConfig}
          emailConfigured={meta.emailConfigured}
          onSaved={(_campaignId, started) => {
            setAnnouncement(started ? "설정을 저장하고 크롤 실행을 대기열에 추가했습니다." : "사이트 진단 설정을 저장했습니다.");
            void load({ page: 1 });
          }}
        />
      )}
    </div>
  );
}
