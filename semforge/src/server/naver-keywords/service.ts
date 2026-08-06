// @TASK NAVER-KI-SVC-01 - NAVER 키워드 인텔리전스 조합 서비스
// @SPEC user-approved-plan#3-a-official-data-collection
// @TEST src/server/naver-keywords/service.test.ts
import {
  NaverApiHubRequestError,
  NaverApiHubUnavailableError,
  type NaverBlogSearchResult,
  type NaverSearchTrendResult,
} from "@/server/naver-api-hub/client";
import {
  NaverSearchAdsRateLimitError,
  NaverSearchAdsRequestError,
  NaverSearchAdsUnavailableError,
  type NaverQueryCount,
  type NaverRelatedKeyword,
  type NaverRelatedKeywordsResult,
} from "@/server/naver-search-ads/client";
import {
  errorSection,
  liveSection,
  unavailableSection,
  type NaverBlogOverview,
  type NaverBlogEnrichmentReport,
  type NaverKeywordCount,
  type NaverKeywordExploreReport,
  type NaverKeywordOverviewReport,
  type NaverKeywordStat,
  type NaverMeasurement,
  type NaverSection,
  type NaverSearchAdsOverview,
  type NaverTrendOverview,
} from "@/server/naver-keywords/contracts";
import {
  KeywordInputError,
  normalizeKeyword,
  normalizeKeywordSeeds,
} from "@/server/naver-keywords/normalization";
import { NaverProviderCapacityError } from "@/server/naver-keywords/errors";

export const NAVER_SEARCH_ADS_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const NAVER_SEARCH_TREND_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const NAVER_BLOG_SEARCH_TTL_MS = 24 * 60 * 60 * 1_000;
export const NAVER_STALE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
export const MAX_NAVER_BLOG_ENRICHMENT_KEYWORDS = 20;

export type NaverInsightKind = "search_trend" | "blog_search";

export interface CachedNaverSection<T> {
  data: T;
  source: string;
  fetchedAt: Date;
  expiresAt: Date;
  cache: "fresh" | "stale";
}

export interface NaverKeywordServiceStore {
  readSearchAds(
    requestKey: string,
    now: Date,
  ): Promise<CachedNaverSection<NaverKeywordStat[]> | null>;
  saveSearchAds(input: {
    requestKey: string;
    section: CachedNaverSection<NaverKeywordStat[]>;
  }): Promise<NaverKeywordStat[]>;
  readInsight<T>(input: {
    keyword: string;
    kind: NaverInsightKind;
    now: Date;
  }): Promise<CachedNaverSection<T> | null>;
  saveInsight<T>(input: {
    keyword: string;
    kind: NaverInsightKind;
    section: CachedNaverSection<T>;
  }): Promise<void>;
}

export interface NaverKeywordProviders {
  hasSearchAdsCredentials?: () => boolean;
  hasApiHubCredentials?: () => boolean;
  fetchSearchAds(seeds: readonly string[]): Promise<NaverRelatedKeywordsResult>;
  fetchTrend(keyword: string): Promise<NaverSearchTrendResult>;
  fetchBlog(keyword: string): Promise<NaverBlogSearchResult>;
}

export interface NaverKeywordProviderExecutor {
  searchAds<T>(task: () => Promise<T>, now: Date): Promise<T>;
  apiHub<T>(task: () => Promise<T>, now: Date): Promise<T>;
}

export interface NaverKeywordServiceDependencies {
  store: NaverKeywordServiceStore;
  providers: NaverKeywordProviders;
  executor: NaverKeywordProviderExecutor;
  now?: () => Date;
}

export interface NaverKeywordService {
  overview(keyword: string): Promise<NaverKeywordOverviewReport>;
  publicPreview(
    keyword: string,
    options?: { cacheOnly?: boolean },
  ): Promise<NaverKeywordOverviewReport>;
  explore(seeds: readonly string[]): Promise<NaverKeywordExploreReport>;
  blogEnrichment(keywords: readonly string[]): Promise<NaverBlogEnrichmentReport>;
}

function safeDate(value: string, fallback: Date): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? fallback : parsed;
}

function normalizedKey(value: string): string {
  return normalizeKeyword(value).toLocaleLowerCase("ko-KR");
}

function compactKeywordKey(value: string): string {
  return normalizedKey(value).replace(/\s+/gu, "");
}

export function searchAdsRequestKey(seeds: readonly string[]): string {
  return seeds.length === 1 ? seeds[0] : seeds.join("\u001f");
}

