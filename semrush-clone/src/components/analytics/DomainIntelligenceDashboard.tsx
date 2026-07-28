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
import { TrendChart } from "@/components/app/app-primitives";
import { useLocale } from "@/i18n/LocaleProvider";
import type {
  AnalyticsDevice,
  DomainAnalyticsReport,
  MetricEstimate,
} from "@/lib/analytics/types";
import { cn } from "@/lib/utils";

const DEFAULT_DOMAIN = "northwind.example.com";
const EXAMPLE_DOMAINS = [
  "northwind.example.com",
  "acme.example.com",
  "globex.example.com",
];

const COPY = {
  en: {
    eyebrow: "Domain intelligence",
    title: "Domain Overview",
    description: "Explore modeled search visibility, panel traffic, and link authority from one traceable report.",
    demo: "Demo dataset",
    modeled: "Modeled estimates",
    export: "Export JSON",
    domain: "Domain",
    domainPlaceholder: "Enter a domain",
    country: "Database",
    device: "Device",
    desktop: "Desktop",
    mobile: "Mobile",
    analyze: "Analyze",
    analyzing: "Analyzing…",
    tryExample: "Try an example:",
    loadError: "The report could not be loaded.",
    initialLoading: "Building the report from source stores…",
    authority: "Authority Score",
    organicTraffic: "Organic Traffic",
    visits: "Visits",
    organicKeywords: "Organic Keywords",
    backlinks: "Backlinks",
    modeledMetric: "Modeled metric",
    serpEstimate: "SERP estimate",
    panelEstimate: "Panel estimate",
    rankedTop10: "Ranking in the top 10",
    discoveredLinks: "Crawled link edges",
    dataUpdated: "Data updated",
    overview: "Overview",
    topKeywords: "Top keywords",
    dataSources: "Data sources",
    twoTraffics: "These two traffic numbers answer different questions",
    organicExplanation: "Organic Traffic estimates potential Google clicks from rankings: Σ(search volume × position CTR).",
    visitsExplanation: "Visits estimates all-site sessions by expanding a weighted clickstream panel to the population.",
    neverCombined: "They use different source stores and are intentionally never merged into one “traffic” value.",
    trafficTrend: "Traffic estimates by month",
    trendDescription: "The blue line is ranking-based organic traffic; the purple line is weighted clickstream visits.",
    engagement: "Panel engagement",
    uniqueVisitors: "Unique visitors",
    pagesPerVisit: "Pages / visit",
    bounceRate: "Bounce rate",
    referringDomains: "Referring domains",
    followShare: "Follow links",
    channels: "Estimated visits by channel",
    keyword: "Keyword",
    intent: "Intent",
    position: "Position",
    volume: "12-mo. volume",
    difficulty: "KD %",
    contribution: "Traffic contribution",
    noKeywords: "No top-10 keywords were found for this scope.",
    pipelineTitle: "Source-to-metric pipeline",
    pipelineDescription: "Raw identifiers stay on the server. This screen receives only aggregates and modeled results.",
    sourceStores: "Source stores",
    derivedLayer: "Derived calculation layer",
    derivedOne: "Organic Traffic = volume × CTR",
    derivedTwo: "Authority = links + organic signal − spam",
    derivedThree: "KD = top-10 profile + volume + SERP features",
    records: "records",
    cadence: "Cadence",
    role: "Used for",
    freshness: "Latest data",
    modelNotes: "Model notes",
    organicModel: "Organic Traffic uses a versioned top-10 CTR curve and each keyword’s latest 12-month average volume.",
    authorityModel: "Authority Score is the clone-authority-v1 blend: 55% link power, 35% organic signal, and 10% spam trust.",
    kdModel: "KD keeps the published AS 16.99% and volume 9.47% weights; the remaining factors are explicitly the clone-kd-v1 model.",
    privacy: "Privacy boundary",
    privacyBody: "Session and user hashes, source network keys, and raw page paths are never returned by the analytics API.",
    confidenceHigh: "High confidence",
    confidenceMedium: "Medium confidence",
    confidenceLow: "Low confidence",
    estimated: "Estimated",
    modeledLabel: "Modeled",
    informational: "Informational",
    navigational: "Navigational",
    commercial: "Commercial",
    transactional: "Transactional",
  },
  ko: {
    eyebrow: "도메인 인텔리전스",
    title: "도메인 개요",
    description: "검색 노출, 패널 트래픽, 링크 권위를 하나의 추적 가능한 리포트에서 확인하세요.",
    demo: "데모 데이터셋",
    modeled: "모델 추정치",
    export: "JSON 내보내기",
    domain: "도메인",
    domainPlaceholder: "도메인을 입력하세요",
    country: "데이터베이스",
    device: "기기",
    desktop: "데스크톱",
    mobile: "모바일",
    analyze: "분석",
    analyzing: "분석 중…",
    tryExample: "예시 도메인:",
    loadError: "리포트를 불러오지 못했습니다.",
    initialLoading: "원천 스토어에서 리포트를 계산하고 있습니다…",
    authority: "Authority Score",
    organicTraffic: "오가닉 트래픽",
    visits: "방문 수",
    organicKeywords: "오가닉 키워드",
    backlinks: "백링크",
    modeledMetric: "모델 합성 지표",
    serpEstimate: "SERP 추정치",
    panelEstimate: "패널 추정치",
    rankedTop10: "상위 10위 키워드",
    discoveredLinks: "수집된 링크 엣지",
    dataUpdated: "데이터 갱신",
    overview: "개요",
    topKeywords: "상위 키워드",
    dataSources: "데이터 원천",
    twoTraffics: "두 트래픽 숫자는 서로 다른 질문에 답합니다",
    organicExplanation: "오가닉 트래픽은 순위로 발생 가능한 Google 클릭을 추정합니다: Σ(검색량 × 순위별 CTR).",
    visitsExplanation: "방문 수는 가중 클릭스트림 패널을 모집단으로 확장해 사이트 전체 세션을 추정합니다.",
    neverCombined: "원천 스토어가 다르므로 두 값을 하나의 ‘트래픽’ 숫자로 합치지 않습니다.",
    trafficTrend: "월별 트래픽 추정",
    trendDescription: "파란 선은 순위 기반 오가닉 트래픽, 보라색 선은 가중 클릭스트림 방문 수입니다.",
    engagement: "패널 참여 지표",
    uniqueVisitors: "순 방문자",
    pagesPerVisit: "방문당 페이지",
    bounceRate: "이탈률",
    referringDomains: "참조 도메인",
    followShare: "Follow 링크",
    channels: "채널별 추정 방문 수",
    keyword: "키워드",
    intent: "의도",
    position: "순위",
    volume: "12개월 검색량",
    difficulty: "KD %",
    contribution: "트래픽 기여",
    noKeywords: "이 조건에서 상위 10위 키워드를 찾지 못했습니다.",
    pipelineTitle: "원천 → 지표 계산 파이프라인",
    pipelineDescription: "원시 식별자는 서버에만 남고, 화면에는 집계값과 모델 결과만 전달됩니다.",
    sourceStores: "원천 스토어",
    derivedLayer: "파생 계산 레이어",
    derivedOne: "오가닉 트래픽 = 검색량 × CTR",
    derivedTwo: "Authority = 링크 + 오가닉 신호 − 스팸",
    derivedThree: "KD = 상위 10개 프로필 + 검색량 + SERP 피처",
    records: "개 레코드",
    cadence: "갱신",
    role: "사용 목적",
    freshness: "최신 데이터",
    modelNotes: "모델 설명",
    organicModel: "오가닉 트래픽은 버전이 고정된 상위 10위 CTR 곡선과 키워드별 최근 12개월 평균 검색량을 사용합니다.",
    authorityModel: "Authority Score는 clone-authority-v1 모델로 링크 파워 55%, 오가닉 신호 35%, 스팸 신뢰도 10%를 합성합니다.",
    kdModel: "KD는 공개된 AS 16.99%, 검색량 9.47%를 유지하며 나머지 요소는 clone-kd-v1 모델임을 명시합니다.",
    privacy: "개인정보 경계",
    privacyBody: "세션·사용자 해시, 원천 네트워크 키, 원시 페이지 경로는 분석 API 응답에 포함하지 않습니다.",
    confidenceHigh: "높은 확신도",
    confidenceMedium: "중간 확신도",
    confidenceLow: "낮은 확신도",
    estimated: "추정",
    modeledLabel: "모델 합성",
    informational: "정보 탐색",
    navigational: "이동",
    commercial: "상업 조사",
    transactional: "거래",
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];
type TabKey = "overview" | "keywords" | "sources";
type LoadStatus = "loading" | "ready" | "error";

interface ApiSuccess<T> {
  data: T;
}

interface ApiFailure {
  error?: { message?: string };
}

async function fetchDomainReport(
  domain: string,
  device: AnalyticsDevice,
  signal: AbortSignal,
): Promise<DomainAnalyticsReport> {
  const params = new URLSearchParams({ domain, country: "US", device });
  const response = await fetch(`/api/analytics/domain-overview/?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  const body = (await response.json()) as ApiSuccess<DomainAnalyticsReport> & ApiFailure;
  if (!response.ok || !body.data) {
    throw new Error(body.error?.message || `HTTP ${response.status}`);
  }
  return body.data;
}

function ConfidenceBadge({ metric, copy }: { metric: MetricEstimate; copy: Copy }) {
  const confidence =
    metric.confidence === "high"
      ? copy.confidenceHigh
      : metric.confidence === "medium"
        ? copy.confidenceMedium
        : copy.confidenceLow;
  return (
    <span
      title={`${confidence} · ${metric.modelVersion}`}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.35px]",
        metric.confidence === "high" && "bg-[#e5f7f1] text-[#087b64]",
        metric.confidence === "medium" && "bg-[#fff4df] text-[#8a5700]",
        metric.confidence === "low" && "bg-[#f1eaff] text-[#7040b6]",
      )}
    >
      {metric.kind === "modeled" ? copy.modeledLabel : copy.estimated}
    </span>
  );
}

function MetricTile({
  label,
  value,
  note,
  badge,
}: {
  label: string;
  value: string;
  note: string;
  badge?: ReactNode;
}) {
  return (
    <article className="min-w-0 rounded-[10px] border border-app-border bg-white p-4 shadow-[0_1px_2px_rgba(25,27,35,0.03)]">
      <div className="flex min-h-[20px] items-start justify-between gap-2">
        <h2 className="text-[12px] font-medium leading-[18px] text-app-text-secondary">{label}</h2>
        {badge}
      </div>
      <p className="mt-2 truncate text-[26px] font-semibold leading-[32px] tracking-[-0.4px] text-app-text">
        {value}
      </p>
      <p className="mt-1 truncate text-[11px] leading-[16px] text-app-text-secondary" title={note}>
        {note}
      </p>
    </article>
  );
}

function LoadingCards({ copy }: { copy: Copy }) {
  return (
    <div role="status" className="py-10" aria-live="polite">
      <p className="mb-4 text-center text-[13px] text-app-text-secondary">{copy.initialLoading}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-[118px] animate-pulse rounded-[10px] border border-app-border bg-white p-4">
            <div className="h-3 w-24 rounded bg-[#e9ebf0]" />
            <div className="mt-5 h-7 w-20 rounded bg-[#e9ebf0]" />
            <div className="mt-3 h-2.5 w-32 rounded bg-[#f0f1f4]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DomainIntelligenceDashboard({
  initialReport,
}: {
  initialReport: DomainAnalyticsReport | null;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [domain, setDomain] = useState(DEFAULT_DOMAIN);
  const [device, setDevice] = useState<AnalyticsDevice>("desktop");
  const [report, setReport] = useState<DomainAnalyticsReport | null>(initialReport);
  const [status, setStatus] = useState<LoadStatus>(initialReport ? "ready" : "error");
  const [error, setError] = useState<string | null>(initialReport ? null : copy.loadError);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const requestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const runQuery = useCallback(async (nextDomain: string, nextDevice: AnalyticsDevice) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("loading");
    setError(null);
    try {
      const nextReport = await fetchDomainReport(nextDomain, nextDevice, controller.signal);
      if (requestId !== requestIdRef.current) return;
      setReport(nextReport);
      setDomain(nextReport.query.domain);
      setStatus("ready");
    } catch (caught) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      setError(caught instanceof Error ? caught.message : copy.loadError);
      setStatus("error");
    }
  }, [copy.loadError]);

  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

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
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    [locale],
  );

  const chartSeries = useMemo(
    () =>
      report?.trend.map((point) => ({
        label: new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
          month: "short",
          year: "2-digit",
          timeZone: "UTC",
        }).format(new Date(`${point.period}-01T00:00:00Z`)),
        a: point.organicTrafficEstimate,
        b: point.visitsEstimate,
      })) ?? [],
    [locale, report],
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runQuery(domain, device);
  };

  const exportReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${report.query.domain}-domain-overview.json`;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  const availableDomains = report?.availableDomains.length
    ? report.availableDomains
    : EXAMPLE_DOMAINS;

  return (
    <div className="mx-auto w-full max-w-[1560px] p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.65px] text-app-blue">{copy.eyebrow}</p>
          <h1 className="mt-1 text-[24px] font-semibold leading-[32px] tracking-[-0.3px] text-app-text">{copy.title}</h1>
          <p className="mt-1 max-w-3xl text-[13px] leading-[20px] text-app-text-secondary">{copy.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-[#fff1eb] px-2.5 py-1 text-[11px] font-medium text-[#b63c0b]">{copy.demo}</span>
            <span className="rounded-full bg-[#eaf3ff] px-2.5 py-1 text-[11px] font-medium text-[#0872bf]">{copy.modeled}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={exportReport}
          disabled={!report}
          className="flex h-10 items-center rounded-[7px] border border-app-border bg-white px-4 text-[13px] font-medium text-app-text transition-colors hover:bg-app-bg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copy.export}
        </button>
      </header>

      <form onSubmit={submit} className="mt-5 rounded-[10px] border border-app-border bg-white p-3 shadow-[0_1px_3px_rgba(25,27,35,0.04)]">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_150px_150px_auto] lg:items-end">
          <label className="min-w-0">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.4px] text-app-text-secondary">{copy.domain}</span>
            <input
              name="domain"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder={copy.domainPlaceholder}
              autoComplete="url"
              required
              className="h-11 w-full rounded-[7px] border border-app-border bg-white px-3 text-[14px] text-app-text outline-none transition focus:border-app-blue focus:ring-2 focus:ring-[#d8ecff]"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.4px] text-app-text-secondary">{copy.country}</span>
            <select
              aria-label={copy.country}
              value="US"
              disabled
              className="h-11 w-full rounded-[7px] border border-app-border bg-[#f9fafb] px-3 text-[13px] text-app-text-secondary"
            >
              <option value="US">United States</option>
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.4px] text-app-text-secondary">{copy.device}</span>
            <select
              value={device}
              onChange={(event) => setDevice(event.target.value as AnalyticsDevice)}
              className="h-11 w-full rounded-[7px] border border-app-border bg-white px-3 text-[13px] text-app-text outline-none focus:border-app-blue focus:ring-2 focus:ring-[#d8ecff]"
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-app-text-secondary">{copy.tryExample}</span>
          {availableDomains.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setDomain(item);
                void runQuery(item, device);
              }}
              className="min-h-8 rounded-full border border-app-border bg-white px-3 text-[11px] text-app-text transition hover:border-[#b9d8f2] hover:bg-[#f5faff]"
            >
              {item}
            </button>
          ))}
        </div>
      </form>

      <div className="min-h-[24px]" aria-live="polite">
        {error && (
          <div role="alert" className="mt-4 flex items-start justify-between gap-3 rounded-[8px] border border-[#ffc8d4] bg-[#fff4f6] px-4 py-3 text-[13px] text-[#a80028]">
            <span>{copy.loadError} {error}</span>
            <button type="button" onClick={() => void runQuery(domain, device)} className="shrink-0 font-semibold underline underline-offset-2">{copy.analyze}</button>
          </div>
        )}
      </div>

      {!report && status === "loading" ? (
        <LoadingCards copy={copy} />
      ) : report ? (
        <div className={cn("transition-opacity", status === "loading" && "pointer-events-none opacity-60")}>
          <section aria-label="Key metrics" className="mt-1 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <MetricTile
              label={copy.authority}
              value={`${report.metrics.authorityScore.value}/100`}
              note={copy.modeledMetric}
              badge={<ConfidenceBadge metric={report.metrics.authorityScore} copy={copy} />}
            />
            <MetricTile
              label={copy.organicTraffic}
              value={numberFormatter.format(report.metrics.organicTrafficEstimate.value)}
              note={copy.serpEstimate}
              badge={<ConfidenceBadge metric={report.metrics.organicTrafficEstimate} copy={copy} />}
            />
            <MetricTile
              label={copy.visits}
              value={numberFormatter.format(report.metrics.visitsEstimate.value)}
              note={copy.panelEstimate}
              badge={<ConfidenceBadge metric={report.metrics.visitsEstimate} copy={copy} />}
            />
            <MetricTile
              label={copy.organicKeywords}
              value={preciseFormatter.format(report.metrics.organicKeywords)}
              note={copy.rankedTop10}
            />
            <MetricTile
              label={copy.backlinks}
              value={preciseFormatter.format(report.metrics.backlinks)}
              note={copy.discoveredLinks}
            />
          </section>

          <div className="mt-5 flex gap-1 overflow-x-auto border-b border-app-border" role="tablist" aria-label={copy.title}>
            {([
              ["overview", copy.overview],
              ["keywords", copy.topKeywords],
              ["sources", copy.dataSources],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                id={`domain-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                aria-controls={`domain-panel-${key}`}
                onClick={() => setActiveTab(key)}
                className={cn(
                  "-mb-px min-h-11 whitespace-nowrap border-b-2 px-4 text-[13px] font-medium transition-colors",
                  activeTab === key
                    ? "border-app-blue text-app-text"
                    : "border-transparent text-app-text-secondary hover:text-app-text",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === "overview" && (
            <section id="domain-panel-overview" role="tabpanel" aria-labelledby="domain-tab-overview" className="pt-4">
              <div className="rounded-[10px] border border-[#c8ddf2] bg-[#f4f9ff] p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  <div className="lg:w-[260px] lg:shrink-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.55px] text-[#0872bf]">Methodology</p>
                    <h2 className="mt-1 text-[16px] font-semibold leading-[22px] text-app-text">{copy.twoTraffics}</h2>
                  </div>
                  <div className="grid flex-1 gap-3 md:grid-cols-2">
                    <div className="rounded-[8px] bg-white p-3">
                      <p className="text-[12px] font-semibold text-app-blue">{copy.organicTraffic}</p>
                      <p className="mt-1 text-[12px] leading-[18px] text-app-text-secondary">{copy.organicExplanation}</p>
                    </div>
                    <div className="rounded-[8px] bg-white p-3">
                      <p className="text-[12px] font-semibold text-app-purple">{copy.visits}</p>
                      <p className="mt-1 text-[12px] leading-[18px] text-app-text-secondary">{copy.visitsExplanation}</p>
                    </div>
                    <p className="text-[11px] leading-[17px] text-[#4c6579] md:col-span-2">{copy.neverCombined}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
                <div>
                  <TrendChart
                    title={copy.trafficTrend}
                    type="line"
                    series={chartSeries}
                    legend={[copy.organicTraffic, copy.visits]}
                  />
                  <p className="mt-2 text-[11px] leading-[17px] text-app-text-secondary">{copy.trendDescription}</p>
                </div>
                <aside className="rounded-[10px] border border-app-border bg-white p-4">
                  <h2 className="text-[14px] font-semibold text-app-text">{copy.engagement}</h2>
                  <dl className="mt-3 grid grid-cols-2 gap-3">
                    {[
                      [copy.uniqueVisitors, numberFormatter.format(report.metrics.uniqueVisitorsEstimate.value)],
                      [copy.pagesPerVisit, report.metrics.pagesPerVisit.toFixed(2)],
                      [copy.bounceRate, `${report.metrics.bounceRate.toFixed(1)}%`],
                      [copy.referringDomains, preciseFormatter.format(report.metrics.referringDomains)],
                      [copy.followShare, `${report.metrics.followShare.toFixed(1)}%`],
                      [copy.dataUpdated, report.freshness.clickstreamThrough ? dateFormatter.format(new Date(report.freshness.clickstreamThrough)) : "—"],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-[7px] bg-app-bg p-3">
                        <dt className="text-[10px] uppercase tracking-[0.35px] text-app-text-secondary">{label}</dt>
                        <dd className="mt-1 text-[16px] font-semibold text-app-text">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </aside>
              </div>

              <section className="mt-4 rounded-[10px] border border-app-border bg-white p-4">
                <h2 className="text-[14px] font-semibold text-app-text">{copy.channels}</h2>
                <div className="mt-4 space-y-3">
                  {report.channels.map((row) => (
                    <div key={row.channel} className="grid grid-cols-[90px_minmax(0,1fr)_86px] items-center gap-3 text-[12px]">
                      <span className="capitalize text-app-text">{row.channel}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-[#eceef3]">
                        <div className="h-full rounded-full bg-app-purple" style={{ width: `${Math.max(row.share, 1)}%` }} />
                      </div>
                      <span className="text-right tabular-nums text-app-text-secondary">{numberFormatter.format(row.visitsEstimate)} · {row.share}%</span>
                    </div>
                  ))}
                </div>
              </section>
            </section>
          )}

          {activeTab === "keywords" && (
            <section id="domain-panel-keywords" role="tabpanel" aria-labelledby="domain-tab-keywords" className="pt-4">
              <div className="overflow-x-auto rounded-[10px] border border-app-border bg-white">
                <table className="w-full min-w-[760px] border-collapse">
                  <caption className="sr-only">{copy.topKeywords} — {report.query.domain}</caption>
                  <thead>
                    <tr className="bg-[#f9fafb]">
                      {[copy.keyword, copy.intent, copy.position, copy.volume, copy.difficulty, copy.contribution].map((label, index) => (
                        <th key={label} scope="col" className={cn("border-b border-app-border px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.35px] text-app-text-secondary", index >= 2 && "text-right")}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.topKeywords.map((row) => (
                      <tr key={row.keyword} className="hover:bg-[#fafbfc]">
                        <td className="border-b border-[#eef0f2] px-4 py-3">
                          <a href={row.url} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-app-blue hover:underline">{row.keyword}</a>
                        </td>
                        <td className="border-b border-[#eef0f2] px-4 py-3 text-[12px] text-app-text-secondary">{copy[row.intent]}</td>
                        <td className="border-b border-[#eef0f2] px-4 py-3 text-right text-[13px] font-semibold tabular-nums text-app-text">{row.position}</td>
                        <td className="border-b border-[#eef0f2] px-4 py-3 text-right text-[13px] tabular-nums text-app-text">{preciseFormatter.format(row.volume)}</td>
                        <td className="border-b border-[#eef0f2] px-4 py-3 text-right"><span className={cn("inline-flex min-w-9 justify-center rounded-full px-2 py-1 text-[11px] font-semibold", row.difficulty >= 70 ? "bg-[#ffe8ed] text-[#b0002a]" : row.difficulty >= 45 ? "bg-[#fff3df] text-[#8d5900]" : "bg-[#e5f7f1] text-[#087b64]")}>{row.difficulty}</span></td>
                        <td className="border-b border-[#eef0f2] px-4 py-3 text-right text-[13px] tabular-nums text-app-text">{preciseFormatter.format(row.trafficContribution)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {report.topKeywords.length === 0 && <p className="p-8 text-center text-[13px] text-app-text-secondary">{copy.noKeywords}</p>}
              </div>
            </section>
          )}

          {activeTab === "sources" && (
            <section id="domain-panel-sources" role="tabpanel" aria-labelledby="domain-tab-sources" className="pt-4">
              <div className="rounded-[10px] border border-app-border bg-white p-4 sm:p-5">
                <h2 className="text-[16px] font-semibold text-app-text">{copy.pipelineTitle}</h2>
                <p className="mt-1 text-[12px] leading-[18px] text-app-text-secondary">{copy.pipelineDescription}</p>
                <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_56px_minmax(280px,0.8fr)] xl:items-stretch">
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.45px] text-app-text-secondary">{copy.sourceStores}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {report.sources.map((source, index) => (
                        <article key={source.key} className="rounded-[8px] border border-app-border bg-[#fafbfc] p-3">
                          <div className="flex items-start justify-between gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#eaf3ff] text-[11px] font-bold text-app-blue">{index + 1}</span>
                            <span className="text-[10px] text-app-text-secondary">{source.cadence}</span>
                          </div>
                          <h3 className="mt-3 text-[13px] font-semibold text-app-text">{source.label}</h3>
                          <p className="mt-1 text-[11px] leading-[17px] text-app-text-secondary">{source.role}</p>
                          <p className="mt-2 text-[11px] font-medium text-app-text">{preciseFormatter.format(source.records)} {copy.records}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                  <div className="hidden items-center justify-center xl:flex" aria-hidden="true">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eaf3ff] text-[20px] text-app-blue">→</span>
                  </div>
                  <div className="rounded-[9px] border border-[#cab7ef] bg-[#f8f5ff] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.45px] text-[#7040b6]">{copy.derivedLayer}</p>
                    <ol className="mt-3 space-y-3 text-[12px] leading-[18px] text-app-text">
                      {[copy.derivedOne, copy.derivedTwo, copy.derivedThree].map((item, index) => (
                        <li key={item} className="flex gap-2"><span className="font-semibold text-app-purple">{index + 1}.</span><span>{item}</span></li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-[10px] border border-app-border bg-white">
                <table className="w-full min-w-[760px] border-collapse">
                  <caption className="sr-only">{copy.dataSources}</caption>
                  <thead><tr className="bg-[#f9fafb]">
                    {[copy.dataSources, copy.cadence, copy.role, copy.freshness].map((label) => <th key={label} scope="col" className="border-b border-app-border px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.35px] text-app-text-secondary">{label}</th>)}
                  </tr></thead>
                  <tbody>{report.sources.map((source) => (
                    <tr key={source.key}>
                      <th scope="row" className="border-b border-[#eef0f2] px-4 py-3 text-left text-[13px] font-semibold text-app-text">{source.label}<span className="ml-2 font-normal text-app-text-secondary">({preciseFormatter.format(source.records)})</span></th>
                      <td className="border-b border-[#eef0f2] px-4 py-3 text-[12px] text-app-text-secondary">{source.cadence}</td>
                      <td className="border-b border-[#eef0f2] px-4 py-3 text-[12px] text-app-text-secondary">{source.role}</td>
                      <td className="border-b border-[#eef0f2] px-4 py-3 text-[12px] text-app-text-secondary">{source.lastUpdated ? dateFormatter.format(new Date(source.lastUpdated)) : "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <article className="rounded-[10px] border border-app-border bg-white p-4">
                  <h2 className="text-[14px] font-semibold text-app-text">{copy.modelNotes}</h2>
                  <ul className="mt-3 space-y-3 text-[12px] leading-[18px] text-app-text-secondary">
                    <li>{copy.organicModel}</li>
                    <li>{copy.authorityModel}</li>
                    <li>{copy.kdModel}</li>
                  </ul>
                </article>
                <article className="rounded-[10px] border border-[#bce8dc] bg-[#f1fbf8] p-4">
                  <h2 className="text-[14px] font-semibold text-[#087b64]">{copy.privacy}</h2>
                  <p className="mt-2 text-[12px] leading-[18px] text-[#3c6860]">{copy.privacyBody}</p>
                  <code className="mt-4 block overflow-x-auto rounded-[6px] bg-white px-3 py-2 text-[11px] text-app-text">rawIdentifiersExposed: false</code>
                </article>
              </div>
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}
