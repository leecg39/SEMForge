export type NaverSectionStatus = "live" | "unavailable" | "error";
export type NaverCacheStatus = "fresh" | "stale";
export type NaverMeasurement = "absolute" | "relative" | "calculated" | "inferred";

interface SectionMetadata {
  status: NaverSectionStatus;
  cache: NaverCacheStatus;
  measurement: NaverMeasurement;
  source: string;
  fetchedAt: string;
  expiresAt: string;
  reason?: string;
}

export interface LiveSection<T> extends SectionMetadata {
  status: "live";
  data: T;
}

export interface UnavailableSection extends SectionMetadata {
  status: "unavailable";
}

export interface ErrorSection extends SectionMetadata {
  status: "error";
}

export type NaverSection<T> = LiveSection<T> | UnavailableSection | ErrorSection;

export interface NaverKeywordCount {
  relation: "exact" | "lt" | "range";
  min: number;
  maxExclusive: number | null;
  display: string;
  value?: number;
}

export interface NaverKeywordStat {
  snapshotId: string | null;
  keyword: string;
  normalizedKeyword: string;
  monthlyPcQueries: NaverKeywordCount | null;
  monthlyMobileQueries: NaverKeywordCount | null;
  monthlyTotalQueries: NaverKeywordCount | null;
  monthlyAveragePcClicks: number | null;
  monthlyAverageMobileClicks: number | null;
  monthlyAveragePcCtr: number | null;
  monthlyAverageMobileCtr: number | null;
  averageAdDepth: number | null;
  competition: "low" | "medium" | "high" | null;
  competitionLabel: string | null;
}

export interface NaverSearchAdsOverview {
  primary: NaverKeywordStat | null;
  relatedKeywords: NaverKeywordStat[];
}

export interface NaverTrendPoint {
  period: string;
  ratio: number;
}

export interface NaverTrendOverview {
  title: string;
  keywords: string[];
  points: NaverTrendPoint[];
}

export interface NaverDemographicPoint {
  key: string;
  label: string;
  ratio: number;
}

export interface NaverDemographicsOverview {
  device: NaverDemographicPoint[];
  gender: NaverDemographicPoint[];
  age: NaverDemographicPoint[];
}

export interface NaverBlogItem {
  title: string;
  link: string;
  description: string | null;
  bloggerName: string | null;
  bloggerLink: string | null;
  postDate: string | null;
}

export interface NaverBlogOverview {
  /** 블로그 검색 API 결과 수이며 통합검색/SERP 순위가 아니다. */
  total: number;
  items: NaverBlogItem[];
  resultLabel: "네이버 블로그 검색 API 응답 예시";
}

export interface NaverKeywordOverviewReport {
  keyword: string;
  generatedAt: string;
  searchAds: NaverSection<NaverSearchAdsOverview>;
  trend: NaverSection<NaverTrendOverview>;
  demographics: NaverSection<NaverDemographicsOverview>;
  blog: NaverSection<NaverBlogOverview>;
}

export interface NaverKeywordExploreReport {
  seeds: string[];
  generatedAt: string;
  total: number;
  keywords: NaverSection<NaverKeywordStat[]>;
}

export interface NaverBlogEnrichmentResult {
  keyword: string;
  blog: NaverSection<NaverBlogOverview>;
}

export interface NaverBlogEnrichmentReport {
  keywords: string[];
  generatedAt: string;
  results: NaverBlogEnrichmentResult[];
}

export interface NaverProviderCapability {
  enabled: boolean;
  source: string;
  reason?: string;
}

export interface NaverKeywordCapabilities {
  enabled: boolean;
  publicPreviewEnabled: boolean;
  providers: {
    searchAds: NaverProviderCapability;
    apiHub: NaverProviderCapability;
  };
}

export function liveSection<T>(input: {
  data: T;
  source: string;
  measurement: NaverMeasurement;
  cache: NaverCacheStatus;
  fetchedAt: Date;
  expiresAt: Date;
  reason?: string;
}): LiveSection<T> {
  return {
    status: "live",
    cache: input.cache,
    measurement: input.measurement,
    source: input.source,
    fetchedAt: input.fetchedAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    ...(input.reason ? { reason: input.reason } : {}),
    data: input.data,
  };
}

export function unavailableSection(input: {
  source: string;
  measurement: NaverMeasurement;
  reason: string;
  now?: Date;
}): UnavailableSection {
  const now = input.now ?? new Date();
  return {
    status: "unavailable",
    cache: "fresh",
    measurement: input.measurement,
    source: input.source,
    fetchedAt: now.toISOString(),
    expiresAt: now.toISOString(),
    reason: input.reason,
  };
}

export function errorSection(input: {
  source: string;
  measurement: NaverMeasurement;
  reason: string;
  now?: Date;
}): ErrorSection {
  const now = input.now ?? new Date();
  return {
    status: "error",
    cache: "fresh",
    measurement: input.measurement,
    source: input.source,
    fetchedAt: now.toISOString(),
    expiresAt: now.toISOString(),
    reason: input.reason,
  };
}

export function allSectionsFailed(
  sections: readonly NaverSection<unknown>[],
): boolean {
  return sections.every((section) => section.status !== "live");
}
