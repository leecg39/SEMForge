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
  linkGraph?: { edges: number; targetDomains: number };
  totals: { errors: number; warnings: number; notices: number };
}

type AuditTab = "overview" | "issues" | "pages" | "stats" | "themes";

type ThemeKey =
  | "crawlability"
  | "https"
  | "coreWebVitals"
  | "performance"
  | "internalLinking"
  | "internationalSeo"
  | "markup"
  | "pageResources"
  | "jsRendering";

type IssueCategory = "crawling" | "meta" | "resources" | "links" | "other";

interface ThemeScore {
  key: ThemeKey;
  score: number | null;
  affectedPages: number;
  urls: string[];
  measurable: boolean;
}

interface OverviewData {
  campaign: {
    id: string;
    name: string;
    domain: string;
    status: string;
    siteHealth: number | null;
    lastRunAt: string | null;
  };
  crawledPages: number;
  failedFetches: number;
  totals: { errors: number; warnings: number; notices: number };
  topIssues: {
    category: IssueCategory;
    count: number;
    issues: { severity: "error" | "warning" | "notice"; title: string; count: number }[];
  }[];
  themes: ThemeScore[];
  statistics: {
    depthDistribution: { depth: number; count: number }[];
    statusDistribution: { bucket: string; count: number }[];
    avgResponseMs: number | null;
    totalBytes: number;
  };
}

