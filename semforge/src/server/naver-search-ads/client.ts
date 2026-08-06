// @TASK NAVER-P0-PROVIDERS - NAVER Search Ads RelKwdStat server client
// @SPEC user-approved-plan#3-a-official-data-collection
// @TEST src/server/naver-search-ads/client.test.ts
import { createHmac } from "node:crypto";

const NAVER_SEARCH_ADS_BASE_URL = "https://api.searchad.naver.com";
const KEYWORD_TOOL_PATH = "/keywordstool";
const DEFAULT_TIMEOUT_MS = 15_000;

export interface NaverSearchAdsCredentials {
  accessLicense: string;
  secretKey: string;
  customerId: string;
}

export interface NaverSearchAdsEnv {
  NAVER_SEARCH_AD_ACCESS_LICENSE?: string;
  NAVER_SEARCH_AD_SECRET_KEY?: string;
  NAVER_SEARCH_AD_CUSTOMER_ID?: string;
}

export interface NaverSearchAdsClientOptions {
  fetchImpl?: typeof fetch;
  credentials?: NaverSearchAdsCredentials;
  env?: NaverSearchAdsEnv;
  baseUrl?: string;
  requestTimeoutMs?: number;
  now?: () => number;
}

export class NaverSearchAdsUnavailableError extends Error {
  readonly status = "unavailable" as const;
  readonly provider = "naver-search-ads" as const;

  constructor() {
    super("NAVER Search Ads 자격 증명이 설정되지 않았습니다.");
    this.name = "NaverSearchAdsUnavailableError";
  }
}

export type NaverSearchAdsFailureKind =
  | "authentication"
  | "provider"
  | "network"
  | "timeout"
  | "invalid_response";

export class NaverSearchAdsRequestError extends Error {
  readonly provider = "naver-search-ads" as const;

  constructor(
    message: string,
    readonly kind: NaverSearchAdsFailureKind,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "NaverSearchAdsRequestError";
  }
}

export class NaverSearchAdsRateLimitError extends Error {
  readonly provider = "naver-search-ads" as const;
  readonly kind = "rate_limited" as const;
  readonly statusCode = 429 as const;

  constructor() {
    super("NAVER Search Ads 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.");
    this.name = "NaverSearchAdsRateLimitError";
  }
}

export class NaverSearchAdsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NaverSearchAdsValidationError";
  }
}

export interface NaverExactQueryCount {
  relation: "exact";
  value: number;
  min: number;
  maxExclusive: number;
  display: string;
}

export interface NaverLessThanQueryCount {
  relation: "lt";
  min: 0;
  maxExclusive: number;
  display: string;
}

export interface NaverRangeQueryCount {
  relation: "range";
  min: number;
  maxExclusive: number;
  display: string;
}

export type NaverQueryCount =
  | NaverExactQueryCount
  | NaverLessThanQueryCount
  | NaverRangeQueryCount;

export type NaverKeywordCompetition = "low" | "medium" | "high" | "unknown";

/** 공식 RelKwdStat 응답에서 사용하는 필드의 허용 형태. */
export interface NaverKeywordToolRawItem {
  relKeyword?: unknown;
  monthlyPcQcCnt?: unknown;
  monthlyMobileQcCnt?: unknown;
  monthlyAvePcClkCnt?: unknown;
  monthlyAveMobileClkCnt?: unknown;
  monthlyAvePcCtr?: unknown;
  monthlyAveMobileCtr?: unknown;
  plAvgDepth?: unknown;
  compIdx?: unknown;
}

export interface NaverRelatedKeyword {
  keyword: string;
  monthlyPcQueries: NaverQueryCount | null;
  monthlyMobileQueries: NaverQueryCount | null;
  monthlyTotalQueries: NaverQueryCount | null;
  monthlyAveragePcClicks: number | null;
  monthlyAverageMobileClicks: number | null;
  monthlyAveragePcCtr: number | null;
  monthlyAverageMobileCtr: number | null;
  averageAdDepth: number | null;
  competition: NaverKeywordCompetition;
  competitionLabel: string | null;
}

