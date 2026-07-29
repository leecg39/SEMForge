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
import Link from "next/link";
import {
  OrganicResearchSetupDialog,
  type OrganicResearchSetupSummary,
} from "@/components/analytics/OrganicResearchSetupDialog";
import { useLocale } from "@/i18n/LocaleProvider";
import type {
  AnalyticsDevice,
  AnalyticsIntent,
  DomainAnalyticsReport,
  PositionBucketKey,
} from "@/lib/analytics/types";
import { cn } from "@/lib/utils";

/**
 * Organic Research 라이브 대시보드.
 * 축적된 serp_snapshots(시드 + TalorData 수집)를 도메인 관점으로 조회한
 * GET /api/analytics/domain-overview/ 리포트의 topKeywords 를 주 데이터로 쓴다.
 * 추가 외부 API 호출은 없다 — 수집은 Domain Overview / Keyword Overview 가 담당한다.
 */

const DEFAULT_DOMAIN = "northwind.example.com";

const INTENT_COLORS: Record<AnalyticsIntent, string> = {
  informational: "#0ba5a5",
  navigational: "#008ff8",
  commercial: "#f79009",
  transactional: "#e0447c",
};

const POSITION_BUCKET_COLORS: Record<PositionBucketKey, string> = {
  "1-3": "#008ff8",
  "4-10": "#12b5a5",
  "11-20": "#8649e1",
  "21-50": "#e0447c",
  "51-100": "#b794f6",
};

const COPY = {
  en: {
    eyebrow: "Competitive research",
    title: "Organic Research",
    description:
      "Every keyword this domain ranks for in the accumulated SERP snapshots — positions, volume, difficulty and traffic contribution. No extra API credits are spent on this screen.",
    domain: "Domain",
    domainPlaceholder: "Enter a domain",
    country: "Database",
    device: "Device",
    desktop: "Desktop",
    mobile: "Mobile",
    analyze: "Research",
    analyzing: "Loading…",
    tryExample: "Try:",
    loadError: "The report could not be loaded.",
    notFoundHint: "This domain has no rows in the source stores yet. Collect live SERP data from Domain Overview first.",
    goCollect: "Collect in Domain Overview →",
    demo: "Demo dataset",
    liveData: "Live collected data",
    mixedData: "Live + demo mixed",
    dataUpdated: "SERP updated",
    keywords: "Keywords",
    organicTraffic: "Organic Traffic",
    brandedShare: "Branded traffic",
    topPositions: "Top-3 positions",
    positionDistribution: "Position distribution",
    currentSnapshot: "Latest snapshot per keyword",
    keywordsTable: "Organic keywords",
    filterPlaceholder: "Filter keywords…",
    all: "All",
    keyword: "Keyword",
    intent: "Intent",
    position: "Pos",
    volume: "Volume",
    difficulty: "KD %",
    cpc: "CPC",
    traffic: "Traffic",
    trafficShare: "Traffic %",
    url: "URL",
    noKeywords: "No ranked keywords for this scope yet.",
    noFilterMatch: "No keywords match the filter.",
    openKeyword: "Open in Keyword Overview",
    informational: "Informational",
    navigational: "Navigational",
    commercial: "Commercial",
    transactional: "Transactional",
    today: "today",
    dayAgo: "1 day ago",
    daysAgo: "days ago",
  },
  ko: {
    eyebrow: "경쟁 조사",
    title: "오가닉 리서치",
    description:
      "축적된 SERP 스냅샷에서 이 도메인이 랭킹된 모든 키워드를 확인하세요 — 순위·검색량·난이도·트래픽 기여. 이 화면은 추가 API 크레딧을 쓰지 않습니다.",
    domain: "도메인",
    domainPlaceholder: "도메인을 입력하세요",
    country: "데이터베이스",
    device: "기기",
    desktop: "데스크톱",
    mobile: "모바일",
    analyze: "조회",
    analyzing: "불러오는 중…",
    tryExample: "예시:",
    loadError: "리포트를 불러오지 못했습니다.",
    notFoundHint: "이 도메인은 아직 원천 스토어에 데이터가 없습니다. 먼저 도메인 개요에서 실시간 SERP 를 수집하세요.",
    goCollect: "도메인 개요에서 수집하기 →",
    demo: "데모 데이터셋",
    liveData: "실시간 수집 데이터",
    mixedData: "실시간 + 데모 혼합",
    dataUpdated: "SERP 갱신",
    keywords: "키워드",
    organicTraffic: "오가닉 트래픽",
    brandedShare: "브랜드 트래픽",
    topPositions: "상위 1–3위",
    positionDistribution: "포지션 분포",
    currentSnapshot: "키워드별 최신 스냅샷 기준",
    keywordsTable: "오가닉 키워드",
    filterPlaceholder: "키워드 필터…",
    all: "전체",
    keyword: "키워드",
    intent: "의도",
    position: "순위",
    volume: "검색량",
    difficulty: "KD %",
    cpc: "CPC",
    traffic: "트래픽",
    trafficShare: "트래픽 %",
    url: "URL",
    noKeywords: "이 조건에서 랭킹된 키워드가 아직 없습니다.",
    noFilterMatch: "필터와 일치하는 키워드가 없습니다.",
    openKeyword: "키워드 개요에서 열기",
    informational: "정보 탐색",
    navigational: "이동",
    commercial: "상업 조사",
    transactional: "거래",
    today: "오늘",
    dayAgo: "1일 전",
    daysAgo: "일 전",
  },
} as const;

