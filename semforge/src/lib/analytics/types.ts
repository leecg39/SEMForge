export type AnalyticsDevice = "desktop" | "mobile";
export type AnalyticsIntent =
  | "informational"
  | "navigational"
  | "commercial"
  | "transactional";
export type DateValue = Date | string | number;

export interface RawKeywordMetric {
  id: string;
  keyword: string;
  normalizedKeyword: string;
  countryCode: string;
  device: AnalyticsDevice;
  periodStart: DateValue;
  volume: number;
  cpcCents: number;
  currencyCode: string;
  intent: AnalyticsIntent;
  source: string;
  updatedAt: DateValue;
}

export interface RawSerpSnapshot {
  id: string;
  keywordMetricId: string;
  searchEngine: "google" | "bing";
  domain: string;
  url: string;
  position: number;
  isAd: boolean;
  serpFeatures: string;
  source: string;
  capturedAt: DateValue;
}

export interface RawClickstreamEvent {
  id: string;
  anonymousUserHash: string;
  sessionHash: string;
  domain: string;
  path: string;
  countryCode: string;
  device: AnalyticsDevice;
  channel: "direct" | "organic" | "paid" | "referral" | "social" | "email";
  populationWeight: number;
  source: string;
  occurredAt: DateValue;
}

export interface RawLinkGraphEdge {
  id: string;
  sourceDomain: string;
  targetDomain: string;
  sourceUrl: string;
  targetUrl: string;
  sourceNetwork: string;
  isFollow: boolean;
  sourceAuthority: number;
  source: string;
  firstSeenAt: DateValue;
  lastSeenAt: DateValue;
}

export interface AnalyticsRawDataset {
  keywords: readonly RawKeywordMetric[];
  serp: readonly RawSerpSnapshot[];
  clickstream: readonly RawClickstreamEvent[];
  links: readonly RawLinkGraphEdge[];
}

export interface MetricEstimate {
  value: number;
  kind: "estimated" | "modeled";
  modelVersion: string;
  source: string;
  confidence: "high" | "medium" | "low";
}

/** 도메인 개요 — 의도별 키워드 분포 한 조각. */
export interface IntentShare {
  intent: AnalyticsIntent;
  keywords: number;
  /** 상위 키워드 중 해당 의도의 비중(%) */
  share: number;
}

/** 도메인이 랭킹된 키워드의 SERP 에서 피처가 관찰된 비율. */
export interface SerpFeatureShare {
  feature: string;
  keywords: number;
  /** 랭킹 키워드 중 피처가 나타난 키워드 비율(%) */
  share: number;
}

export type PositionBucketKey = "1-3" | "4-10" | "11-20" | "21-50" | "51-100";

export interface PositionBucket {
  bucket: PositionBucketKey;
  keywords: number;
  share: number;
}

export interface BrandedKeywordRow {
  keyword: string;
  volume: number;
  trafficContribution: number;
}

/**
 * 브랜드/논브랜드 분할.
 * 도메인 SLD 토큰 포함 여부의 휴리스틱이므로 정확한 브랜드 사전은 아니다.
 */
export interface BrandedSplit {
  totalTraffic: number;
  brandedTraffic: number;
  brandedShare: number;
  brandedKeywords: BrandedKeywordRow[];
  nonBrandedKeywords: BrandedKeywordRow[];
}

/** 참조 도메인을 소스 권위 점수 구간별로 묶은 분포. */
export interface AuthorityBucket {
  bucket: string;
  referringDomains: number;
}

/** 링크 그래프에서 백링크가 가장 많이 향한 호스트(페이지 그룹). */
export interface LinkedPageRow {
  host: string;
  backlinks: number;
  referringDomains: number;
}

export type DomainProviderStatus = "live" | "unavailable" | "error";

/** 브라우저에 노출해도 되는 공급자 상태. 키·인증 헤더는 절대 포함하지 않는다. */
export interface DomainProviderState {
  status: DomainProviderStatus;
  source: "talordata" | "firecrawl" | "pagespeed-insights";
  fetchedAt: string;
  reason?: string;
  records?: number;
}

