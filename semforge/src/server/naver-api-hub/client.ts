// @TASK NAVER-P0-PROVIDERS - NAVER API HUB server client
// @SPEC user-approved-plan#3-a-official-data-collection
// @TEST src/server/naver-api-hub/client.test.ts

const NAVER_API_HUB_BASE_URL = "https://naverapihub.apigw.ntruss.com";
const DEFAULT_TIMEOUT_MS = 15_000;
const BLOG_SEARCH_PATH = "/search/v1/blog";
const SEARCH_TREND_PATH = "/search-trend/v1/search";

export interface NaverApiHubCredentials {
  clientId: string;
  clientSecret: string;
}

export interface NaverApiHubEnv {
  NAVER_API_HUB_CLIENT_ID?: string;
  NAVER_API_HUB_CLIENT_SECRET?: string;
}

export interface NaverApiHubClientOptions {
  fetchImpl?: typeof fetch;
  credentials?: NaverApiHubCredentials;
  env?: NaverApiHubEnv;
  baseUrl?: string;
  requestTimeoutMs?: number;
  now?: () => Date;
}

export class NaverApiHubUnavailableError extends Error {
  readonly status = "unavailable" as const;
  readonly provider = "naver-api-hub" as const;

  constructor() {
    super("NAVER API HUB 자격 증명이 설정되지 않았습니다.");
    this.name = "NaverApiHubUnavailableError";
  }
}

export type NaverApiHubFailureKind =
  | "authentication"
  | "rate_limited"
  | "provider"
  | "network"
  | "timeout"
  | "invalid_response";

export class NaverApiHubRequestError extends Error {
  readonly provider = "naver-api-hub" as const;

  constructor(
    message: string,
    readonly kind: NaverApiHubFailureKind,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "NaverApiHubRequestError";
  }
}

export class NaverApiHubValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NaverApiHubValidationError";
  }
}

export type NaverBlogSort = "sim" | "date";

export interface NaverBlogSearchInput {
  query: string;
  display?: number;
  start?: number;
  sort?: NaverBlogSort;
}

export interface NaverBlogSearchItem {
  title: string;
  link: string;
  description: string | null;
  bloggerName: string | null;
  bloggerLink: string | null;
  postDate: string | null;
}

export interface NaverBlogSearchResult {
  query: string;
  total: number;
  start: number;
  display: number;
  lastBuildDate: string | null;
  items: NaverBlogSearchItem[];
  capturedAt: string;
  source: "naver-api-hub-blog-search";
}

export type NaverTrendTimeUnit = "date" | "week" | "month";
export type NaverTrendDevice = "pc" | "mo";
export type NaverTrendGender = "m" | "f";
export type NaverTrendAge = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "11";

export interface NaverTrendKeywordGroup {
  groupName: string;
  keywords: string[];
}

export interface NaverSearchTrendInput {
  keywordGroups: NaverTrendKeywordGroup[];
  startDate?: string;
  endDate?: string;
  timeUnit?: NaverTrendTimeUnit;
  device?: NaverTrendDevice;
  gender?: NaverTrendGender;
  ages?: NaverTrendAge[];
}

export interface NaverSearchTrendPoint {
  period: string;
  ratio: number;
}

export interface NaverSearchTrendSeries {
  title: string;
  keywords: string[];
  data: NaverSearchTrendPoint[];
}

export interface NaverSearchTrendResult {
  startDate: string;
  endDate: string;
  timeUnit: NaverTrendTimeUnit;
  results: NaverSearchTrendSeries[];
  capturedAt: string;
  source: "naver-api-hub-search-trend";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/<\/?b>/gi, "").trim();
  return text.length > 0 ? text : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function normalizeText(value: string, label: string): string {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!normalized) throw new NaverApiHubValidationError(`${label}을(를) 입력해 주세요.`);
  return normalized;
}

function integerInRange(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < min || resolved > max) {
    throw new NaverApiHubValidationError(`${label}은(는) ${min}~${max} 범위의 정수여야 합니다.`);
  }
  return resolved;
}

