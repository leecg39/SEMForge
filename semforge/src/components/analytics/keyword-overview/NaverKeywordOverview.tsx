// @TASK NAVER-OVERVIEW-MVP - NAVER 키워드 개요 전용 UI
// @SPEC 사용자 승인 계획#로그인-기능
// @TEST src/components/analytics/keyword-overview/NaverKeywordOverview.test.tsx

import Link from "next/link";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { Card } from "@/components/analytics/keyword-overview/primitives";
import type {
  NaverAdvertisingCompetition,
  NaverAdvertisingData,
  NaverBlogData,
  NaverBlogItem,
  NaverCacheStatus,
  NaverCountRange,
  NaverDemographicPoint,
  NaverDemographicsData,
  NaverKeywordOverviewReport,
  NaverKeywordVolumeData,
  NaverMeasurement,
  NaverProviderEnvelope,
  NaverProviderStatus,
  NaverRelatedKeywordItem,
  NaverRelatedKeywordsData,
  NaverTrendData,
  NaverTrendPoint,
} from "@/components/analytics/keyword-overview/types";
import { classifyIntent } from "@/lib/analytics/intent";
import { cn } from "@/lib/utils";

type DashboardLocale = "en" | "ko";
export type KeywordOverviewEngine = "serp" | "naver";

type UnknownRecord = Record<string, unknown>;

const COPY = {
  en: {
    tabsLabel: "Keyword data source",
    serpTab: "Google / Bing",
    serpDescription: "SERP and Google Trends",
    naverTab: "NAVER",
    naverDescription: "Official Korean keyword data",
    keyword: "NAVER keyword",
    placeholder: "Enter a Korean keyword",
    analyze: "Analyze with NAVER",
    analyzing: "Collecting NAVER data…",
    fixedContext: "South Korea · NAVER official APIs",
    examples: "Examples:",
    loadingInitial: "Collecting official NAVER data…",
    loadingPrevious: "Showing the previous result while checking the latest data.",
    emptyTitle: "Search a keyword with official NAVER data",
    emptyBody:
      "Search volume, Search Ads competition, relative trend, and Blog Search examples appear only when the connected source provides them.",
    retry: "Try again",
    volumeTitle: "Monthly keyword searches",
    volumeHint: "Search Ads keyword statistics · values such as <10 remain ranges",
    pcVolume: "PC searches",
    mobileVolume: "Mobile searches",
    totalVolume: "Total searches",
    advertisingTitle: "Search advertising signals",
    advertisingHint: "Search Ads metrics. Advertising competition is not organic difficulty.",
    competition: "Advertising competition",
    competitionClarifier: "A Search Ads metric, different from organic difficulty",
    avgPcClicks: "Avg. PC ad clicks",
    avgMobileClicks: "Avg. mobile ad clicks",
    avgPcCtr: "Avg. PC CTR",
    avgMobileCtr: "Avg. mobile CTR",
    pcAdDepth: "PC ad depth",
    trendTitle: "12-month relative search interest",
    trendHint: "A relative index within the selected period, not absolute search volume",
    demographicsTitle: "Relative audience distribution",
    demographicsHint: "Relative Search Trend segments when available",
    device: "Device",
    gender: "Gender",
    age: "Age",
    blogTitle: "NAVER Blog Search API response examples",
    blogHint: "The displayed order does not represent a position in NAVER unified search.",
    blogTotal: "Blog Search API results",
    relatedTitle: "Related keywords",
    relatedHint: "Related Search Ads keywords returned by the official source",
    relatedKeyword: "Keyword",
    relatedVolume: "Monthly searches",
    relatedCompetition: "Ad competition",
    unavailable: "Unavailable",
    empty: "No data was returned by the connected source.",
    source: "Source",
    fetchedAt: "Fetched",
    noFetchedAt: "No fetch time",
    live: "Live data",
    providerError: "Provider error",
    fresh: "Fresh cache",
    stale: "Stale cache",
    absolute: "Absolute",
    relative: "Relative index",
    calculated: "Calculated",
    inferred: "Inferred",
    low: "Low",
    medium: "Medium",
    high: "High",
    unknown: "Unavailable",
    period: "Period",
    actionsEyebrow: "Review handoff",
    actionsTitle: "Continue with this NAVER insight",
    actionsHint:
      "Prefill an editable draft with the available official data. This does not publish content or create an advertising campaign.",
    draftOnly: "Editable draft",
    contentBrief: "NAVER content brief",
    contentBriefDescription:
      "Prefill a review brief with the keyword, inferred intent, relative trend, and Blog Search API response titles. Titles are examples, not rankings.",
    advertisingDraft: "Advertising keyword draft",
    advertisingDraftDescription:
      "Prefill advertising research with available Search Ads volume, clicks, CTR, and advertising competition.",
  },
  ko: {
    tabsLabel: "키워드 데이터 소스",
    serpTab: "Google / Bing",
    serpDescription: "SERP 및 Google Trends",
    naverTab: "NAVER",
    naverDescription: "국내 공식 키워드 데이터",
    keyword: "NAVER 키워드",
    placeholder: "한국어 키워드를 입력하세요",
    analyze: "NAVER 분석",
    analyzing: "NAVER 데이터 수집 중…",
    fixedContext: "대한민국 · NAVER 공식 API",
    examples: "예시 키워드:",
    loadingInitial: "NAVER 공식 데이터를 수집하고 있습니다…",
    loadingPrevious: "최신 데이터를 확인하는 동안 이전 결과를 표시합니다.",
    emptyTitle: "NAVER 공식 데이터로 키워드를 분석하세요",
    emptyBody:
      "검색량, Search Ads 광고 경쟁도, 상대 추이와 블로그 검색 예시는 연결된 공식 소스가 제공할 때만 표시합니다.",
    retry: "다시 시도",
    volumeTitle: "월간 키워드 검색량",
    volumeHint: "Search Ads 키워드 통계 · <10 같은 범위값을 그대로 보존합니다",
    pcVolume: "PC 검색량",
    mobileVolume: "모바일 검색량",
    totalVolume: "합계 검색량",
    advertisingTitle: "검색광고 지표",
    advertisingHint: "Search Ads 지표이며 광고 경쟁도는 자연검색 난이도가 아닙니다.",
    competition: "광고 경쟁도",
    competitionClarifier: "자연검색 난이도와 다른 Search Ads 지표",
    avgPcClicks: "평균 PC 광고 클릭",
    avgMobileClicks: "평균 모바일 광고 클릭",
    avgPcCtr: "평균 PC CTR",
    avgMobileCtr: "평균 모바일 CTR",
    pcAdDepth: "PC 광고 노출 깊이",
    trendTitle: "12개월 상대 검색 관심도",
    trendHint: "선택 기간 안의 상대 지수이며 절대 검색량이 아닙니다",
    demographicsTitle: "상대 이용자 분포",
    demographicsHint: "Search Trend가 제공하는 상대 분포만 표시합니다",
    device: "기기",
    gender: "성별",
    age: "연령",
    blogTitle: "네이버 블로그 검색 API 응답 예시",
    blogHint: "표시 순서는 네이버 통합검색의 노출 위치를 의미하지 않습니다.",
    blogTotal: "블로그 검색 API 결과 수",
    relatedTitle: "연관 키워드",
    relatedHint: "공식 Search Ads 소스가 반환한 연관 키워드입니다",
    relatedKeyword: "키워드",
    relatedVolume: "월간 검색량",
    relatedCompetition: "광고 경쟁도",
    unavailable: "사용 불가",
    empty: "연결된 소스가 데이터를 반환하지 않았습니다.",
    source: "출처",
    fetchedAt: "수집",
    noFetchedAt: "수집 시각 없음",
    live: "실수집",
    providerError: "공급자 오류",
    fresh: "최신 캐시",
    stale: "오래된 캐시",
    absolute: "절대값",
    relative: "상대 지수",
    calculated: "계산값",
    inferred: "추론값",
    low: "낮음",
    medium: "중간",
    high: "높음",
    unknown: "사용 불가",
    period: "기준",
    actionsEyebrow: "검토형 handoff",
    actionsTitle: "이 NAVER 인사이트로 다음 작업 이어가기",
    actionsHint:
      "사용 가능한 공식 데이터를 편집 가능한 검토용 초안에 미리 채웁니다. 자동으로 게시하거나 캠페인을 생성하지 않습니다.",
    draftOnly: "편집 가능한 초안",
    contentBrief: "네이버 콘텐츠 브리프",
    contentBriefDescription:
      "키워드·추론 의도·상대 추이·블로그 검색 API 응답 제목을 검토용 브리프에 미리 채웁니다. 응답 제목은 순위가 아닙니다.",
    advertisingDraft: "광고 키워드 초안",
    advertisingDraftDescription:
      "사용 가능한 Search Ads 검색량·평균 클릭·CTR·광고 경쟁도를 광고 리서치 초안에 미리 채웁니다.",
  },
} as const;