export interface DomainSiteProfile {
  requestedUrl: string;
  finalUrl: string;
  title: string | null;
  metaDescription: string | null;
  pagesDiscovered: number;
  pagesAnalyzed: number;
  successfulPages: number;
  headings: string[];
  keywordCandidates: string[];
  hasStructuredData: boolean;
  imagesTotal: number;
  imagesMissingAlt: number;
}

export interface DomainPerformanceProfile {
  url: string;
  strategy: AnalyticsDevice;
  scores: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
  };
  cwv: {
    lcpMs?: number;
    cls?: number;
    inpMs?: number;
    fcpMs?: number;
    tbtMs?: number;
    source: "field" | "lab" | "none";
    originLevel?: boolean;
  };
}

/** Firecrawl + TalorData + PageSpeed의 실제 호출 결과를 묶은 보존 스냅샷. */
export interface DomainExternalAnalysis {
  domain: string;
  countryCode: string;
  device: AnalyticsDevice;
  capturedAt: string;
  keywordCandidates: string[];
  providers: {
    talordata: DomainProviderState;
    firecrawl: DomainProviderState;
    pagespeed: DomainProviderState;
  };
  site: DomainSiteProfile | null;
  performance: DomainPerformanceProfile | null;
}

export interface DomainAnalyticsReport {
  query: {
    domain: string;
    countryCode: string;
    device: AnalyticsDevice;
  };
  /**
   * 리포트 입력 데이터의 출처.
   * live = TalorData 실시간 수집만, demo = 시드/데모만, mixed = 둘 다.
   * 서버 저장소 경계(getDomainAnalytics)에서 채우며 순수 계산 레이어는 건드리지 않는다.
   */
  provenance?: "demo" | "live" | "mixed";
  /** 마지막 외부 API 수집 스냅샷. 미수집 도메인은 undefined. */
  external?: DomainExternalAnalysis;
  availableDomains: string[];
  metrics: {
    authorityScore: MetricEstimate | null;
    organicTrafficEstimate: MetricEstimate | null;
    visitsEstimate: MetricEstimate | null;
    uniqueVisitorsEstimate: MetricEstimate | null;
    organicKeywords: number;
    backlinks: number | null;
    referringDomains: number | null;
    pagesPerVisit: number | null;
    bounceRate: number | null;
    followShare: number | null;
  };
  trend: Array<{
    period: string;
    organicTrafficEstimate: number | null;
    visitsEstimate: number | null;
    /** 해당 월에 상위 10위 안에 든 키워드 수 */
    keywords: number;
  }>;
  topKeywords: Array<{
    keyword: string;
    intent: AnalyticsIntent | null;
    position: number;
    volume: number | null;
    difficulty: number | null;
    trafficContribution: number | null;
    url: string;
    cpcCents: number | null;
  }>;
  intentDistribution: IntentShare[];
  serpFeatures: SerpFeatureShare[];
  positionDistribution: PositionBucket[];
  brandedSplit: BrandedSplit | null;
  refDomainsByAuthority: AuthorityBucket[];
  topLinkedPages: LinkedPageRow[];
  channels: Array<{
    channel: RawClickstreamEvent["channel"];
    visitsEstimate: number;
    share: number;
  }>;
  sources: Array<{
    key: "keyword_metrics" | "serp_snapshots" | "clickstream_events" | "link_graph";
    label: string;
    records: number;
    lastUpdated: string | null;
    cadence: string;
    role: string;
  }>;
  freshness: {
    keywordMetricsThrough: string | null;
    serpCapturedAt: string | null;
    clickstreamThrough: string | null;
    linksThrough: string | null;
  };
  models: {
    organicTraffic: "clone-organic-traffic-v1";
    clickstream: "clone-clickstream-v1";
    authority: "clone-authority-v1";
    keywordDifficulty: "clone-kd-v1";
  };
}