function readCredentials(options: NaverApiHubClientOptions): NaverApiHubCredentials {
  if (options.credentials) {
    const clientId = options.credentials.clientId.trim();
    const clientSecret = options.credentials.clientSecret.trim();
    if (clientId && clientSecret) return { clientId, clientSecret };
    throw new NaverApiHubUnavailableError();
  }
  const env = options.env ?? process.env;
  const clientId = env.NAVER_API_HUB_CLIENT_ID?.trim();
  const clientSecret = env.NAVER_API_HUB_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new NaverApiHubUnavailableError();
  return { clientId, clientSecret };
}

export function hasNaverApiHubCredentials(
  env: NaverApiHubEnv = process.env as NaverApiHubEnv,
): boolean {
  return Boolean(
    env.NAVER_API_HUB_CLIENT_ID?.trim() &&
      env.NAVER_API_HUB_CLIENT_SECRET?.trim(),
  );
}

function apiHeaders(credentials: NaverApiHubCredentials, jsonBody: boolean): Headers {
  const headers = new Headers({
    Accept: "application/json",
    "X-NCP-APIGW-API-KEY-ID": credentials.clientId,
    "X-NCP-APIGW-API-KEY": credentials.clientSecret,
  });
  if (jsonBody) headers.set("Content-Type", "application/json");
  return headers;
}

function safeBaseUrl(value: string | undefined): string {
  return (value ?? NAVER_API_HUB_BASE_URL).replace(/\/+$/, "");
}

async function requestJson(
  url: string,
  init: RequestInit,
  options: NaverApiHubClientOptions,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    throw new NaverApiHubRequestError(
      controller.signal.aborted
        ? "NAVER API HUB 응답 시간이 초과되었습니다."
        : "NAVER API HUB에 연결하지 못했습니다.",
      controller.signal.aborted ? "timeout" : "network",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new NaverApiHubRequestError(
        "NAVER API HUB 인증 정보를 확인해 주세요.",
        "authentication",
        response.status,
      );
    }
    if (response.status === 429) {
      throw new NaverApiHubRequestError(
        "NAVER API HUB 사용량 한도에 도달했습니다.",
        "rate_limited",
        429,
      );
    }
    throw new NaverApiHubRequestError(
      "NAVER API HUB 요청에 실패했습니다.",
      "provider",
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new NaverApiHubRequestError(
      "NAVER API HUB가 올바른 JSON을 반환하지 않았습니다.",
      "invalid_response",
      response.status,
    );
  }
  if (!isRecord(payload)) {
    throw new NaverApiHubRequestError(
      "NAVER API HUB가 객체 형태의 응답을 반환하지 않았습니다.",
      "invalid_response",
      response.status,
    );
  }
  return payload;
}

function normalizeBlogItem(value: unknown): NaverBlogSearchItem | null {
  if (!isRecord(value)) return null;
  const title = cleanText(value.title);
  const link = cleanText(value.link);
  if (!title || !link) return null;
  return {
    title,
    link,
    description: cleanText(value.description),
    bloggerName: cleanText(value.bloggername),
    bloggerLink: cleanText(value.bloggerlink),
    postDate: cleanText(value.postdate),
  };
}

/** NAVER 블로그 검색 API의 세로형 결과다. 통합검색 순위로 사용하면 안 된다. */
export async function fetchNaverBlogSearch(
  input: NaverBlogSearchInput,
  options: NaverApiHubClientOptions = {},
): Promise<NaverBlogSearchResult> {
  const query = normalizeText(input.query, "검색어");
  const display = integerInRange(input.display, 3, 1, 100, "display");
  const start = integerInRange(input.start, 1, 1, 1_000, "start");
  const sort = input.sort ?? "sim";
  if (sort !== "sim" && sort !== "date") {
    throw new NaverApiHubValidationError("sort는 sim 또는 date여야 합니다.");
  }
  const credentials = readCredentials(options);
  const url = new URL(`${safeBaseUrl(options.baseUrl)}${BLOG_SEARCH_PATH}`);
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(display));
  url.searchParams.set("start", String(start));
  url.searchParams.set("sort", sort);
  const payload = await requestJson(
    url.toString(),
    { method: "GET", headers: apiHeaders(credentials, false) },
    options,
  );
  const total = finiteNumber(payload.total);
  if (total === null || !Array.isArray(payload.items)) {
    throw new NaverApiHubRequestError(
      "NAVER 블로그 검색 응답 형식을 확인할 수 없습니다.",
      "invalid_response",
    );
  }
  return {
    query,
    total,
    start: finiteNumber(payload.start) ?? start,
    display: finiteNumber(payload.display) ?? display,
    lastBuildDate: cleanText(payload.lastBuildDate),
    items: payload.items.map(normalizeBlogItem).filter((item): item is NaverBlogSearchItem => item !== null),
    capturedAt: (options.now ?? (() => new Date()))().toISOString(),
    source: "naver-api-hub-blog-search",
  };
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function lastTwelveMonthsRange(now: Date): { startDate: string; endDate: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && formatDate(parsed) === value;
}