interface PageRow {
  id: string;
  url: string;
  statusCode: number;
  title: string | null;
  hasTitle: boolean;
  titleDup: boolean;
  metaDescriptionPresent: boolean;
  metaDup: boolean;
  imagesTotal: number;
  imagesMissingAlt: number;
  internalLinks: number;
  isHttps: boolean;
  hasJsonLd: boolean;
  bytes: number;
  responseMs: number;
  depth: number;
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
    linkEdges: (edges: number, domains: number) =>
      `외부 링크 엣지 ${edges}개 적재 (대상 도메인 ${domains}개)`,
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
    tabOverview: "개요",
    tabIssues: "문제",
    tabPages: "크롤링된 페이지",
    tabStats: "통계",
    tabThemes: "테마 보고서",
    auditHeader: (domain: string) => `Site Audit: ${domain}`,
    reportUpdated: (date: string) => `보고서 업데이트: ${date}`,
    allChecksPassed: "모든 검사가 통과되었습니다",
    issuesFound: (count: number) => `${count}개의 이슈가 발견되었습니다`,
    crawledPagesLabel: "크롤된 페이지",
    errorsShort: "오류",
    warningsShort: "경고",
    noticesShort: "알림",
    pagesUnit: (count: number) => `${count}개`,
    topIssues: "상위 이슈",
    thematicReports: "테마별 보고서",
    affectedPagesCount: (count: number) => `${count}개의 영향받는 페이지`,
    urlsCount: (count: number) => `${count}개의 URL`,
    notMeasurableNote: "크롤 데이터만으로는 측정할 수 없는 항목입니다.",
    categoryCrawling: "크롤링 및 색인 생성",
    categoryMeta: "메타 태그",
    categoryResources: "페이지 리소스",
    categoryLinks: "내부 링크",
    categoryOther: "기타",
    themeCrawlability: "크롤링 가능성",
    themeHttps: "HTTPS 구현",
    themeCoreWebVitals: "Core Web Vitals",
    themePerformance: "성능",
    themeInternalLinking: "내부 링크",
    themeInternationalSeo: "국제 SEO",
    themeMarkup: "마크업",
    themePageResources: "페이지 리소스",
    themeJsRendering: "JS 렌더링",
    noOverviewYet:
      "아직 크롤 결과가 없습니다. 크롤을 실행하면 Site Health 와 테마별 보고서가 여기에 표시됩니다.",
    noPagesYet: "아직 수집된 페이지가 없습니다. 크롤을 실행하면 페이지 목록이 표시됩니다.",
    pagesColUrl: "페이지 URL",
    pagesColStatus: "상태 코드",
    pagesColTitle: "제목",
    pagesColMeta: "메타 설명",
    pagesColImages: "이미지 alt",
    pagesColLinks: "내부 링크",
    pagesColDepth: "깊이",
    pagesColResponse: "응답",
    present: "있음",
    missing: "없음",
    dupBadge: "중복",
    statsDepthTitle: "페이지 깊이(클릭 깊이) 분포",
    statsStatusTitle: "상태 코드 분포",
    statsAvgResponse: "평균 응답 시간",
    statsTotalBytes: "수집한 HTML 크기",
    depthLabel: (depth: number) => `깊이 ${depth}`,
    bucketFailed: "수집 실패",
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
    linkEdges: (edges: number, domains: number) =>
      `${edges} outbound link edges stored (${domains} target domains)`,
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
    tabOverview: "Overview",
    tabIssues: "Issues",
    tabPages: "Crawled Pages",
    tabStats: "Statistics",
    tabThemes: "Thematic Reports",
    auditHeader: (domain: string) => `Site Audit: ${domain}`,
    reportUpdated: (date: string) => `Report updated: ${date}`,
    allChecksPassed: "All checks passed",
    issuesFound: (count: number) => `${count} issues found`,
    crawledPagesLabel: "Crawled pages",
    errorsShort: "Errors",
    warningsShort: "Warnings",
    noticesShort: "Notices",
    pagesUnit: (count: number) => `${count}`,
    topIssues: "Top Issues",
    thematicReports: "Thematic Reports",
    affectedPagesCount: (count: number) => `${count} affected pages`,
    urlsCount: (count: number) => `${count} URLs`,
    notMeasurableNote: "This theme cannot be measured from crawl data alone.",
    categoryCrawling: "Crawling & Indexing",
    categoryMeta: "Meta Tags",
    categoryResources: "Page Resources",
    categoryLinks: "Internal Links",
    categoryOther: "Other",
    themeCrawlability: "Crawlability",
    themeHttps: "HTTPS Implementation",
    themeCoreWebVitals: "Core Web Vitals",
    themePerformance: "Performance",
    themeInternalLinking: "Internal Linking",
    themeInternationalSeo: "International SEO",
    themeMarkup: "Markup",
    themePageResources: "Page Resources",
    themeJsRendering: "JS Rendering",
    noOverviewYet:
      "No crawl results yet. Run a crawl to see Site Health and thematic reports here.",
    noPagesYet: "No pages collected yet. Run a crawl to see the page list here.",
    pagesColUrl: "Page URL",
    pagesColStatus: "Status",
    pagesColTitle: "Title",
    pagesColMeta: "Meta description",
    pagesColImages: "Image alt",
    pagesColLinks: "Internal links",
    pagesColDepth: "Depth",
    pagesColResponse: "Response",
    present: "Present",
    missing: "Missing",
    dupBadge: "Dup",
    statsDepthTitle: "Page depth (click depth) distribution",
    statsStatusTitle: "Status code distribution",
    statsAvgResponse: "Average response time",
    statsTotalBytes: "HTML bytes collected",
    depthLabel: (depth: number) => `Depth ${depth}`,
    bucketFailed: "Fetch failed",
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

/**
 * 크롤러(crawl.ts)가 DB에 저장하는 이슈 제목은 한국어 원문이다.
 * 데이터 자체는 유지하고, en 로케일 렌더 시에만 영어로 매핑한다.
 */
const ISSUE_TITLE_EN: Record<string, string> = {
  "4xx 상태 코드를 반환하는 페이지": "Pages returning a 4xx status code",
  "5xx 상태 코드를 반환하는 페이지": "Pages returning a 5xx status code",
  "제목 태그가 없는 페이지": "Pages with missing title tags",
  "제목 태그가 중복된 페이지": "Pages with duplicate title tags",
  "메타 설명이 없는 페이지": "Pages with missing meta descriptions",
  "메타 설명이 중복된 페이지": "Pages with duplicate meta descriptions",
  "이미지에 대체 텍스트 없음": "Images with missing alt text",
  "내부 링크가 1개뿐인 페이지": "Pages with only one internal link",
};

function localizeIssueTitle(title: string, locale: "ko" | "en"): string {
  return locale === "en" ? (ISSUE_TITLE_EN[title] ?? title) : title;
}

const SEVERITY_STYLE = {
  error: { dot: "#e01b4b", chip: "bg-[#fdecef] text-[#a4002a]" },
  warning: { dot: "#f5a623", chip: "bg-[#fff6e5] text-[#8a5a00]" },
  notice: { dot: "#235FE2", chip: "bg-[#eaf1fd] text-[#235FE2]" },
} as const;

/** 개요 그리드 카드 순서 — Semrush 개요 탭의 3×3 배열과 동일 */
const THEME_ORDER: ThemeKey[] = [
  "crawlability",
  "https",
  "coreWebVitals",
  "performance",
  "internalLinking",
  "internationalSeo",
  "markup",
  "pageResources",
  "jsRendering",
];

const STATUS_BUCKET_COLOR: Record<string, string> = {
  "2xx": "#00a87d",
  "3xx": "#235FE2",
  "4xx": "#f5a623",
  "5xx": "#e01b4b",
  failed: "#9a9ea8",
  other: "#c4c7cf",
};

function healthColor(value: number): string {
  if (value >= 80) return "#00a87d";
  if (value >= 50) return "#ff642d";
  return "#e01b4b";
}

function statusChipClass(code: number): string {
  if (code >= 200 && code < 300) return "bg-[#e6f5f0] text-[#0a6b57]";
  if (code >= 300 && code < 400) return "bg-[#eaf1fd] text-[#235FE2]";
  if (code >= 400 && code < 500) return "bg-[#fff6e5] text-[#8a5a00]";
  if (code >= 500) return "bg-[#fdecef] text-[#a4002a]";
  return "bg-[#eceef2] text-app-text-secondary";
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function themeLabel(copy: Copy, key: ThemeKey): string {
  const map: Record<ThemeKey, string> = {
    crawlability: copy.themeCrawlability,
    https: copy.themeHttps,
    coreWebVitals: copy.themeCoreWebVitals,
    performance: copy.themePerformance,
    internalLinking: copy.themeInternalLinking,
    internationalSeo: copy.themeInternationalSeo,
    markup: copy.themeMarkup,
    pageResources: copy.themePageResources,
    jsRendering: copy.themeJsRendering,
  };
  return map[key];
}

function categoryLabel(copy: Copy, key: IssueCategory): string {
  const map: Record<IssueCategory, string> = {
    crawling: copy.categoryCrawling,
    meta: copy.categoryMeta,
    resources: copy.categoryResources,
    links: copy.categoryLinks,
    other: copy.categoryOther,
  };
  return map[key];
}

function HealthGauge({ value, label }: { value: number | null; label?: string }) {
  const radius = 54;
  const half = Math.PI * radius;
  const fraction = value === null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  const color = value === null ? "#c4c7cf" : healthColor(value);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 72" className="h-[110px] w-[180px]" role="img" aria-label={label ?? "Site Health"}>
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
      {label && (
        <span className="mt-1 text-[12px] font-medium text-app-text-secondary">{label}</span>
      )}
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

function NavIcon({ name }: { name: AuditTab }) {
  const paths: Record<AuditTab, string> = {
    overview: "M2.5 2.5h5v5h-5z M10.5 2.5h5v5h-5z M2.5 10.5h5v5h-5z M10.5 10.5h5v5h-5z",
    issues: "M9 2.8 16 15H2L9 2.8z M9 7v3.6 M9 12.8v.4",
    pages: "M5.5 4h10 M5.5 9h10 M5.5 14h10 M2 4h.01 M2 9h.01 M2 14h.01",
    stats: "M3 15.5v-5 M8.5 15.5v-9 M14 15.5V7 M2 15.5h14",
    themes: "M2.5 2.5h13v13h-13z M2.5 7h13 M2.5 11.5h13 M7 2.5v13 M11.5 2.5v13",
  };
  return (
    <svg
      viewBox="0 0 18 18"
      className="h-[15px] w-[15px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-[15px] w-[15px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d="m5.2 8.2 1.8 1.8 3.8-4" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-[14px] w-[14px] text-app-text-secondary transition-transform group-hover:translate-x-0.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </svg>
  );
}

/** 개요 탭 테마 카드 — 점수(%) 또는 미측정 시 "N개의 URL" 표시 */
function ThemeCard({
  theme,
  copy,
  onOpen,
}: {
  theme: ThemeScore;
  copy: Copy;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col rounded-[10px] border border-app-border bg-white p-4 text-left transition-shadow hover:shadow-[0_2px_10px_rgba(16,24,40,0.08)]"
    >
      <span className="text-[12px] font-medium text-app-text-secondary">
        {themeLabel(copy, theme.key)}
      </span>
      {theme.measurable ? (
        <span
          className="mt-2 text-[22px] font-semibold leading-[28px]"
          style={{ color: healthColor(theme.score ?? 0) }}
        >
          {theme.score}%
        </span>
      ) : (
        <span className="mt-2 text-[22px] font-semibold leading-[28px] text-app-text">
          {copy.urlsCount(0)}
        </span>
      )}
      <span className="mt-2 flex items-center justify-between border-t border-app-border pt-2.5 text-[12px]">
        <span className={theme.affectedPages > 0 ? "font-medium text-app-text" : "text-app-text-secondary"}>
          {copy.affectedPagesCount(theme.affectedPages)}
        </span>
        <ChevronRightIcon />
      </span>
    </button>
  );
}

function BarRows({
  items,
  colorFor,
}: {
  items: { key: string; label: string; count: number }[];
  colorFor: (key: string) => string;
}) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-3">
          <span className="w-[110px] shrink-0 truncate text-[12px] text-app-text-secondary">
            {item.label}
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block h-[16px] rounded-[3px]"
              style={{
                width: `${Math.max(item.count > 0 ? 3 : 0, (item.count / max) * 100)}%`,
                backgroundColor: colorFor(item.key),
              }}
            />
          </span>
          <span className="w-[32px] shrink-0 text-right text-[12px] font-medium text-app-text">
            {item.count}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SiteAuditDashboard({
  campaigns: initialCampaigns,
  canManage,
  initialCampaignId,
}: {
  campaigns: SiteAuditCampaignRow[];
  canManage: boolean;
  initialCampaignId?: string;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [selectedId, setSelectedId] = useState(
    initialCampaignId ?? initialCampaigns[0]?.id ?? ""
  );
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
  const [auditTab, setAuditTab] = useState<AuditTab>("overview");
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loadedOverviewFor, setLoadedOverviewFor] = useState<string | null>(null);
  const [pagesData, setPagesData] = useState<{ campaignId: string; rows: PageRow[] } | null>(null);
  const [loadedPagesFor, setLoadedPagesFor] = useState<string | null>(null);
  const [expandedTheme, setExpandedTheme] = useState<ThemeKey | null>(null);

  const campaign = useMemo(
    () => campaigns.find((item) => item.id === selectedId) ?? null,
    [campaigns, selectedId]
  );
  const issuesLoading = Boolean(selectedId) && selectedId !== loadedIssuesFor;
  const overviewLoading = Boolean(selectedId) && selectedId !== loadedOverviewFor;
  const pagesLoading = Boolean(selectedId) && selectedId !== loadedPagesFor;
  // 다른 캠페인의 페이지 목록이 남아 보이지 않도록 캠페인 id 로 키잉한다.
  const pagesRows = pagesData?.campaignId === selectedId ? pagesData.rows : [];

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

  const loadOverview = useCallback(async (campaignId: string) => {
    try {
      const response = await api.get<OverviewData>(
        `/api/site-audits/${encodeURIComponent(campaignId)}/overview/`
      );
      setOverview(response.data);
    } catch {
      setOverview(null);
    } finally {
      setLoadedOverviewFor(campaignId);
    }
  }, []);

  const loadPages = useCallback(async (campaignId: string) => {
    try {
      const response = await api.get<PageRow[]>(
        `/api/site-audits/${encodeURIComponent(campaignId)}/pages/`
      );
      setPagesData({ campaignId, rows: response.data });
    } catch {
      setPagesData({ campaignId, rows: [] });
    } finally {
      setLoadedPagesFor(campaignId);
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
    // load*() 의 setState 는 첫 await 이후에만 실행된다 (동기 연쇄 렌더 없음).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedId) { void loadIssues(selectedId); void loadOverview(selectedId); }
  }, [selectedId, loadIssues, loadOverview]);

  useEffect(() => {
    // 페이지 목록은 탭 진입 시 지연 로딩한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (auditTab === "pages" && selectedId && loadedPagesFor !== selectedId) void loadPages(selectedId);
  }, [auditTab, selectedId, loadedPagesFor, loadPages]);

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
        await Promise.all([
          loadCampaigns(campaignId),
          loadIssues(campaignId),
          loadOverview(campaignId),
          loadPages(campaignId),
        ]);
      } catch (caught) {
        setRunError(caught instanceof ClientApiError ? caught.message : COPY.ko.runError);
        await loadCampaigns(campaignId);
      } finally {
        setRunning(false);
      }
    },
    [running, loadCampaigns, loadIssues, loadOverview, loadPages]
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

  const orderedThemes = useMemo(() => {
    if (!overview) return [];
    const byKey = new Map(overview.themes.map((theme) => [theme.key, theme]));
    return THEME_ORDER.map((key) => byKey.get(key)).filter(
      (theme): theme is ThemeScore => Boolean(theme)
    );
  }, [overview]);

  const gaugeValue =
    report && !running ? report.siteHealth : (campaign?.siteHealth ?? null);
  const totalIssueCount = issueTotals.errors + issueTotals.warnings + issueTotals.notices;
  const hasCrawlData = (overview?.crawledPages ?? 0) > 0 || report !== null;

  const tabs: { key: AuditTab; label: string }[] = [
    { key: "overview", label: copy.tabOverview },
    { key: "issues", label: copy.tabIssues },
    { key: "pages", label: copy.tabPages },
    { key: "stats", label: copy.tabStats },
    { key: "themes", label: copy.tabThemes },
  ];

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
                  onChange={(event) => {
                    setSelectedId(event.target.value);
                    setExpandedTheme(null);
                  }}
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
                  {report!.linkGraph && report!.linkGraph.edges > 0
                    ? ` · ${copy.linkEdges(report!.linkGraph.edges, report!.linkGraph.targetDomains)}`
                    : ""}
                  {report!.sourceNote ? ` · ${report!.sourceNote}` : ""}
                </>
              )}
            </section>
          )}

          {campaign && (
            <section className="mt-4 grid items-start gap-4 lg:grid-cols-[190px_minmax(0,1fr)]">
              <nav
                className="rounded-[10px] border border-app-border bg-white p-2"
                aria-label={copy.title}
              >
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setAuditTab(tab.key)}
                    aria-current={auditTab === tab.key ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2.5 text-left text-[13px] font-medium transition-colors",
                      auditTab === tab.key
                        ? "bg-[#f4f7fe] text-app-blue"
                        : "text-app-text-secondary hover:bg-app-bg hover:text-app-text"
                    )}
                  >
                    <NavIcon name={tab.key} />
                    {tab.label}
                  </button>
                ))}
              </nav>

              <div className="min-w-0">
                {auditTab === "overview" && (
                  <div>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-[18px] font-semibold text-app-text">
                        {copy.auditHeader(campaign.domain)}
                      </h2>
                      <StatusBadge status={campaign.status} copy={copy} />
                    </div>

                    {!hasCrawlData && !overviewLoading ? (
                      <div className="rounded-[10px] border border-app-border bg-white p-8 text-center">
                        <p className="text-[13px] leading-[20px] text-app-text-secondary">
                          {copy.noOverviewYet}
                        </p>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => void runCrawl(campaign.id)}
                            disabled={running}
                            className="mt-4 h-[38px] rounded-[8px] bg-app-orange px-5 text-[13px] font-medium text-white transition-colors hover:bg-[#e5541f] disabled:opacity-60"
                          >
                            {running ? copy.running : copy.runNow}
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
                          <div className="rounded-[10px] border border-app-border bg-white p-5">
                            <h3 className="text-[13px] font-semibold text-app-text">
                              {copy.siteHealth}
                            </h3>
                            <div className="mt-2 flex justify-center">
                              <HealthGauge value={gaugeValue} />
                            </div>
                            {gaugeValue === 100 ? (
                              <p className="mt-2 flex items-center justify-center gap-1.5 text-[13px] font-medium text-[#00a87d]">
                                <CheckCircleIcon />
                                {copy.allChecksPassed}
                              </p>
                            ) : (
                              <p className="mt-2 text-center text-[13px] text-app-text-secondary">
                                {copy.issuesFound(totalIssueCount)}
                              </p>
                            )}
                            <p
                              className="mt-3 border-t border-app-border pt-3 text-center text-[12px] text-app-text-secondary"
                              suppressHydrationWarning
                            >
                              {copy.reportUpdated(
                                campaign.lastRunAt
                                  ? dateFormatter.format(new Date(campaign.lastRunAt))
                                  : copy.never
                              )}
                            </p>
                          </div>

                          <div className="flex min-w-0 flex-col gap-4">
                            <div className="grid grid-cols-2 rounded-[10px] border border-app-border bg-white px-5 py-4 sm:grid-cols-4">
                              <div className="py-1">
                                <span className="block text-[12px] text-app-text-secondary">
                                  {copy.crawledPagesLabel}
                                </span>
                                <span className="mt-1 block text-[22px] font-semibold text-app-text">
                                  {copy.pagesUnit(
                                    overview?.crawledPages ?? report?.crawledPages ?? 0
                                  )}
                                </span>
                              </div>
                              <div className="border-l border-app-border py-1 pl-4">
                                <span className="block text-[12px] text-app-text-secondary">
                                  {copy.errorsShort}
                                </span>
                                <span className="mt-1 block text-[22px] font-semibold text-[#e01b4b]">
                                  {issueTotals.errors}
                                </span>
                              </div>
                              <div className="border-l border-app-border py-1 pl-4 max-sm:border-l-0 max-sm:pl-0 sm:border-l sm:pl-4">
                                <span className="block text-[12px] text-app-text-secondary">
                                  {copy.warningsShort}
                                </span>
                                <span className="mt-1 block text-[22px] font-semibold text-[#f5a623]">
                                  {issueTotals.warnings}
                                </span>
                              </div>
                              <div className="border-l border-app-border py-1 pl-4">
                                <span className="block text-[12px] text-app-text-secondary">
                                  {copy.noticesShort}
                                </span>
                                <span className="mt-1 block text-[22px] font-semibold text-[#235FE2]">
                                  {issueTotals.notices}
                                </span>
                              </div>
                            </div>

                            <div className="rounded-[10px] border border-app-border bg-white p-5">
                              <h3 className="text-[13px] font-semibold text-app-text">
                                {copy.topIssues}
                              </h3>
                              {!overview || overview.topIssues.length === 0 ? (
                                <p className="mt-2 text-[13px] text-app-text-secondary">
                                  {copy.noIssues}
                                </p>
                              ) : (
                                <ul className="mt-3 space-y-3">
                                  {overview.topIssues.map((group) => (
                                    <li key={group.category}>
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-[13px] font-medium text-app-text">
                                          {categoryLabel(copy, group.category)}
                                        </span>
                                        <span className="rounded-[4px] bg-[#eceef2] px-1.5 py-0.5 text-[11px] font-semibold text-app-text-secondary">
                                          {group.count}
                                        </span>
                                      </div>
                                      <ul className="mt-1.5 space-y-1">
                                        {group.issues.map((issue) => (
                                          <li
                                            key={issue.title}
                                            className="flex items-center gap-2 text-[12px] text-app-text-secondary"
                                          >
                                            <span
                                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                                              style={{
                                                backgroundColor:
                                                  SEVERITY_STYLE[issue.severity].dot,
                                              }}
                                            />
                                            <span className="min-w-0 flex-1 truncate">
                                              {localizeIssueTitle(issue.title, locale)}
                                            </span>
                                            <span className="shrink-0 font-medium">
                                              {issue.count}
                                            </span>
                                          </li>
                                        ))}
                                      </ul>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mt-5">
                          <h3 className="mb-2.5 text-[15px] font-semibold text-app-text">
                            {copy.thematicReports}
                          </h3>
                          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {orderedThemes.map((theme) => (
                              <ThemeCard
                                key={theme.key}
                                theme={theme}
                                copy={copy}
                                onOpen={() => {
                                  setAuditTab("themes");
                                  setExpandedTheme(theme.key);
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {auditTab === "issues" && (
                  <section className="overflow-hidden rounded-[10px] border border-app-border bg-white">
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
                                setExpandedIssue((current) =>
                                  current === issue.id ? null : issue.id
                                )
                              }
                              copy={copy}
                              locale={locale}
                            />
                          ))}
                      </tbody>
                    </table>
                  </section>
                )}

                {auditTab === "pages" && (
                  <section className="overflow-hidden rounded-[10px] border border-app-border bg-white">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] border-collapse text-left">
                        <thead>
                          <tr className="border-b border-app-border bg-[#f9fafb] text-[12px] text-app-text-secondary">
                            <th className="px-4 py-2.5 font-medium">{copy.pagesColUrl}</th>
                            <th className="w-[90px] px-4 py-2.5 text-center font-medium">
                              {copy.pagesColStatus}
                            </th>
                            <th className="px-4 py-2.5 font-medium">{copy.pagesColTitle}</th>
                            <th className="w-[110px] px-4 py-2.5 text-center font-medium">
                              {copy.pagesColMeta}
                            </th>
                            <th className="w-[100px] px-4 py-2.5 text-center font-medium">
                              {copy.pagesColImages}
                            </th>
                            <th className="w-[90px] px-4 py-2.5 text-center font-medium">
                              {copy.pagesColLinks}
                            </th>
                            <th className="w-[70px] px-4 py-2.5 text-center font-medium">
                              {copy.pagesColDepth}
                            </th>
                            <th className="w-[90px] px-4 py-2.5 text-right font-medium">
                              {copy.pagesColResponse}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagesLoading && (
                            <tr>
                              <td colSpan={8} className="px-4 py-6 text-center text-[13px] text-app-text-secondary">
                                …
                              </td>
                            </tr>
                          )}
                          {!pagesLoading && pagesRows.length === 0 && (
                            <tr>
                              <td colSpan={8} className="px-4 py-6 text-center text-[13px] text-app-text-secondary">
                                {copy.noPagesYet}
                              </td>
                            </tr>
                          )}
                          {!pagesLoading &&
                            pagesRows.map((row) => (
                              <tr
                                key={row.id}
                                className="border-b border-app-border text-[13px] last:border-b-0 hover:bg-[#f9fafb]"
                              >
                                <td className="max-w-[280px] px-4 py-2.5">
                                  <a
                                    href={row.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="break-all text-app-blue hover:underline"
                                  >
                                    {row.url}
                                  </a>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <span
                                    className={cn(
                                      "inline-block rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold",
                                      statusChipClass(row.statusCode)
                                    )}
                                  >
                                    {row.statusCode === 0 ? "—" : row.statusCode}
                                  </span>
                                </td>
                                <td className="max-w-[240px] px-4 py-2.5">
                                  {row.hasTitle && row.title ? (
                                    <span className="flex items-center gap-1.5">
                                      <span className="truncate text-app-text" title={row.title}>
                                        {row.title}
                                      </span>
                                      {row.titleDup && (
                                        <span className="shrink-0 rounded-[4px] bg-[#fff6e5] px-1.5 py-0.5 text-[10px] font-semibold text-[#8a5a00]">
                                          {copy.dupBadge}
                                        </span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="text-[#a4002a]">{copy.missing}</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {row.metaDescriptionPresent ? (
                                    row.metaDup ? (
                                      <span className="rounded-[4px] bg-[#fff6e5] px-1.5 py-0.5 text-[10px] font-semibold text-[#8a5a00]">
                                        {copy.dupBadge}
                                      </span>
                                    ) : (
                                      <span className="text-app-text-secondary">{copy.present}</span>
                                    )
                                  ) : (
                                    <span className="text-[#a4002a]">{copy.missing}</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <span
                                    className={
                                      row.imagesMissingAlt > 0
                                        ? "font-medium text-[#8a5a00]"
                                        : "text-app-text-secondary"
                                    }
                                  >
                                    {row.imagesMissingAlt}/{row.imagesTotal}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-center text-app-text-secondary">
                                  {row.internalLinks}
                                </td>
                                <td className="px-4 py-2.5 text-center text-app-text-secondary">
                                  {row.depth}
                                </td>
                                <td className="px-4 py-2.5 text-right text-app-text-secondary">
                                  {row.statusCode > 0 ? `${row.responseMs}ms` : "—"}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {auditTab === "stats" && (
                  <div className="grid items-start gap-4 lg:grid-cols-2">
                    <div className="rounded-[10px] border border-app-border bg-white p-5">
                      <h3 className="text-[13px] font-semibold text-app-text">
                        {copy.statsDepthTitle}
                      </h3>
                      {!overview || overview.statistics.depthDistribution.length === 0 ? (
                        <p className="mt-2 text-[13px] text-app-text-secondary">
                          {copy.noPagesYet}
                        </p>
                      ) : (
                        <BarRows
                          items={overview.statistics.depthDistribution.map((item) => ({
                            key: String(item.depth),
                            label: copy.depthLabel(item.depth),
                            count: item.count,
                          }))}
                          colorFor={() => "#235FE2"}
                        />
                      )}
                    </div>
                    <div className="rounded-[10px] border border-app-border bg-white p-5">
                      <h3 className="text-[13px] font-semibold text-app-text">
                        {copy.statsStatusTitle}
                      </h3>
                      {!overview || overview.statistics.statusDistribution.length === 0 ? (
                        <p className="mt-2 text-[13px] text-app-text-secondary">
                          {copy.noPagesYet}
                        </p>
                      ) : (
                        <BarRows
                          items={overview.statistics.statusDistribution.map((item) => ({
                            key: item.bucket,
                            label: item.bucket === "failed" ? copy.bucketFailed : item.bucket,
                            count: item.count,
                          }))}
                          colorFor={(key) => STATUS_BUCKET_COLOR[key] ?? "#c4c7cf"}
                        />
                      )}
                    </div>
                    <div className="rounded-[10px] border border-app-border bg-white p-5">
                      <span className="block text-[12px] text-app-text-secondary">
                        {copy.statsAvgResponse}
                      </span>
                      <span className="mt-1 block text-[22px] font-semibold text-app-text">
                        {overview?.statistics.avgResponseMs != null
                          ? `${overview.statistics.avgResponseMs}ms`
                          : "–"}
                      </span>
                    </div>
                    <div className="rounded-[10px] border border-app-border bg-white p-5">
                      <span className="block text-[12px] text-app-text-secondary">
                        {copy.statsTotalBytes}
                      </span>
                      <span className="mt-1 block text-[22px] font-semibold text-app-text">
                        {overview ? formatBytes(overview.statistics.totalBytes) : "–"}
                      </span>
                    </div>
                  </div>
                )}

                {auditTab === "themes" && (
                  <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {orderedThemes.map((theme) => {
                      const expanded = expandedTheme === theme.key;
                      return (
                        <div
                          key={theme.key}
                          className="rounded-[10px] border border-app-border bg-white p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <h4 className="text-[13px] font-semibold text-app-text">
                              {themeLabel(copy, theme.key)}
                            </h4>
                            {theme.measurable ? (
                              <span
                                className="text-[18px] font-semibold"
                                style={{ color: healthColor(theme.score ?? 0) }}
                              >
                                {theme.score}%
                              </span>
                            ) : (
                              <span className="text-[13px] font-medium text-app-text-secondary">
                                {copy.urlsCount(0)}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[12px] text-app-text-secondary">
                            {theme.measurable
                              ? copy.affectedPagesCount(theme.affectedPages)
                              : copy.notMeasurableNote}
                          </p>
                          {theme.measurable && theme.urls.length > 0 && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedTheme((current) =>
                                    current === theme.key ? null : theme.key
                                  )
                                }
                                className="mt-2.5 flex items-center gap-1 text-[12px] font-medium text-app-blue hover:underline"
                              >
                                <span
                                  className={cn(
                                    "inline-block transition-transform",
                                    expanded && "rotate-90"
                                  )}
                                >
                                  ▸
                                </span>
                                {copy.affectedPagesCount(theme.affectedPages)}
                              </button>
                              {expanded && (
                                <ul className="mt-2 max-h-[200px] space-y-1 overflow-y-auto border-t border-app-border pt-2 text-[12px] text-app-blue">
                                  {theme.urls.map((url) => (
                                    <li key={url} className="break-all">
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="hover:underline"
                                      >
                                        {url}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

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
  locale,
}: {
  issue: IssueRow;
  expanded: boolean;
  onToggle: () => void;
  copy: Copy;
  locale: "ko" | "en";
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
            <span className="font-medium text-app-text">
              {localizeIssueTitle(issue.title, locale)}
            </span>
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