export interface NaverRelatedKeywordsResult {
  seedKeywords: string[];
  keywords: NaverRelatedKeyword[];
  capturedAt: string;
  source: "naver-search-ads-relkwdstat";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function groupedInteger(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

/** `< 10` qualifier를 0으로 강제하지 않고 상한이 열린 범위로 보존한다. */
export function parseNaverQueryCount(value: unknown): NaverQueryCount | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return {
      relation: "exact",
      value,
      min: value,
      maxExclusive: value + 1,
      display: groupedInteger(value),
    };
  }
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  const lessThan = normalized.match(/^<\s*([\d,]+)$/);
  if (lessThan) {
    const threshold = Number(lessThan[1]?.replaceAll(",", ""));
    if (Number.isSafeInteger(threshold) && threshold > 0) {
      return {
        relation: "lt",
        min: 0,
        maxExclusive: threshold,
        display: `<${groupedInteger(threshold)}`,
      };
    }
    return null;
  }
  if (!/^[\d,]+$/.test(normalized)) return null;
  const exact = Number(normalized.replaceAll(",", ""));
  return parseNaverQueryCount(exact);
}

export function sumNaverQueryCounts(values: readonly NaverQueryCount[]): NaverQueryCount | null {
  if (values.length === 0) return null;
  if (values.every((value): value is NaverExactQueryCount => value.relation === "exact")) {
    const total = values.reduce((sum, value) => sum + value.value, 0);
    return parseNaverQueryCount(total);
  }
  const min = values.reduce((sum, value) => sum + value.min, 0);
  const maxExclusive = values.reduce(
    (sum, value) => sum + (value.relation === "exact" ? value.value : value.maxExclusive),
    0,
  );
  if (min === 0) {
    return {
      relation: "lt",
      min: 0,
      maxExclusive,
      display: `<${groupedInteger(maxExclusive)}`,
    };
  }
  return {
    relation: "range",
    min,
    maxExclusive,
    display: `${groupedInteger(min)}–${groupedInteger(maxExclusive - 1)}`,
  };
}

export function normalizeNaverSeedKeywords(seedKeywords: readonly string[]): string[] {
  if (!Array.isArray(seedKeywords) || seedKeywords.length < 1) {
    throw new NaverSearchAdsValidationError("seed 키워드를 1개 이상 입력해 주세요.");
  }
  if (seedKeywords.length > 5) {
    throw new NaverSearchAdsValidationError("seed 키워드는 최대 5개까지 조회할 수 있습니다.");
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of seedKeywords) {
    const keyword = value.normalize("NFKC").trim().replace(/\s+/g, " ");
    if (!keyword) throw new NaverSearchAdsValidationError("빈 seed 키워드는 사용할 수 없습니다.");
    if (keyword.includes(",")) {
      throw new NaverSearchAdsValidationError("seed 키워드에는 쉼표를 사용할 수 없습니다.");
    }
    if (!seen.has(keyword)) {
      seen.add(keyword);
      normalized.push(keyword);
    }
  }
  return normalized;
}

export function createNaverSearchAdsSignature(input: {
  timestamp: number | string;
  method: string;
  path: string;
  secretKey: string;
}): string {
  const message = `${input.timestamp}.${input.method.toUpperCase()}.${input.path}`;
  return createHmac("sha256", input.secretKey).update(message).digest("base64");
}

function readCredentials(options: NaverSearchAdsClientOptions): NaverSearchAdsCredentials {
  if (options.credentials) {
    const accessLicense = options.credentials.accessLicense.trim();
    const secretKey = options.credentials.secretKey.trim();
    const customerId = options.credentials.customerId.trim();
    if (accessLicense && secretKey && customerId) return { accessLicense, secretKey, customerId };
    throw new NaverSearchAdsUnavailableError();
  }
  const env = options.env ?? process.env;
  const accessLicense = env.NAVER_SEARCH_AD_ACCESS_LICENSE?.trim();
  const secretKey = env.NAVER_SEARCH_AD_SECRET_KEY?.trim();
  const customerId = env.NAVER_SEARCH_AD_CUSTOMER_ID?.trim();
  if (!accessLicense || !secretKey || !customerId) throw new NaverSearchAdsUnavailableError();
  return { accessLicense, secretKey, customerId };
}

export function hasNaverSearchAdsCredentials(
  env: NaverSearchAdsEnv = process.env as NaverSearchAdsEnv,
): boolean {
  return Boolean(
    env.NAVER_SEARCH_AD_ACCESS_LICENSE?.trim() &&
      env.NAVER_SEARCH_AD_SECRET_KEY?.trim() &&
      env.NAVER_SEARCH_AD_CUSTOMER_ID?.trim(),
  );
}

function safeBaseUrl(value: string | undefined): string {
  return (value ?? NAVER_SEARCH_ADS_BASE_URL).replace(/\/+$/, "");
}

function finiteMetric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replaceAll(",", "").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function competitionFrom(value: unknown): { value: NaverKeywordCompetition; label: string | null } {
  if (typeof value !== "string" || !value.trim()) return { value: "unknown", label: null };
  const label = value.trim();
  const normalized = label.toLocaleLowerCase("en-US");
  if (["높음", "high"].includes(normalized)) return { value: "high", label };
  if (["중간", "medium", "mid"].includes(normalized)) return { value: "medium", label };
  if (["낮음", "low"].includes(normalized)) return { value: "low", label };
  return { value: "unknown", label };
}

