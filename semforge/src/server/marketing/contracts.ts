export type MarketingProvider = "gsc" | "ga4" | "google_ads" | "meta_ads" | "hubspot";
export type MarketingStatus = "live" | "unavailable" | "error";
export type MarketingCache = "fresh" | "stale";
export type MarketingMeasurement = "absolute" | "relative" | "calculated" | "inferred";
export type MarketingAttributionKind = "confirmed" | "inferred" | "unattributed";
export type AirbyteMarketingStream =
  | "gsc_pages"
  | "ga4_pages"
  | "ga4_traffic_sources"
  | "google_ads_campaigns"
  | "meta_ads_campaigns"
  | "hubspot_deals";

export interface AirbyteRawRecord {
  stream: AirbyteMarketingStream;
  data: Record<string, unknown>;
}

export interface MarketingSection<T> {
  status: MarketingStatus;
  cache: MarketingCache;
  measurement: MarketingMeasurement;
  source: string[];
  fetchedAt: string;
  expiresAt: string;
  reason?: string;
  data?: T;
}

export interface MarketingConnectionView {
  id: string;
  provider: MarketingProvider;
  status: "pending" | "active" | "syncing" | "error" | "disconnected";
  lastAttemptedAt: string | null;
  lastSucceededAt: string | null;
  nextSyncAt: string | null;
  cache: MarketingCache | "expired";
  reason?: string;
}

export interface TrafficOverview {
  clicks: number;
  impressions: number;
  sessions: number;
  engagedSessions: number;
  keyEvents: number;
  revenue: number;
  engagementRate: number | null;
  clickSessionRatio: number | null;
}

export interface TrafficChannelRow {
  date: string;
  channel: string;
  sessions: number;
  engagedSessions: number;
  keyEvents: number;
  revenue: number;
}

export interface TrafficPageRow {
  date: string;
  url: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
  sessions: number;
  engagedSessions: number;
  engagementRate: number | null;
  keyEvents: number;
  revenue: number;
}

export interface MarketingTrafficReport {
  overview: TrafficOverview;
  channels: TrafficChannelRow[];
  pages: TrafficPageRow[];
}

export interface AttributionRow {
  date: string;
  channel: string;
  campaign: string | null;
  landingPage: string | null;
  conversions: number;
  revenue: number;
  attribution: MarketingAttributionKind;
  evidence: string[];
}

export interface MarketingAttributionReport {
  rows: AttributionRow[];
}

export interface CampaignPerformanceRow {
  provider: "google_ads" | "meta_ads";
  date: string;
  externalCampaignId: string;
  campaign: string | null;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  cpa: number | null;
  roas: number | null;
}

export interface CampaignPerformanceReport { rows: CampaignPerformanceRow[] }

export interface TrafficRange {
  from: string;
  to: string;
  view: "overview" | "channels" | "pages";
}

export interface AttributionRange {
  from: string;
  to: string;
}
