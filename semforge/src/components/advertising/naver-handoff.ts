// @TASK NAVER-KI-MVP - NAVER 키워드 탐색기에서 광고 리서치로 안전하게 전달
// @SPEC 사용자 계획 §3.D 로그인 기능
// @TEST src/components/advertising/naver-handoff.test.ts

export const MAX_NAVER_HANDOFF_KEYWORDS = 20;
const MAX_KEYWORD_LENGTH = 80;
const MAX_KEYWORDS_QUERY_LENGTH = 4_096;
const MAX_METRIC_LENGTH = 32;
const NAVER_EXPLORER_SOURCE = "naver-keyword-explorer";
const NAVER_SEARCH_ADS_SOURCES = new Set(["naver-search-ads", "NAVER Search Ads"]);
const MEASUREMENTS = new Set(["absolute", "relative", "calculated", "inferred"] as const);

type NaverMeasurement = "absolute" | "relative" | "calculated" | "inferred";

interface SearchParamsReader {
  get(name: string): string | null;
}

export interface NaverAdvertisingAdStats {
  monthlyPcQueries?: string;
  monthlyMobileQueries?: string;
  monthlyTotalQueries?: string;
  averagePcClicks?: string;
  averageMobileClicks?: string;
  averagePcCtr?: string;
  averageMobileCtr?: string;
  competition?: string;
}

export interface NaverAdvertisingHandoff {
  keywords: string[];
  providerSource: string | null;
  fetchedAt: string | null;
  measurement: NaverMeasurement | null;
  adStats: NaverAdvertisingAdStats;
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/i.test(value);
}

function normalizeKeyword(value: string): string | null {
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > MAX_KEYWORD_LENGTH || hasControlCharacters(normalized)) {
    return null;
  }
  return normalized;
}

function parseKeywords(raw: string): string[] {
  if (raw.length > MAX_KEYWORDS_QUERY_LENGTH) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of raw.normalize("NFKC").split(/[,\r\n]+/)) {
    const keyword = normalizeKeyword(part);
    if (!keyword) continue;
    const dedupeKey = keyword.toLocaleLowerCase("ko-KR");
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    result.push(keyword);
    if (result.length >= MAX_NAVER_HANDOFF_KEYWORDS) break;
  }

  return result;
}

function parseProviderSource(raw: string | null): string | null {
  if (!raw || raw.length > 160) return null;
  const normalized = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  return normalized.length <= 80 && NAVER_SEARCH_ADS_SOURCES.has(normalized) ? normalized : null;
}

function parseFetchedAt(raw: string | null): string | null {
  if (!raw || raw.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(raw)) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function parseMeasurement(raw: string | null): NaverMeasurement | null {
  return raw && MEASUREMENTS.has(raw as NaverMeasurement) ? (raw as NaverMeasurement) : null;
}

function parseMetric(raw: string | null): string | undefined {
  if (!raw || raw.length > MAX_METRIC_LENGTH * 2) return undefined;
  const normalized = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (
    !normalized ||
    normalized.length > MAX_METRIC_LENGTH ||
    hasControlCharacters(normalized) ||
    !/^[0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ\s.,%+\-–—<>/=]+$/.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

function firstMetric(params: SearchParamsReader, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = parseMetric(params.get(name));
    if (value !== undefined) return value;
  }
  return undefined;
}

function parseAdStats(params: SearchParamsReader): NaverAdvertisingAdStats {
  const entries: Array<[keyof NaverAdvertisingAdStats, readonly string[]]> = [
    ["monthlyPcQueries", ["naverMonthlyPcQueries"]],
    ["monthlyMobileQueries", ["naverMonthlyMobileQueries"]],
    ["monthlyTotalQueries", ["naverMonthlyTotalQueries"]],
    ["averagePcClicks", ["naverAveragePcClicks", "naverMonthlyAveragePcClicks"]],
    ["averageMobileClicks", ["naverAverageMobileClicks", "naverMonthlyAverageMobileClicks"]],
    ["averagePcCtr", ["naverAveragePcCtr", "naverMonthlyAveragePcCtr"]],
    ["averageMobileCtr", ["naverAverageMobileCtr", "naverMonthlyAverageMobileCtr"]],
    ["competition", ["naverAdCompetition", "naverCompetitionLabel"]],
  ];
  const result: NaverAdvertisingAdStats = {};

  for (const [key, names] of entries) {
    const value = firstMetric(params, names);
    if (value !== undefined) result[key] = value;
  }

  return result;
}

export function parseNaverAdvertisingHandoff(
  params: SearchParamsReader,
): NaverAdvertisingHandoff | null {
  if (params.get("source") !== NAVER_EXPLORER_SOURCE) return null;

  const keywords = parseKeywords(params.get("keywords") ?? "");
  if (keywords.length === 0) return null;

  return {
    keywords,
    providerSource: parseProviderSource(params.get("naverSource")),
    fetchedAt: parseFetchedAt(params.get("naverFetchedAt")),
    measurement: parseMeasurement(params.get("measurement")),
    adStats: parseAdStats(params),
  };
}