export function normalizeNaverKeywordToolItem(raw: NaverKeywordToolRawItem): NaverRelatedKeyword | null {
  if (typeof raw.relKeyword !== "string") return null;
  const keyword = raw.relKeyword.normalize("NFKC").trim();
  if (!keyword) return null;
  const monthlyPcQueries = parseNaverQueryCount(raw.monthlyPcQcCnt);
  const monthlyMobileQueries = parseNaverQueryCount(raw.monthlyMobileQcCnt);
  const competition = competitionFrom(raw.compIdx);
  return {
    keyword,
    monthlyPcQueries,
    monthlyMobileQueries,
    monthlyTotalQueries:
      monthlyPcQueries && monthlyMobileQueries
        ? sumNaverQueryCounts([monthlyPcQueries, monthlyMobileQueries])
        : null,
    monthlyAveragePcClicks: finiteMetric(raw.monthlyAvePcClkCnt),
    monthlyAverageMobileClicks: finiteMetric(raw.monthlyAveMobileClkCnt),
    monthlyAveragePcCtr: finiteMetric(raw.monthlyAvePcCtr),
    monthlyAverageMobileCtr: finiteMetric(raw.monthlyAveMobileCtr),
    averageAdDepth: finiteMetric(raw.plAvgDepth),
    competition: competition.value,
    competitionLabel: competition.label,
  };
}

async function requestKeywordTool(
  url: string,
  headers: Headers,
  options: NaverSearchAdsClientOptions,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    throw new NaverSearchAdsRequestError(
      controller.signal.aborted
        ? "NAVER Search Ads 응답 시간이 초과되었습니다."
        : "NAVER Search Ads에 연결하지 못했습니다.",
      controller.signal.aborted ? "timeout" : "network",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429) throw new NaverSearchAdsRateLimitError();
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new NaverSearchAdsRequestError(
        "NAVER Search Ads 인증 정보를 확인해 주세요.",
        "authentication",
        response.status,
      );
    }
    throw new NaverSearchAdsRequestError(
      "NAVER Search Ads 요청에 실패했습니다.",
      "provider",
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new NaverSearchAdsRequestError(
      "NAVER Search Ads가 올바른 JSON을 반환하지 않았습니다.",
      "invalid_response",
      response.status,
    );
  }
  if (!isRecord(payload)) {
    throw new NaverSearchAdsRequestError(
      "NAVER Search Ads가 객체 형태의 응답을 반환하지 않았습니다.",
      "invalid_response",
      response.status,
    );
  }
  return payload;
}

/** RelKwdStat 조회는 호출당 한 번만 요청하며 429를 내부에서 재시도하지 않는다. */
export async function fetchNaverRelatedKeywords(
  seedKeywords: readonly string[],
  options: NaverSearchAdsClientOptions = {},
): Promise<NaverRelatedKeywordsResult> {
  const normalizedSeeds = normalizeNaverSeedKeywords(seedKeywords);
  const credentials = readCredentials(options);
  const timestamp = (options.now ?? Date.now)();
  const signature = createNaverSearchAdsSignature({
    timestamp,
    method: "GET",
    path: KEYWORD_TOOL_PATH,
    secretKey: credentials.secretKey,
  });
  const url = new URL(`${safeBaseUrl(options.baseUrl)}${KEYWORD_TOOL_PATH}`);
  url.searchParams.set("hintKeywords", normalizedSeeds.join(","));
  url.searchParams.set("showDetail", "1");
  const headers = new Headers({
    Accept: "application/json",
    "X-Timestamp": String(timestamp),
    "X-API-KEY": credentials.accessLicense,
    "X-Customer": credentials.customerId,
    "X-Signature": signature,
  });
  const payload = await requestKeywordTool(url.toString(), headers, options);
  if (!Array.isArray(payload.keywordList)) {
    throw new NaverSearchAdsRequestError(
      "NAVER Search Ads 키워드 응답 형식을 확인할 수 없습니다.",
      "invalid_response",
    );
  }
  return {
    seedKeywords: normalizedSeeds,
    keywords: payload.keywordList
      .map((item) => (isRecord(item) ? normalizeNaverKeywordToolItem(item) : null))
      .filter((item): item is NaverRelatedKeyword => item !== null),
    capturedAt: new Date(timestamp).toISOString(),
    source: "naver-search-ads-relkwdstat",
  };
}
