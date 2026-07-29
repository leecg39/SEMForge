"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import {
  SiteAuditSetupDialog,
  type SiteAuditSetupValues,
} from "@/components/siteaudit/SiteAuditSetupDialog";

export interface SiteAuditCampaignRow {
  id: string;
  name: string;
  domain: string;
  crawlScope: "domain" | "subdomain" | "path";
  pageLimit: number;
  crawlSource: "website" | "sitemap" | "url_list";
  schedule: "off" | "weekly" | "monthly";
  status: "idle" | "queued" | "running" | "completed" | "failed";
  siteHealth: number | null;
  lastRunAt: string | null;
}

interface IssueRow {
  id: string;
  severity: "error" | "warning" | "notice";
  title: string;
  count: number;
  status: string;
  pages: string[];
}

interface RunReport {
  campaignId: string;
  campaignName: string;
  domain: string;
  crawledPages: number;
  failedFetches: number;
  siteHealth: number;
  durationMs: number;
  finishedAt: string;
  sourceNote?: string;
  crawlEngine?: "firecrawl" | "self";
  firecrawl?: { mappedUrls: number; scrapeFailures: number };
  totals: { errors: number; warnings: number; notices: number };
}

const COPY = {
  ko: {
    eyebrow: "SEO · 사이트 크롤링",
    title: "사이트 진단",
    description:
      "크롤 엔진(Firecrawl 또는 자체 크롤러)이 사이트 페이지를 실제로 수집하고, 상태 코드·제목 태그·메타 설명·이미지 대체 텍스트·내부 링크를 항목별로 검사합니다.",
    newAudit: "새 사이트 진단",
    runNow: "지금 크롤 실행",
    running: "크롤링 중…",
    crawlerWorking: "크롤러가 사이트를 검사하고 있습니다",
    crawlerHint: "페이지 수와 응답 속도에 따라 수십 초가 걸릴 수 있습니다. 완료되면 결과가 자동으로 표시됩니다.",
    elapsed: (seconds: number) => `${seconds}초 경과`,
    siteHealth: "Site Health",
    crawledPages: "크롤링한 페이지",
    fetchFailed: "연결 실패",
    engineLabel: "크롤 엔진",
    engineFirecrawl: "Firecrawl",
    engineSelf: "자체 크롤러",
    mappedUrls: (count: number) => `매핑 URL ${count}개`,
    scrapeFailed: (count: number) => `수집 실패 ${count}개`,
    lastRun: "마지막 크롤",
    issues: "이슈",
    errors: "Errors",
    warnings: "Warnings",
    notices: "Notices",
    issueColumn: "이슈",
    countColumn: "건수",
    affectedPages: (count: number) => `영향받는 페이지 ${count}개`,
    noIssues: "이 심각도의 이슈가 없습니다.",
    noCampaignsTitle: "아직 사이트 진단 프로젝트가 없습니다",
    noCampaignsBody:
      "프로젝트를 만들고 크롤링을 시작하면 Site Health 와 항목별 이슈를 여기서 확인할 수 있습니다.",
    noCampaignsCta: "사이트 진단 설정 열기",
    projects: "프로젝트",
    projectName: "이름",
    projectDomain: "도메인",
    projectStatus: "상태",
    projectHealth: "Site Health",
    projectLastRun: "마지막 실행",
    projectLimit: "페이지 제한",
    projectSchedule: "예약",
    projectActions: "작업",
    statusIdle: "대기",
    statusQueued: "큐 대기",
    statusRunning: "크롤링 중",
    statusCompleted: "완료",
    statusFailed: "실패",
    scheduleOff: "없음",
    scheduleWeekly: "매주",
    scheduleMonthly: "매월",
    never: "실행 기록 없음",
    runError: "크롤링 실행에 실패했습니다.",
    loadError: "이슈를 불러오지 못했습니다.",
    listLoadError: "프로젝트 목록을 불러오지 못했습니다.",
    createError: "프로젝트 생성에 실패했습니다.",
    reportDone: "크롤링 완료",
    reportSummary: (pages: number, ms: number) =>
      `${pages}개 페이지 검사 · ${(ms / 1000).toFixed(1)}초 소요`,
    selectCampaign: "프로젝트 선택",
    runAgain: "다시 크롤",
    openSetup: "설정 열기",
  },
  en: {
    eyebrow: "SEO · Site Crawling",
    title: "Site Audit",
    description:
      "A crawl engine (Firecrawl or the built-in crawler) actually collects your site's pages and checks status codes, title tags, meta descriptions, image alt text, and internal links.",
    newAudit: "New Site Audit",
    runNow: "Run crawl now",
    running: "Crawling…",
    crawlerWorking: "The crawler is auditing your website",
    crawlerHint: "This can take tens of seconds depending on page count and response times. Results appear automatically.",
    elapsed: (seconds: number) => `${seconds}s elapsed`,
    siteHealth: "Site Health",
    crawledPages: "Crawled pages",
    fetchFailed: "Unreachable",
    engineLabel: "Crawl engine",
    engineFirecrawl: "Firecrawl",
    engineSelf: "Built-in crawler",
    mappedUrls: (count: number) => `${count} mapped URLs`,
    scrapeFailed: (count: number) => `${count} scrapes failed`,
    lastRun: "Last crawl",
    issues: "Issues",
    errors: "Errors",
    warnings: "Warnings",
    notices: "Notices",
    issueColumn: "Issue",
    countColumn: "Count",
    affectedPages: (count: number) => `${count} affected pages`,
    noIssues: "No issues with this severity.",
    noCampaignsTitle: "No Site Audit projects yet",
    noCampaignsBody:
      "Create a project and run a crawl to see Site Health and per-category issues here.",
    noCampaignsCta: "Open Site Audit setup",
    projects: "Projects",
    projectName: "Name",
    projectDomain: "Domain",
    projectStatus: "Status",
    projectHealth: "Site Health",
    projectLastRun: "Last run",
    projectLimit: "Page limit",
    projectSchedule: "Schedule",
    projectActions: "Actions",
    statusIdle: "Idle",
    statusQueued: "Queued",
    statusRunning: "Running",
    statusCompleted: "Completed",
    statusFailed: "Failed",
    scheduleOff: "None",
    scheduleWeekly: "Weekly",
    scheduleMonthly: "Monthly",
    never: "Never run",
    runError: "The crawl failed to run.",
    loadError: "Issues could not be loaded.",
    listLoadError: "Projects could not be loaded.",
    createError: "The project could not be created.",
    reportDone: "Crawl finished",
    reportSummary: (pages: number, ms: number) =>
      `${pages} pages checked in ${(ms / 1000).toFixed(1)}s`,
    selectCampaign: "Select a project",
    runAgain: "Re-crawl",
    openSetup: "Open setup",
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

const SEVERITY_STYLE = {
  error: { dot: "#e01b4b", chip: "bg-[#fdecef] text-[#a4002a]" },
  warning: { dot: "#f5a623", chip: "bg-[#fff6e5] text-[#8a5a00]" },
  notice: { dot: "#235FE2", chip: "bg-[#eaf1fd] text-[#235FE2]" },
} as const;

function healthColor(value: number): string {
  if (value >= 80) return "#00a87d";
  if (value >= 50) return "#ff642d";
  return "#e01b4b";
}

function HealthGauge({ value, label }: { value: number | null; label: string }) {
  const radius = 54;
  const half = Math.PI * radius;
  const fraction = value === null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  const color = value === null ? "#c4c7cf" : healthColor(value);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 72" className="h-[110px] w-[180px]" role="img" aria-label={label}>
        <path
          d="M 6 66 A 54 54 0 0 1 114 66"
          fill="none"
          stroke="#eceef2"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M 6 66 A 54 54 0 0 1 114 66"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(fraction * half).toFixed(1)} ${half.toFixed(1)}`}
        />
        <text
          x="60"
          y="62"
          textAnchor="middle"
          fontSize="22"
          fontWeight="700"
          fill={value === null ? "#9a9ea8" : color}
        >
          {value === null ? "–" : `${value}%`}
        </text>
      </svg>
      <span className="mt-1 text-[12px] font-medium text-app-text-secondary">{label}</span>
    </div>
  );
}

function StatusBadge({ status, copy }: { status: SiteAuditCampaignRow["status"]; copy: Copy }) {
  const map = {
    idle: { label: copy.statusIdle, className: "bg-[#eceef2] text-app-text-secondary" },
    queued: { label: copy.statusQueued, className: "bg-[#eaf1fd] text-[#235FE2]" },
    running: { label: copy.statusRunning, className: "bg-[#eaf1fd] text-[#235FE2]" },
    completed: { label: copy.statusCompleted, className: "bg-[#e6f5f0] text-[#0a6b57]" },
    failed: { label: copy.statusFailed, className: "bg-[#fdecef] text-[#a4002a]" },
  } as const;
  const item = map[status] ?? map.idle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium",
        item.className
      )}
    >
      {status === "running" && (
        <span className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
      )}
      {item.label}
    </span>
  );
}

