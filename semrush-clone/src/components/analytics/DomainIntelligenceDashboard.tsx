"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendChart } from "@/components/app/app-primitives";
import { useLocale } from "@/i18n/LocaleProvider";
import type {
  AnalyticsDevice,
  AnalyticsIntent,
  DomainAnalyticsReport,
  MetricEstimate,
  PositionBucketKey,
} from "@/lib/analytics/types";
import { cn } from "@/lib/utils";

const DEFAULT_DOMAIN = "northwind.example.com";

const ORGANIC_RESEARCH_HREF = "/analytics/organic/overview/";
const BACKLINKS_HREF = "/analytics/backlinks/overview/";
const COMPARE_DOMAINS_HREF = "/analytics/comparedomains/";

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

const FEATURE_LABELS: Record<string, { en: string; ko: string }> = {
  featured_snippet: { en: "Featured snippet", ko: "추천 스니펫" },
  people_also_ask: { en: "People also ask", ko: "관련 질문" },
  ai_overview: { en: "AI Overview", ko: "AI 개요" },
  knowledge_panel: { en: "Knowledge panel", ko: "지식 패널" },
  answer_box: { en: "Answer box", ko: "답변 박스" },
  local_pack: { en: "Local pack", ko: "로컬 팩" },
  image_pack: { en: "Image pack", ko: "이미지 팩" },
  video: { en: "Video", ko: "동영상" },
  reviews: { en: "Reviews", ko: "리뷰" },
  top_stories: { en: "Top stories", ko: "주요 뉴스" },
};

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
    authorityDesc: "Overall score based on backlinks and organic traffic",
    organicTraffic: "Organic Traffic",
    visits: "Visits",
    organicKeywords: "Organic Keywords",
    backlinks: "Backlinks",
    dataUpdated: "Data updated",
    overview: "Overview",
    topKeywords: "Top Keywords",
    dataSources: "Data sources",
    compareDomains: "Compare domains",
    viewDetails: "View details",
    organicSearch: "Organic Search",
    traffic: "Traffic",
    keywords: "Keywords",
    vsPreviousMonth: "vs previous month",
    keywordsByIntent: "Keywords by intent",
    intentBasis: "Share of ranked keywords",
    serpFeaturesTitle: "SERP Features",
    serpFeaturesBasis: "Keywords where the feature appears on the SERP",
    serpFeaturesEmpty: "No SERP features were observed for this scope.",
    keyword: "Keyword",
    intent: "Intent",
    position: "Position",
    volume: "Volume",
    difficulty: "KD %",
    trafficShare: "Traffic %",
    cpc: "CPC",
    contribution: "Traffic contribution",
    noKeywords: "No top-10 keywords were found for this scope.",
    positionDistribution: "Position distribution",
    currentSnapshot: "Current snapshot",
    brandedTitle: "Branded vs Non-branded traffic",
    branded: "Branded",
    nonBranded: "Non-branded",
    brandedNote: "Heuristic split: a keyword is branded when it contains the domain name.",
    brandedKeywords: "Branded keywords",
    nonBrandedKeywords: "Non-branded keywords",
    noBrandedRows: "No branded keywords detected.",
    noNonBrandedRows: "All ranked keywords are branded.",
    paidSearch: "Paid Search",
    noData: "No data available",
    paidNoData: "Ad SERP positions are not collected in this workspace yet, so paid search cannot be estimated.",
    referringDomainsCard: "Referring Domains",
    latestCrawl: "Latest crawl",
    refByAuthority: "Referring Domains by Authority Score",
    refByAuthorityBasis: "Average source authority per referring domain",
    topAnchors: "Top anchors",
    anchorsNoData: "The link graph does not store anchor text, so anchors cannot be aggregated.",
    followVsNofollow: "Follow vs Nofollow",
    follow: "Follow",
    nofollow: "Nofollow",
    industry: "Referring domains by industry",
    industryNoData: "Industry classification for referring domains is not available yet.",
    topPages: "Top pages",
    pageHost: "Page (host)",
    noLinkedPages: "No link-graph rows target this domain.",
    panelTitle: "Panel traffic & engagement",
    panelNote: "Visits-based metrics come from the weighted clickstream panel — a different source from SERP-based organic traffic.",
    uniqueVisitors: "Unique visitors",
    pagesPerVisit: "Pages / visit",
    bounceRate: "Bounce rate",
    referringDomains: "Referring domains",
    followShare: "Follow links",
    channels: "Estimated visits by channel",
    visitsTrend: "Panel visits by month",
    today: "today",
    dayAgo: "1 day ago",
    daysAgo: "days ago",
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
    liveCollectTitle: "Collect live SERP data",
    liveCollectDescription: "This domain is not in the local source stores yet. Collect real Google results for its brand keywords (comma-separated; leave empty to use suggestions), then the report is rebuilt from the collected data.",
    liveCollectKeywordsLabel: "Keywords to collect",
    liveCollectPlaceholder: "e.g. brand name, brand service",
    liveCollectAction: "Collect & rebuild report",
    liveCollecting: "Collecting live…",
    liveCollectRanked: "Found at",
    liveCollectNotFound: "Not in top results",
    liveData: "Live collected data",
    mixedData: "Live + demo mixed",
  },
  ko: {
    eyebrow: "도메인 인텔리전스",
    title: "도메인 개요",
    description: "검색 노출, 패널 트래픽, 링크 권위를 하나의 추적 가능한 리포트에서 확인하세요.",
    demo: "데모 데이터셋",
    modeled: "모델 추정치",
    export: "JSON보내기",
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
    authorityDesc: "백링크와 오가닉 트래픽을 합성한 종합 점수",
    organicTraffic: "오가닉 트래픽",
    visits: "방문 수",
    organicKeywords: "오가닉 키워드",
    backlinks: "백링크",
    dataUpdated: "데이터 갱신",
    overview: "개요",
    topKeywords: "상위 키워드",
    dataSources: "데이터 원천",
    compareDomains: "도메인 비교",
    viewDetails: "자세히 보기",
    organicSearch: "오가닉 검색",
    traffic: "트래픽",
    keywords: "키워드",
    vsPreviousMonth: "이전 달 대비",
    keywordsByIntent: "의도별 키워드",
    intentBasis: "랭킹 키워드 기준 비중",
    serpFeaturesTitle: "SERP 피처",
    serpFeaturesBasis: "해당 피처가 나타난 SERP의 키워드 수",
    serpFeaturesEmpty: "이 조건에서 관찰된 SERP 피처가 없습니다.",
    keyword: "키워드",
    intent: "의도",
    position: "순위",
    volume: "검색량",
    difficulty: "KD %",
    trafficShare: "트래픽 %",
    cpc: "CPC",
    contribution: "트래픽 기여",
    noKeywords: "이 조건에서 상위 10위 키워드를 찾지 못했습니다.",
    positionDistribution: "포지션 분포",
    currentSnapshot: "현재 스냅샷 기준",
    brandedTitle: "브랜드 vs 논브랜드 트래픽",
    branded: "브랜드",
    nonBranded: "논브랜드",
    brandedNote: "키워드에 도메인 이름이 포함되면 브랜드로 분류하는 휴리스틱입니다.",
    brandedKeywords: "브랜드 키워드",
    nonBrandedKeywords: "논브랜드 키워드",
    noBrandedRows: "브랜드 키워드가 감지되지 않았습니다.",
    noNonBrandedRows: "랭킹 키워드가 모두 브랜드 키워드입니다.",
    paidSearch: "유료 검색",
    noData: "데이터 없음",
    paidNoData: "이 워크스페이스는 광고 SERP를 아직 수집하지 않아 유료 검색을 추정할 수 없습니다.",
    referringDomainsCard: "참조 도메인",
    latestCrawl: "최신 크롤",
    refByAuthority: "Authority Score별 참조 도메인",
    refByAuthorityBasis: "참조 도메인별 평균 소스 권위",
    topAnchors: "상위 앵커",
    anchorsNoData: "링크 그래프가 앵커 텍스트를 저장하지 않아 집계할 수 없습니다.",
    followVsNofollow: "Follow vs Nofollow",
    follow: "Follow",
    nofollow: "Nofollow",
    industry: "업계별 참조 도메인",
    industryNoData: "참조 도메인의 업계 분류 데이터는 아직 없습니다.",
    topPages: "상위 페이지",
    pageHost: "페이지(호스트)",
    noLinkedPages: "이 도메인을 향한 링크 그래프 행이 없습니다.",
    panelTitle: "패널 트래픽 · 참여 지표",
    panelNote: "방문 수 계열은 가중 클릭스트림 패널 기반으로, SERP 기반 오가닉 트래픽과 원천이 다릅니다.",
    uniqueVisitors: "순 방문자",
    pagesPerVisit: "방문당 페이지",
    bounceRate: "이탈률",
    referringDomains: "참조 도메인",
    followShare: "Follow 링크",
    channels: "채널별 추정 방문 수",
    visitsTrend: "월별 패널 방문 수",
    today: "오늘",
    dayAgo: "1일 전",
    daysAgo: "일 전",
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
    liveCollectTitle: "실시간 SERP 수집",
    liveCollectDescription: "로컬 원천 스토어에 없는 도메인입니다. 브랜드 키워드의 실제 Google 결과를 수집하면(쉼표 구분, 비우면 추천 키워드 사용) 수집 데이터로 리포트를 다시 계산합니다.",
    liveCollectKeywordsLabel: "수집할 키워드",
    liveCollectPlaceholder: "예: 브랜드명, 브랜드 서비스",
    liveCollectAction: "수집 후 리포트 생성",
    liveCollecting: "실시간 수집 중…",
    liveCollectRanked: "순위 확인됨",
    liveCollectNotFound: "상위 결과에 없음",
    liveData: "실시간 수집 데이터",
    mixedData: "실시간 + 데모 혼합",
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];
type TabKey = "overview" | "keywords" | "sources";
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
  signal: AbortSignal,
  country: string,
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