const NAVER_EXAMPLES = ["커피 머신", "노트북 추천", "서울 맛집", "마케팅 자동화"];
const NAVER_HANDOFF_MAX_URL_LENGTH = 4_096;
const NAVER_HANDOFF_MAX_TEXT_LENGTH = 120;
const OFFICIAL_NAVER_SOURCES = new Set([
  "naver-search-ads",
  "naver-api-hub",
  "naver-api-hub-search-trend",
  "naver-api-hub-blog-search",
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function stripMarkup(value: unknown): string | null {
  const text = optionalString(value);
  return text ? text.replace(/<[^>]*>/g, "").trim() : null;
}

function safeExternalUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function parseCountRange(value: unknown): NaverCountRange | null {
  const exact = finiteNumber(value);
  if (exact !== null && exact >= 0) {
    return { min: exact, maxExclusive: null, display: Math.trunc(exact).toLocaleString("en-US") };
  }

  if (typeof value === "string") {
    const compact = value.replaceAll(",", "").trim();
    const lessThan = compact.match(/^<\s*(\d+)$/);
    if (lessThan) {
      const threshold = Number(lessThan[1]);
      return { min: 0, maxExclusive: threshold, display: `<${threshold}` };
    }
  }

  if (!isRecord(value)) return null;

  if (value.relation === "lt") {
    const threshold = finiteNumber(value.threshold);
    if (threshold !== null && threshold > 0) {
      return { min: 0, maxExclusive: threshold, display: `<${Math.trunc(threshold)}` };
    }
  }
  if (value.relation === "exact") {
    const relationValue = finiteNumber(value.value);
    if (relationValue !== null && relationValue >= 0) {
      return {
        min: relationValue,
        maxExclusive: null,
        display: Math.trunc(relationValue).toLocaleString("en-US"),
      };
    }
  }

  const min = finiteNumber(value.min);
  const maxExclusive = value.maxExclusive === null ? null : finiteNumber(value.maxExclusive);
  if (min === null || min < 0 || (maxExclusive !== null && maxExclusive <= min)) return null;

  const display = optionalString(value.display);
  if (display) return { min, maxExclusive, display };
  if (maxExclusive === null) {
    return { min, maxExclusive, display: Math.trunc(min).toLocaleString("en-US") };
  }
  if (min === 0) return { min, maxExclusive, display: `<${Math.trunc(maxExclusive)}` };
  return {
    min,
    maxExclusive,
    display: `${Math.trunc(min).toLocaleString("en-US")}–${Math.trunc(maxExclusive - 1).toLocaleString("en-US")}`,
  };
}

function parseVolumeData(value: unknown): NaverKeywordVolumeData | null {
  if (!isRecord(value)) return null;
  const pc = parseCountRange(value.pc);
  const mobile = parseCountRange(value.mobile);
  const total = parseCountRange(value.total);
  if (!pc && !mobile && !total) return null;
  return {
    pc,
    mobile,
    total,
    period: optionalString(value.period) ?? "최근 30일",
  };
}

function parseCompetition(value: unknown): NaverAdvertisingCompetition {
  if (typeof value !== "string") return "unknown";
  const normalized = value.toLowerCase();
  if (normalized === "low" || normalized === "낮음") return "low";
  if (normalized === "medium" || normalized === "mid" || normalized === "중간") return "medium";
  if (normalized === "high" || normalized === "높음") return "high";
  return "unknown";
}

function parseAdvertisingData(value: unknown): NaverAdvertisingData | null {
  if (!isRecord(value)) return null;
  const result: NaverAdvertisingData = {
    competition: parseCompetition(value.competition),
    averagePcClicks: finiteNumber(value.averagePcClicks ?? value.avgPcClicks),
    averageMobileClicks: finiteNumber(value.averageMobileClicks ?? value.avgMobileClicks),
    averagePcCtr: finiteNumber(value.averagePcCtr ?? value.avgPcCtr),
    averageMobileCtr: finiteNumber(value.averageMobileCtr ?? value.avgMobileCtr),
    pcAdDepth: finiteNumber(value.pcAdDepth),
  };
  return Object.values(result).some((item) => item !== null && item !== "unknown") ? result : null;
}

interface ParsedSearchAdsStat {
  keyword: string;
  volume: NaverKeywordVolumeData;
  advertising: NaverAdvertisingData;
  related: NaverRelatedKeywordItem;
}

interface ParsedSearchAdsData {
  primary: ParsedSearchAdsStat | null;
  relatedKeywords: ParsedSearchAdsStat[];
}

function parseSearchAdsStat(value: unknown): ParsedSearchAdsStat | null {
  if (!isRecord(value)) return null;
  const keyword = optionalString(value.keyword ?? value.relKeyword);
  if (!keyword) return null;
  const pc = parseCountRange(value.monthlyPcQueries ?? value.monthlyPcQcCnt ?? value.pc);
  const mobile = parseCountRange(value.monthlyMobileQueries ?? value.monthlyMobileQcCnt ?? value.mobile);
  const total = parseCountRange(value.monthlyTotalQueries ?? value.total);
  const competition = parseCompetition(value.competition ?? value.competitionLabel ?? value.compIdx);
  return {
    keyword,
    volume: {
      pc,
      mobile,
      total,
      period: optionalString(value.period) ?? "최근 30일",
    },
    advertising: {
      competition,
      averagePcClicks: finiteNumber(
        value.monthlyAveragePcClicks ?? value.averagePcClicks ?? value.avgPcClicks,
      ),
      averageMobileClicks: finiteNumber(
        value.monthlyAverageMobileClicks ?? value.averageMobileClicks ?? value.avgMobileClicks,
      ),
      averagePcCtr: finiteNumber(
        value.monthlyAveragePcCtr ?? value.averagePcCtr ?? value.avgPcCtr,
      ),
      averageMobileCtr: finiteNumber(
        value.monthlyAverageMobileCtr ?? value.averageMobileCtr ?? value.avgMobileCtr,
      ),
      pcAdDepth: finiteNumber(value.averageAdDepth ?? value.pcAdDepth ?? value.adDepth),
    },
    related: { keyword, pc, mobile, total, competition },
  };
}

function parseSearchAdsData(value: unknown): ParsedSearchAdsData | null {
  if (!isRecord(value)) return null;
  const primary = parseSearchAdsStat(value.primary);
  const relatedKeywords = Array.isArray(value.relatedKeywords)
    ? value.relatedKeywords.flatMap<ParsedSearchAdsStat>((item) => {
        const parsed = parseSearchAdsStat(item);
        return parsed ? [parsed] : [];
      })
    : [];
  return primary || relatedKeywords.length ? { primary, relatedKeywords } : null;
}

function parseTrendData(value: unknown): NaverTrendData | null {
  if (!isRecord(value) || !Array.isArray(value.points)) return null;
  const points = value.points.flatMap<NaverTrendPoint>((item) => {
    if (!isRecord(item)) return [];
    const period = optionalString(item.period ?? item.periodStart ?? item.label);
    const ratio = finiteNumber(item.ratio ?? item.value);
    return period && ratio !== null ? [{ period, ratio }] : [];
  });
  return points.length ? { points, unit: "relative-index" } : null;
}

function parseDemographicPoints(value: unknown): NaverDemographicPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap<NaverDemographicPoint>((item, index) => {
    if (!isRecord(item)) return [];
    const key = optionalString(item.key ?? item.segment ?? item.name) ?? `segment-${index + 1}`;
    const label = optionalString(item.label ?? item.name ?? item.segment) ?? key;
    const ratio = finiteNumber(item.ratio ?? item.value);
    return ratio === null ? [] : [{ key, label, ratio }];
  });
}

function parseDemographicsData(value: unknown): NaverDemographicsData | null {
  if (!isRecord(value)) return null;
  const result = {
    device: parseDemographicPoints(value.device ?? value.devices),
    gender: parseDemographicPoints(value.gender ?? value.genders),
    age: parseDemographicPoints(value.age ?? value.ages),
  };
  return result.device.length || result.gender.length || result.age.length ? result : null;
}

function parseBlogData(value: unknown): NaverBlogData | null {
  if (!isRecord(value)) return null;
  const items = Array.isArray(value.items)
    ? value.items.flatMap<NaverBlogItem>((item) => {
        if (!isRecord(item)) return [];
        const title = stripMarkup(item.title);
        const link = optionalString(item.link);
        if (!title || !link) return [];
        return [
          {
            title,
            link,
            bloggerName: stripMarkup(item.bloggerName ?? item.bloggername),
            postDate: optionalString(item.postDate ?? item.postdate),
          },
        ];
      })
    : [];
  const total = finiteNumber(value.total);
  return total !== null || items.length ? { total, items } : null;
}

function parseRelatedItem(value: unknown): NaverRelatedKeywordItem | null {
  if (!isRecord(value)) return null;
  const keyword = optionalString(value.keyword ?? value.relKeyword);
  if (!keyword) return null;
  return {
    keyword,
    pc: parseCountRange(value.pc ?? value.monthlyPcQueries ?? value.monthlyPcQcCnt),
    mobile: parseCountRange(value.mobile ?? value.monthlyMobileQueries ?? value.monthlyMobileQcCnt),
    total: parseCountRange(value.total ?? value.monthlyTotalQueries),
    competition: parseCompetition(value.competition ?? value.competitionLabel ?? value.compIdx),
  };
}

function parseRelatedData(value: unknown): NaverRelatedKeywordsData | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const items = value.items.flatMap<NaverRelatedKeywordItem>((item) => {
    const parsed = parseRelatedItem(item);
    return parsed ? [parsed] : [];
  });
  return items.length ? { items } : null;
}

