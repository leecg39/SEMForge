// @TASK P3-C2-T1 - Official NAVER Search Ads, DataLab, and Blog adapters
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/providers/naver/production.contract.test.ts
import {
  fetchNaverRelatedKeywords,
  type NaverSearchAdsClientOptions,
} from "@/server/naver-search-ads/client";
import type {
  NaverAgeCode,
  NaverAgeDemographics,
  NaverBlogResultTotal,
  NaverCollectionRange,
  NaverGender,
  NaverGenderDemographics,
  NaverMonthlySearchVolume,
  NaverProvider,
  NaverRelativeTrend,
  NaverTrendPoint,
} from "@/server/providers/naver/contracts";

const NAVER_OPEN_API_ORIGIN = "https://openapi.naver.com";
const NAVER_DATALAB_PATH = "/v1/datalab/search";
const NAVER_BLOG_PATH = "/v1/search/blog.json";
const DEFAULT_TIMEOUT_MS = 15_000;

export const NAVER_AGE_CODES = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
] as const satisfies readonly NaverAgeCode[];

const NAVER_GENDERS = ["m", "f"] as const satisfies readonly NaverGender[];

export interface NaverOpenApiCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface NaverOpenApiEnv {
  readonly NAVER_OPEN_API_CLIENT_ID?: string;
  readonly NAVER_OPEN_API_CLIENT_SECRET?: string;
}

export type NaverOpenApiFailureKind =
  | "unavailable"
  | "authentication"
  | "rate_limited"
  | "provider"
  | "network"
  | "timeout"
  | "invalid_response";

export class NaverOpenApiRequestError extends Error {
  readonly provider = "naver-open-api" as const;

  constructor(
    readonly kind: NaverOpenApiFailureKind,
    readonly statusCode?: number,
  ) {
    super(`NAVER Open API request failed: ${kind}`);
    this.name = "NaverOpenApiRequestError";
  }
}