/** 수집 API 봉투의 키워드별 결과. */
interface DomainSeedOutcome {
  keyword: string;
  position: number | null;
  url: string | null;
  error?: string;
}

interface DomainSeedCollectResponse {
  domain: string;
  collected: number;
  failed: number;
  ranked: number;
  outcomes: DomainSeedOutcome[];
  capturedAt: string;
}

/** 서버 suggestDomainKeywords 와 동일한 규칙의 클라이언트 미리보기 후보. */
function suggestKeywordsClient(domain: string): string[] {
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed) return [];
  let hostname = trimmed;
  try {
    hostname = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return [];
  }
  hostname = hostname.replace(/^www\./, "").replace(/\.$/, "");
  const sld = hostname.split(".")[0] ?? "";
  const tokens = sld.split(/[-_]/).filter(Boolean);
  const suggestions = new Set<string>();
  if (sld) suggestions.add(sld);
  if (tokens.length > 1) {
    suggestions.add(tokens.join(" "));
    suggestions.add(tokens.join(""));
  }
  return [...suggestions].slice(0, 5);
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

/** 카드 공용 껍데기 — 프로젝트 a2 토큰 사용. */
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

function ViewDetailsLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="shrink-0 text-[12px] font-semibold text-app-blue transition-colors hover:text-app-blue-dark hover:underline"
    >
      {label} →
    </Link>
  );
}

