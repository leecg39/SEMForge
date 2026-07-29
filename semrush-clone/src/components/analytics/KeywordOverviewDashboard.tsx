"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

/**
 * Keyword Overview 라이브 대시보드.
 * POST /api/serp/collect/ 하나로 TalorData 실시간 SERP(또는 24h 캐시)와
 * KD·검색량·도메인 권위 리포트를 받아 렌더링한다.
 */

const EXAMPLE_KEYWORDS = ["seo tools", "ai marketing", "커피 머신", "노트북 추천"];

interface KeywordOverviewResult {
  position: number;
  title: string;
  link: string;
  domain: string;
  displayLink: string | null;
  description: string | null;
  authorityScore: number;
  backlinks: number;
  referringDomains: number;
  previousPosition: number | null;
}

interface KeywordOverviewReport {
  keyword: string;
  countryCode: string;
  device: "desktop" | "mobile";
  engine: "google" | "bing";
  keywordMetricId: string;
  capturedAt: string;
  fromCache: boolean;
  volume: number;
  volumeMonthsUsed: number;
  intent: string | null;
  cpcCents: number | null;
  difficulty: number;
  features: string[];
  results: KeywordOverviewResult[];
  captures: Array<{ capturedAt: string; results: number }>;
  rank: { position: number; url: string } | null;
}

interface ApiSuccess<T> {
  data: T;
}

interface ApiFailure {
  error?: { code?: string; message?: string };
}

const FEATURE_LABELS: Record<string, { en: string; ko: string }> = {
  featured_snippet: { en: "Featured snippet", ko: "추천 스니펫" },
  people_also_ask: { en: "People also ask", ko: "관련 질문" },
  ai_overview: { en: "AI Overview", ko: "AI 개요" },
  knowledge_panel: { en: "Knowledge panel", ko: "지식 패널" },
  answer_box: { en: "Answer box", ko: "답변 박스" },
  local_pack: { en: "Local pack", ko: "로컬 팩" },
  related_searches: { en: "Related searches", ko: "관련 검색어" },
  refine_this_search: { en: "Refine this search", ko: "검색 상세화" },
  people_are_saying: { en: "People are saying", ko: "실시간 반응" },
  shopping: { en: "Shopping", ko: "쇼핑" },
  videos: { en: "Videos", ko: "동영상" },
  images: { en: "Images", ko: "이미지" },
  top_stories: { en: "Top stories", ko: "주요 뉴스" },
};

const INTENT_LABELS: Record<string, { en: string; ko: string; color: string }> = {
  informational: { en: "Informational", ko: "정보 탐색", color: "#0ba5a5" },
  navigational: { en: "Navigational", ko: "이동", color: "#008ff8" },
  commercial: { en: "Commercial", ko: "상업 조사", color: "#f79009" },
  transactional: { en: "Transactional", ko: "거래", color: "#e0447c" },
};