export interface NaverProductionProviderOptions {
  readonly credentials?: NaverOpenApiCredentials;
  readonly env?: NaverOpenApiEnv;
  readonly fetchImpl?: typeof fetch;
  readonly requestTimeoutMs?: number;
  readonly now?: () => Date;
  readonly searchAdsOptions?: NaverSearchAdsClientOptions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedQuery(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function comparableKeyword(value: string): string {
  return normalizedQuery(value).replaceAll(" ", "").toLocaleLowerCase("ko-KR");
}

function readCredentials(options: NaverProductionProviderOptions): NaverOpenApiCredentials {
  if (options.credentials) {
    const clientId = options.credentials.clientId.trim();
    const clientSecret = options.credentials.clientSecret.trim();
    if (clientId && clientSecret) return { clientId, clientSecret };
    throw new NaverOpenApiRequestError("unavailable");
  }
  const env = options.env ?? (process.env as NaverOpenApiEnv);
  const clientId = env.NAVER_OPEN_API_CLIENT_ID?.trim();
  const clientSecret = env.NAVER_OPEN_API_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new NaverOpenApiRequestError("unavailable");
  return { clientId, clientSecret };
}

function requestHeaders(credentials: NaverOpenApiCredentials, jsonBody: boolean): Headers {
  const headers = new Headers({
    Accept: "application/json",
    "X-Naver-Client-Id": credentials.clientId,
    "X-Naver-Client-Secret": credentials.clientSecret,
  });
  if (jsonBody) headers.set("Content-Type", "application/json");
  return headers;
}

async function requestJson(
  url: string,
  init: RequestInit,
  options: NaverProductionProviderOptions,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    throw new NaverOpenApiRequestError(controller.signal.aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new NaverOpenApiRequestError("authentication", response.status);
    }
    if (response.status === 429) {
      throw new NaverOpenApiRequestError("rate_limited", 429);
    }
    throw new NaverOpenApiRequestError("provider", response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new NaverOpenApiRequestError("invalid_response", response.status);
  }
  if (!isRecord(payload)) throw new NaverOpenApiRequestError("invalid_response", response.status);
  return payload;
}

function parseTrendPoints(payload: Record<string, unknown>): NaverTrendPoint[] {
  if (!Array.isArray(payload.results) || !isRecord(payload.results[0])) {
    throw new NaverOpenApiRequestError("invalid_response");
  }
  const series = payload.results[0];
  if (!Array.isArray(series.data)) throw new NaverOpenApiRequestError("invalid_response");
  return series.data.flatMap((raw): NaverTrendPoint[] => {
    if (!isRecord(raw) || typeof raw.period !== "string") return [];
    if (typeof raw.ratio !== "number" || !Number.isFinite(raw.ratio) || raw.ratio < 0) return [];
    return [{ period: raw.period, ratio: raw.ratio }];
  });
}

async function fetchDatalabTrend(
  query: string,
  range: NaverCollectionRange,
  options: NaverProductionProviderOptions,
  filter: { gender?: NaverGender; ages?: readonly NaverAgeCode[] } = {},
): Promise<NaverTrendPoint[]> {
  const credentials = readCredentials(options);
  const body = {
    startDate: range.startDate,
    endDate: range.endDate,
    timeUnit: range.timeUnit,
    keywordGroups: [{ groupName: "tracked-query", keywords: [normalizedQuery(query)] }],
    ...(filter.gender ? { gender: filter.gender } : {}),
    ...(filter.ages ? { ages: filter.ages } : {}),
  };
  const payload = await requestJson(
    `${NAVER_OPEN_API_ORIGIN}${NAVER_DATALAB_PATH}`,
    {
      method: "POST",
      headers: requestHeaders(credentials, true),
      body: JSON.stringify(body),
    },
    options,
  );
  return parseTrendPoints(payload);
}

/** 공식 endpoint를 감싼 production adapter. 비용 한도 판단은 collector에만 둔다. */
export function createNaverProductionProvider(
  options: NaverProductionProviderOptions = {},
): NaverProvider {
  const now = options.now ?? (() => new Date());

  return {
    async getMonthlySearchVolume({ query }): Promise<NaverMonthlySearchVolume> {
      const normalized = normalizedQuery(query);
      const result = await fetchNaverRelatedKeywords([normalized], {
        ...options.searchAdsOptions,
        now: options.searchAdsOptions?.now ?? (() => now().getTime()),
      });
      const comparable = comparableKeyword(normalized);
      const matched = result.keywords.find(
        (keyword) => comparableKeyword(keyword.keyword) === comparable,
      );
      return {
        pc: matched?.monthlyPcQueries ?? null,
        mobile: matched?.monthlyMobileQueries ?? null,
        source: "naver-search-ads-relkwdstat",
        collectedAt: result.capturedAt,
      };
    },

    async getRelativeTrend({ query, range }): Promise<NaverRelativeTrend> {
      const collectedAt = now().toISOString();
      return {
        points: await fetchDatalabTrend(query, range, options),
        source: "naver-datalab-search",
        collectedAt,
      };
    },

    async getGenderDemographics({ query, range }): Promise<NaverGenderDemographics> {
      const collectedAt = now().toISOString();
      const segments: Array<{
        gender: NaverGender;
        points: readonly NaverTrendPoint[];
      }> = [];
      for (const gender of NAVER_GENDERS) {
        segments.push({
          gender,
          points: await fetchDatalabTrend(query, range, options, { gender }),
        });
      }
      return { segments, source: "naver-datalab-search", collectedAt };
    },

    async getAgeDemographics({ query, range }): Promise<NaverAgeDemographics> {
      const collectedAt = now().toISOString();
      const segments: Array<{
        age: NaverAgeCode;
        points: readonly NaverTrendPoint[];
      }> = [];
      for (const age of NAVER_AGE_CODES) {
        segments.push({
          age,
          points: await fetchDatalabTrend(query, range, options, { ages: [age] }),
        });
      }
      return { segments, source: "naver-datalab-search", collectedAt };
    },

    async getBlogResultTotal({ query }): Promise<NaverBlogResultTotal> {
      const credentials = readCredentials(options);
      const url = new URL(`${NAVER_OPEN_API_ORIGIN}${NAVER_BLOG_PATH}`);
      url.searchParams.set("query", normalizedQuery(query));
      url.searchParams.set("display", "1");
      url.searchParams.set("start", "1");
      url.searchParams.set("sort", "sim");
      const payload = await requestJson(
        url.toString(),
        { method: "GET", headers: requestHeaders(credentials, false) },
        options,
      );
      if (
        typeof payload.total !== "number" ||
        !Number.isSafeInteger(payload.total) ||
        payload.total < 0
      ) {
        throw new NaverOpenApiRequestError("invalid_response");
      }
      return {
        total: payload.total,
        source: "naver-search-blog",
        collectedAt: now().toISOString(),
      };
    },
  };
}
