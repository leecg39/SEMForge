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

export interface DomainAnalyticsReport {
  query: {
    domain: string;
    countryCode: string;
    device: AnalyticsDevice;
  };
  availableDomains: string[];
  metrics: {
    authorityScore: MetricEstimate;
    organicTrafficEstimate: MetricEstimate;
    visitsEstimate: MetricEstimate;
    uniqueVisitorsEstimate: MetricEstimate;
    organicKeywords: number;
    backlinks: number;
    referringDomains: number;
    pagesPerVisit: number;
    bounceRate: number;
    followShare: number;
  };
  trend: Array<{
    period: string;
    organicTrafficEstimate: number;
    visitsEstimate: number;
  }>;
  topKeywords: Array<{
    keyword: string;
    intent: AnalyticsIntent;
    position: number;
    volume: number;
    difficulty: number;
    trafficContribution: number;
    url: string;
  }>;
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