export function normalizeBlogEnrichmentKeywords(values: readonly string[]): string[] {
  if (values.length < 1 || values.length > MAX_NAVER_BLOG_ENRICHMENT_KEYWORDS) {
    throw new KeywordInputError(
      `블로그 공급량 보강 키워드는 1개 이상 ${MAX_NAVER_BLOG_ENRICHMENT_KEYWORDS}개 이하여야 합니다.`,
    );
  }
  const unique = new Map<string, string>();
  for (const value of values) {
    const keyword = normalizeKeyword(value);
    const key = keyword.toLocaleLowerCase("ko-KR");
    if (!unique.has(key)) unique.set(key, keyword);
  }
  return [...unique.values()];
}

function toCount(value: NaverQueryCount | null): NaverKeywordCount | null {
  if (!value) return null;
  return {
    relation: value.relation,
    min: value.min,
    maxExclusive: value.maxExclusive,
    display: value.display,
    ...(value.relation === "exact" ? { value: value.value } : {}),
  };
}

function toKeywordStat(value: NaverRelatedKeyword): NaverKeywordStat {
  return {
    snapshotId: null,
    keyword: value.keyword,
    normalizedKeyword: normalizedKey(value.keyword),
    monthlyPcQueries: toCount(value.monthlyPcQueries),
    monthlyMobileQueries: toCount(value.monthlyMobileQueries),
    monthlyTotalQueries: toCount(value.monthlyTotalQueries),
    monthlyAveragePcClicks: value.monthlyAveragePcClicks,
    monthlyAverageMobileClicks: value.monthlyAverageMobileClicks,
    monthlyAveragePcCtr: value.monthlyAveragePcCtr,
    monthlyAverageMobileCtr: value.monthlyAverageMobileCtr,
    averageAdDepth: value.averageAdDepth,
    competition: value.competition === "unknown" ? null : value.competition,
    competitionLabel: value.competitionLabel,
  };
}

function toTrendOverview(result: NaverSearchTrendResult, keyword: string): NaverTrendOverview {
  const first = result.results[0];
  return {
    title: first?.title ?? keyword,
    keywords: first?.keywords ?? [keyword],
    points: first?.data ?? [],
  };
}

function toBlogOverview(result: NaverBlogSearchResult): NaverBlogOverview {
  return {
    total: result.total,
    items: result.items.slice(0, 3).map((item) => ({
      title: item.title,
      link: item.link,
      description: item.description,
      bloggerName: item.bloggerName,
      bloggerLink: item.bloggerLink,
      postDate: item.postDate,
    })),
    resultLabel: "네이버 블로그 검색 API 응답 예시",
  };
}