function providerStatus(value: unknown, hasData: boolean): NaverProviderStatus {
  return value === "live" || value === "unavailable" || value === "error"
    ? value
    : hasData
      ? "live"
      : "unavailable";
}

function cacheStatus(value: unknown): NaverCacheStatus {
  return value === "stale" ? "stale" : "fresh";
}

function measurement(value: unknown, fallback: NaverMeasurement): NaverMeasurement {
  return value === "absolute" ||
    value === "relative" ||
    value === "calculated" ||
    value === "inferred"
    ? value
    : fallback;
}

function parseEnvelope<T>(
  value: unknown,
  dataParser: (candidate: unknown) => T | null,
  defaults: { source: string; measurement: NaverMeasurement },
): NaverProviderEnvelope<T> {
  const raw = isRecord(value) ? value : {};
  const candidate = Object.hasOwn(raw, "data") ? raw.data : value;
  const data = dataParser(candidate);
  const status = providerStatus(raw.status, data !== null);
  return {
    status,
    cache: cacheStatus(raw.cache),
    measurement: measurement(raw.measurement, defaults.measurement),
    source: optionalString(raw.source) ?? defaults.source,
    fetchedAt: optionalString(raw.fetchedAt),
    expiresAt: optionalString(raw.expiresAt),
    reason:
      optionalString(raw.reason) ??
      (status === "unavailable" && data === null ? "연결된 소스가 데이터를 반환하지 않았습니다." : null),
    data,
  };
}