/** Authority Score 반원 게이지. */
function AuthorityGauge({ score }: { score: number }) {
  const clamped = Math.min(100, Math.max(0, score));
  const radius = 76;
  const halfCircumference = Math.PI * radius;
  const filled = (clamped / 100) * halfCircumference;
  const color = clamped >= 60 ? "#0ba360" : clamped >= 30 ? "#f79009" : "#e0447c";
  return (
    <svg viewBox="0 0 180 104" className="mx-auto w-full max-w-[220px]" role="img" aria-label={`${clamped}/100`}>
      <path d="M 14 96 A 76 76 0 0 1 166 96" fill="none" stroke="#eceef3" strokeWidth="14" strokeLinecap="round" />
      <path
        d="M 14 96 A 76 76 0 0 1 166 96"
        fill="none"
        stroke={color}
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${halfCircumference}`}
      />
      <text x="90" y="86" textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--a2-text)">
        {clamped}
      </text>
    </svg>
  );
}

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/** 범례 없는 순수 도넛 — 중앙에 총계 표시. */
function Donut({
  segments,
  centerValue,
  centerLabel,
  size = 132,
  thickness = 18,
}: {
  segments: DonutSegment[];
  centerValue: string;
  centerLabel: string;
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label={centerLabel}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#eef0f2" strokeWidth={thickness} />
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {total > 0 &&
          segments.map((segment) => {
            const dash = (segment.value / total) * circumference;
            const element = (
              <circle
                key={segment.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return element;
          })}
      </g>
      <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize="19" fontWeight="700" fill="var(--a2-text)">
        {total > 0 ? centerValue : "—"}
      </text>
      <text x={size / 2} y={size / 2 + 16} textAnchor="middle" fontSize="9.5" fill="var(--a2-text-muted)">
        {centerLabel}
      </text>
    </svg>
  );
}

/** 카드 안의 단일 시리즈 면적 추이 차트. */
function MiniArea({
  data,
  color,
  name,
  formatValue,
}: {
  data: Array<{ label: string; value: number }>;
  color: string;
  name: string;
  formatValue: (value: number) => string;
}) {
  const gradientId = useId();
  if (data.length === 0) {
    return <div className="flex h-[110px] items-center justify-center text-[12px] text-a2-text-muted">—</div>;
  }
  return (
    <div className="h-[110px]" role="img" aria-label={name}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "#9a9ca7" }}
            tickMargin={6}
            minTickGap={28}
          />
          <YAxis hide domain={[0, "auto"]} />
          <Tooltip
            formatter={(value) => [formatValue(Number(value)), name]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #ececee" }}
            labelStyle={{ fontWeight: 600 }}
          />
          <Area type="monotone" dataKey="value" name={name} stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 전월 대비 변화율 칩 (추이 마지막 두 점으로 계산, 이전 값이 0이면 표시하지 않음). */
function DeltaChip({ series, copy }: { series: number[]; copy: Copy }) {
  if (series.length < 2) return null;
  const previous = series[series.length - 2];
  const current = series[series.length - 1];
  if (previous <= 0) return null;
  const delta = ((current - previous) / previous) * 100;
  if (!Number.isFinite(delta) || delta === 0) return null;
  const positive = delta > 0;
  return (
    <span
      title={copy.vsPreviousMonth}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        positive ? "bg-[#e5f7f1] text-[#087b64]" : "bg-[#ffe8ed] text-[#b0002a]",
      )}
    >
      {positive ? "+" : ""}
      {delta.toFixed(1)}%
    </span>
  );
}

function NoDataBody({ message, label }: { message: string; label: string }) {
  return (
    <div className="flex min-h-[110px] flex-col items-center justify-center rounded-[8px] border border-dashed border-app-border bg-app-bg px-4 py-6 text-center">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-a2-text-faint">
        <rect x="3" y="10" width="4" height="10" rx="1" stroke="currentColor" strokeWidth="1.6" />
        <rect x="10" y="6" width="4" height="14" rx="1" stroke="currentColor" strokeWidth="1.6" />
        <rect x="17" y="3" width="4" height="17" rx="1" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      <p className="mt-2 text-[12px] font-semibold text-a2-text">{label}</p>
      <p className="mt-1 max-w-[260px] text-[11px] leading-[16px] text-a2-text-muted">{message}</p>
    </div>
  );
}

function LoadingCards({ copy }: { copy: Copy }) {
  return (
    <div role="status" className="py-10" aria-live="polite">
      <p className="mb-4 text-center text-[13px] text-app-text-secondary">{copy.initialLoading}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-[150px] animate-pulse rounded-[10px] border border-app-border bg-a2-card p-4">
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
  const [device] = useState<AnalyticsDevice>("desktop");
  const [country] = useState(initialCountry ?? "US");
  const [report, setReport] = useState<DomainAnalyticsReport | null>(initialReport);
  const [status, setStatus] = useState<LoadStatus>(initialReport ? "ready" : "error");
  const [error, setError] = useState<string | null>(initialReport ? null : copy.loadError);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [collectInput, setCollectInput] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [collectSummary, setCollectSummary] = useState<DomainSeedCollectResponse | null>(null);
  const [collectError, setCollectError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const runQuery = useCallback(async (
    nextDomain: string,
    nextDevice: AnalyticsDevice,
    nextCountry: string
  ): Promise<"ready" | "not_found" | "error"> => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("loading");
    setError(null);
    try {
      const nextReport = await fetchDomainReport(nextDomain, nextDevice, controller.signal, nextCountry);
      if (requestId !== requestIdRef.current) return "error";
      setReport(nextReport);
      setDomain(nextReport.query.domain);
      setStatus("ready");
      return "ready";
    } catch (caught) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return "error";
      setError(caught instanceof Error ? caught.message : copy.loadError);
      setStatus("error");
      return (caught as { code?: string })?.code === "NOT_FOUND" ? "not_found" : "error";
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

  /** "N일 전" 식 상대 날짜 — 30일 이상이면 절대 날짜. */
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

  const monthLabel = useCallback(
    (period: string) =>
      new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }).format(new Date(`${period}-01T00:00:00Z`)),
    [locale],
  );

  const trendSeries = useMemo(
    () => (report?.trend ?? []).map((point) => ({
      label: monthLabel(point.period),
      organic: point.organicTrafficEstimate,
      visits: point.visitsEstimate,
      keywords: point.keywords,
    })),
    [report, monthLabel],
  );

  const visitsChartSeries = useMemo(
    () => trendSeries.map((point) => ({ label: point.label, a: point.visits })),
    [trendSeries],
  );

  const featureLabel = useCallback(
    (feature: string) =>
      FEATURE_LABELS[feature]?.[locale] ?? feature.replaceAll("_", " "),
    [locale],
  );

  /** 실시간 수집: 로컬 데이터가 없는 실제 도메인의 브랜드/지정 키워드 SERP 를 수집한 뒤 리포트를 다시 계산한다. */
  const runCollect = async (auto = false) => {
    setCollecting(true);
    setCollectError(null);
    if (!auto) setCollectSummary(null);
    try {
      const keywords = collectInput
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean);
      const response = await fetch("/api/analytics/domain-overview/collect/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          domain,
          keywords: keywords.length > 0 ? keywords : undefined,
          countryCode: country,
          device,
        }),
      });
      const body = (await response.json()) as ApiSuccess<DomainSeedCollectResponse> & ApiFailure;
      if (!response.ok || !body.data) {
        const failure = new Error(body.error?.message || `HTTP ${response.status}`) as Error & {
          code?: string;
        };
        failure.code = body.error?.code;
        throw failure;
      }
      setCollectSummary(body.data);
      if (body.data.collected > 0) {
        await runQuery(domain, device, country);
      }
    } catch (caught) {
      setCollectError(caught instanceof Error ? caught.message : copy.loadError);
    } finally {
      setCollecting(false);
    }
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

  return (
    <div className="mx-auto w-full max-w-[1560px] p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.65px] text-app-blue">{copy.eyebrow}</p>
          <h1 className="mt-1 text-[24px] font-semibold leading-[32px] tracking-[-0.3px] text-a2-text">{copy.title}</h1>
          <p className="mt-1 max-w-3xl text-[13px] leading-[20px] text-a2-text-muted">{copy.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {report?.provenance === "live" ? (
              <span className="rounded-full bg-[#e6f5f0] px-2.5 py-1 text-[11px] font-medium text-[#0a6b57]">
                {copy.liveData}
              </span>
            ) : report?.provenance === "mixed" ? (
              <span className="rounded-full bg-[#eaf3ff] px-2.5 py-1 text-[11px] font-medium text-[#0872bf]">
                {copy.mixedData}
              </span>
            ) : (
              <span className="rounded-full bg-[#fff1eb] px-2.5 py-1 text-[11px] font-medium text-[#b63c0b]">{copy.demo}</span>
            )}
            <span className="rounded-full bg-[#eaf3ff] px-2.5 py-1 text-[11px] font-medium text-[#0872bf]">{copy.modeled}</span>
            {report?.freshness.serpCapturedAt && (
              <span className="text-[11px] text-a2-text-muted">
                {copy.dataUpdated}: {relativeDate(report.freshness.serpCapturedAt)}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={exportReport}
          disabled={!report}
          className="flex h-10 items-center rounded-[7px] border border-app-border bg-a2-card px-4 text-[13px] font-medium text-a2-text transition-colors hover:bg-app-bg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copy.export}
        </button>
      </header>

      <div className="min-h-[24px]" aria-live="polite">
        {error && (
          <div role="alert" className="mt-4 rounded-[8px] border border-[#ffc8d4] bg-[#fff4f6] px-4 py-3 text-[13px] text-[#a80028]">
            <div className="flex items-start justify-between gap-3">
              <span>{copy.loadError} {error}</span>
              <button type="button" onClick={() => void runQuery(domain, device, country)} className="shrink-0 font-semibold underline underline-offset-2">{copy.analyze}</button>
            </div>

            {/* 실시간 수집 패널 — 원천 스토어에 없는 실제 도메인은 TalorData 로 브랜드 SERP 를 수집해 리포트를 만든다 */}
            <div className="mt-3 border-t border-[#ffc8d4] pt-3">
              <p className="text-[12px] font-semibold text-[#7a001d]">{copy.liveCollectTitle}</p>
              <p className="mt-1 text-[12px] leading-[18px] text-[#a80028]">{copy.liveCollectDescription}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  value={collectInput}
                  onChange={(event) => setCollectInput(event.target.value)}
                  placeholder={suggestKeywordsClient(domain).join(", ") || copy.liveCollectPlaceholder}
                  aria-label={copy.liveCollectKeywordsLabel}
                  className="h-9 min-w-[220px] flex-1 rounded-[7px] border border-[#ffc8d4] bg-white px-3 text-[13px] text-a2-text outline-none focus:border-app-blue"
                />
                <button
                  type="button"
                  onClick={() => void runCollect()}
                  disabled={collecting}
                  className="h-9 shrink-0 rounded-[7px] bg-[#a80028] px-4 text-[12px] font-semibold text-white transition-opacity disabled:cursor-wait disabled:opacity-60"
                >
                  {collecting ? copy.liveCollecting : copy.liveCollectAction}
                </button>
              </div>
              {collectError && <p className="mt-2 text-[12px] font-medium">{collectError}</p>}
              {collectSummary && (
                <ul className="mt-2 flex flex-col gap-1 text-[12px]">
                  {collectSummary.outcomes.map((outcome) => (
                    <li key={outcome.keyword} className="flex items-center gap-2">
                      <span className="font-medium text-a2-text">{outcome.keyword}</span>
                      {outcome.error ? (
                        <span>— {outcome.error}</span>
                      ) : outcome.position !== null ? (
                        <span className="font-semibold text-[#0a6b57]">
                          {copy.liveCollectRanked} #{outcome.position}
                        </span>
                      ) : (
                        <span className="text-[#7a001d]">{copy.liveCollectNotFound}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
      {!report && status === "loading" ? (
        <LoadingCards copy={copy} />
      ) : report ? (
        <div className={cn("transition-opacity", status === "loading" && "pointer-events-none opacity-60")}>
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
                    ? "border-app-blue text-a2-text"
                    : "border-transparent text-a2-text-muted hover:text-a2-text",
                )}
              >
                {label}
              </button>
            ))}
            <Link
              href={COMPARE_DOMAINS_HREF}
              className="-mb-px flex min-h-11 items-center whitespace-nowrap border-b-2 border-transparent px-4 text-[13px] font-medium text-a2-text-muted transition-colors hover:text-a2-text"
            >
              {copy.compareDomains} →
            </Link>
          </div>

          {activeTab === "overview" && (
            <section id="domain-panel-overview" role="tabpanel" aria-labelledby="domain-tab-overview" className="pt-4">
              {/* 1행: Authority Score + 오가닉 검색 (PDF 상단 구성) */}
              <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                <Card>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-[14px] font-semibold text-a2-text">{copy.authority}</h2>
                    <ConfidenceBadge metric={report.metrics.authorityScore} copy={copy} />
                  </div>
                  <div className="mt-3">
                    <AuthorityGauge score={report.metrics.authorityScore.value} />
                  </div>
                  <p className="mt-2 text-center text-[11px] leading-[16px] text-a2-text-muted">{copy.authorityDesc}</p>
                </Card>

                <div className="min-w-0">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-[16px] font-semibold text-a2-text">{copy.organicSearch}</h2>
                    <ViewDetailsLink href={ORGANIC_RESEARCH_HREF} label={copy.viewDetails} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-[12px] font-medium text-a2-text-muted">{copy.traffic}</h3>
                        <div className="flex items-center gap-1.5">
                          <DeltaChip series={trendSeries.map((point) => point.organic)} copy={copy} />
                          <ConfidenceBadge metric={report.metrics.organicTrafficEstimate} copy={copy} />
                        </div>
                      </div>
                      <p className="mt-1 text-[26px] font-semibold leading-[32px] tracking-[-0.4px] text-a2-text">
                        {numberFormatter.format(report.metrics.organicTrafficEstimate.value)}
                      </p>
                      <div className="mt-2">
                        <MiniArea
                          data={trendSeries.map((point) => ({ label: point.label, value: point.organic }))}
                          color="#008ff8"
                          name={copy.organicTraffic}
                          formatValue={(value) => numberFormatter.format(value)}
                        />
                      </div>
                    </Card>
                    <Card>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-[12px] font-medium text-a2-text-muted">{copy.keywords}</h3>
                        <DeltaChip series={trendSeries.map((point) => point.keywords)} copy={copy} />
                      </div>
                      <p className="mt-1 text-[26px] font-semibold leading-[32px] tracking-[-0.4px] text-a2-text">
                        {preciseFormatter.format(report.metrics.organicKeywords)}
                      </p>
                      <div className="mt-2">
                        <MiniArea
                          data={trendSeries.map((point) => ({ label: point.label, value: point.keywords }))}
                          color="#8649e1"
                          name={copy.keywords}
                          formatValue={(value) => preciseFormatter.format(value)}
                        />
                      </div>
                    </Card>
                  </div>
                </div>
              </div>

              {/* 2행: 의도 도넛 + SERP 피처 + 상위 키워드 */}
              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.05fr)_minmax(0,1.35fr)]">
                <Card title={copy.keywordsByIntent} hint={copy.intentBasis}>
                  <div className="flex items-center gap-4">
                    <Donut
                      segments={report.intentDistribution.map((row) => ({
                        label: copy[row.intent],
                        value: row.keywords,
                        color: INTENT_COLORS[row.intent],
                      }))}
                      centerValue={preciseFormatter.format(report.metrics.organicKeywords)}
                      centerLabel={copy.keywords}
                      size={120}
                    />
                    <ul className="min-w-0 flex-1 space-y-1.5">
                      {report.intentDistribution.map((row) => (
                        <li key={row.intent} className="flex items-center gap-2 text-[12px]">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: INTENT_COLORS[row.intent] }} />
                          <span className="min-w-0 flex-1 truncate text-a2-text">{copy[row.intent]}</span>
                          <span className="shrink-0 tabular-nums text-a2-text-muted">{row.share}%</span>
                        </li>
                      ))}
                      {report.intentDistribution.length === 0 && (
                        <li className="text-[12px] text-a2-text-muted">{copy.noKeywords}</li>
                      )}
                    </ul>
                  </div>
                </Card>

                <Card title={copy.serpFeaturesTitle} hint={copy.serpFeaturesBasis}>
                  {report.serpFeatures.length > 0 ? (
                    <ul className="space-y-2">
                      {report.serpFeatures.slice(0, 8).map((row) => {
                        const maxShare = report.serpFeatures[0]?.share ?? 1;
                        return (
                          <li key={row.feature} className="grid grid-cols-[minmax(90px,130px)_minmax(0,1fr)_64px] items-center gap-2 text-[12px]">
                            <span className="truncate capitalize text-a2-text" title={featureLabel(row.feature)}>
                              {featureLabel(row.feature)}
                            </span>
                            <div className="h-2 overflow-hidden rounded-full bg-[#eceef3]">
                              <div
                                className="h-full rounded-full bg-app-blue"
                                style={{ width: `${Math.max((row.share / maxShare) * 100, 2)}%` }}
                              />
                            </div>
                            <span className="text-right tabular-nums text-a2-text-muted">{row.share.toFixed(2)}%</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <NoDataBody message={copy.serpFeaturesEmpty} label={copy.noData} />
                  )}
                </Card>

                <Card
                  title={copy.topKeywords}
                  action={<ViewDetailsLink href={ORGANIC_RESEARCH_HREF} label={copy.viewDetails} />}
                >
                  {report.topKeywords.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] border-collapse">
                        <thead>
                          <tr>
                            {[copy.keyword, copy.intent, copy.position, copy.volume, copy.difficulty, copy.trafficShare].map((label, index) => (
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
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {report.topKeywords.slice(0, 5).map((row) => (
                            <tr key={row.keyword} className="hover:bg-[#fafbfc]">
                              <td className="max-w-[160px] truncate border-b border-[#eef0f2] px-2 py-2.5 text-[12px] font-medium text-a2-text" title={row.keyword}>
                                {row.keyword}
                              </td>
                              <td className="border-b border-[#eef0f2] px-2 py-2.5">
                                <span
                                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                                  style={{ background: INTENT_COLORS[row.intent] }}
                                  title={copy[row.intent]}
                                >
                                  {copy[row.intent].slice(0, 1)}
                                </span>
                              </td>
                              <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] font-semibold tabular-nums text-a2-text">{row.position}</td>
                              <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] tabular-nums text-a2-text">{numberFormatter.format(row.volume)}</td>
                              <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] tabular-nums text-a2-text">{row.difficulty}</td>
                              <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] tabular-nums text-a2-text">
                                {report.metrics.organicTrafficEstimate.value > 0
                                  ? `${((row.trafficContribution / report.metrics.organicTrafficEstimate.value) * 100).toFixed(2)}%`
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <NoDataBody message={copy.noKeywords} label={copy.noData} />
                  )}
                </Card>
              </div>

              {/* 3행: 포지션 분포 + 브랜드 분할 + 브랜드 키워드 목록 */}
              <div className="mt-4 grid gap-4 xl:grid-cols-3">
                <Card title={copy.positionDistribution} hint={copy.currentSnapshot}>
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
                  <ul className="mt-3 space-y-1.5">
                    {report.positionDistribution.map((row) => (
                      <li key={row.bucket} className="flex items-center gap-2 text-[12px]">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: POSITION_BUCKET_COLORS[row.bucket] }} />
                        <span className="flex-1 tabular-nums text-a2-text">{row.bucket}</span>
                        <span className="shrink-0 tabular-nums text-a2-text-muted">{numberFormatter.format(row.keywords)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>

                <Card title={copy.brandedTitle} hint={copy.brandedNote}>
                  <div className="flex items-center gap-4">
                    <Donut
                      segments={[
                        { label: copy.branded, value: report.brandedSplit.brandedTraffic, color: "#008ff8" },
                        {
                          label: copy.nonBranded,
                          value: Math.max(0, report.brandedSplit.totalTraffic - report.brandedSplit.brandedTraffic),
                          color: "#8649e1",
                        },
                      ]}
                      centerValue={numberFormatter.format(report.brandedSplit.totalTraffic)}
                      centerLabel={copy.traffic}
                      size={120}
                    />
                    <ul className="min-w-0 flex-1 space-y-1.5">
                      <li className="flex items-center gap-2 text-[12px]">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-app-blue" />
                        <span className="min-w-0 flex-1 truncate text-a2-text">{copy.branded}</span>
                        <span className="shrink-0 tabular-nums text-a2-text-muted">{report.brandedSplit.brandedShare}%</span>
                      </li>
                      <li className="flex items-center gap-2 text-[12px]">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-app-purple" />
                        <span className="min-w-0 flex-1 truncate text-a2-text">{copy.nonBranded}</span>
                        <span className="shrink-0 tabular-nums text-a2-text-muted">
                          {Math.round((100 - report.brandedSplit.brandedShare) * 10) / 10}%
                        </span>
                      </li>
                    </ul>
                  </div>
                </Card>

                <Card>
                  <div className="grid h-full gap-4 sm:grid-cols-2">
                    {([
                      [copy.brandedKeywords, report.brandedSplit.brandedKeywords, copy.noBrandedRows],
                      [copy.nonBrandedKeywords, report.brandedSplit.nonBrandedKeywords, copy.noNonBrandedRows],
                    ] as const).map(([listTitle, rows, emptyLabel]) => (
                      <div key={listTitle} className="min-w-0">
                        <h3 className="text-[12px] font-semibold text-a2-text">{listTitle}</h3>
                        {rows.length > 0 ? (
                          <ul className="mt-2 space-y-1.5">
                            {rows.map((row) => (
                              <li key={row.keyword} className="flex items-baseline justify-between gap-2 text-[12px]">
                                <span className="min-w-0 truncate text-app-blue" title={row.keyword}>{row.keyword}</span>
                                <span className="shrink-0 tabular-nums text-a2-text-muted">{numberFormatter.format(row.volume)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-[11px] leading-[16px] text-a2-text-muted">{emptyLabel}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              {/* 4행: 유료 검색 — 광고 SERP 미수집으로 정직한 빈 상태 (PDF의 "No data available" 대응) */}
              <Card title={copy.paidSearch} className="mt-4">
                <NoDataBody message={copy.paidNoData} label={copy.noData} />
              </Card>

              {/* 5행: 백링크 섹션 (PDF 하단 구성) */}
              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-[16px] font-semibold text-a2-text">{copy.backlinks}</h2>
                  <ViewDetailsLink href={BACKLINKS_HREF} label={copy.viewDetails} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <h3 className="text-[12px] font-medium text-a2-text-muted">{copy.backlinks}</h3>
                    <p className="mt-1 text-[26px] font-semibold leading-[32px] tracking-[-0.4px] text-a2-text">
                      {numberFormatter.format(report.metrics.backlinks)}
                    </p>
                    <p className="mt-1 text-[11px] text-a2-text-muted">
                      {copy.latestCrawl}: {relativeDate(report.freshness.linksThrough)}
                    </p>
                  </Card>
                  <Card>
                    <h3 className="text-[12px] font-medium text-a2-text-muted">{copy.referringDomainsCard}</h3>
                    <p className="mt-1 text-[26px] font-semibold leading-[32px] tracking-[-0.4px] text-a2-text">
                      {numberFormatter.format(report.metrics.referringDomains)}
                    </p>
                    <p className="mt-1 text-[11px] text-a2-text-muted">
                      {copy.followShare}: {report.metrics.followShare.toFixed(1)}%
                    </p>
                  </Card>
                </div>
              </div>

              {/* 6행: 권위별 참조 도메인 + 상위 앵커 + Follow/Nofollow */}
              <div className="mt-4 grid gap-4 xl:grid-cols-3">
                <Card title={copy.refByAuthority} hint={copy.refByAuthorityBasis}>
                  {report.metrics.referringDomains > 0 ? (
                    <div className="flex h-[150px] items-end gap-1.5" role="img" aria-label={copy.refByAuthority}>
                      {report.refDomainsByAuthority.map((row) => {
                        const maxCount = Math.max(
                          ...report.refDomainsByAuthority.map((bucket) => bucket.referringDomains),
                          1,
                        );
                        const height = Math.max((row.referringDomains / maxCount) * 100, row.referringDomains > 0 ? 4 : 0);
                        return (
                          <div key={row.bucket} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                            <span className="text-[9px] tabular-nums text-a2-text-muted">
                              {row.referringDomains > 0 ? numberFormatter.format(row.referringDomains) : ""}
                            </span>
                            <div
                              className="w-full rounded-t-[3px] bg-app-blue"
                              style={{ height: `${height}%`, minHeight: row.referringDomains > 0 ? "3px" : "0" }}
                              title={`${row.bucket}: ${row.referringDomains}`}
                            />
                            <span className="w-full truncate text-center text-[8.5px] tabular-nums text-a2-text-faint">{row.bucket}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <NoDataBody message={copy.noLinkedPages} label={copy.noData} />
                  )}
                </Card>

                <Card title={copy.topAnchors}>
                  <NoDataBody message={copy.anchorsNoData} label={copy.noData} />
                </Card>

                <Card title={copy.followVsNofollow}>
                  <div className="flex items-center gap-4">
                    <Donut
                      segments={[
                        { label: copy.follow, value: report.metrics.followShare, color: "#008ff8" },
                        { label: copy.nofollow, value: Math.max(0, 100 - report.metrics.followShare), color: "#e0447c" },
                      ]}
                      centerValue={`${report.metrics.followShare.toFixed(0)}%`}
                      centerLabel={copy.follow}
                      size={120}
                    />
                    <ul className="min-w-0 flex-1 space-y-1.5">
                      <li className="flex items-center gap-2 text-[12px]">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-app-blue" />
                        <span className="min-w-0 flex-1 truncate text-a2-text">{copy.follow}</span>
                        <span className="shrink-0 tabular-nums text-a2-text-muted">{report.metrics.followShare.toFixed(1)}%</span>
                      </li>
                      <li className="flex items-center gap-2 text-[12px]">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#e0447c]" />
                        <span className="min-w-0 flex-1 truncate text-a2-text">{copy.nofollow}</span>
                        <span className="shrink-0 tabular-nums text-a2-text-muted">
                          {(100 - report.metrics.followShare).toFixed(1)}%
                        </span>
                      </li>
                    </ul>
                  </div>
                </Card>
              </div>

              {/* 패널 트래픽 — 클릭스트림 원천이 있는 도메인에만 표시 (기존 자산 유지) */}
              {(report.metrics.visitsEstimate.value > 0 || report.channels.length > 0) && (
                <div className="mt-6">
                  <div className="mb-3">
                    <h2 className="text-[16px] font-semibold text-a2-text">{copy.panelTitle}</h2>
                    <p className="mt-0.5 text-[11px] leading-[16px] text-a2-text-muted">{copy.panelNote}</p>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
                    <div>
                      <TrendChart
                        title={copy.visitsTrend}
                        type="line"
                        series={visitsChartSeries}
                        legend={[copy.visits]}
                      />
                    </div>
                    <Card>
                      <dl className="grid grid-cols-2 gap-3">
                        {[
                          [copy.visits, numberFormatter.format(report.metrics.visitsEstimate.value)],
                          [copy.uniqueVisitors, numberFormatter.format(report.metrics.uniqueVisitorsEstimate.value)],
                          [copy.pagesPerVisit, report.metrics.pagesPerVisit.toFixed(2)],
                          [copy.bounceRate, `${report.metrics.bounceRate.toFixed(1)}%`],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-[7px] bg-app-bg p-3">
                            <dt className="text-[10px] uppercase tracking-[0.35px] text-a2-text-muted">{label}</dt>
                            <dd className="mt-1 text-[16px] font-semibold text-a2-text">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </Card>
                  </div>
                  {report.channels.length > 0 && (
                    <Card title={copy.channels} className="mt-4">
                      <div className="space-y-3">
                        {report.channels.map((row) => (
                          <div key={row.channel} className="grid grid-cols-[90px_minmax(0,1fr)_86px] items-center gap-3 text-[12px]">
                            <span className="capitalize text-a2-text">{row.channel}</span>
                            <div className="h-2 overflow-hidden rounded-full bg-[#eceef3]">
                              <div className="h-full rounded-full bg-app-purple" style={{ width: `${Math.max(row.share, 1)}%` }} />
                            </div>
                            <span className="text-right tabular-nums text-a2-text-muted">
                              {numberFormatter.format(row.visitsEstimate)} · {row.share}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                </div>
              )}

              {/* 7행: 업계별 참조 도메인 — 분류 데이터 없음, 정직한 빈 상태 */}
              <Card title={copy.industry} className="mt-4">
                <NoDataBody message={copy.industryNoData} label={copy.noData} />
              </Card>

              {/* 8행: 상위 페이지 */}
              <Card
                title={copy.topPages}
                className="mt-4"
                action={<ViewDetailsLink href={BACKLINKS_HREF} label={copy.viewDetails} />}
              >
                {report.topLinkedPages.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] border-collapse">
                      <thead>
                        <tr>
                          {[copy.pageHost, copy.backlinks, copy.referringDomainsCard].map((label, index) => (
                            <th
                              key={label}
                              scope="col"
                              className={cn(
                                "border-b border-app-border px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.35px] text-a2-text-muted",
                                index >= 1 && "text-right",
                              )}
                            >
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {report.topLinkedPages.map((row) => (
                          <tr key={row.host} className="hover:bg-[#fafbfc]">
                            <td className="max-w-[220px] truncate border-b border-[#eef0f2] px-3 py-2.5 text-[12px] font-medium text-app-blue" title={row.host}>
                              {row.host}
                            </td>
                            <td className="border-b border-[#eef0f2] px-3 py-2.5 text-right text-[12px] tabular-nums text-a2-text">
                              {numberFormatter.format(row.backlinks)}
                            </td>
                            <td className="border-b border-[#eef0f2] px-3 py-2.5 text-right text-[12px] tabular-nums text-a2-text">
                              {numberFormatter.format(row.referringDomains)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <NoDataBody message={copy.noLinkedPages} label={copy.noData} />
                )}
              </Card>
            </section>
          )}

          {activeTab === "keywords" && (
            <section id="domain-panel-keywords" role="tabpanel" aria-labelledby="domain-tab-keywords" className="pt-4">
              <div className="overflow-x-auto rounded-[10px] border border-app-border bg-a2-card shadow-[var(--a2-card-shadow)]">
                <table className="w-full min-w-[860px] border-collapse">
                  <caption className="sr-only">{copy.topKeywords} — {report.query.domain}</caption>
                  <thead>
                    <tr className="bg-[#f9fafb]">
                      {[copy.keyword, copy.intent, copy.position, copy.volume, copy.difficulty, copy.trafficShare, copy.cpc, copy.contribution].map((label, index) => (
                        <th key={label} scope="col" className={cn("border-b border-app-border px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.35px] text-a2-text-muted", index >= 2 && "text-right")}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.topKeywords.map((row) => (
                      <tr key={row.keyword} className="hover:bg-[#fafbfc]">
                        <td className="border-b border-[#eef0f2] px-4 py-3">
                          <a href={row.url} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-app-blue hover:underline">{row.keyword}</a>
                        </td>
                        <td className="border-b border-[#eef0f2] px-4 py-3 text-[12px] text-a2-text-muted">{copy[row.intent]}</td>
                        <td className="border-b border-[#eef0f2] px-4 py-3 text-right text-[13px] font-semibold tabular-nums text-a2-text">{row.position}</td>
                        <td className="border-b border-[#eef0f2] px-4 py-3 text-right text-[13px] tabular-nums text-a2-text">{preciseFormatter.format(row.volume)}</td>
                        <td className="border-b border-[#eef0f2] px-4 py-3 text-right"><span className={cn("inline-flex min-w-9 justify-center rounded-full px-2 py-1 text-[11px] font-semibold", row.difficulty >= 70 ? "bg-[#ffe8ed] text-[#b0002a]" : row.difficulty >= 45 ? "bg-[#fff3df] text-[#8d5900]" : "bg-[#e5f7f1] text-[#087b64]")}>{row.difficulty}</span></td>
                        <td className="border-b border-[#eef0f2] px-4 py-3 text-right text-[13px] tabular-nums text-a2-text">
                          {report.metrics.organicTrafficEstimate.value > 0
                            ? `${((row.trafficContribution / report.metrics.organicTrafficEstimate.value) * 100).toFixed(2)}%`
                            : "—"}
                        </td>
                        <td className="border-b border-[#eef0f2] px-4 py-3 text-right text-[13px] tabular-nums text-a2-text">{moneyFormatter.format(row.cpcCents / 100)}</td>
                        <td className="border-b border-[#eef0f2] px-4 py-3 text-right text-[13px] tabular-nums text-a2-text">{preciseFormatter.format(row.trafficContribution)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {report.topKeywords.length === 0 && <p className="p-8 text-center text-[13px] text-a2-text-muted">{copy.noKeywords}</p>}
              </div>
            </section>
          )}

          {activeTab === "sources" && (
            <section id="domain-panel-sources" role="tabpanel" aria-labelledby="domain-tab-sources" className="pt-4">
              <div className="rounded-[10px] border border-app-border bg-a2-card p-4 shadow-[var(--a2-card-shadow)] sm:p-5">
                <h2 className="text-[16px] font-semibold text-a2-text">{copy.pipelineTitle}</h2>
                <p className="mt-1 text-[12px] leading-[18px] text-a2-text-muted">{copy.pipelineDescription}</p>
                <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_56px_minmax(280px,0.8fr)] xl:items-stretch">
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.45px] text-a2-text-muted">{copy.sourceStores}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {report.sources.map((source, index) => (
                        <article key={source.key} className="rounded-[8px] border border-app-border bg-[#fafbfc] p-3">
                          <div className="flex items-start justify-between gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#eaf3ff] text-[11px] font-bold text-app-blue">{index + 1}</span>
                            <span className="text-[10px] text-a2-text-muted">{source.cadence}</span>
                          </div>
                          <h3 className="mt-3 text-[13px] font-semibold text-a2-text">{source.label}</h3>
                          <p className="mt-1 text-[11px] leading-[17px] text-a2-text-muted">{source.role}</p>
                          <p className="mt-2 text-[11px] font-medium text-a2-text">{preciseFormatter.format(source.records)} {copy.records}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                  <div className="hidden items-center justify-center xl:flex" aria-hidden="true">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eaf3ff] text-[20px] text-app-blue">→</span>
                  </div>
                  <div className="rounded-[9px] border border-[#cab7ef] bg-[#f8f5ff] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.45px] text-[#7040b6]">{copy.derivedLayer}</p>
                    <ol className="mt-3 space-y-3 text-[12px] leading-[18px] text-a2-text">
                      {[copy.derivedOne, copy.derivedTwo, copy.derivedThree].map((item, index) => (
                        <li key={item} className="flex gap-2"><span className="font-semibold text-app-purple">{index + 1}.</span><span>{item}</span></li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-[10px] border border-app-border bg-a2-card shadow-[var(--a2-card-shadow)]">
                <table className="w-full min-w-[760px] border-collapse">
                  <caption className="sr-only">{copy.dataSources}</caption>
                  <thead><tr className="bg-[#f9fafb]">
                    {[copy.dataSources, copy.cadence, copy.role, copy.freshness].map((label) => <th key={label} scope="col" className="border-b border-app-border px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.35px] text-a2-text-muted">{label}</th>)}
                  </tr></thead>
                  <tbody>{report.sources.map((source) => (
                    <tr key={source.key}>
                      <th scope="row" className="border-b border-[#eef0f2] px-4 py-3 text-left text-[13px] font-semibold text-a2-text">{source.label}<span className="ml-2 font-normal text-a2-text-muted">({preciseFormatter.format(source.records)})</span></th>
                      <td className="border-b border-[#eef0f2] px-4 py-3 text-[12px] text-a2-text-muted">{source.cadence}</td>
                      <td className="border-b border-[#eef0f2] px-4 py-3 text-[12px] text-a2-text-muted">{source.role}</td>
                      <td className="border-b border-[#eef0f2] px-4 py-3 text-[12px] text-a2-text-muted">{source.lastUpdated ? dateFormatter.format(new Date(source.lastUpdated)) : "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <article className="rounded-[10px] border border-app-border bg-a2-card p-4 shadow-[var(--a2-card-shadow)]">
                  <h2 className="text-[14px] font-semibold text-a2-text">{copy.modelNotes}</h2>
                  <ul className="mt-3 space-y-3 text-[12px] leading-[18px] text-a2-text-muted">
                    <li>{copy.organicModel}</li>
                    <li>{copy.authorityModel}</li>
                    <li>{copy.kdModel}</li>
                  </ul>
                </article>
                <article className="rounded-[10px] border border-[#bce8dc] bg-[#f1fbf8] p-4">
                  <h2 className="text-[14px] font-semibold text-[#087b64]">{copy.privacy}</h2>
                  <p className="mt-2 text-[12px] leading-[18px] text-[#3c6860]">{copy.privacyBody}</p>
                  <code className="mt-4 block overflow-x-auto rounded-[6px] bg-white px-3 py-2 text-[11px] text-a2-text">rawIdentifiersExposed: false</code>
                </article>
              </div>
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}
