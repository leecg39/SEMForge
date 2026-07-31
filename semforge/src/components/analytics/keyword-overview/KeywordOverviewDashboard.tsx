"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CapturesCard } from "@/components/analytics/keyword-overview/CapturesCard";
import { KpiRow } from "@/components/analytics/keyword-overview/KpiRow";
import { SearchForm } from "@/components/analytics/keyword-overview/SearchForm";
import { SerpFeaturesCard } from "@/components/analytics/keyword-overview/SerpFeaturesCard";
import { SerpResultsCard } from "@/components/analytics/keyword-overview/SerpResultsCard";
import { TrendCard } from "@/components/analytics/keyword-overview/TrendCard";
import type {
  ApiFailure,
  ApiSuccess,
  KeywordInsightsResponse,
  KeywordOverviewReport,
  TrendState,
} from "@/components/analytics/keyword-overview/types";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

/**
 * Keyword Overview 라이브 대시보드 (오케스트레이터).
 *
 * 검색 1회에 두 요청을 병렬로 보낸다:
 *   1) POST /api/serp/collect/     — TalorData 실시간 SERP (24h 캐시)
 *   2) POST /api/keywords/insights/ — Google Trends 관심도 추이 (7일 캐시)
 * 추세 수집 실패는 SERP 리포트를 막지 않는다 (위젯별 독립 오류 — 부분 실패 허용).
 * 검색량·CPC 처럼 소스가 없는 지표는 미제공으로 정직하게 표시한다.
 */