function mapEnvelope<T, U>(
  envelope: NaverProviderEnvelope<T>,
  transform: (data: T) => U | null,
  emptyReason: string,
): NaverProviderEnvelope<U> {
  const data = envelope.data ? transform(envelope.data) : null;
  return {
    ...envelope,
    status: envelope.status === "live" && data === null ? "unavailable" : envelope.status,
    reason: data === null ? envelope.reason ?? emptyReason : envelope.reason,
    data,
  };
}

/** API 성공 wrapper와 직접 리포트 양쪽을 수용하되 필수 식별자는 엄격하게 검사한다. */
export function parseNaverKeywordOverviewReport(payload: unknown): NaverKeywordOverviewReport | null {
  const outer = isRecord(payload) ? payload : null;
  if (!outer) return null;
  const candidate = isRecord(outer.data) ? outer.data : outer;
  const keyword = optionalString(candidate.keyword);
  if (!keyword) return null;
  const normalizedKeyword = optionalString(candidate.normalizedKeyword) ?? normalizeNaverKeyword(keyword);
  const searchAds = Object.hasOwn(candidate, "searchAds")
    ? parseEnvelope(candidate.searchAds, parseSearchAdsData, {
        source: "naver-search-ads",
        measurement: "absolute",
      })
    : null;
  const volume = searchAds
    ? mapEnvelope(searchAds, (data) => data.primary?.volume ?? null, "기준 키워드 검색량이 제공되지 않았습니다.")
    : parseEnvelope(candidate.volume, parseVolumeData, {
        source: "naver-search-ads",
        measurement: "absolute",
      });
  const advertising = searchAds
    ? mapEnvelope(searchAds, (data) => data.primary?.advertising ?? null, "기준 키워드 광고 지표가 제공되지 않았습니다.")
    : parseEnvelope(candidate.advertising, parseAdvertisingData, {
        source: "naver-search-ads",
        measurement: "absolute",
      });
  const related = searchAds
    ? mapEnvelope(
        searchAds,
        (data) => ({ items: data.relatedKeywords.map((item) => item.related) }),
        "연관 키워드가 제공되지 않았습니다.",
      )
    : parseEnvelope(candidate.related, parseRelatedData, {
        source: "naver-search-ads",
        measurement: "absolute",
      });
  const demographics = Object.hasOwn(candidate, "demographics")
    ? parseEnvelope(candidate.demographics, parseDemographicsData, {
        source: "naver-api-hub-search-trend",
        measurement: "relative",
      })
    : undefined;

  return {
    keyword,
    normalizedKeyword,
    locale: "ko-KR",
    generatedAt: optionalString(candidate.generatedAt),
    volume,
    advertising,
    trend: parseEnvelope(candidate.trend, parseTrendData, {
      source: "naver-api-hub-search-trend",
      measurement: "relative",
    }),
    ...(demographics ? { demographics } : {}),
    blog: parseEnvelope(candidate.blog, parseBlogData, {
      source: "naver-api-hub-blog-search",
      measurement: "absolute",
    }),
    related,
  };
}