type LoadStatus = "loading" | "ready" | "error";

interface ApiSuccess<T> {
  data: T;
}

interface ApiFailure {
  error?: { code?: string; message?: string };
}

async function fetchDomainReport(
  domain: string,
  device: AnalyticsDevice,
  country: string,
  signal: AbortSignal,
): Promise<DomainAnalyticsReport> {
  const params = new URLSearchParams({ domain, country, device });
  const response = await fetch(`/api/analytics/domain-overview/?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  const body = (await response.json()) as ApiSuccess<DomainAnalyticsReport> & ApiFailure;
  if (!response.ok || !body.data) {
    const failure = new Error(body.error?.message || `HTTP ${response.status}`) as Error & {
      code?: string;
    };
    failure.code = body.error?.code;
    throw failure;
  }
  return body.data;
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

export function OrganicResearchDashboard({
  initialReport,
  initialDomain,
  initialCountry,
}: {
  initialReport: DomainAnalyticsReport | null;
  initialDomain?: string;
  initialCountry?: string;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [domain, setDomain] = useState(initialDomain ?? DEFAULT_DOMAIN);
  const [country, setCountry] = useState(initialCountry ?? "US");
  const [device, setDevice] = useState<AnalyticsDevice>("desktop");
  const [report, setReport] = useState<DomainAnalyticsReport | null>(initialReport);
  const [status, setStatus] = useState<LoadStatus>(initialReport ? "ready" : "error");
  const [error, setError] = useState<string | null>(initialReport ? null : copy.loadError);
  const [notFound, setNotFound] = useState(!initialReport);
  const [filter, setFilter] = useState("");
  const [intentFilter, setIntentFilter] = useState<AnalyticsIntent | "all">("all");
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupSummary, setSetupSummary] = useState<OrganicResearchSetupSummary | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const runQuery = useCallback(
    async (nextDomain: string, nextDevice: AnalyticsDevice, nextCountry: string) => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setStatus("loading");
      setError(null);
      setNotFound(false);
      try {
        const nextReport = await fetchDomainReport(
          nextDomain,
          nextDevice,
          nextCountry,
          controller.signal,
        );
        setReport(nextReport);
        setDomain(nextReport.query.domain);
        setStatus("ready");
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : copy.loadError);
        setNotFound((caught as { code?: string })?.code === "NOT_FOUND");
        setStatus("error");
      }
    },
    [copy.loadError],
  );

  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  useEffect(() => {
    const key = `organic-research-page-seo-setup:${initialDomain ?? DEFAULT_DOMAIN}`;
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(key);
        if (stored) {
          setSetupSummary(JSON.parse(stored) as OrganicResearchSetupSummary);
          return;
        }
      } catch {
        // 읽을 수 없는 로컬 설정은 새 설정으로 대체한다.
      }
      setSetupOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialDomain]);

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
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    [locale],
  );

  const relativeDate = useCallback(
    (iso: string | null): string => {
      if (!iso) return "—";
      const timestamp = new Date(iso).getTime();
      if (!Number.isFinite(timestamp)) return "—";
      const days = Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000));
      if (days <= 0) return copy.today;
      if (days === 1) return copy.dayAgo;
      if (days < 30) return `${days}${locale === "ko" ? "" : " "}${copy.daysAgo}`;
      return dateFormatter.format(new Date(timestamp));
    },
    [copy, dateFormatter, locale],
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runQuery(domain, device, country);
  };

  const filteredKeywords = useMemo(() => {
    if (!report) return [];
    const needle = filter.trim().toLowerCase();
    return report.topKeywords.filter((row) => {
      if (intentFilter !== "all" && row.intent !== intentFilter) return false;
      if (needle && !row.keyword.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [report, filter, intentFilter]);

  const top3Count = useMemo(
    () => report?.positionDistribution.find((row) => row.bucket === "1-3")?.keywords ?? 0,
    [report],
  );

  const availableDomains = report?.availableDomains.slice(0, 6) ?? [];
  const setupSuggestions = useMemo(
    () =>
      report?.topKeywords.slice(0, 7).map((row) => ({ keyword: row.keyword, url: row.url })) ?? [],
    [report],
  );

  const completeSetup = (summary: OrganicResearchSetupSummary) => {
    setSetupSummary(summary);
    try {
      window.localStorage.setItem(
        `organic-research-page-seo-setup:${summary.domain}`,
        JSON.stringify(summary),
      );
    } catch {
      // 스토리지 사용이 제한된 환경에서도 현재 세션의 완료 상태는 유지한다.
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1560px] p-4 sm:p-6">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-4">
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
              {report.provenance === "live" ? (
                <span className="rounded-full bg-[#e6f5f0] px-2.5 py-1 text-[11px] font-medium text-[#0a6b57]">
                  {copy.liveData}
                </span>
              ) : report.provenance === "mixed" ? (
                <span className="rounded-full bg-[#eaf3ff] px-2.5 py-1 text-[11px] font-medium text-[#0872bf]">
                  {copy.mixedData}
                </span>
              ) : (
                <span className="rounded-full bg-[#fff1eb] px-2.5 py-1 text-[11px] font-medium text-[#b63c0b]">
                  {copy.demo}
                </span>
              )}
              {report.freshness.serpCapturedAt && (
                <span className="text-[11px] text-a2-text-muted">
                  {copy.dataUpdated}: {relativeDate(report.freshness.serpCapturedAt)}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex max-w-[360px] flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="h-10 rounded-[7px] bg-[#4d1da8] px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-[#3f178d]"
          >
            {setupSummary ? "페이지 SEO 설정 수정" : "페이지 SEO 분석 설정"}
          </button>
          {setupSummary && (
            <p className="text-right text-[11px] leading-[17px] text-[#23775f]">
              설정 완료 · 키워드 {setupSummary.keywordCount}개 · {setupSummary.cadence === "weekly" ? "매주 재수집" : "수동 재수집"}
            </p>
          )}
        </div>
      </header>

      <form
        onSubmit={submit}
        className="mt-5 rounded-[10px] border border-app-border bg-a2-card p-3 shadow-[var(--a2-card-shadow)]"
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_150px_150px_auto] lg:items-end">
          <label className="min-w-0">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.4px] text-a2-text-muted">
              {copy.domain}
            </span>
            <input
              name="domain"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder={copy.domainPlaceholder}
              autoComplete="url"
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
              <option value="US">United States</option>
              <option value="KR">South Korea</option>
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.4px] text-a2-text-muted">
              {copy.device}
            </span>
            <select
              value={device}
              onChange={(event) => setDevice(event.target.value as AnalyticsDevice)}
              className="h-11 w-full rounded-[7px] border border-app-border bg-white px-3 text-[13px] text-a2-text outline-none focus:border-app-blue focus:ring-2 focus:ring-[#d8ecff]"
            >
              <option value="desktop">{copy.desktop}</option>
              <option value="mobile">{copy.mobile}</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={status === "loading"}
            className="h-11 rounded-[7px] bg-app-blue px-6 text-[13px] font-semibold text-white transition-colors hover:bg-app-blue-dark disabled:cursor-wait disabled:opacity-70"
          >
            {status === "loading" ? copy.analyzing : copy.analyze}
          </button>
        </div>
        {availableDomains.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-a2-text-muted">{copy.tryExample}</span>
            {availableDomains.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setDomain(item);
                  void runQuery(item, device, country);
                }}
                className="min-h-8 rounded-full border border-app-border bg-white px-3 text-[11px] text-a2-text transition hover:border-[#b9d8f2] hover:bg-[#f5faff]"
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </form>

      <div className="min-h-[24px]" aria-live="polite">
        {error && (
          <div
            role="alert"
            className="mt-4 rounded-[8px] border border-[#ffc8d4] bg-[#fff4f6] px-4 py-3 text-[13px] text-[#a80028]"
          >
            <p>
              {copy.loadError} {error}
            </p>
            {notFound && (
              <p className="mt-2">
                {copy.notFoundHint}{" "}
                <Link
                  href={`/analytics/overview/?domain=${encodeURIComponent(domain)}`}
                  className="font-semibold underline underline-offset-2"
                >
                  {copy.goCollect}
                </Link>
              </p>
            )}
          </div>
        )}
      </div>

      {report && (
        <div className={cn("transition-opacity", status === "loading" && "pointer-events-none opacity-60")}>
          {/* KPI 행 */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <h3 className="text-[12px] font-medium text-a2-text-muted">{copy.keywords}</h3>
              <p className="mt-1 text-[26px] font-semibold leading-[32px] tracking-[-0.4px] text-a2-text">
                {preciseFormatter.format(report.metrics.organicKeywords)}
              </p>
            </Card>
            <Card>
              <h3 className="text-[12px] font-medium text-a2-text-muted">{copy.organicTraffic}</h3>
              <p className="mt-1 text-[26px] font-semibold leading-[32px] tracking-[-0.4px] text-a2-text">
                {numberFormatter.format(report.metrics.organicTrafficEstimate.value)}
              </p>
            </Card>
            <Card>
              <h3 className="text-[12px] font-medium text-a2-text-muted">{copy.brandedShare}</h3>
              <p className="mt-1 text-[26px] font-semibold leading-[32px] tracking-[-0.4px] text-a2-text">
                {report.brandedSplit.brandedShare}%
              </p>
            </Card>
            <Card>
              <h3 className="text-[12px] font-medium text-a2-text-muted">{copy.topPositions}</h3>
              <p className="mt-1 text-[26px] font-semibold leading-[32px] tracking-[-0.4px] text-a2-text">
                {preciseFormatter.format(top3Count)}
              </p>
            </Card>
          </div>

          {/* 포지션 분포 */}
          <Card title={copy.positionDistribution} hint={copy.currentSnapshot} className="mt-4">
            <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-[#eceef3]">
              {report.positionDistribution.map((row) =>
                row.keywords > 0 ? (
                  <div
                    key={row.bucket}
                    className="h-full"
                    style={{ width: `${row.share}%`, background: POSITION_BUCKET_COLORS[row.bucket] }}
                    title={`${row.bucket}: ${row.keywords}`}
                  />
                ) : null,
              )}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
              {report.positionDistribution.map((row) => (
                <li key={row.bucket} className="flex items-center gap-2 text-[12px]">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: POSITION_BUCKET_COLORS[row.bucket] }}
                  />
                  <span className="tabular-nums text-a2-text">{row.bucket}</span>
                  <span className="tabular-nums text-a2-text-muted">
                    {numberFormatter.format(row.keywords)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {/* 키워드 테이블 */}
          <Card title={copy.keywordsTable} className="mt-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={copy.filterPlaceholder}
                aria-label={copy.filterPlaceholder}
                className="h-9 w-full max-w-[260px] rounded-[7px] border border-app-border bg-white px-3 text-[13px] text-a2-text outline-none focus:border-app-blue"
              />
              {(["all", "informational", "navigational", "commercial", "transactional"] as const).map(
                (value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setIntentFilter(value)}
                    className={cn(
                      "min-h-8 rounded-full border px-3 text-[11px] transition",
                      intentFilter === value
                        ? "border-app-blue bg-[#eaf3ff] font-semibold text-[#0872bf]"
                        : "border-app-border bg-white text-a2-text hover:bg-app-bg",
                    )}
                  >
                    {value === "all" ? copy.all : copy[value]}
                  </button>
                ),
              )}
            </div>
            {report.topKeywords.length === 0 ? (
              <p className="p-6 text-center text-[13px] text-a2-text-muted">{copy.noKeywords}</p>
            ) : filteredKeywords.length === 0 ? (
              <p className="p-6 text-center text-[13px] text-a2-text-muted">{copy.noFilterMatch}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse">
                  <caption className="sr-only">
                    {copy.keywordsTable} — {report.query.domain}
                  </caption>
                  <thead>
                    <tr className="bg-[#f9fafb]">
                      {[copy.keyword, copy.intent, copy.position, copy.volume, copy.difficulty, copy.cpc, copy.trafficShare, copy.traffic].map(
                        (label, index) => (
                          <th
                            key={label}
                            scope="col"
                            className={cn(
                              "border-b border-app-border px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.35px] text-a2-text-muted",
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
                    {filteredKeywords.map((row) => (
                      <tr key={row.keyword} className="hover:bg-[#fafbfc]">
                        <td className="border-b border-[#eef0f2] px-3 py-2.5">
                          <Link
                            href={`/analytics/keywordoverview/?keyword=${encodeURIComponent(row.keyword)}`}
                            className="text-[13px] font-medium text-app-blue hover:underline"
                            title={copy.openKeyword}
                          >
                            {row.keyword}
                          </Link>
                          <a
                            href={row.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block max-w-[280px] truncate text-[11px] text-a2-text-muted hover:underline"
                            title={row.url}
                          >
                            {row.url}
                          </a>
                        </td>
                        <td className="border-b border-[#eef0f2] px-3 py-2.5">
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                            style={{ background: INTENT_COLORS[row.intent] }}
                            title={copy[row.intent]}
                          >
                            {copy[row.intent].slice(0, 1)}
                          </span>
                        </td>
                        <td className="border-b border-[#eef0f2] px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums text-a2-text">
                          {row.position}
                        </td>
                        <td className="border-b border-[#eef0f2] px-3 py-2.5 text-right text-[13px] tabular-nums text-a2-text">
                          {preciseFormatter.format(row.volume)}
                        </td>
                        <td className="border-b border-[#eef0f2] px-3 py-2.5 text-right">
                          <span
                            className={cn(
                              "inline-flex min-w-9 justify-center rounded-full px-2 py-1 text-[11px] font-semibold",
                              row.difficulty >= 70
                                ? "bg-[#ffe8ed] text-[#b0002a]"
                                : row.difficulty >= 45
                                  ? "bg-[#fff3df] text-[#8d5900]"
                                  : "bg-[#e5f7f1] text-[#087b64]",
                            )}
                          >
                            {row.difficulty}
                          </span>
                        </td>
                        <td className="border-b border-[#eef0f2] px-3 py-2.5 text-right text-[13px] tabular-nums text-a2-text">
                          {moneyFormatter.format(row.cpcCents / 100)}
                        </td>
                        <td className="border-b border-[#eef0f2] px-3 py-2.5 text-right text-[13px] tabular-nums text-a2-text">
                          {report.metrics.organicTrafficEstimate.value > 0
                            ? `${((row.trafficContribution / report.metrics.organicTrafficEstimate.value) * 100).toFixed(2)}%`
                            : "—"}
                        </td>
                        <td className="border-b border-[#eef0f2] px-3 py-2.5 text-right text-[13px] tabular-nums text-a2-text">
                          {preciseFormatter.format(row.trafficContribution)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      <OrganicResearchSetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        domain={domain}
        country={country}
        suggestions={setupSuggestions}
        onComplete={completeSetup}
      />
    </div>
  );
}