function normalizeTrendGroups(groups: NaverTrendKeywordGroup[]): NaverTrendKeywordGroup[] {
  if (!Array.isArray(groups) || groups.length < 1 || groups.length > 5) {
    throw new NaverApiHubValidationError("키워드 그룹은 1~5개여야 합니다.");
  }
  return groups.map((group, groupIndex) => {
    const groupName = normalizeText(group.groupName, `${groupIndex + 1}번째 그룹 이름`);
    if (!Array.isArray(group.keywords) || group.keywords.length < 1 || group.keywords.length > 20) {
      throw new NaverApiHubValidationError("그룹별 키워드는 1~20개여야 합니다.");
    }
    return {
      groupName,
      keywords: group.keywords.map((keyword, keywordIndex) =>
        normalizeText(keyword, `${groupIndex + 1}번째 그룹의 ${keywordIndex + 1}번째 키워드`),
      ),
    };
  });
}

function normalizeTrendSeries(value: unknown): NaverSearchTrendSeries | null {
  if (!isRecord(value)) return null;
  const title = cleanText(value.title);
  if (!title || !Array.isArray(value.keywords) || !Array.isArray(value.data)) return null;
  const keywords = value.keywords.map(cleanText).filter((item): item is string => item !== null);
  const data = value.data.flatMap((point): NaverSearchTrendPoint[] => {
    if (!isRecord(point)) return [];
    const period = cleanText(point.period);
    const ratio = finiteNumber(point.ratio);
    return period && ratio !== null ? [{ period, ratio }] : [];
  });
  return { title, keywords, data };
}

/** 검색량이 아닌, 선택 기간의 최댓값을 100으로 둔 상대 검색 추이를 반환한다. */
export async function fetchNaverSearchTrend(
  input: NaverSearchTrendInput,
  options: NaverApiHubClientOptions = {},
): Promise<NaverSearchTrendResult> {
  const capturedAt = (options.now ?? (() => new Date()))();
  const defaultRange = lastTwelveMonthsRange(capturedAt);
  const startDate = input.startDate ?? defaultRange.startDate;
  const endDate = input.endDate ?? defaultRange.endDate;
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
    throw new NaverApiHubValidationError("조회 기간은 올바른 YYYY-MM-DD 범위여야 합니다.");
  }
  const timeUnit = input.timeUnit ?? "month";
  const keywordGroups = normalizeTrendGroups(input.keywordGroups);
  const credentials = readCredentials(options);
  const body = {
    startDate,
    endDate,
    timeUnit,
    keywordGroups,
    ...(input.device ? { device: input.device } : {}),
    ...(input.gender ? { gender: input.gender } : {}),
    ...(input.ages?.length ? { ages: input.ages } : {}),
  };
  const payload = await requestJson(
    `${safeBaseUrl(options.baseUrl)}${SEARCH_TREND_PATH}`,
    {
      method: "POST",
      headers: apiHeaders(credentials, true),
      body: JSON.stringify(body),
    },
    options,
  );
  if (!Array.isArray(payload.results)) {
    throw new NaverApiHubRequestError(
      "NAVER 검색 트렌드 응답 형식을 확인할 수 없습니다.",
      "invalid_response",
    );
  }
  return {
    startDate: cleanText(payload.startDate) ?? startDate,
    endDate: cleanText(payload.endDate) ?? endDate,
    timeUnit: (cleanText(payload.timeUnit) as NaverTrendTimeUnit | null) ?? timeUnit,
    results: payload.results
      .map(normalizeTrendSeries)
      .filter((series): series is NaverSearchTrendSeries => series !== null),
    capturedAt: capturedAt.toISOString(),
    source: "naver-api-hub-search-trend",
  };
}