const COPY = {
  en: {
    eyebrow: "Keyword research",
    title: "Keyword Overview",
    description:
      "Live Google/Bing SERP plus Google Trends interest for any keyword. Metrics without a connected data source are marked as unavailable.",
    refresh: "Re-collect live",
    liveBadge: "Live collected",
    cacheBadge: "24h snapshot cache",
    collectedAt: "Collected",
    desktop: "Desktop",
    mobile: "Mobile",
    emptyTitle: "Search a keyword to build a live report",
    emptyBody:
      "The first run calls the TalorData SERP API and stores a snapshot. Repeat runs within 24 hours reuse the snapshot without spending credits.",
    loadError: "The report could not be loaded.",
    justNow: "just now",
    dayAgo: "1 day ago",
    daysAgo: "days ago",
    hoursAgo: (hours: number) => `${hours}h ago`,
  },
  ko: {
    eyebrow: "키워드 리서치",
    title: "키워드 개요",
    description:
      "키워드의 실시간 Google/Bing SERP 와 Google Trends 관심도 추이를 확인하세요. 연결된 데이터 소스가 없는 지표는 미제공으로 표시합니다.",
    refresh: "실시간 재수집",
    liveBadge: "실시간 수집",
    cacheBadge: "24시간 스냅샷 캐시",
    collectedAt: "수집 시각",
    desktop: "데스크톱",
    mobile: "모바일",
    emptyTitle: "키워드를 검색해 라이브 리포트를 만드세요",
    emptyBody:
      "첫 수집은 TalorData SERP API 를 호출해 스냅샷을 저장합니다. 24시간 이내 반복 조회는 크레딧 소모 없이 스냅샷을 재사용합니다.",
    loadError: "리포트를 불러오지 못했습니다.",
    justNow: "방금 전",
    dayAgo: "1일 전",
    daysAgo: "일 전",
    hoursAgo: (hours: number) => `${hours}시간 전`,
  },
} as const;

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
  const [trendState, setTrendState] = useState<TrendState>({ status: "idle" });
  const requestRef = useRef<AbortController | null>(null);
  const trendRequestRef = useRef<AbortController | null>(null);

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

  /**
   * 추세 로딩. SERP 수집과 독립적으로 실패/empty 상태를 가진다.
   * loading 에 머무는 전이 경로가 없다 — 항상 ready/empty/error 로 끝난다.
   */
  const loadTrend = useCallback(async (nextKeyword: string, nextCountry: string) => {
    trendRequestRef.current?.abort();
    const controller = new AbortController();
    trendRequestRef.current = controller;
    setTrendState({ status: "loading" });
    try {
      const response = await fetch("/api/keywords/insights/", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          keyword: nextKeyword,
          countryCode: nextCountry,
          kinds: ["trend_timeseries"],
        }),
      });
      const body = (await response.json()) as ApiSuccess<KeywordInsightsResponse> & ApiFailure;
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message || `HTTP ${response.status}`);
      }
      const outcome = body.data.insights.trend_timeseries;
      if (!outcome || outcome.status === "error") {
        setTrendState({
          status: "error",
          message: outcome?.status === "error" ? outcome.error : copy.loadError,
        });
        return;
      }
      if (outcome.payload.length === 0) {
        setTrendState({ status: "empty", fromCache: outcome.fromCache });
        return;
      }
      setTrendState({
        status: "ready",
        points: outcome.payload,
        fromCache: outcome.fromCache,
        capturedAt: outcome.capturedAt,
      });
    } catch (caught) {
      if (controller.signal.aborted) return;
      setTrendState({
        status: "error",
        message: caught instanceof Error ? caught.message : copy.loadError,
      });
    }
  }, [copy.loadError]);

  const runQuery = useCallback(
    async (nextKeyword: string, options?: { forceRefresh?: boolean }) => {
      const trimmed = nextKeyword.trim();
      if (!trimmed) return;
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(true);
      setError(null);
      // 추세는 SERP 와 병렬 수집. 재수집(forceRefresh)이어도 추세는 7일 캐시를
      // 재사용한다 (Trends 는 일 단위보다 느리게 움직이므로 크레딧 보호 우선).
      void loadTrend(trimmed, country);
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
    [copy.loadError, country, device, loadTrend, targetDomain],
  );

  useEffect(() => {
    return () => {
      requestRef.current?.abort();
      trendRequestRef.current?.abort();
    };
  }, []);

  /** 딥링크(?keyword=)로 진입한 경우에만 자동 수집 — TTL 캐시 덕에 반복 진입은 무료다. */
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current || !initialKeyword.trim()) return;
    autoRanRef.current = true;
    void runQuery(initialKeyword);
  }, [initialKeyword, runQuery]);

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
                {report.engine === "google" ? "Google" : "Bing"} · {report.countryCode} ·{" "}
                {report.device === "mobile" ? copy.mobile : copy.desktop}
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

      <SearchForm
        keyword={keyword}
        targetDomain={targetDomain}
        country={country}
        device={device}
        loading={loading}
        onKeywordChange={setKeyword}
        onTargetDomainChange={setTargetDomain}
        onCountryChange={setCountry}
        onDeviceChange={setDevice}
        onSubmit={() => void runQuery(keyword)}
        onExample={(example) => {
          setKeyword(example);
          void runQuery(example);
        }}
      />

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
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="text-a2-text-faint"
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
            <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <p className="mt-3 text-[15px] font-semibold text-a2-text">{copy.emptyTitle}</p>
          <p className="mt-1.5 max-w-[420px] text-[12px] leading-[18px] text-a2-text-muted">
            {copy.emptyBody}
          </p>
        </div>
      )}

      {!report && loading && (
        <div role="status" className="py-10" aria-live="polite">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="h-[120px] animate-pulse rounded-[10px] border border-app-border bg-a2-card p-4"
              >
                <div className="h-3 w-20 rounded bg-[#e9ebf0]" />
                <div className="mt-5 h-7 w-16 rounded bg-[#e9ebf0]" />
              </div>
            ))}
          </div>
        </div>
      )}

      {report && (
        <div className={cn("transition-opacity", loading && "pointer-events-none opacity-60")}>
          <KpiRow report={report} targetDomain={targetDomain} />

          <TrendCard
            state={trendState}
            onRetry={() => void loadTrend(report.keyword, report.countryCode)}
          />

          <SerpFeaturesCard features={report.features} />

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <SerpResultsCard report={report} />
            <CapturesCard report={report} />
          </div>
        </div>
      )}
    </div>
  );
}