const COPY = {
  en: {
    eyebrow: "Keyword research",
    title: "Keyword Overview",
    description:
      "Live Google/Bing SERP for any keyword with difficulty, authority and SERP features — collected once, cached for 24 hours.",
    keyword: "Keyword",
    keywordPlaceholder: "Enter a keyword",
    domain: "Your domain (optional)",
    domainPlaceholder: "example.com",
    country: "Database",
    device: "Device",
    desktop: "Desktop",
    mobile: "Mobile",
    analyze: "Analyze",
    analyzing: "Collecting SERP…",
    refresh: "Re-collect live",
    tryExample: "Try an example:",
    liveBadge: "Live collected",
    cacheBadge: "24h snapshot cache",
    collectedAt: "Collected",
    volume: "Volume",
    volumeNote: (months: number) =>
      months > 0 ? `${months}-month average` : "No volume source yet",
    difficulty: "Keyword Difficulty",
    difficultyNote: "clone-kd-v1 · top-10 authority",
    intent: "Intent",
    intentNote: "From keyword metadata",
    cpc: "CPC",
    cpcNote: "Latest observed",
    resultsCount: "Organic results",
    resultsNote: "Collected this run",
    serpFeatures: "SERP features on this keyword",
    noFeatures: "No SERP features were detected.",
    rankTitle: "Your rank",
    rankFound: (position: number) => `Ranked #${position}`,
    rankMissing: "Not in collected results",
    serpTable: "Live SERP results",
    position: "Pos",
    change: "Δ",
    result: "Result",
    authority: "AS",
    backlinks: "Backlinks",
    refDomains: "Ref. domains",
    newEntry: "New",
    captures: "Collection history",
    capturesNote: "Snapshots stored in serp_snapshots",
    capturesResults: "results",
    emptyTitle: "Search a keyword to build a live report",
    emptyBody:
      "The first run calls the TalorData SERP API and stores a snapshot. Repeat runs within 24 hours reuse the snapshot without spending credits.",
    loadError: "The report could not be loaded.",
    kdEasy: "Easy",
    kdPossible: "Possible",
    kdDifficult: "Difficult",
    kdHard: "Hard",
    noVolume: "n/a",
    today: "today",
    dayAgo: "1 day ago",
    daysAgo: "days ago",
    justNow: "just now",
    hoursAgo: (hours: number) => `${hours}h ago`,
  },
  ko: {
    eyebrow: "키워드 리서치",
    title: "키워드 개요",
    description:
      "키워드의 실시간 Google/Bing SERP 와 난이도·권위·SERP 피처를 확인하세요. 한 번 수집하면 24시간 동안 캐시로 재사용합니다.",
    keyword: "키워드",
    keywordPlaceholder: "키워드를 입력하세요",
    domain: "내 도메인 (선택)",
    domainPlaceholder: "example.com",
    country: "데이터베이스",
    device: "기기",
    desktop: "데스크톱",
    mobile: "모바일",
    analyze: "분석",
    analyzing: "SERP 수집 중…",
    refresh: "실시간 재수집",
    tryExample: "예시 키워드:",
    liveBadge: "실시간 수집",
    cacheBadge: "24시간 스냅샷 캐시",
    collectedAt: "수집 시각",
    volume: "검색량",
    volumeNote: (months: number) =>
      months > 0 ? `${months}개월 평균` : "검색량 원천 없음",
    difficulty: "키워드 난이도",
    difficultyNote: "clone-kd-v1 · 상위 10개 권위",
    intent: "검색 의도",
    intentNote: "키워드 메타 기준",
    cpc: "CPC",
    cpcNote: "최근 관측값",
    resultsCount: "오가닉 결과",
    resultsNote: "이번 수집 기준",
    serpFeatures: "이 키워드의 SERP 피처",
    noFeatures: "감지된 SERP 피처가 없습니다.",
    rankTitle: "내 순위",
    rankFound: (position: number) => `#${position} 위 확인`,
    rankMissing: "수집된 결과에 없음",
    serpTable: "실시간 SERP 결과",
    position: "순위",
    change: "Δ",
    result: "결과",
    authority: "AS",
    backlinks: "백링크",
    refDomains: "참조 도메인",
    newEntry: "신규",
    captures: "수집 이력",
    capturesNote: "serp_snapshots 에 저장된 스냅샷",
    capturesResults: "개 결과",
    emptyTitle: "키워드를 검색해 라이브 리포트를 만드세요",
    emptyBody:
      "첫 수집은 TalorData SERP API 를 호출해 스냅샷을 저장합니다. 24시간 이내 반복 조회는 크레딧 소모 없이 스냅샷을 재사용합니다.",
    loadError: "리포트를 불러오지 못했습니다.",
    kdEasy: "쉬움",
    kdPossible: "보통",
    kdDifficult: "어려움",
    kdHard: "매우 어려움",
    noVolume: "관측 없음",
    today: "오늘",
    dayAgo: "1일 전",
    daysAgo: "일 전",
    justNow: "방금 전",
    hoursAgo: (hours: number) => `${hours}시간 전`,
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function kdLevel(difficulty: number, copy: Copy): { label: string; chip: string; bar: string } {
  if (difficulty >= 70)
    return { label: copy.kdHard, chip: "bg-[#ffe8ed] text-[#b0002a]", bar: "#e0447c" };
  if (difficulty >= 45)
    return { label: copy.kdDifficult, chip: "bg-[#fff3df] text-[#8d5900]", bar: "#f79009" };
  if (difficulty >= 30)
    return { label: copy.kdPossible, chip: "bg-[#eaf3ff] text-[#0872bf]", bar: "#008ff8" };
  return { label: copy.kdEasy, chip: "bg-[#e5f7f1] text-[#087b64]", bar: "#0ba360" };
}

function Card({
  title,
  hint,
  action,
  children,
  className,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
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
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[14px] font-semibold text-a2-text">{title}</h2>}
            {hint && <p className="mt-0.5 text-[11px] leading-[16px] text-a2-text-muted">{hint}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function DeltaCell({
  row,
  hasHistory,
  copy,
}: {
  row: KeywordOverviewResult;
  hasHistory: boolean;
  copy: Copy;
}) {
  if (!hasHistory) return <span className="text-a2-text-faint">—</span>;
  if (row.previousPosition === null) {
    return (
      <span className="inline-flex rounded-full bg-[#eaf3ff] px-1.5 py-0.5 text-[10px] font-semibold text-[#0872bf]">
        {copy.newEntry}
      </span>
    );
  }
  const delta = row.previousPosition - row.position;
  if (delta === 0) return <span className="text-a2-text-faint">＝</span>;
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        delta > 0 ? "text-[#087b64]" : "text-[#b0002a]",
      )}
      title={`#${row.previousPosition} → #${row.position}`}
    >
      {delta > 0 ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}

export function KeywordOverviewDashboard({ initialKeyword = "" }: { initialKeyword?: string }) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [keyword, setKeyword] = useState(initialKeyword);
  const [targetDomain, setTargetDomain] = useState("");
  const [country, setCountry] = useState("KR");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [report, setReport] = useState<KeywordOverviewReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [locale],
  );
  const preciseFormatter = useMemo(
    () => new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US"),
    [locale],
  );
  const moneyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
        style: "currency",
        currency: "USD",
      }),
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

  const relativeTime = useCallback(
    (iso: string): string => {
      const timestamp = new Date(iso).getTime();
      if (!Number.isFinite(timestamp)) return "—";
      const minutes = Math.floor((Date.now() - timestamp) / 60_000);
      if (minutes < 1) return copy.justNow;
      if (minutes < 60) return `${minutes}m`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return copy.hoursAgo(hours);
      const days = Math.floor(hours / 24);
      if (days === 1) return copy.dayAgo;
      return `${days}${locale === "ko" ? "" : " "}${copy.daysAgo}`;
    },
    [copy, locale],
  );

  const runQuery = useCallback(
    async (nextKeyword: string, options?: { forceRefresh?: boolean }) => {
      const trimmed = nextKeyword.trim();
      if (!trimmed) return;
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/serp/collect/", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            keyword: trimmed,
            domain: targetDomain.trim() || undefined,
            countryCode: country,
            device,
            forceRefresh: options?.forceRefresh ?? false,
          }),
        });
        const body = (await response.json()) as ApiSuccess<KeywordOverviewReport> & ApiFailure;
        if (!response.ok || !body.data) {
          throw new Error(body.error?.message || `HTTP ${response.status}`);
        }
        setReport(body.data);
        setKeyword(body.data.keyword);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : copy.loadError);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [copy.loadError, country, device, targetDomain],
  );

  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  /** 딥링크(?keyword=)로 진입한 경우에만 자동 수집 — TTL 캐시 덕에 반복 진입은 무료다. */
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current || !initialKeyword.trim()) return;
    autoRanRef.current = true;
    void runQuery(initialKeyword);
  }, [initialKeyword, runQuery]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runQuery(keyword);
  };

  const featureLabel = useCallback(
    (feature: string) => FEATURE_LABELS[feature]?.[locale] ?? feature.replaceAll("_", " "),
    [locale],
  );

  const intentInfo = report?.intent ? INTENT_LABELS[report.intent] : undefined;
  const kd = report ? kdLevel(report.difficulty, copy) : null;
  const hasHistory = (report?.captures.length ?? 0) > 1;

  return (
    <div className="mx-auto w-full max-w-[1560px] p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
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
              {report.fromCache ? (
                <span className="rounded-full bg-[#eaf3ff] px-2.5 py-1 text-[11px] font-medium text-[#0872bf]">
                  {copy.cacheBadge}
                </span>
              ) : (
                <span className="rounded-full bg-[#e6f5f0] px-2.5 py-1 text-[11px] font-medium text-[#0a6b57]">
                  {copy.liveBadge}
                </span>
              )}
              <span className="text-[11px] text-a2-text-muted">
                {copy.collectedAt}: {relativeTime(report.capturedAt)} ·{" "}
                {report.engine === "google" ? "Google" : "Bing"} ·{" "}
                {report.countryCode} · {report.device === "mobile" ? copy.mobile : copy.desktop}
              </span>
            </div>
          )}
        </div>
        {report && (
          <button
            type="button"
            onClick={() => void runQuery(report.keyword, { forceRefresh: true })}
            disabled={loading}
            className="flex h-10 items-center rounded-[7px] border border-app-border bg-a2-card px-4 text-[13px] font-medium text-a2-text transition-colors hover:bg-app-bg disabled:cursor-wait disabled:opacity-50"
          >
            {copy.refresh}
          </button>
        )}
      </header>

      <form
        onSubmit={submit}
        className="mt-5 rounded-[10px] border border-app-border bg-a2-card p-3 shadow-[var(--a2-card-shadow)]"
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.2fr)_minmax(180px,1fr)_140px_140px_auto] lg:items-end">
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
          <label className="min-w-0">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.4px] text-a2-text-muted">
              {copy.domain}
            </span>
            <input
              name="domain"
              value={targetDomain}
              onChange={(event) => setTargetDomain(event.target.value)}
              placeholder={copy.domainPlaceholder}
              autoComplete="url"
              className="h-11 w-full rounded-[7px] border border-app-border bg-white px-3 text-[13px] text-a2-text outline-none transition focus:border-app-blue focus:ring-2 focus:ring-[#d8ecff]"
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-a2-text-muted">{copy.tryExample}</span>
          {EXAMPLE_KEYWORDS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setKeyword(item);
                void runQuery(item);
              }}
              className="min-h-8 rounded-full border border-app-border bg-white px-3 text-[11px] text-a2-text transition hover:border-[#b9d8f2] hover:bg-[#f5faff]"
            >
              {item}
            </button>
          ))}
        </div>
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
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
            <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <p className="mt-3 text-[15px] font-semibold text-a2-text">{copy.emptyTitle}</p>
          <p className="mt-1.5 max-w-[420px] text-[12px] leading-[18px] text-a2-text-muted">{copy.emptyBody}</p>
        </div>
      )}

      {!report && loading && (
        <div role="status" className="py-10" aria-live="polite">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-[120px] animate-pulse rounded-[10px] border border-app-border bg-a2-card p-4">
                <div className="h-3 w-20 rounded bg-[#e9ebf0]" />
                <div className="mt-5 h-7 w-16 rounded bg-[#e9ebf0]" />
              </div>
            ))}
          </div>
        </div>
      )}

      {report && (
        <div className={cn("transition-opacity", loading && "pointer-events-none opacity-60")}>
          {/* KPI 행: 검색량 · KD · 의도 · CPC · 결과 수 */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <h3 className="text-[12px] font-medium text-a2-text-muted">{copy.volume}</h3>
              <p className="mt-1 text-[26px] font-semibold leading-[32px] tracking-[-0.4px] text-a2-text">
                {report.volume > 0 ? numberFormatter.format(report.volume) : copy.noVolume}
              </p>
              <p className="mt-1 text-[11px] text-a2-text-muted">
                {copy.volumeNote(report.volumeMonthsUsed)}
              </p>
            </Card>
            <Card>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[12px] font-medium text-a2-text-muted">{copy.difficulty}</h3>
                {kd && (
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", kd.chip)}>
                    {kd.label}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[26px] font-semibold leading-[32px] tracking-[-0.4px] text-a2-text">
                {report.difficulty}%
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eceef3]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(report.difficulty, 2)}%`, background: kd?.bar }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-a2-text-muted">{copy.difficultyNote}</p>
            </Card>
            <Card>
              <h3 className="text-[12px] font-medium text-a2-text-muted">{copy.intent}</h3>
              {intentInfo ? (
                <p className="mt-2 inline-flex items-center gap-2 text-[18px] font-semibold text-a2-text">
                  <span className="h-3 w-3 rounded-full" style={{ background: intentInfo.color }} />
                  {intentInfo[locale]}
                </p>
              ) : (
                <p className="mt-2 text-[18px] font-semibold text-a2-text-faint">—</p>
              )}
              <p className="mt-1.5 text-[11px] text-a2-text-muted">{copy.intentNote}</p>
              {report.cpcCents !== null && report.cpcCents > 0 && (
                <p className="mt-2 text-[12px] text-a2-text">
                  {copy.cpc}: <strong>{moneyFormatter.format(report.cpcCents / 100)}</strong>
                  <span className="ml-1 text-[11px] text-a2-text-muted">({copy.cpcNote})</span>
                </p>
              )}
            </Card>
            <Card>
              <h3 className="text-[12px] font-medium text-a2-text-muted">{copy.resultsCount}</h3>
              <p className="mt-1 text-[26px] font-semibold leading-[32px] tracking-[-0.4px] text-a2-text">
                {preciseFormatter.format(report.results.length)}
              </p>
              <p className="mt-1 text-[11px] text-a2-text-muted">{copy.resultsNote}</p>
              {targetDomain.trim() && (
                <p className="mt-2 text-[12px]">
                  <span className="text-a2-text-muted">{copy.rankTitle}: </span>
                  {report.rank ? (
                    <strong className="text-[#087b64]">{copy.rankFound(report.rank.position)}</strong>
                  ) : (
                    <span className="font-medium text-[#b0002a]">{copy.rankMissing}</span>
                  )}
                </p>
              )}
            </Card>
          </div>

          {/* SERP 피처 */}
          <Card title={copy.serpFeatures} className="mt-4">
            {report.features.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {report.features.map((feature) => (
                  <span
                    key={feature}
                    className="rounded-full border border-[#cfe4f7] bg-[#f2f9ff] px-3 py-1 text-[12px] font-medium text-[#0872bf]"
                  >
                    {featureLabel(feature)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-a2-text-muted">{copy.noFeatures}</p>
            )}
          </Card>

          {/* SERP 테이블 + 수집 이력 */}
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <Card title={copy.serpTable}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse">
                  <thead>
                    <tr>
                      {[copy.position, copy.change, copy.result, copy.authority, copy.backlinks, copy.refDomains].map(
                        (label, index) => (
                          <th
                            key={label}
                            scope="col"
                            className={cn(
                              "border-b border-app-border px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.35px] text-a2-text-muted",
                              index >= 3 && "text-right",
                            )}
                          >
                            {label}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {report.results.map((row) => {
                      const isTarget =
                        report.rank !== null && row.position === report.rank.position;
                      return (
                        <tr
                          key={`${row.position}-${row.link}`}
                          className={cn("hover:bg-[#fafbfc]", isTarget && "bg-[#f1fbf6]")}
                        >
                          <td className="border-b border-[#eef0f2] px-2 py-2.5 text-[13px] font-semibold tabular-nums text-a2-text">
                            {row.position}
                          </td>
                          <td className="border-b border-[#eef0f2] px-2 py-2.5 text-[12px]">
                            <DeltaCell row={row} hasHistory={hasHistory} copy={copy} />
                          </td>
                          <td className="border-b border-[#eef0f2] px-2 py-2.5">
                            <a
                              href={row.link}
                              target="_blank"
                              rel="noreferrer"
                              className="block max-w-[420px] truncate text-[13px] font-medium text-app-blue hover:underline"
                              title={row.title || row.link}
                            >
                              {row.title || row.link}
                            </a>
                            <span className="block max-w-[420px] truncate text-[11px] text-a2-text-muted">
                              {row.domain}
                            </span>
                          </td>
                          <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right">
                            <span
                              className={cn(
                                "inline-flex min-w-8 justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                                row.authorityScore >= 60
                                  ? "bg-[#e5f7f1] text-[#087b64]"
                                  : row.authorityScore >= 30
                                    ? "bg-[#fff3df] text-[#8d5900]"
                                    : "bg-[#f0f1f4] text-a2-text-muted",
                              )}
                            >
                              {row.authorityScore}
                            </span>
                          </td>
                          <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] tabular-nums text-a2-text">
                            {numberFormatter.format(row.backlinks)}
                          </td>
                          <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] tabular-nums text-a2-text">
                            {numberFormatter.format(row.referringDomains)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title={copy.captures} hint={copy.capturesNote}>
              <ul className="space-y-2">
                {report.captures.map((capture) => (
                  <li
                    key={capture.capturedAt}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-[7px] border border-app-border px-3 py-2 text-[12px]",
                      capture.capturedAt === report.capturedAt && "border-[#b9d8f2] bg-[#f5faff]",
                    )}
                  >
                    <span className="text-a2-text">
                      {dateTimeFormatter.format(new Date(capture.capturedAt))}
                    </span>
                    <span className="shrink-0 tabular-nums text-a2-text-muted">
                      {capture.results}
                      {locale === "ko" ? copy.capturesResults : ` ${copy.capturesResults}`}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