function safeProviderFailure(error: unknown): {
  status: "unavailable" | "error";
  reason: string;
} {
  if (
    error instanceof NaverApiHubUnavailableError ||
    error instanceof NaverSearchAdsUnavailableError
  ) {
    return { status: "unavailable", reason: error.message };
  }
  if (error instanceof NaverSearchAdsRateLimitError) {
    return { status: "unavailable", reason: "NAVER Search Ads 요청 한도에 도달했습니다." };
  }
  if (error instanceof NaverApiHubRequestError) {
    return {
      status: error.kind === "rate_limited" ? "unavailable" : "error",
      reason: error.kind === "rate_limited"
        ? "NAVER API HUB 사용량 한도에 도달했습니다."
        : "NAVER API HUB 수집에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
  if (error instanceof NaverSearchAdsRequestError) {
    return {
      status: "error",
      reason: "NAVER Search Ads 수집에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
  if (error instanceof NaverProviderCapacityError) {
    return { status: "unavailable", reason: error.message };
  }
  return { status: "error", reason: "외부 데이터 수집에 실패했습니다. 잠시 후 다시 시도해 주세요." };
}

function failedOrStale<T>(input: {
  cached: CachedNaverSection<T> | null;
  error: unknown;
  source: string;
  measurement: NaverMeasurement;
  now: Date;
}): NaverSection<T> {
  const failure = safeProviderFailure(input.error);
  if (input.cached) {
    return liveSection({
      ...input.cached,
      cache: "stale",
      measurement: input.measurement,
      reason: `${failure.reason} 최근 30일 이내 캐시를 표시합니다.`,
    });
  }
  return failure.status === "unavailable"
    ? unavailableSection({
      source: input.source,
      measurement: input.measurement,
      reason: failure.reason,
      now: input.now,
    })
    : errorSection({
      source: input.source,
      measurement: input.measurement,
      reason: failure.reason,
      now: input.now,
    });
}

function volumeLowerBound(row: NaverKeywordStat): number {
  return row.monthlyTotalQueries?.min ?? 0;
}

export function sortNaverKeywordStats(rows: readonly NaverKeywordStat[]): NaverKeywordStat[] {
  return [...rows].sort((left, right) => {
    const volume = volumeLowerBound(right) - volumeLowerBound(left);
    return volume || left.keyword.localeCompare(right.keyword, "ko-KR");
  });
}

export function createNaverKeywordService(
  dependencies: NaverKeywordServiceDependencies,
): NaverKeywordService {
  const now = dependencies.now ?? (() => new Date());
  const searchAdsInflight = new Map<string, Promise<NaverSection<NaverKeywordStat[]>>>();
  const trendInflight = new Map<string, Promise<NaverSection<NaverTrendOverview>>>();
  const blogInflight = new Map<string, Promise<NaverSection<NaverBlogOverview>>>();

  function singleFlight<T>(
    inflight: Map<string, Promise<T>>,
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const existing = inflight.get(key);
    if (existing) return existing;
    const promise = operation().finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key);
    });
    inflight.set(key, promise);
    return promise;
  }

  async function searchAdsSection(
    seeds: readonly string[],
    options: { cacheOnly?: boolean } = {},
  ): Promise<NaverSection<NaverKeywordStat[]>> {
    const requestedAt = now();
    const requestKey = searchAdsRequestKey(seeds);
    return singleFlight(searchAdsInflight, requestKey, async () => {
      const cached = await dependencies.store.readSearchAds(requestKey, requestedAt);
      if (cached?.cache === "fresh") {
        return liveSection({ ...cached, measurement: "absolute" });
      }

      if (options.cacheOnly) {
        return cached
          ? liveSection({ ...cached, measurement: "absolute" })
          : unavailableSection({
              source: "naver-search-ads-relkwdstat",
              measurement: "absolute",
              reason: "동일 키워드 무료 재조회는 저장된 캐시만 제공합니다.",
              now: requestedAt,
            });
      }

      if (dependencies.providers.hasSearchAdsCredentials?.() === false) {
        return failedOrStale({
          cached,
          error: new NaverSearchAdsUnavailableError(),
          source: "naver-search-ads-relkwdstat",
          measurement: "absolute",
          now: requestedAt,
        });
      }

      try {
        const result = await dependencies.executor.searchAds(
          () => dependencies.providers.fetchSearchAds(seeds),
          requestedAt,
        );
        const fetchedAt = safeDate(result.capturedAt, requestedAt);
        const section: CachedNaverSection<NaverKeywordStat[]> = {
          data: result.keywords.map(toKeywordStat),
          source: result.source,
          fetchedAt,
          expiresAt: new Date(fetchedAt.getTime() + NAVER_SEARCH_ADS_TTL_MS),
          cache: "fresh",
        };
        section.data = await dependencies.store.saveSearchAds({ requestKey, section });
        return liveSection({ ...section, measurement: "absolute" });
      } catch (error) {
        return failedOrStale({
          cached,
          error,
          source: "naver-search-ads-relkwdstat",
          measurement: "absolute",
          now: requestedAt,
        });
      }
    });
  }

  async function trendSection(
    keyword: string,
    options: { cacheOnly?: boolean } = {},
  ): Promise<NaverSection<NaverTrendOverview>> {
    const requestedAt = now();
    return singleFlight(trendInflight, normalizedKey(keyword), async () => {
      const cached = await dependencies.store.readInsight<NaverTrendOverview>({
        keyword,
        kind: "search_trend",
        now: requestedAt,
      });
      if (cached?.cache === "fresh") {
        return liveSection({ ...cached, measurement: "relative" });
      }


      if (options.cacheOnly) {
        return cached
          ? liveSection({ ...cached, measurement: "relative" })
          : unavailableSection({
              source: "naver-api-hub-search-trend",
              measurement: "relative",
              reason: "동일 키워드 무료 재조회는 저장된 캐시만 제공합니다.",
              now: requestedAt,
            });
      }

      if (dependencies.providers.hasApiHubCredentials?.() === false) {
        return failedOrStale({
          cached,
          error: new NaverApiHubUnavailableError(),
          source: "naver-api-hub-search-trend",
          measurement: "relative",
          now: requestedAt,
        });
      }

      try {
        const result = await dependencies.executor.apiHub(
          () => dependencies.providers.fetchTrend(keyword),
          requestedAt,
        );
        const fetchedAt = safeDate(result.capturedAt, requestedAt);
        const section: CachedNaverSection<NaverTrendOverview> = {
          data: toTrendOverview(result, keyword),
          source: result.source,
          fetchedAt,
          expiresAt: new Date(fetchedAt.getTime() + NAVER_SEARCH_TREND_TTL_MS),
          cache: "fresh",
        };
        await dependencies.store.saveInsight({ keyword, kind: "search_trend", section });
        return liveSection({ ...section, measurement: "relative" });
      } catch (error) {
        return failedOrStale({
          cached,
          error,
          source: "naver-api-hub-search-trend",
          measurement: "relative",
          now: requestedAt,
        });
      }
    });
  }

  async function blogSection(
    keyword: string,
    options: { cacheOnly?: boolean } = {},
  ): Promise<NaverSection<NaverBlogOverview>> {
    const requestedAt = now();
    return singleFlight(blogInflight, normalizedKey(keyword), async () => {
      const cached = await dependencies.store.readInsight<NaverBlogOverview>({
        keyword,
        kind: "blog_search",
        now: requestedAt,
      });
      if (cached?.cache === "fresh") {
        return liveSection({ ...cached, measurement: "absolute" });
      }


      if (options.cacheOnly) {
        return cached
          ? liveSection({ ...cached, measurement: "absolute" })
          : unavailableSection({
              source: "naver-api-hub-blog-search",
              measurement: "absolute",
              reason: "동일 키워드 무료 재조회는 저장된 캐시만 제공합니다.",
              now: requestedAt,
            });
      }

      if (dependencies.providers.hasApiHubCredentials?.() === false) {
        return failedOrStale({
          cached,
          error: new NaverApiHubUnavailableError(),
          source: "naver-api-hub-blog-search",
          measurement: "absolute",
          now: requestedAt,
        });
      }

      try {
        const result = await dependencies.executor.apiHub(
          () => dependencies.providers.fetchBlog(keyword),
          requestedAt,
        );
        const fetchedAt = safeDate(result.capturedAt, requestedAt);
        const section: CachedNaverSection<NaverBlogOverview> = {
          data: toBlogOverview(result),
          source: result.source,
          fetchedAt,
          expiresAt: new Date(fetchedAt.getTime() + NAVER_BLOG_SEARCH_TTL_MS),
          cache: "fresh",
        };
        await dependencies.store.saveInsight({ keyword, kind: "blog_search", section });
        return liveSection({ ...section, measurement: "absolute" });
      } catch (error) {
        return failedOrStale({
          cached,
          error,
          source: "naver-api-hub-blog-search",
          measurement: "absolute",
          now: requestedAt,
        });
      }
    });
  }

  async function buildOverview(
    value: string,
    options: { cacheOnly?: boolean } = {},
  ): Promise<NaverKeywordOverviewReport> {
    const keyword = normalizeKeyword(value);
    const [rawSearchAds, trend, blog] = await Promise.all([
      searchAdsSection([keyword], options),
      trendSection(keyword, options),
      blogSection(keyword, options),
    ]);
    let searchAds: NaverSection<NaverSearchAdsOverview>;
    if (rawSearchAds.status === "live") {
      const key = normalizedKey(keyword);
      const compactKey = compactKeywordKey(keyword);
      const primary = rawSearchAds.data.find((row) => row.normalizedKeyword === key)
        ?? rawSearchAds.data.find((row) => compactKeywordKey(row.keyword) === compactKey)
        ?? null;
      searchAds = {
        ...rawSearchAds,
        data: {
          primary,
          relatedKeywords: rawSearchAds.data.filter((row) => row !== primary),
        },
      };
    } else {
      searchAds = rawSearchAds;
    }
    return {
      keyword,
      generatedAt: now().toISOString(),
      searchAds,
      trend,
      demographics: unavailableSection({
        source: "naver-api-hub-search-trend",
        measurement: "relative",
        reason: "현재 NAVER Search Trend 연동은 기기·성별·연령 필터별 추이를 제공하지만 비교 가능한 audience share 비율을 직접 제공하지 않아 인구통계 비율을 표시할 수 없습니다.",
        now: now(),
      }),
      blog,
    };
  }

  return {
    overview: (value) => buildOverview(value),
    async publicPreview(value, options) {
      const report = await buildOverview(value, options);
      if (report.searchAds.status !== "live") return report;
      return {
        ...report,
        searchAds: {
          ...report.searchAds,
          data: {
            ...report.searchAds.data,
            relatedKeywords: report.searchAds.data.relatedKeywords.slice(0, 5),
          },
        },
      };
    },
    async explore(values) {
      const seeds = normalizeKeywordSeeds(values);
      const section = await searchAdsSection(seeds);
      if (section.status !== "live") {
        return { seeds, generatedAt: now().toISOString(), total: 0, keywords: section };
      }
      const sorted = sortNaverKeywordStats(section.data);
      return {
        seeds,
        generatedAt: now().toISOString(),
        total: sorted.length,
        keywords: { ...section, data: sorted.slice(0, 1_000) },
      };
    },
    async blogEnrichment(values) {
      const keywords = normalizeBlogEnrichmentKeywords(values);
      const results = await Promise.all(
        keywords.map(async (keyword) => ({
          keyword,
          blog: await blogSection(keyword),
        })),
      );
      return {
        keywords,
        generatedAt: now().toISOString(),
        results,
      };
    },
  };
}