export function SiteAuditDashboard({
  campaigns: initialCampaigns,
  canManage,
}: {
  campaigns: SiteAuditCampaignRow[];
  canManage: boolean;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [selectedId, setSelectedId] = useState(initialCampaigns[0]?.id ?? "");
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [loadedIssuesFor, setLoadedIssuesFor] = useState<string | null>(null);
  const [issueTotals, setIssueTotals] = useState({ errors: 0, warnings: 0, notices: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(
    () => initialCampaigns.length === 0 && canManage
  );
  const [submitting, setSubmitting] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [report, setReport] = useState<RunReport | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [severityTab, setSeverityTab] = useState<"error" | "warning" | "notice">("error");
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);

  const campaign = useMemo(
    () => campaigns.find((item) => item.id === selectedId) ?? null,
    [campaigns, selectedId]
  );
  const issuesLoading = Boolean(selectedId) && selectedId !== loadedIssuesFor;

  const loadIssues = useCallback(async (campaignId: string) => {
    try {
      const response = await api.get<IssueRow[]>(
        `/api/site-audits/${encodeURIComponent(campaignId)}/issues/`
      );
      setIssues(response.data);
      const meta = response.meta as
        | { totals?: { errors: number; warnings: number; notices: number } }
        | undefined;
      setIssueTotals(
        meta?.totals ?? {
          errors: response.data.filter((i) => i.severity === "error").reduce((s, i) => s + i.count, 0),
          warnings: response.data.filter((i) => i.severity === "warning").reduce((s, i) => s + i.count, 0),
          notices: response.data.filter((i) => i.severity === "notice").reduce((s, i) => s + i.count, 0),
        }
      );
      setLoadError(null);
    } catch (caught) {
      setLoadError(caught instanceof ClientApiError ? caught.message : COPY.ko.loadError);
      setIssues([]);
    } finally {
      setLoadedIssuesFor(campaignId);
    }
  }, []);

  const loadCampaigns = useCallback(async (keepSelected?: string) => {
    try {
      const response = await api.get<SiteAuditCampaignRow[]>(
        "/api/site-audits/?sort=updatedAt:desc&pageSize=100"
      );
      setCampaigns(response.data);
      if (keepSelected) setSelectedId(keepSelected);
      else {
        setSelectedId((current) =>
          response.data.some((row) => row.id === current)
            ? current
            : (response.data[0]?.id ?? "")
        );
      }
    } catch {
      setLoadError((prev) => prev ?? COPY.ko.listLoadError);
    }
  }, []);

  useEffect(() => {
    // loadIssues() 의 setState 는 첫 await 이후에만 실행된다 (동기 연쇄 렌더 없음).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedId) void loadIssues(selectedId);
  }, [selectedId, loadIssues]);

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const runCrawl = useCallback(
    async (campaignId: string) => {
      if (running) return;
      setRunning(true);
      setRunError(null);
      setReport(null);
      setElapsed(0);
      try {
        const response = await api.post<RunReport>(
          `/api/site-audits/${encodeURIComponent(campaignId)}/run/`
        );
        setReport(response.data);
        await Promise.all([loadCampaigns(campaignId), loadIssues(campaignId)]);
      } catch (caught) {
        setRunError(caught instanceof ClientApiError ? caught.message : COPY.ko.runError);
        await loadCampaigns(campaignId);
      } finally {
        setRunning(false);
      }
    },
    [running, loadCampaigns, loadIssues]
  );

  const createAndRun = async (values: SiteAuditSetupValues) => {
    if (submitting) return;
    setSubmitting(true);
    setSetupError(null);
    try {
      const created = await api.post<SiteAuditCampaignRow>("/api/site-audits/", {
        name: values.name,
        domain: values.domain,
        crawlScope: values.crawlScope,
        pageLimit: values.pageLimit,
        crawlSource: values.crawlSource,
        schedule: values.schedule,
      });
      setSetupOpen(false);
      await loadCampaigns(created.data.id);
      void runCrawl(created.data.id);
    } catch (caught) {
      setSetupError(
        caught instanceof ClientApiError
          ? (caught.fields?.name ?? caught.fields?.domain ?? caught.message)
          : COPY.ko.createError
      );
    } finally {
      setSubmitting(false);
    }
  };

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale]
  );

  const filteredIssues = issues.filter((issue) => issue.severity === severityTab);
  const scheduleLabel = (value: SiteAuditCampaignRow["schedule"]) =>
    value === "weekly" ? copy.scheduleWeekly : value === "monthly" ? copy.scheduleMonthly : copy.scheduleOff;

  return (
    <div className="p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.65px] text-app-blue">
            {copy.eyebrow}
          </p>
          <h1 className="mt-1 text-[24px] font-semibold leading-[32px] text-app-text">
            {copy.title}
          </h1>
          <p className="mt-1 max-w-[760px] text-[13px] leading-[20px] text-app-text-secondary">
            {copy.description}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            {campaign && (
              <button
                type="button"
                onClick={() => void runCrawl(campaign.id)}
                disabled={running}
                className="h-[40px] rounded-[8px] border border-app-border bg-white px-4 text-[14px] font-medium text-app-text transition-colors hover:bg-app-bg disabled:cursor-not-allowed disabled:opacity-60"
              >
                {running ? copy.running : copy.runAgain}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSetupError(null);
                setSetupOpen(true);
              }}
              className="h-[40px] rounded-[8px] bg-app-orange px-5 text-[14px] font-medium text-white transition-colors hover:bg-[#e5541f]"
            >
              {copy.newAudit}
            </button>
          </div>
        )}
      </header>

      {campaigns.length === 0 ? (
        <section className="mt-6 max-w-[560px] rounded-[10px] border border-app-border bg-white p-8 text-center">
          <h2 className="text-[16px] font-semibold text-app-text">{copy.noCampaignsTitle}</h2>
          <p className="mt-2 text-[13px] leading-[20px] text-app-text-secondary">
            {copy.noCampaignsBody}
          </p>
          {canManage && (
            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              className="mt-4 h-[38px] rounded-[8px] bg-app-orange px-5 text-[13px] font-medium text-white transition-colors hover:bg-[#e5541f]"
            >
              {copy.noCampaignsCta}
            </button>
          )}
        </section>
      ) : (
        <>
          <section className="mt-5 rounded-[10px] border border-app-border bg-white p-4">
            <div className="flex flex-wrap items-center gap-4">
              <label className="min-w-[260px] flex-1">
                <span className="mb-1.5 block text-[12px] font-medium text-app-text-secondary">
                  {copy.selectCampaign}
                </span>
                <select
                  value={selectedId}
                  onChange={(event) => setSelectedId(event.target.value)}
                  className="h-[40px] w-full rounded-[8px] border border-app-border bg-white px-3 text-[14px] text-app-text"
                >
                  {campaigns.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.domain}
                    </option>
                  ))}
                </select>
              </label>
              {campaign && (
                <div className="flex items-center gap-6 text-[13px]">
                  <div>
                    <span className="block text-[12px] text-app-text-secondary">
                      {copy.projectStatus}
                    </span>
                    <StatusBadge status={campaign.status} copy={copy} />
                  </div>
                  <div>
                    <span className="block text-[12px] text-app-text-secondary">
                      {copy.lastRun}
                    </span>
                    <span className="text-app-text" suppressHydrationWarning>
                      {campaign.lastRunAt
                        ? dateFormatter.format(new Date(campaign.lastRunAt))
                        : copy.never}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {running && (
            <section
              className="mt-4 flex items-center gap-4 rounded-[10px] border border-[#bfd4fb] bg-[#f4f7fe] px-5 py-4"
              role="status"
            >
              <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-[#235FE2] border-t-transparent" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-app-text">{copy.crawlerWorking}</p>
                <p className="mt-0.5 text-[12px] text-app-text-secondary">
                  {copy.crawlerHint} · {copy.elapsed(elapsed)}
                </p>
                <div className="relative mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#dbe4f8]">
                  <div className="absolute inset-y-0 w-1/3 animate-[sa-crawl-progress_1.4s_ease-in-out_infinite] rounded-full bg-[#235FE2]" />
                </div>
                <style>{`@keyframes sa-crawl-progress { 0% { left: -33%; } 100% { left: 100%; } }`}</style>
              </div>
            </section>
          )}

          {(report || runError) && !running && (
            <section
              className={cn(
                "mt-4 rounded-[8px] border px-4 py-3 text-[13px]",
                runError
                  ? "border-[#f5c2cd] bg-[#fdecef] text-[#a4002a]"
                  : "border-[#bfe6d8] bg-[#e6f5f0] text-[#0a6b57]"
              )}
              role="status"
            >
              {runError ?? (
                <>
                  <span className="font-semibold">{copy.reportDone}</span>
                  {" · "}
                  {copy.reportSummary(report!.crawledPages, report!.durationMs)}
                  {" · "}
                  {copy.siteHealth} {report!.siteHealth}%
                  {" · "}
                  {copy.engineLabel}:{" "}
                  {report!.crawlEngine === "firecrawl" ? copy.engineFirecrawl : copy.engineSelf}
                  {report!.crawlEngine === "firecrawl" && report!.firecrawl
                    ? ` · ${copy.mappedUrls(report!.firecrawl.mappedUrls)}`
                    : ""}
                  {report!.crawlEngine === "firecrawl" &&
                  report!.firecrawl &&
                  report!.firecrawl.scrapeFailures > 0
                    ? ` · ${copy.scrapeFailed(report!.firecrawl.scrapeFailures)}`
                    : ""}
                  {report!.sourceNote ? ` · ${report!.sourceNote}` : ""}
                </>
              )}
            </section>
          )}

          <section className="mt-4 grid gap-4 lg:grid-cols-[240px_1fr]">
            <div className="flex items-center justify-center rounded-[10px] border border-app-border bg-white p-4">
              <HealthGauge
                value={report && !running ? report.siteHealth : (campaign?.siteHealth ?? null)}
                label={copy.siteHealth}
              />
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-[10px] border border-app-border bg-white p-4">
                <span className="block text-[12px] text-app-text-secondary">{copy.errors}</span>
                <span className="mt-1 block text-[24px] font-semibold text-[#a4002a]">
                  {issueTotals.errors}
                </span>
              </div>
              <div className="rounded-[10px] border border-app-border bg-white p-4">
                <span className="block text-[12px] text-app-text-secondary">{copy.warnings}</span>
                <span className="mt-1 block text-[24px] font-semibold text-[#8a5a00]">
                  {issueTotals.warnings}
                </span>
              </div>
              <div className="rounded-[10px] border border-app-border bg-white p-4">
                <span className="block text-[12px] text-app-text-secondary">{copy.notices}</span>
                <span className="mt-1 block text-[24px] font-semibold text-[#235FE2]">
                  {issueTotals.notices}
                </span>
              </div>
              <div className="rounded-[10px] border border-app-border bg-white p-4">
                <span className="block text-[12px] text-app-text-secondary">
                  {copy.crawledPages}
                </span>
                <span className="mt-1 block text-[24px] font-semibold text-app-text">
                  {report && !running ? report.crawledPages : "–"}
                </span>
                {report && !running && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-[4px] bg-[#eceef2] px-1.5 py-0.5 text-[11px] font-medium text-app-text-secondary">
                    {copy.engineLabel}:{" "}
                    {report.crawlEngine === "firecrawl" ? copy.engineFirecrawl : copy.engineSelf}
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="mt-4 overflow-hidden rounded-[10px] border border-app-border bg-white">
            <div className="flex gap-1 border-b border-app-border px-4 pt-3">
              {(
                [
                  ["error", copy.errors, issueTotals.errors],
                  ["warning", copy.warnings, issueTotals.warnings],
                  ["notice", copy.notices, issueTotals.notices],
                ] as const
              ).map(([key, label, total]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSeverityTab(key)}
                  className={cn(
                    "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
                    severityTab === key
                      ? "border-app-orange text-app-text"
                      : "border-transparent text-app-text-secondary hover:text-app-text"
                  )}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: SEVERITY_STYLE[key].dot }}
                  />
                  {label}
                  <span className="rounded-[4px] bg-[#eceef2] px-1.5 py-0.5 text-[11px] text-app-text-secondary">
                    {total}
                  </span>
                </button>
              ))}
            </div>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-app-border bg-[#f9fafb] text-[12px] text-app-text-secondary">
                  <th className="px-4 py-2.5 font-medium">{copy.issueColumn}</th>
                  <th className="w-[110px] px-4 py-2.5 text-right font-medium">
                    {copy.countColumn}
                  </th>
                </tr>
              </thead>
              <tbody>
                {loadError && (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-[13px] text-app-red">
                      {loadError}
                    </td>
                  </tr>
                )}
                {!loadError && issuesLoading && (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-[13px] text-app-text-secondary">
                      …
                    </td>
                  </tr>
                )}
                {!loadError && !issuesLoading && filteredIssues.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-[13px] text-app-text-secondary">
                      {copy.noIssues}
                    </td>
                  </tr>
                )}
                {!loadError &&
                  !issuesLoading &&
                  filteredIssues.map((issue) => (
                    <FragmentIssueRow
                      key={issue.id}
                      issue={issue}
                      expanded={expandedIssue === issue.id}
                      onToggle={() =>
                        setExpandedIssue((current) => (current === issue.id ? null : issue.id))
                      }
                      copy={copy}
                    />
                  ))}
              </tbody>
            </table>
          </section>

          <section className="mt-6">
            <h2 className="mb-2 text-[15px] font-semibold text-app-text">{copy.projects}</h2>
            <div className="overflow-hidden rounded-[10px] border border-app-border bg-white">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-app-border bg-[#f9fafb] text-[12px] text-app-text-secondary">
                    <th className="px-4 py-2.5 font-medium">{copy.projectName}</th>
                    <th className="px-4 py-2.5 font-medium">{copy.projectDomain}</th>
                    <th className="px-4 py-2.5 font-medium">{copy.projectStatus}</th>
                    <th className="px-4 py-2.5 text-center font-medium">{copy.projectHealth}</th>
                    <th className="px-4 py-2.5 text-center font-medium">{copy.projectLimit}</th>
                    <th className="px-4 py-2.5 text-center font-medium">{copy.projectSchedule}</th>
                    <th className="px-4 py-2.5 font-medium">{copy.projectLastRun}</th>
                    {canManage && (
                      <th className="px-4 py-2.5 text-right font-medium">{copy.projectActions}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={cn(
                        "cursor-pointer border-b border-app-border text-[13px] last:border-b-0 hover:bg-[#f9fafb]",
                        item.id === selectedId && "bg-[#f4f7fe] hover:bg-[#f4f7fe]"
                      )}
                    >
                      <td className="px-4 py-2.5 font-medium text-app-text">{item.name}</td>
                      <td className="px-4 py-2.5 text-app-text-secondary">{item.domain}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={item.status} copy={copy} />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {item.siteHealth === null ? (
                          <span className="text-app-text-secondary">–</span>
                        ) : (
                          <span
                            className="font-semibold"
                            style={{ color: healthColor(item.siteHealth) }}
                          >
                            {item.siteHealth}%
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center text-app-text-secondary">
                        {item.pageLimit}
                      </td>
                      <td className="px-4 py-2.5 text-center text-app-text-secondary">
                        {scheduleLabel(item.schedule)}
                      </td>
                      <td className="px-4 py-2.5 text-app-text-secondary" suppressHydrationWarning>
                        {item.lastRunAt
                          ? dateFormatter.format(new Date(item.lastRunAt))
                          : copy.never}
                      </td>
                      {canManage && (
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedId(item.id);
                              void runCrawl(item.id);
                            }}
                            disabled={running || item.status === "running"}
                            className="h-[30px] rounded-[6px] border border-app-border bg-white px-3 text-[12px] font-medium text-app-text transition-colors hover:bg-app-bg disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {item.status === "running" ? copy.running : copy.runNow}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <SiteAuditSetupDialog
        open={setupOpen}
        locale={locale}
        submitting={submitting}
        error={setupError}
        onClose={() => setSetupOpen(false)}
        onSubmit={(values) => void createAndRun(values)}
      />
    </div>
  );
}

function FragmentIssueRow({
  issue,
  expanded,
  onToggle,
  copy,
}: {
  issue: IssueRow;
  expanded: boolean;
  onToggle: () => void;
  copy: Copy;
}) {
  const style = SEVERITY_STYLE[issue.severity];
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-app-border text-[13px] last:border-b-0 hover:bg-[#f9fafb]"
      >
        <td className="px-4 py-2.5">
          <span className="flex items-center gap-2.5">
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 shrink-0 rounded-full transition-transform",
                expanded && "rotate-90"
              )}
              style={{ backgroundColor: style.dot }}
            />
            <span className="font-medium text-app-text">{issue.title}</span>
            {issue.pages.length > 0 && (
              <span className="text-[11px] text-app-text-secondary">
                {expanded ? "▾" : "▸"}
              </span>
            )}
          </span>
        </td>
        <td className="px-4 py-2.5 text-right">
          <span
            className={cn(
              "inline-block rounded-[4px] px-1.5 py-0.5 text-[12px] font-semibold",
              style.chip
            )}
          >
            {issue.count}
          </span>
        </td>
      </tr>
      {expanded && issue.pages.length > 0 && (
        <tr className="border-b border-app-border bg-[#f9fafb] last:border-b-0">
          <td colSpan={2} className="px-10 py-3">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.4px] text-app-text-secondary">
              {copy.affectedPages(issue.count)}
            </p>
            <ul className="max-h-[220px] space-y-1 overflow-y-auto text-[12px] text-app-blue">
              {issue.pages.map((page) => (
                <li key={page} className="break-all">
                  <a href={page} target="_blank" rel="noreferrer" className="hover:underline">
                    {page}
                  </a>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
