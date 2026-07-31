"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

/**
 * On-Page SEO Checker 라이브 대시보드.
 * POST /api/onpage/analyze/ 하나로 TalorData SERP(24h 캐시)와
 * Firecrawl/자체 fetch 페이지 비교 분석 결과를 받아 렌더링한다.
 */

type IdeaSeverity = "error" | "warning" | "idea";

interface OnPageIdea {
  code: string;
  severity: IdeaSeverity;
  data?: Record<string, number | string | null>;
}

interface OnPageElements {
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  h1: string | null;
  h1Count: number;
  wordCount: number;
  imagesTotal: number;
  imagesMissingAlt: number;
  keywordInTitle: boolean;
  keywordInMeta: boolean;
  keywordInH1: boolean;
  keywordOccurrences: number;
}

interface OnPageCompetitor extends OnPageElements {
  position: number;
  url: string;
  domain: string;
  serpTitle: string;
  fetched: boolean;
  scrapeEngine: "firecrawl" | "direct" | null;
  fetchError?: string;
}

interface OnPageReport {
  url: string;
  finalUrl: string;
  domain: string;
  keyword: string;
  countryCode: string;
  device: "desktop" | "mobile";
  engine: "google" | "bing";
  serpCapturedAt: string;
  serpFromCache: boolean;
  serpFeatures: string[];
  yourRank: { position: number; url: string } | null;
  page: OnPageElements & {
    status: number;
    scrapeEngine: "firecrawl" | "direct";
    fetchError?: string;
  };
  competitors: OnPageCompetitor[];
  benchmarks: {
    sampled: number;
    titleLength: number;
    metaDescriptionLength: number;
    wordCount: number;
    keywordOccurrences: number;
  } | null;
  ideas: OnPageIdea[];
  passedChecks: number;
  totalChecks: number;
}

interface ApiSuccess<T> {
  data: T;
}

interface ApiFailure {
  error?: { code?: string; message?: string; fields?: Record<string, string> };
}