export function normalizeNaverKeyword(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function normalizeHandoffText(value: string, maxLength: number): string {
  const normalized = value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ");
  return Array.from(normalized).slice(0, maxLength).join("");
}

function isOfficialLive<T>(envelope: NaverProviderEnvelope<T>): envelope is NaverProviderEnvelope<T> & { data: T } {
  return envelope.status === "live" && envelope.data !== null && OFFICIAL_NAVER_SOURCES.has(envelope.source);
}

function validFetchedAt(value: string | null): string | null {
  if (!value || value.length > 64) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function latestFetchedAt(envelopes: readonly NaverProviderEnvelope<unknown>[]): string | null {
  const timestamps = envelopes
    .flatMap((envelope) => {
      if (!isOfficialLive(envelope)) return [];
      const fetchedAt = validFetchedAt(envelope.fetchedAt);
      return fetchedAt ? [fetchedAt] : [];
    })
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  return timestamps[0] ?? null;
}

function handoffHref(pathname: string, params: URLSearchParams): string {
  return `${pathname}?${params.toString()}`;
}

/** Optional URL context is truncated or omitted before the handoff exceeds a conservative 4 KiB limit. */
function appendWithinHandoffBudget(
  pathname: string,
  params: URLSearchParams,
  name: string,
  rawValue: string,
  maxCharacters = NAVER_HANDOFF_MAX_TEXT_LENGTH,
): void {
  const characters = Array.from(normalizeHandoffText(rawValue, maxCharacters));
  if (!characters.length) return;

  let low = 1;
  let high = characters.length;
  let accepted = "";
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidateValue = characters.slice(0, middle).join("");
    const candidate = new URLSearchParams(params);
    candidate.append(name, candidateValue);
    if (handoffHref(pathname, candidate).length <= NAVER_HANDOFF_MAX_URL_LENGTH) {
      accepted = candidateValue;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (accepted) params.append(name, accepted);
}

function appendOfficialContext(
  pathname: string,
  params: URLSearchParams,
  envelopes: readonly NaverProviderEnvelope<unknown>[],
  preferredMeasurement: NaverMeasurement | null,
): void {
  const sources = new Set<string>();
  for (const envelope of envelopes) {
    if (!isOfficialLive(envelope) || sources.has(envelope.source)) continue;
    sources.add(envelope.source);
    appendWithinHandoffBudget(pathname, params, "naverSource", envelope.source, 80);
  }
  const fetchedAt = latestFetchedAt(envelopes);
  if (fetchedAt) appendWithinHandoffBudget(pathname, params, "naverFetchedAt", fetchedAt, 40);
  if (sources.size > 0 && preferredMeasurement) {
    params.set("measurement", preferredMeasurement);
  }
}

function summarizeRelativeTrend(data: NaverTrendData): string | null {
  const points = data.points.slice(-6).flatMap((point) => {
    if (!Number.isFinite(point.ratio)) return [];
    const period = normalizeHandoffText(point.period, 10);
    if (!period) return [];
    const ratio = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(point.ratio);
    return [`${period} ${ratio}`];
  });
  return points.length ? `최근 상대 지수: ${points.join(" → ")}` : null;
}

function metricHandoffValue(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(value);
}

function appendMetric(params: URLSearchParams, name: string, value: string | null): void {
  if (value) params.set(name, value);
}

export interface NaverOverviewHandoffLinks {
  content: string;
  advertising: string;
}

/**
 * 공식 provider envelope만 다음 화면에 전달한다. URL에는 원시 응답이나 자격 증명을 넣지 않으며,
 * Blog Search 제목은 응답 예시 문맥으로만 전달한다.
 */
export function buildNaverOverviewHandoffLinks(
  report: NaverKeywordOverviewReport,
): NaverOverviewHandoffLinks {
  const keyword = normalizeHandoffText(report.normalizedKeyword || report.keyword, 80);
  const inferredIntent = classifyIntent({ keyword }).intent;

  const contentPath = "/content/";
  const contentParams = new URLSearchParams({
    intent: "brief",
    keyword,
    source: "naver-keyword-overview",
    naverIntent: inferredIntent,
  });
  const contentEnvelopes: NaverProviderEnvelope<unknown>[] = [
    report.volume,
    report.advertising,
    report.trend,
    report.blog,
  ];
  const contentMeasurement = isOfficialLive(report.trend)
    ? report.trend.measurement
    : isOfficialLive(report.blog)
      ? report.blog.measurement
      : isOfficialLive(report.volume)
        ? report.volume.measurement
        : isOfficialLive(report.advertising)
          ? report.advertising.measurement
          : null;
  appendOfficialContext(contentPath, contentParams, contentEnvelopes, contentMeasurement);

  if (isOfficialLive(report.trend)) {
    const trend = summarizeRelativeTrend(report.trend.data);
    if (trend) appendWithinHandoffBudget(contentPath, contentParams, "naverTrend", trend, 320);
  }
  if (isOfficialLive(report.blog)) {
    for (const item of report.blog.data.items.slice(0, 3)) {
      appendWithinHandoffBudget(contentPath, contentParams, "naverBlogTitle", item.title, 120);
    }
  }

  const advertisingPath = "/analytics/adwords/positions/";
  const advertisingParams = new URLSearchParams({
    keyword,
    // The advertising receiver historically accepts a comma-separated `keywords` value.
    keywords: keyword,
    source: "naver-keyword-overview",
    naverIntent: inferredIntent,
  });
  const advertisingEnvelopes: NaverProviderEnvelope<unknown>[] = [
    report.volume,
    report.advertising,
  ];
  const advertisingMeasurement = isOfficialLive(report.volume)
    ? report.volume.measurement
    : isOfficialLive(report.advertising)
      ? report.advertising.measurement
      : null;
  appendOfficialContext(
    advertisingPath,
    advertisingParams,
    advertisingEnvelopes,
    advertisingMeasurement,
  );

  if (isOfficialLive(report.volume)) {
    appendMetric(advertisingParams, "naverMonthlyPcQueries", report.volume.data.pc?.display ?? null);
    appendMetric(advertisingParams, "naverMonthlyMobileQueries", report.volume.data.mobile?.display ?? null);
    appendMetric(advertisingParams, "naverMonthlyTotalQueries", report.volume.data.total?.display ?? null);
  }
  if (isOfficialLive(report.advertising)) {
    appendMetric(
      advertisingParams,
      "naverAveragePcClicks",
      metricHandoffValue(report.advertising.data.averagePcClicks),
    );
    appendMetric(
      advertisingParams,
      "naverAverageMobileClicks",
      metricHandoffValue(report.advertising.data.averageMobileClicks),
    );
    appendMetric(
      advertisingParams,
      "naverAveragePcCtr",
      metricHandoffValue(report.advertising.data.averagePcCtr),
    );
    appendMetric(
      advertisingParams,
      "naverAverageMobileCtr",
      metricHandoffValue(report.advertising.data.averageMobileCtr),
    );
    if (report.advertising.data.competition !== "unknown") {
      advertisingParams.set("naverAdCompetition", report.advertising.data.competition);
    }
  }

  return {
    content: handoffHref(contentPath, contentParams),
    advertising: handoffHref(advertisingPath, advertisingParams),
  };
}

export function formatNaverCount(value: NaverCountRange | null, locale: DashboardLocale): string {
  if (!value) return COPY[locale].unavailable;
  if (value.display.trim()) return value.display;
  if (value.maxExclusive === null) return Math.trunc(value.min).toLocaleString(locale === "ko" ? "ko-KR" : "en-US");
  if (value.min === 0) return `<${Math.trunc(value.maxExclusive).toLocaleString("en-US")}`;
  return `${Math.trunc(value.min).toLocaleString("en-US")}–${Math.trunc(value.maxExclusive - 1).toLocaleString("en-US")}`;
}

function formatMetric(value: number | null, locale: DashboardLocale, suffix = ""): string {
  if (value === null) return COPY[locale].unavailable;
  return `${new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
    maximumFractionDigits: 2,
  }).format(value)}${suffix}`;
}

function formatTimestamp(value: string | null, locale: DashboardLocale): string {
  if (!value) return COPY[locale].noFetchedAt;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatPostDate(value: string | null, locale: DashboardLocale): string | null {
  if (!value) return null;
  const matched = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!matched) return value;
  const date = new Date(`${matched[1]}-${matched[2]}-${matched[3]}T00:00:00Z`);
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

function statusLabel(status: NaverProviderStatus, locale: DashboardLocale): string {
  if (status === "live") return COPY[locale].live;
  if (status === "error") return COPY[locale].providerError;
  return COPY[locale].unavailable;
}

function measurementLabel(value: NaverMeasurement, locale: DashboardLocale): string {
  return COPY[locale][value];
}

function competitionLabel(value: NaverAdvertisingCompetition, locale: DashboardLocale): string {
  return COPY[locale][value];
}

function EnvelopeMeta<T>({ envelope, locale }: { envelope: NaverProviderEnvelope<T>; locale: DashboardLocale }) {
  const copy = COPY[locale];
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-app-border pt-3 text-[10px] leading-4 text-a2-text-muted">
      <span
        className={cn(
          "rounded-full px-2 py-0.5 font-semibold",
          envelope.status === "live" && "bg-[#e6f5f0] text-[#0a6b57]",
          envelope.status === "unavailable" && "bg-[#f1f2f4] text-[#5b6472]",
          envelope.status === "error" && "bg-[#fff0f3] text-[#a80028]",
        )}
      >
        {statusLabel(envelope.status, locale)}
      </span>
      <span>{envelope.cache === "stale" ? copy.stale : copy.fresh}</span>
      <span>{measurementLabel(envelope.measurement, locale)}</span>
      <span>
        {copy.source}: {envelope.source}
      </span>
      <time dateTime={envelope.fetchedAt ?? undefined}>
        {copy.fetchedAt}: {formatTimestamp(envelope.fetchedAt, locale)}
      </time>
    </div>
  );
}

function SectionBody<T>({
  envelope,
  locale,
  children,
}: {
  envelope: NaverProviderEnvelope<T>;
  locale: DashboardLocale;
  children: (data: T) => ReactNode;
}) {
  const copy = COPY[locale];
  return (
    <>
      {envelope.status !== "live" && (
        <div
          role={envelope.status === "error" ? "alert" : "status"}
          className={cn(
            "mb-3 rounded-[7px] border px-3 py-2 text-[12px] leading-[18px]",
            envelope.status === "error"
              ? "border-[#ffc8d4] bg-[#fff4f6] text-[#8f1838]"
              : "border-app-border bg-app-bg text-a2-text-muted",
          )}
        >
          <span className="font-semibold">{statusLabel(envelope.status, locale)}</span>
          {envelope.reason ? ` · ${envelope.reason}` : null}
        </div>
      )}
      {envelope.data ? (
        children(envelope.data)
      ) : (
        <div className="rounded-[7px] border border-dashed border-app-border bg-app-bg px-4 py-7 text-center text-[12px] text-a2-text-muted">
          {envelope.reason ?? copy.empty}
        </div>
      )}
      <EnvelopeMeta envelope={envelope} locale={locale} />
    </>
  );
}

function MetricTile({ label, value, supporting }: { label: string; value: string; supporting?: string }) {
  return (
    <div className="min-w-0 rounded-[8px] border border-app-border bg-app-bg p-3.5">
      <p className="text-[11px] font-medium text-a2-text-muted">{label}</p>
      <p className="mt-1.5 truncate text-[22px] font-semibold leading-7 tracking-[-0.35px] text-a2-text" title={value}>
        {value}
      </p>
      {supporting && <p className="mt-1 text-[10px] text-a2-text-faint">{supporting}</p>}
    </div>
  );
}

function AdvertisingGrid({ data, locale }: { data: NaverAdvertisingData; locale: DashboardLocale }) {
  const copy = COPY[locale];
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      <MetricTile
        label={copy.competition}
        value={competitionLabel(data.competition, locale)}
        supporting={copy.competitionClarifier}
      />
      <MetricTile label={copy.avgPcClicks} value={formatMetric(data.averagePcClicks, locale)} />
      <MetricTile label={copy.avgMobileClicks} value={formatMetric(data.averageMobileClicks, locale)} />
      <MetricTile label={copy.avgPcCtr} value={formatMetric(data.averagePcCtr, locale, "%")} />
      <MetricTile label={copy.avgMobileCtr} value={formatMetric(data.averageMobileCtr, locale, "%")} />
      <MetricTile label={copy.pcAdDepth} value={formatMetric(data.pcAdDepth, locale)} />
    </div>
  );
}

function TrendBars({ data, locale }: { data: NaverTrendData; locale: DashboardLocale }) {
  const copy = COPY[locale];
  const points = data.points.slice(-12);
  const max = Math.max(1, ...points.map((point) => point.ratio));
  return (
    <figure aria-label={copy.trendTitle}>
      <div className="overflow-x-auto pb-1">
        <ol className="flex min-w-[520px] items-end gap-2" aria-label={copy.trendTitle}>
          {points.map((point) => {
            const height = Math.max(3, Math.min(100, (point.ratio / max) * 100));
            return (
              <li key={point.period} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="text-[9px] font-medium text-a2-text-muted">{formatMetric(point.ratio, locale)}</span>
                <div className="flex h-28 w-full items-end rounded-[4px] bg-[#eef3f7]" aria-hidden="true">
                  <div
                    className="w-full rounded-[4px] bg-[#03a66d] transition-[height] duration-300"
                    style={{ height: `${height}%` }}
                  />
                </div>
                <time className="max-w-full truncate text-[9px] text-a2-text-faint" dateTime={point.period} title={point.period}>
                  {point.period.slice(0, 7)}
                </time>
              </li>
            );
          })}
        </ol>
      </div>
      <figcaption className="mt-2 text-[10px] text-a2-text-muted">{copy.trendHint}</figcaption>
    </figure>
  );
}

function DemographicGroup({
  title,
  points,
  locale,
}: {
  title: string;
  points: NaverDemographicPoint[];
  locale: DashboardLocale;
}) {
  if (!points.length) return null;
  const max = Math.max(1, ...points.map((point) => point.ratio));
  return (
    <section aria-label={title} className="rounded-[8px] border border-app-border bg-app-bg p-3">
      <h3 className="text-[11px] font-semibold text-a2-text">{title}</h3>
      <ul className="mt-3 space-y-2.5">
        {points.map((point) => (
          <li key={point.key}>
            <div className="mb-1 flex items-center justify-between gap-3 text-[10px]">
              <span className="truncate text-a2-text-muted">{point.label}</span>
              <span className="font-semibold text-a2-text">{formatMetric(point.ratio, locale)}</span>
            </div>
            <div
              role="progressbar"
              aria-label={`${title} ${point.label}`}
              aria-valuemin={0}
              aria-valuemax={max}
              aria-valuenow={point.ratio}
              className="h-1.5 overflow-hidden rounded-full bg-[#e8edf1]"
            >
              <div
                className="h-full rounded-full bg-[#0872bf]"
                style={{ width: `${Math.max(0, Math.min(100, (point.ratio / max) * 100))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DemographicsGrid({ data, locale }: { data: NaverDemographicsData; locale: DashboardLocale }) {
  const copy = COPY[locale];
  return (
    <div className="grid gap-2.5 md:grid-cols-3">
      <DemographicGroup title={copy.device} points={data.device} locale={locale} />
      <DemographicGroup title={copy.gender} points={data.gender} locale={locale} />
      <DemographicGroup title={copy.age} points={data.age} locale={locale} />
    </div>
  );
}

function BlogResults({ data, locale }: { data: NaverBlogData; locale: DashboardLocale }) {
  const copy = COPY[locale];
  return (
    <div>
      <div className="flex items-end justify-between gap-3 rounded-[8px] border border-app-border bg-app-bg p-3.5">
        <p className="text-[11px] text-a2-text-muted">{copy.blogTotal}</p>
        <p className="text-[20px] font-semibold text-a2-text">{formatMetric(data.total, locale)}</p>
      </div>
      {data.items.length > 0 && (
        <ol className="mt-3 divide-y divide-app-border rounded-[8px] border border-app-border">
          {data.items.map((item, index) => {
            const href = safeExternalUrl(item.link);
            const date = formatPostDate(item.postDate, locale);
            return (
              <li key={`${item.link}-${index}`} className="p-3">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[12px] font-semibold leading-[18px] text-[#0872bf] underline-offset-2 hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue"
                  >
                    {item.title}
                  </a>
                ) : (
                  <p className="text-[12px] font-semibold leading-[18px] text-a2-text">{item.title}</p>
                )}
                {(item.bloggerName || date) && (
                  <p className="mt-1 text-[10px] text-a2-text-muted">
                    {[item.bloggerName, date].filter(Boolean).join(" · ")}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function RelatedKeywordTable({ data, locale }: { data: NaverRelatedKeywordsData; locale: DashboardLocale }) {
  const copy = COPY[locale];
  return (
    <div className="overflow-x-auto rounded-[8px] border border-app-border">
      <table className="w-full min-w-[520px] border-collapse text-left text-[11px]">
        <thead className="bg-app-bg text-a2-text-muted">
          <tr>
            <th scope="col" className="px-3 py-2.5 font-semibold">{copy.relatedKeyword}</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">{copy.relatedVolume}</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">{copy.relatedCompetition}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-app-border bg-a2-card">
          {data.items.map((item) => (
            <tr key={item.keyword}>
              <th scope="row" className="px-3 py-3 font-medium text-a2-text">{item.keyword}</th>
              <td className="px-3 py-3 text-right tabular-nums text-a2-text">{formatNaverCount(item.total, locale)}</td>
              <td className="px-3 py-3 text-right text-a2-text-muted">{competitionLabel(item.competition, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KeywordEngineTabs({
  activeEngine,
  locale,
  onChange,
}: {
  activeEngine: KeywordOverviewEngine;
  locale: DashboardLocale;
  onChange: (engine: KeywordOverviewEngine) => void;
}) {
  const copy = COPY[locale];
  const tabs = [
    { id: "serp" as const, title: copy.serpTab, description: copy.serpDescription },
    { id: "naver" as const, title: copy.naverTab, description: copy.naverDescription },
  ];
  const changeWithKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    current: KeywordOverviewEngine,
  ) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home"
      ? "serp"
      : event.key === "End"
        ? "naver"
        : current === "serp"
          ? "naver"
          : "serp";
    onChange(next);
    const nextTab = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
      `[data-keyword-engine="${next}"]`,
    );
    nextTab?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={copy.tabsLabel}
      className="mt-5 grid max-w-[560px] grid-cols-2 gap-1 rounded-[9px] border border-app-border bg-app-bg p-1"
    >
      {tabs.map((tab) => {
        const selected = activeEngine === tab.id;
        return (
          <button
            key={tab.id}
            id={`keyword-engine-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`keyword-engine-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            data-keyword-engine={tab.id}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => changeWithKeyboard(event, tab.id)}
            className={cn(
              "min-h-12 rounded-[7px] px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-blue",
              selected
                ? "border border-app-border bg-a2-card text-a2-text shadow-[var(--a2-card-shadow)]"
                : "border border-transparent text-a2-text-muted hover:bg-white/70",
            )}
          >
            <span className="block text-[12px] font-semibold">{tab.title}</span>
            <span className="mt-0.5 block truncate text-[9px] font-medium">{tab.description}</span>
          </button>
        );
      })}
    </div>
  );
}

export function NaverKeywordSearchForm({
  keyword,
  locale,
  loading,
  onKeywordChange,
  onSubmit,
  onExample,
}: {
  keyword: string;
  locale: DashboardLocale;
  loading: boolean;
  onKeywordChange: (value: string) => void;
  onSubmit: () => void;
  onExample: (keyword: string) => void;
}) {
  const copy = COPY[locale];
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form
      onSubmit={submit}
      className="mt-5 rounded-[10px] border border-app-border bg-a2-card p-3 shadow-[var(--a2-card-shadow)]"
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="min-w-0">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.4px] text-a2-text-muted">
            {copy.keyword}
          </span>
          <input
            name="keyword"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder={copy.placeholder}
            maxLength={80}
            required
            autoComplete="off"
            className="h-12 w-full rounded-[7px] border border-app-border bg-white px-3 text-[16px] text-a2-text outline-none transition focus:border-app-blue focus:ring-2 focus:ring-[#d8ecff] sm:text-[14px]"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="min-h-12 rounded-[7px] bg-[#03a66d] px-6 text-[13px] font-semibold text-white transition-colors hover:bg-[#02875a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#047a54] disabled:cursor-wait disabled:opacity-70"
        >
          {loading ? copy.analyzing : copy.analyze}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[#e6f5f0] px-2.5 py-1 text-[10px] font-semibold text-[#0a6b57]">
          {copy.fixedContext}
        </span>
        <span className="text-[11px] text-a2-text-muted">{copy.examples}</span>
        {NAVER_EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onExample(example)}
            className="min-h-9 rounded-full border border-app-border bg-white px-3 text-[11px] text-a2-text transition hover:border-[#b9d8f2] hover:bg-[#f5faff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-blue"
          >
            {example}
          </button>
        ))}
      </div>
    </form>
  );
}

export function NaverKeywordOverview({
  locale,
  report,
  loading,
  error,
  onRetry,
}: {
  locale: DashboardLocale;
  report: NaverKeywordOverviewReport | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const copy = COPY[locale];

  if (!report && loading) {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="mt-6">
        <p className="mb-3 text-[12px] font-medium text-a2-text-muted">{copy.loadingInitial}</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-[116px] animate-pulse rounded-[10px] border border-app-border bg-a2-card p-4">
              <div className="h-3 w-24 rounded bg-[#e9ebf0]" />
              <div className="mt-5 h-7 w-20 rounded bg-[#e9ebf0]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="mt-6 rounded-[10px] border border-dashed border-app-border bg-a2-card px-6 py-12 text-center">
        {error ? (
          <div role="alert">
            <p className="text-[13px] font-semibold text-[#a80028]">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 min-h-11 rounded-[7px] border border-app-border bg-white px-4 text-[12px] font-semibold text-a2-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-blue"
            >
              {copy.retry}
            </button>
          </div>
        ) : (
          <>
            <p className="text-[15px] font-semibold text-a2-text">{copy.emptyTitle}</p>
            <p className="mx-auto mt-1.5 max-w-[560px] text-[12px] leading-[18px] text-a2-text-muted">{copy.emptyBody}</p>
          </>
        )}
      </div>
    );
  }

  const handoffLinks = buildNaverOverviewHandoffLinks(report);

  return (
    <div aria-busy={loading} className="mt-6">
      {loading && (
        <div role="status" aria-live="polite" className="mb-3 rounded-[8px] border border-[#b9d8f2] bg-[#f5faff] px-4 py-2.5 text-[12px] text-[#0b5f99]">
          {copy.loadingPrevious}
        </div>
      )}
      {error && (
        <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#ffc8d4] bg-[#fff4f6] px-4 py-2.5 text-[12px] text-[#a80028]">
          <span>{error}</span>
          <button type="button" onClick={onRetry} className="min-h-9 rounded-[6px] border border-[#e9a3b3] bg-white px-3 font-semibold">
            {copy.retry}
          </button>
        </div>
      )}

      <div className={cn("transition-opacity duration-200", loading && "pointer-events-none opacity-65")}>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title={copy.volumeTitle} hint={copy.volumeHint}>
            <SectionBody envelope={report.volume} locale={locale}>
              {(data) => (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <MetricTile label={copy.pcVolume} value={formatNaverCount(data.pc, locale)} supporting={`${copy.period}: ${data.period}`} />
                  <MetricTile label={copy.mobileVolume} value={formatNaverCount(data.mobile, locale)} supporting={`${copy.period}: ${data.period}`} />
                  <MetricTile label={copy.totalVolume} value={formatNaverCount(data.total, locale)} supporting={`${copy.period}: ${data.period}`} />
                </div>
              )}
            </SectionBody>
          </Card>

          <Card title={copy.advertisingTitle} hint={copy.advertisingHint}>
            <SectionBody envelope={report.advertising} locale={locale}>
              {(data) => <AdvertisingGrid data={data} locale={locale} />}
            </SectionBody>
          </Card>

          <Card title={copy.trendTitle} hint={copy.trendHint}>
            <SectionBody envelope={report.trend} locale={locale}>
              {(data) => <TrendBars data={data} locale={locale} />}
            </SectionBody>
          </Card>

          {report.demographics && (
            <Card title={copy.demographicsTitle} hint={copy.demographicsHint}>
              <SectionBody envelope={report.demographics} locale={locale}>
                {(data) => <DemographicsGrid data={data} locale={locale} />}
              </SectionBody>
            </Card>
          )}

          <Card title={copy.blogTitle} hint={copy.blogHint}>
            <SectionBody envelope={report.blog} locale={locale}>
              {(data) => <BlogResults data={data} locale={locale} />}
            </SectionBody>
          </Card>

          <Card title={copy.relatedTitle} hint={copy.relatedHint}>
            <SectionBody envelope={report.related} locale={locale}>
              {(data) => <RelatedKeywordTable data={data} locale={locale} />}
            </SectionBody>
          </Card>
        </div>

        <section
          aria-labelledby="naver-overview-actions-title"
          className="mt-4 overflow-hidden rounded-[10px] border border-app-border bg-a2-card shadow-[var(--a2-card-shadow)]"
        >
          <div className="border-b border-app-border px-4 py-4 sm:px-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#0a6b57]">
              {copy.actionsEyebrow}
            </p>
            <h2
              id="naver-overview-actions-title"
              className="mt-1 text-[15px] font-semibold tracking-[-0.2px] text-a2-text"
            >
              {copy.actionsTitle}
            </h2>
            <p className="mt-1.5 max-w-[760px] text-[12px] leading-[18px] text-a2-text-muted">
              {copy.actionsHint}
            </p>
          </div>
          <div className="grid gap-px bg-app-border md:grid-cols-2">
            <Link
              href={handoffLinks.content}
              aria-describedby="naver-content-brief-description"
              className="group flex min-h-[112px] items-start justify-between gap-4 bg-a2-card p-4 transition-colors hover:bg-[#f7fbf9] focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#047a54] sm:p-5"
            >
              <span className="min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[#0a6b57]">
                  {copy.draftOnly}
                </span>
                <span className="mt-1 block text-[13px] font-semibold text-a2-text">
                  {copy.contentBrief}
                </span>
                <span
                  id="naver-content-brief-description"
                  className="mt-1 block text-[11px] leading-[17px] text-a2-text-muted"
                >
                  {copy.contentBriefDescription}
                </span>
              </span>
              <span aria-hidden="true" className="mt-1 text-[18px] text-[#0a6b57] transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <Link
              href={handoffLinks.advertising}
              aria-describedby="naver-ad-draft-description"
              className="group flex min-h-[112px] items-start justify-between gap-4 bg-a2-card p-4 transition-colors hover:bg-[#f5faff] focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-app-blue sm:p-5"
            >
              <span className="min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[#0b5f99]">
                  {copy.draftOnly}
                </span>
                <span className="mt-1 block text-[13px] font-semibold text-a2-text">
                  {copy.advertisingDraft}
                </span>
                <span
                  id="naver-ad-draft-description"
                  className="mt-1 block text-[11px] leading-[17px] text-a2-text-muted"
                >
                  {copy.advertisingDraftDescription}
                </span>
              </span>
              <span aria-hidden="true" className="mt-1 text-[18px] text-[#0b5f99] transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