const COPY = {
  en: {
    eyebrow: "On-page SEO",
    title: "On Page SEO Checker",
    description:
      "Compare your page against the live top-ranking pages for a target keyword. SERP comes from TalorData (24h cache) and page contents from Firecrawl with a direct-fetch fallback.",
    url: "Page URL",
    urlPlaceholder: "https://example.com/page",
    keyword: "Target keyword",
    keywordPlaceholder: "Enter the keyword to optimize for",
    country: "Database",
    device: "Device",
    desktop: "Desktop",
    mobile: "Mobile",
    analyze: "Analyze page",
    analyzing: "Collecting SERP and scraping pages…",
    analyzingHint: "This can take up to a minute — competitor pages are fetched live.",
    emptyTitle: "Check any page against its live SERP competitors",
    emptyBody:
      "Enter a page URL and its target keyword. We collect the real top results, scrape the competitor pages, and produce optimization ideas from the comparison.",
    loadError: "The analysis failed.",
    liveBadge: "Live SERP",
    cacheBadge: "SERP from 24h cache",
    engineBadge: (engine: string) => `Pages via ${engine}`,
    collectedAt: "SERP collected",
    scoreTitle: "On-page checks",
    scorePassed: "checks passed",
    rankTitle: "Your rank",
    rankFound: (position: number) => `#${position} in live results`,
    rankMissing: "Not in collected results",
    benchmarkTitle: "Competitor benchmark",
    benchmarkNote: (sampled: number) => `Median of ${sampled} scraped top pages`,
    benchmarkEmpty: "No competitor page could be scraped.",
    ideasTitle: "Optimization ideas",
    ideasEmpty: "All checks passed — nothing to fix.",
    comparisonTitle: "Your page vs top-ranking pages",
    colPage: "Page",
    colTitleLen: "Title len",
    colMetaLen: "Meta len",
    colH1: "H1",
    colWords: "Words",
    colKwTitle: "KW in title",
    colKwBody: "KW in body",
    yourPage: "Your page",
    median: "Top-page median",
    notFetched: "not fetched",
    serpFeatures: "SERP features on this keyword",
    yes: "Yes",
    no: "No",
    words: "words",
    chars: "chars",
    severityError: "Error",
    severityWarning: "Warning",
    severityIdea: "Idea",
    ideas: {
      fetch_failed: (d: Record<string, unknown>) =>
        `The page could not be fetched (HTTP ${d.status ?? 0}). Check that the URL is reachable.`,
      title_missing: () => "The page has no <title> tag.",
      title_no_keyword: () => "The target keyword is missing from the title.",
      title_length: (d: Record<string, unknown>) =>
        `Adjust the title length (${d.length} chars — ${d.min}–${d.max} recommended).`,
      meta_missing: () => "The page has no meta description.",
      meta_no_keyword: () => "The target keyword is missing from the meta description.",
      meta_length: (d: Record<string, unknown>) =>
        `Adjust the meta description length (${d.length} chars — ${d.min}–${d.max} recommended).`,
      h1_missing: () => "The page has no H1 heading.",
      h1_multiple: (d: Record<string, unknown>) =>
        `The page has ${d.count} H1 headings — keep exactly one.`,
      h1_no_keyword: () => "The target keyword is missing from the H1.",
      content_thin: (d: Record<string, unknown>) =>
        `Content looks thin: ${d.wordCount} words vs the top-page median of ${d.benchmark}.`,
      keyword_absent_body: () => "The target keyword does not appear in the body text.",
      images_alt_missing: (d: Record<string, unknown>) =>
        `${d.count} of ${d.total} images have no alt text.`,
      not_ranked: (d: Record<string, unknown>) =>
        `Your domain is not in the top ${d.results} live results yet.`,
    } as Record<string, (d: Record<string, unknown>) => string>,
  },
  ko: {
    eyebrow: "온페이지 SEO",
    title: "On Page SEO Checker",
    description:
      "타깃 키워드의 실제 상위 페이지와 내 페이지를 비교합니다. SERP 는 TalorData(24시간 캐시), 페이지 본문은 Firecrawl(자체 fetch 폴백)로 수집합니다.",
    url: "페이지 URL",
    urlPlaceholder: "https://example.com/page",
    keyword: "타깃 키워드",
    keywordPlaceholder: "최적화할 키워드를 입력하세요",
    country: "데이터베이스",
    device: "기기",
    desktop: "데스크톱",
    mobile: "모바일",
    analyze: "페이지 분석",
    analyzing: "SERP 수집·페이지 스크레이프 중…",
    analyzingHint: "경쟁 페이지를 실시간으로 가져오므로 최대 1분 정도 걸릴 수 있습니다.",
    emptyTitle: "내 페이지를 실시간 SERP 경쟁 페이지와 비교하세요",
    emptyBody:
      "페이지 URL 과 타깃 키워드를 입력하면 실제 상위 결과를 수집하고, 경쟁 페이지를 스크레이프해 비교 기반 개선 아이디어를 만들어 드립니다.",
    loadError: "분석에 실패했습니다.",
    liveBadge: "실시간 SERP",
    cacheBadge: "24시간 캐시 SERP",
    engineBadge: (engine: string) => `페이지 수집: ${engine}`,
    collectedAt: "SERP 수집",
    scoreTitle: "온페이지 검사",
    scorePassed: "개 검사 통과",
    rankTitle: "내 순위",
    rankFound: (position: number) => `실시간 결과 #${position}위`,
    rankMissing: "수집된 결과에 없음",
    benchmarkTitle: "경쟁 페이지 벤치마크",
    benchmarkNote: (sampled: number) => `스크레이프된 상위 ${sampled}개 페이지의 중앙값`,
    benchmarkEmpty: "경쟁 페이지를 스크레이프하지 못했습니다.",
    ideasTitle: "개선 아이디어",
    ideasEmpty: "모든 검사를 통과했습니다 — 수정할 항목이 없습니다.",
    comparisonTitle: "내 페이지 vs 상위 페이지",
    colPage: "페이지",
    colTitleLen: "제목 길이",
    colMetaLen: "메타 길이",
    colH1: "H1",
    colWords: "단어 수",
    colKwTitle: "제목 키워드",
    colKwBody: "본문 키워드",
    yourPage: "내 페이지",
    median: "상위 중앙값",
    notFetched: "수집 실패",
    serpFeatures: "이 키워드의 SERP 피처",
    yes: "있음",
    no: "없음",
    words: "단어",
    chars: "자",
    severityError: "오류",
    severityWarning: "경고",
    severityIdea: "아이디어",
    ideas: {
      fetch_failed: (d: Record<string, unknown>) =>
        `페이지를 불러오지 못했습니다 (HTTP ${d.status ?? 0}). URL 접근 가능 여부를 확인하세요.`,
      title_missing: () => "페이지에 <title> 태그가 없습니다.",
      title_no_keyword: () => "제목에 타깃 키워드가 없습니다.",
      title_length: (d: Record<string, unknown>) =>
        `제목 길이를 조정하세요 (${d.length}자 — 권장 ${d.min}–${d.max}자).`,
      meta_missing: () => "메타 설명이 없습니다.",
      meta_no_keyword: () => "메타 설명에 타깃 키워드가 없습니다.",
      meta_length: (d: Record<string, unknown>) =>
        `메타 설명 길이를 조정하세요 (${d.length}자 — 권장 ${d.min}–${d.max}자).`,
      h1_missing: () => "H1 제목이 없습니다.",
      h1_multiple: (d: Record<string, unknown>) =>
        `H1 이 ${d.count}개입니다 — 1개만 유지하세요.`,
      h1_no_keyword: () => "H1 에 타깃 키워드가 없습니다.",
      content_thin: (d: Record<string, unknown>) =>
        `콘텐츠 분량이 부족합니다: ${d.wordCount}단어 (상위 페이지 중앙값 ${d.benchmark}단어).`,
      keyword_absent_body: () => "본문에 타깃 키워드가 나타나지 않습니다.",
      images_alt_missing: (d: Record<string, unknown>) =>
        `이미지 ${d.total}개 중 ${d.count}개에 대체 텍스트가 없습니다.`,
      not_ranked: (d: Record<string, unknown>) =>
        `내 도메인이 아직 상위 ${d.results}개 실시간 결과에 없습니다.`,
    } as Record<string, (d: Record<string, unknown>) => string>,
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

const SEVERITY_STYLE: Record<IdeaSeverity, { chip: string; dot: string }> = {
  error: { chip: "bg-[#ffe8ed] text-[#b0002a]", dot: "#e0447c" },
  warning: { chip: "bg-[#fff3df] text-[#8d5900]", dot: "#f79009" },
  idea: { chip: "bg-[#eaf3ff] text-[#0872bf]", dot: "#008ff8" },
};

function severityLabel(severity: IdeaSeverity, copy: Copy): string {
  if (severity === "error") return copy.severityError;
  if (severity === "warning") return copy.severityWarning;
  return copy.severityIdea;
}

function Card({
  title,
  hint,
  children,
  className,
}: {
  title?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-[10px] border border-app-border bg-a2-card p-4 shadow-[var(--a2-card-shadow)]",
        className,
      )}
    >
      {title && (
        <div className="mb-3 min-w-0">
          <h2 className="text-[14px] font-semibold text-a2-text">{title}</h2>
          {hint && <p className="mt-0.5 text-[11px] leading-[16px] text-a2-text-muted">{hint}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

/** 검사 통과율 반원 게이지. */
function ScoreGauge({ passed, total }: { passed: number; total: number }) {
  const ratio = total > 0 ? passed / total : 0;
  const percent = Math.round(ratio * 100);
  const radius = 76;
  const halfCircumference = Math.PI * radius;
  const filled = ratio * halfCircumference;
  const color = percent >= 80 ? "#0ba360" : percent >= 50 ? "#f79009" : "#e0447c";
  return (
    <svg viewBox="0 0 180 104" className="mx-auto w-full max-w-[200px]" role="img" aria-label={`${passed}/${total}`}>
      <path d="M 14 96 A 76 76 0 0 1 166 96" fill="none" stroke="#eceef3" strokeWidth="14" strokeLinecap="round" />
      <path
        d="M 14 96 A 76 76 0 0 1 166 96"
        fill="none"
        stroke={color}
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${halfCircumference}`}
      />
      <text x="90" y="80" textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--a2-text)">
        {passed}/{total}
      </text>
      <text x="90" y="98" textAnchor="middle" fontSize="10" fill="var(--a2-text-muted)">
        {percent}%
      </text>
    </svg>
  );
}

export function OnPageCheckerDashboard({
  initialUrl = "",
  initialCountry = "US",
  initialDevice = "desktop",
}: {
  initialUrl?: string;
  initialCountry?: string;
  initialDevice?: "desktop" | "mobile";
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [url, setUrl] = useState(initialUrl);
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState(initialCountry);
  const [device, setDevice] = useState<"desktop" | "mobile">(initialDevice);
  const [report, setReport] = useState<OnPageReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const preciseFormatter = useMemo(
    () => new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US"),
    [locale],
  );
  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale],
  );

  const runAnalysis = useCallback(async () => {
    if (!url.trim() || !keyword.trim()) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/onpage/analyze/", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          keyword: keyword.trim(),
          countryCode: country,
          device,
        }),
      });
      const body = (await response.json()) as ApiSuccess<OnPageReport> & ApiFailure;
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message || `HTTP ${response.status}`);
      }
      setReport(body.data);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : copy.loadError);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [copy.loadError, country, device, keyword, url]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runAnalysis();
  };

  const ideaText = useCallback(
    (idea: OnPageIdea): string => {
      const template = copy.ideas[idea.code];
      return template ? template(idea.data ?? {}) : idea.code;
    },
    [copy],
  );

  const grouped = useMemo(() => {
    if (!report) return [];
    const order: IdeaSeverity[] = ["error", "warning", "idea"];
    return order
      .map((severity) => ({
        severity,
        items: report.ideas.filter((idea) => idea.severity === severity),
      }))
      .filter((group) => group.items.length > 0);
  }, [report]);

  return (
    <div className="mx-auto w-full max-w-[1560px] p-4 sm:p-6">
      <header className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.65px] text-app-blue">
          {copy.eyebrow}
        </p>
        <h1 className="mt-1 text-[24px] font-semibold leading-[32px] tracking-[-0.3px] text-a2-text">
          {copy.title}
        </h1>
        <p className="mt-1 max-w-3xl text-[13px] leading-[20px] text-a2-text-muted">
          {copy.description}
        </p>
        {report && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {report.serpFromCache ? (
              <span className="rounded-full bg-[#eaf3ff] px-2.5 py-1 text-[11px] font-medium text-[#0872bf]">
                {copy.cacheBadge}
              </span>
            ) : (
              <span className="rounded-full bg-[#e6f5f0] px-2.5 py-1 text-[11px] font-medium text-[#0a6b57]">
                {copy.liveBadge}
              </span>
            )}
            <span className="rounded-full bg-[#f1eaff] px-2.5 py-1 text-[11px] font-medium text-[#7040b6]">
              {copy.engineBadge(report.page.scrapeEngine === "firecrawl" ? "Firecrawl" : "Direct fetch")}
            </span>
            <span className="text-[11px] text-a2-text-muted">
              {copy.collectedAt}: {dateTimeFormatter.format(new Date(report.serpCapturedAt))} ·{" "}
              {report.engine === "google" ? "Google" : "Bing"} · {report.countryCode}
            </span>
          </div>
        )}
      </header>

      <form
        onSubmit={submit}
        className="mt-5 rounded-[10px] border border-app-border bg-a2-card p-3 shadow-[var(--a2-card-shadow)]"
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1.3fr)_minmax(200px,1fr)_140px_140px_auto] lg:items-end">
          <label className="min-w-0">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.4px] text-a2-text-muted">
              {copy.url}
            </span>
            <input
              name="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={copy.urlPlaceholder}
              autoComplete="url"
              required
              className="h-11 w-full rounded-[7px] border border-app-border bg-white px-3 text-[14px] text-a2-text outline-none transition focus:border-app-blue focus:ring-2 focus:ring-[#d8ecff]"
            />
          </label>
          <label className="min-w-0">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.4px] text-a2-text-muted">
              {copy.keyword}
            </span>
            <input
              name="keyword"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={copy.keywordPlaceholder}
              required
              className="h-11 w-full rounded-[7px] border border-app-border bg-white px-3 text-[14px] text-a2-text outline-none transition focus:border-app-blue focus:ring-2 focus:ring-[#d8ecff]"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.4px] text-a2-text-muted">
              {copy.country}
            </span>
            <select
              aria-label={copy.country}
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              className="h-11 w-full rounded-[7px] border border-app-border bg-white px-3 text-[13px] text-a2-text outline-none focus:border-app-blue focus:ring-2 focus:ring-[#d8ecff]"
            >
              <option value="KR">South Korea</option>
              <option value="US">United States</option>
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.4px] text-a2-text-muted">
              {copy.device}
            </span>
            <select
              value={device}
              onChange={(event) => setDevice(event.target.value as "desktop" | "mobile")}
              className="h-11 w-full rounded-[7px] border border-app-border bg-white px-3 text-[13px] text-a2-text outline-none focus:border-app-blue focus:ring-2 focus:ring-[#d8ecff]"
            >
              <option value="desktop">{copy.desktop}</option>
              <option value="mobile">{copy.mobile}</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={loading}
            className="h-11 rounded-[7px] bg-app-blue px-6 text-[13px] font-semibold text-white transition-colors hover:bg-app-blue-dark disabled:cursor-wait disabled:opacity-70"
          >
            {loading ? copy.analyzing : copy.analyze}
          </button>
        </div>
        {loading && (
          <p className="mt-2 text-[11px] text-a2-text-muted" aria-live="polite">
            {copy.analyzingHint}
          </p>
        )}
      </form>

      <div className="min-h-[24px]" aria-live="polite">
        {error && (
          <div
            role="alert"
            className="mt-4 rounded-[8px] border border-[#ffc8d4] bg-[#fff4f6] px-4 py-3 text-[13px] text-[#a80028]"
          >
            {copy.loadError} {error}
          </div>
        )}
      </div>

      {!report && !loading && !error && (
        <div className="mt-6 flex flex-col items-center rounded-[10px] border border-dashed border-app-border bg-a2-card px-6 py-14 text-center">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-a2-text-faint">
            <path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" />
            <path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <p className="mt-3 text-[15px] font-semibold text-a2-text">{copy.emptyTitle}</p>
          <p className="mt-1.5 max-w-[460px] text-[12px] leading-[18px] text-a2-text-muted">{copy.emptyBody}</p>
        </div>
      )}

      {!report && loading && (
        <div role="status" className="py-10" aria-live="polite">
          <p className="mb-4 text-center text-[13px] text-app-text-secondary">{copy.analyzing}</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="h-[140px] animate-pulse rounded-[10px] border border-app-border bg-a2-card p-4">
                <div className="h-3 w-24 rounded bg-[#e9ebf0]" />
                <div className="mt-5 h-7 w-20 rounded bg-[#e9ebf0]" />
                <div className="mt-3 h-2.5 w-32 rounded bg-[#f0f1f4]" />
              </div>
            ))}
          </div>
        </div>
      )}

      {report && (
        <div className={cn("transition-opacity", loading && "pointer-events-none opacity-60")}>
          {/* 1행: 점수 + 순위 + 벤치마크 */}
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <Card>
              <h2 className="text-[14px] font-semibold text-a2-text">{copy.scoreTitle}</h2>
              <div className="mt-2">
                <ScoreGauge passed={report.passedChecks} total={report.totalChecks} />
              </div>
              <p className="mt-1 text-center text-[11px] text-a2-text-muted">
                {report.passedChecks}/{report.totalChecks} {copy.scorePassed}
              </p>
            </Card>
            <Card>
              <h2 className="text-[14px] font-semibold text-a2-text">{copy.rankTitle}</h2>
              <p className="mt-4 text-[24px] font-semibold leading-[30px] text-a2-text">
                {report.yourRank ? (
                  <span className="text-[#087b64]">{copy.rankFound(report.yourRank.position)}</span>
                ) : (
                  <span className="text-[#b0002a]">{copy.rankMissing}</span>
                )}
              </p>
              <p className="mt-2 max-w-full truncate text-[11px] text-a2-text-muted" title={report.finalUrl}>
                {report.finalUrl}
              </p>
              <p className="mt-1 text-[11px] text-a2-text-muted">
                {report.keyword} · {report.countryCode} ·{" "}
                {report.device === "mobile" ? copy.mobile : copy.desktop}
              </p>
            </Card>
            <Card>
              <h2 className="text-[14px] font-semibold text-a2-text">{copy.benchmarkTitle}</h2>
              {report.benchmarks ? (
                <>
                  <p className="mt-0.5 text-[11px] text-a2-text-muted">
                    {copy.benchmarkNote(report.benchmarks.sampled)}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      [copy.colTitleLen, `${report.benchmarks.titleLength}${copy.chars}`],
                      [copy.colMetaLen, `${report.benchmarks.metaDescriptionLength}${copy.chars}`],
                      [copy.colWords, `${preciseFormatter.format(report.benchmarks.wordCount)}`],
                      [copy.colKwBody, `${report.benchmarks.keywordOccurrences}×`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-[7px] bg-app-bg p-2.5">
                        <dt className="text-[10px] uppercase tracking-[0.35px] text-a2-text-muted">{label}</dt>
                        <dd className="mt-0.5 text-[15px] font-semibold text-a2-text">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <p className="mt-3 text-[12px] text-a2-text-muted">{copy.benchmarkEmpty}</p>
              )}
            </Card>
          </div>

          {/* 2행: 개선 아이디어 */}
          <Card title={copy.ideasTitle} className="mt-4">
            {report.ideas.length === 0 ? (
              <p className="rounded-[8px] bg-[#f1fbf6] px-4 py-3 text-[13px] font-medium text-[#087b64]">
                {copy.ideasEmpty}
              </p>
            ) : (
              <div className="space-y-4">
                {grouped.map((group) => (
                  <div key={group.severity}>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.35px]",
                        SEVERITY_STYLE[group.severity].chip,
                      )}
                    >
                      {severityLabel(group.severity, copy)} · {group.items.length}
                    </span>
                    <ul className="mt-2 space-y-1.5">
                      {group.items.map((idea) => (
                        <li key={idea.code} className="flex items-start gap-2 text-[13px] text-a2-text">
                          <span
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                            style={{ background: SEVERITY_STYLE[group.severity].dot }}
                          />
                          <span>{ideaText(idea)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 3행: 비교 테이블 */}
          <Card title={copy.comparisonTitle} className="mt-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr>
                    {["#", copy.colPage, copy.colTitleLen, copy.colMetaLen, copy.colH1, copy.colWords, copy.colKwTitle, copy.colKwBody].map(
                      (label, index) => (
                        <th
                          key={label}
                          scope="col"
                          className={cn(
                            "border-b border-app-border px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.35px] text-a2-text-muted",
                            index >= 2 && "text-right",
                          )}
                        >
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-[#f5faff]">
                    <td className="border-b border-[#eef0f2] px-2 py-2.5 text-[12px] font-semibold tabular-nums text-a2-text">
                      {report.yourRank ? report.yourRank.position : "—"}
                    </td>
                    <td className="border-b border-[#eef0f2] px-2 py-2.5">
                      <span className="block max-w-[300px] truncate text-[13px] font-semibold text-a2-text" title={report.finalUrl}>
                        {copy.yourPage}
                      </span>
                      <span className="block max-w-[300px] truncate text-[11px] text-a2-text-muted">{report.domain}</span>
                    </td>
                    <ComparisonCells elements={report.page} copy={copy} formatter={preciseFormatter} />
                  </tr>
                  {report.benchmarks && (
                    <tr className="bg-[#fbf9ff]">
                      <td className="border-b border-[#eef0f2] px-2 py-2.5 text-[12px] text-a2-text-faint">·</td>
                      <td className="border-b border-[#eef0f2] px-2 py-2.5 text-[12px] font-medium italic text-a2-text-muted">
                        {copy.median}
                      </td>
                      <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] tabular-nums text-a2-text-muted">
                        {report.benchmarks.titleLength}
                      </td>
                      <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] tabular-nums text-a2-text-muted">
                        {report.benchmarks.metaDescriptionLength}
                      </td>
                      <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] text-a2-text-faint">—</td>
                      <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] tabular-nums text-a2-text-muted">
                        {preciseFormatter.format(report.benchmarks.wordCount)}
                      </td>
                      <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] text-a2-text-faint">—</td>
                      <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] tabular-nums text-a2-text-muted">
                        {report.benchmarks.keywordOccurrences}×
                      </td>
                    </tr>
                  )}
                  {report.competitors.map((competitor) => (
                    <tr key={competitor.url} className="hover:bg-[#fafbfc]">
                      <td className="border-b border-[#eef0f2] px-2 py-2.5 text-[12px] font-semibold tabular-nums text-a2-text">
                        {competitor.position}
                      </td>
                      <td className="border-b border-[#eef0f2] px-2 py-2.5">
                        <a
                          href={competitor.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block max-w-[300px] truncate text-[13px] font-medium text-app-blue hover:underline"
                          title={competitor.serpTitle || competitor.url}
                        >
                          {competitor.serpTitle || competitor.domain}
                        </a>
                        <span className="block max-w-[300px] truncate text-[11px] text-a2-text-muted">
                          {competitor.domain}
                          {!competitor.fetched && (
                            <span className="ml-1 text-[#b0002a]">({copy.notFetched})</span>
                          )}
                        </span>
                      </td>
                      {competitor.fetched ? (
                        <ComparisonCells elements={competitor} copy={copy} formatter={preciseFormatter} />
                      ) : (
                        <td colSpan={6} className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[11px] text-a2-text-faint">
                          {competitor.fetchError ?? copy.notFetched}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* SERP 피처 참고 */}
          {report.serpFeatures.length > 0 && (
            <Card title={copy.serpFeatures} className="mt-4">
              <div className="flex flex-wrap gap-2">
                {report.serpFeatures.map((feature) => (
                  <span
                    key={feature}
                    className="rounded-full border border-[#cfe4f7] bg-[#f2f9ff] px-3 py-1 text-[12px] font-medium text-[#0872bf]"
                  >
                    {feature.replaceAll("_", " ")}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/** 비교 테이블의 수치 셀 6개 (제목/메타 길이, H1 수, 단어 수, 키워드 사용). */
function ComparisonCells({
  elements,
  copy,
  formatter,
}: {
  elements: OnPageElements;
  copy: Copy;
  formatter: Intl.NumberFormat;
}) {
  const boolCell = (value: boolean) => (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
        value ? "bg-[#e5f7f1] text-[#087b64]" : "bg-[#ffe8ed] text-[#b0002a]",
      )}
    >
      {value ? copy.yes : copy.no}
    </span>
  );
  return (
    <>
      <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] tabular-nums text-a2-text">
        {elements.titleLength}
      </td>
      <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] tabular-nums text-a2-text">
        {elements.metaDescriptionLength}
      </td>
      <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] tabular-nums text-a2-text">
        {elements.h1Count}
      </td>
      <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] tabular-nums text-a2-text">
        {formatter.format(elements.wordCount)}
      </td>
      <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right">{boolCell(elements.keywordInTitle)}</td>
      <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] tabular-nums text-a2-text">
        {elements.keywordOccurrences}×
      </td>
    </>
  );
}
