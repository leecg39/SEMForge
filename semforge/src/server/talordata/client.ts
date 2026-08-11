// @TASK P3-C1-T1 - TalorData Google SERP response evidence
// @SPEC docs/planning/06-tasks.md#p3-c1-t1--google-rank와-aio-수집
// @TEST src/server/talordata/client.test.ts
import { ApiError } from "@/lib/api";

/**
 * TalorData SERP API 클라이언트.
 * 문서: https://docs.talordata.com/serp-api
 *   POST https://serpapi.talordata.net/serp/v1/request
 *   Authorization: Bearer <TALORDATA_API_TOKEN>, form-urlencoded 본문
 * 응답의 organic 배열 순서가 곧 순위다 (API가 position 필드를 주지 않는다).
 */

const ENDPOINT = "https://serpapi.talordata.net/serp/v1/request";
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_RETRY_BASE_DELAY_MS = 750;

export type SerpEngine = "google" | "bing";

export interface SerpQuery {
  q: string;
  engine?: SerpEngine;
  /** 가져올 오가닉 결과 수 (기본 10, 최대 100) */
  num?: number;
  /** 국가 코드 (gl). 기본 kr */
  gl?: string;
  /** UI 언어 (hl). 기본 ko */
  hl?: string;
  device?: "desktop" | "mobile" | "tablet";
  /** Google AI Overview 구조화 본문과 인용을 요청한다. */
  aiOverview?: boolean;
  /** Google/Bing 지역 타겟팅용 canonical 위치. */
  location?: string;
  /** Google 위치 인코딩. location 과 함께 전달한다. */
  uule?: string;
  /** Bing 위치 좌표. 둘 다 있을 때만 전달한다. */
  latitude?: number;
  longitude?: number;
}

export interface SerpOrganicItem {
  position: number;
  title: string;
  link: string;
  /** link 에서 추출한 정규화 도메인 (매칭 실패 시 빈 문자열) */
  domain: string;
  displayLink: string | null;
  description: string | null;
}

export type SerpPaidKind = "search_ad" | "shopping_ad";
export type SerpAdPlacement = "top" | "bottom" | "shopping" | "unknown";

/** 검색 광고와 쇼핑 광고를 하나의 공급자 중립 형태로 정규화한 결과. */
export interface SerpPaidItem {
  position: number;
  kind: SerpPaidKind;
  placement: SerpAdPlacement;
  title: string;
  link: string;
  domain: string;
  displayLink: string | null;
  description: string | null;
  advertiser: string | null;
  price: string | null;
  imageUrl: string | null;
}

/** AIO(Google AI 개요) 인용 소스 한 건. */
export interface AiOverviewCitation {
  url: string;
  domain: string;
  title: string | null;
}

export interface AiOverviewInfo {
  present: boolean;
  /** AIO 키가 응답에 있어 출현/미출현을 판정할 수 있는가. */
  presenceAvailable: boolean;
  /**
   * 제공사가 AIO 본문(구조화 데이터)을 줬는가.
   * false 면 출현만 알 수 있고 인용 여부는 판정 불가다.
   */
  citationsAvailable: boolean;
  citations: AiOverviewCitation[];
}

/** 로컬팩(지도 3팩) 업체 한 건. */
export interface LocalResultItem {
  position: number;
  title: string;
  link: string | null;
  rating: number | null;
  reviewsCount: number | null;
  address: string | null;
}

export interface SerpResult {
  query: string;
  engine: SerpEngine;
  organic: SerpOrganicItem[];
  /** 같은 SERP에서 관측한 텍스트/쇼핑 광고. 광고가 없으면 빈 배열이다. */
  paid: SerpPaidItem[];
  /** 공급자 응답에 쇼핑 결과 블록 자체가 있었는지 여부. 빈 배열과 미지원 응답을 구분한다. */
  shoppingAvailability: "available" | "unavailable";
  /** 페이지에서 감지된 SERP 피처 이름 (local_pack, knowledge_panel 등) */
  features: string[];
  /** AIO 출현/인용 정보. AIO가 없으면 present=false. */
  aiOverview: AiOverviewInfo;
  /** 로컬팩 업체 목록. 로컬팩이 없으면 빈 배열. */
  localResults: LocalResultItem[];
  /** 제공사 원본 메타 (응답 id, 소요 시간) */
  provider: { id: string | null; timeTakenSeconds: number | null };
  capturedAt: Date;
}

interface TalordataOrganicRaw {
  title?: string;
  link?: string;
  display_link?: string;
  description?: string;
}

function normalizeDomain(input: string): string {
  const trimmed = input.trim().toLocaleLowerCase("en-US");
  if (!trimmed) return "";
  try {
    const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    return new URL(withProtocol).hostname.replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return "";
  }
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstScalarText(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function paidItemsFrom(
  data: Record<string, unknown>,
  keys: readonly string[],
  kind: SerpPaidKind,
  placement: SerpAdPlacement,
): SerpPaidItem[] {
  const rows: SerpPaidItem[] = [];
  for (const key of keys) {
    const value = data[key];
    if (!Array.isArray(value)) continue;
    value.forEach((entry, index) => {
      if (!isRecord(entry)) return;
      const link = firstString(entry, ["link", "url", "product_link", "landing_page"]);
      if (!link || !/^https?:\/\//i.test(link)) return;
      const parsedPosition = Number(entry.position ?? entry.rank);
      rows.push({
        position:
          Number.isInteger(parsedPosition) && parsedPosition > 0 ? parsedPosition : index + 1,
        kind,
        placement,
        title: firstString(entry, ["title", "headline", "name", "product_title"]) ?? "",
        link,
        domain: normalizeDomain(link),
        displayLink: firstString(entry, ["display_link", "displayed_link", "visible_url"]),
        description: firstString(entry, ["description", "snippet", "text"]),
        advertiser: firstString(entry, ["advertiser", "merchant", "source", "seller"]),
        price: firstScalarText(entry, ["price", "extracted_price", "price_text"]),
        imageUrl: firstString(entry, ["image", "thumbnail", "image_url"]),
      });
    });
  }
  return rows;
}

/** 공급자별 키 이름 차이를 흡수하고 중복 광고를 제거한다. */
export function parsePaidResults(data: Record<string, unknown>): SerpPaidItem[] {
  const candidates = [
    ...paidItemsFrom(data, ["top_ads", "ads_top", "ads", "ad_results", "paid_results"], "search_ad", "top"),
    ...paidItemsFrom(data, ["bottom_ads", "ads_bottom"], "search_ad", "bottom"),
    ...paidItemsFrom(
      data,
      ["shopping", "shopping_results", "immersive_products", "inline_products", "product_results"],
      "shopping_ad",
      "shopping",
    ),
  ];
  const seen = new Set<string>();
  return candidates.filter((item) => {
    const key = `${item.kind}\u0000${item.placement}\u0000${item.link}\u0000${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const SHOPPING_RESULT_KEYS = [
  "shopping",
  "shopping_results",
  "immersive_products",
  "inline_products",
  "product_results",
] as const;

export function shoppingResponseAvailability(
  data: Record<string, unknown>,
): "available" | "unavailable" {
  return SHOPPING_RESULT_KEYS.some((key) => Object.prototype.hasOwnProperty.call(data, key))
    ? "available"
    : "unavailable";
}

export interface TalordataMetadata {
  id?: string;
  status?: string;
  total_time_taken?: number;
}

/** 테스트와 운영 튜닝을 위한 선택적 의존성. 일반 호출부는 기본값을 사용한다. */
export interface TalordataClientOptions {
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
}

type RetryableFailureKind =
  | "aborted"
  | "timeout"
  | "network"
  | "provider"
  | "invalid-response";

export class RetryableTalordataError extends Error {
  constructor(
    message: string,
    readonly kind: RetryableFailureKind,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "RetryableTalordataError";
  }
}

const FEATURE_KEYS: Record<string, string> = {
  google_ai_overview: "ai_overview",
  ai_overview: "ai_overview",
  snack_pack: "local_pack",
  snack_pack_map: "local_pack",
  knowledge: "knowledge_panel",
  answer_box: "answer_box",
  people_also_ask: "people_also_ask",
  people_are_saying: "people_are_saying",
  related_searches: "related_searches",
  refine_this_search: "refine_this_search",
  immersive_products: "shopping",
  shopping: "shopping",
  videos: "videos",
  images: "images",
  news: "top_stories",
};

export function getToken(): string {
  const token = process.env.TALORDATA_API_TOKEN?.trim();
  if (!token) {
    throw new ApiError(
      "INTERNAL",
      "TALORDATA_API_TOKEN 이 설정되지 않았습니다. .env.local 에 토큰을 추가하세요."
    );
  }
  return token;
}

function providerMessage(
  payload: Record<string, unknown>,
  data: Record<string, unknown>,
  metadata?: TalordataMetadata
): string {
  const candidates = [payload.message, payload.error, data.message, data.error];
  const message = candidates.find(
    (candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0
  );
  return message?.trim() ?? metadata?.status?.trim() ?? "알 수 없는 제공사 오류";
}

function isAuthenticationFailure(message: string): boolean {
  return /unauthori[sz]ed|forbidden|invalid\s+(?:api\s+)?token|authentication|credential/i.test(
    message
  );
}

function isQuotaFailure(message: string): boolean {
  return /quota|rate\s*limit|usage\s*limit|insufficient|payment|required|credit|package\s+has\s+expired|balance/i.test(
    message,
  );
}

function isRetryableProviderFailure(message: string): boolean {
  return /collection\s+failed|temporar|timeout|timed\s*out|try\s+again|unavailable|upstream|overload|internal\s+(?:parsing\s+)?error|(?:json|html)\s+data\s+retrieval\s+failed|(?:json|html)\s+fetch\s+failed|data\s+collection\s+api\s+returned\s+incorrect\s+parameters/i.test(
    message
  );
}

export function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0
    ? Math.floor(value)
    : fallback;
}

/**
 * AIO 원본 페이로드에서 인용 소스(URL)를 방어적으로 추출한다.
 * 제공사 응답 형태가 boolean 플래그 / 블록 배열 / { sources: [...] } 객체 등으로
 * 다양하므로 깊이 제한 순회로 link/url 계열 필드를 전부 수집한다.
 */
function parseAiOverview(raw: unknown, presenceAvailable: boolean): AiOverviewInfo {
  if (raw === undefined || raw === null || raw === false) {
    return { present: false, presenceAvailable, citationsAvailable: false, citations: [] };
  }
  if (typeof raw !== "object") {
    // boolean true 등 출현만 알려주는 형태.
    return { present: true, presenceAvailable, citationsAvailable: false, citations: [] };
  }

  const citations = new Map<string, AiOverviewCitation>();
  const walk = (value: unknown, depth: number): void => {
    if (depth > 6 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const link =
      typeof record.link === "string"
        ? record.link
        : typeof record.url === "string"
          ? record.url
          : typeof record.source === "string" && record.source.startsWith("http")
            ? record.source
            : null;
    if (link && /^https?:\/\//i.test(link)) {
      const domain = normalizeDomain(link);
      if (domain && !citations.has(link)) {
        citations.set(link, {
          url: link,
          domain,
          title: typeof record.title === "string" ? record.title : null,
        });
      }
    }
    for (const child of Object.values(record)) walk(child, depth + 1);
  };
  walk(raw, 0);

  return {
    present: true,
    presenceAvailable,
    // AIO 객체가 있다는 사실만으로 인용 판정 가능성을 추정하지 않는다.
    // URL 증거가 하나도 없으면 특정 사이트의 인용 여부는 unknown이어야 한다.
    citationsAvailable: citations.size > 0,
    citations: [...citations.values()],
  };
}

/**
 * 로컬팩 업체 목록을 방어적으로 추출한다.
 * 제공사마다 snack_pack / local_results / local_pack / places 키로 내려주므로
 * 처음 발견되는 "title 을 가진 객체들의 배열"을 채택한다.
 */
function parseLocalResults(data: Record<string, unknown>): LocalResultItem[] {
  const candidateKeys = ["snack_pack", "local_results", "local_pack", "places", "locals"];
  for (const key of candidateKeys) {
    const value = data[key];
    if (!Array.isArray(value) || value.length === 0) continue;
    const items: LocalResultItem[] = [];
    value.forEach((entry, index) => {
      if (!isRecord(entry)) return;
      const title =
        typeof entry.title === "string"
          ? entry.title
          : typeof entry.name === "string"
            ? entry.name
            : null;
      if (!title) return;
      const link =
        typeof entry.link === "string"
          ? entry.link
          : typeof entry.website === "string"
            ? entry.website
            : typeof entry.url === "string"
              ? entry.url
              : null;
      const rating =
        typeof entry.rating === "number" ? entry.rating : Number(entry.rating) || null;
      const reviewsCount =
        typeof entry.reviews === "number"
          ? entry.reviews
          : typeof entry.reviews_count === "number"
            ? entry.reviews_count
            : Number(entry.reviews) || null;
      items.push({
        position:
          typeof entry.position === "number" && entry.position > 0
            ? entry.position
            : index + 1,
        title,
        link,
        rating,
        reviewsCount,
        address: typeof entry.address === "string" ? entry.address : null,
      });
    });
    if (items.length > 0) return items;
  }
  return [];
}

export function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function requestOnce(input: {
  token: string;
  body: URLSearchParams;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<{
  data: Record<string, unknown>;
  metadata?: TalordataMetadata;
  taskId: string | null;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  const requestSignal = input.signal
    ? AbortSignal.any([controller.signal, input.signal])
    : controller.signal;
  let response: Response;
  try {
    response = await input.fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: input.body,
      signal: requestSignal,
      cache: "no-store",
    });
  } catch (error) {
    const externallyAborted = input.signal?.aborted === true;
    throw new RetryableTalordataError(
      externallyAborted
        ? "SERP 수집이 worker 중단 신호로 종료되었습니다."
        : controller.signal.aborted
        ? "SERP 제공사 응답이 시간 초과되었습니다."
        : "SERP 제공사에 연결하지 못했습니다.",
      externallyAborted ? "aborted" : controller.signal.aborted ? "timeout" : "network",
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // 토큰 오류와 사용량 오류를 구분해 노출한다.
    if (response.status === 401 || response.status === 403) {
      throw new ApiError("INTERNAL", "SERP API 토큰이 유효하지 않습니다.");
    }
    if (response.status === 402 || response.status === 429) {
      throw new ApiError(
        "RATE_LIMITED",
        "SERP API 사용량 한도에 도달했습니다. 대시보드에서 잔량을 확인하세요."
      );
    }
    if (response.status === 408 || response.status === 425 || response.status >= 500) {
      throw new RetryableTalordataError(
        `SERP 제공사가 HTTP ${response.status} 를 반환했습니다.`,
        "provider",
        { status: response.status }
      );
    }
    throw new ApiError("INTERNAL", `SERP 제공사가 HTTP ${response.status} 를 반환했습니다.`);
  }

  let rawPayload: unknown;
  try {
    rawPayload = await response.json();
  } catch (error) {
    throw new RetryableTalordataError(
      "SERP 제공사가 올바른 JSON 응답을 반환하지 않았습니다.",
      "invalid-response",
      error instanceof Error ? error.message : String(error)
    );
  }
  if (!isRecord(rawPayload)) {
    throw new RetryableTalordataError(
      "SERP 제공사가 객체 형태의 JSON 응답을 반환하지 않았습니다.",
      "invalid-response"
    );
  }
  const payload = rawPayload;
  const hasResponseCode = payload.code !== undefined && payload.code !== null;
  const responseCode = hasResponseCode ? Number(payload.code) : 0;

  if (hasResponseCode && Number.isNaN(responseCode)) {
    throw new RetryableTalordataError(
      "SERP 제공사가 인식할 수 없는 상태 코드를 반환했습니다.",
      "invalid-response",
    );
  }

  // 실측(2026-07-31 프로브)으로 확인된 실패 모드: 봉투 code=0 인데 data 가
  // 오류 문자열인 형태 — {"code":0,"data":"error, Collection failed"}.
  // 봉투 코드만 믿으면 정상 흐름으로 통과되므로 문자열 data 는 별도 분류한다.
  if (typeof payload.data === "string") {
    const message = payload.data.trim() || "제공사가 빈 오류 응답을 반환했습니다.";
    if (responseCode === 401 || isAuthenticationFailure(message)) {
      throw new ApiError("INTERNAL", "SERP API 토큰이 유효하지 않습니다.");
    }
    if (responseCode === 429 || isQuotaFailure(message)) {
      throw new ApiError(
        "RATE_LIMITED",
        "SERP API 사용량 한도에 도달했습니다. 대시보드에서 잔량을 확인하세요."
      );
    }
    if (
      responseCode === 0 ||
      responseCode === 504 ||
      responseCode >= 500 ||
      isRetryableProviderFailure(message)
    ) {
      throw new RetryableTalordataError(message, "provider", {
        code: responseCode,
      });
    }
    throw new ApiError("INTERNAL", `SERP 제공사가 요청을 거부했습니다: ${message}`);
  }

  // 공식 봉투는 { code, data: { task_id, result } }이며,
  // 이전 응답의 { code, data: { organic, ... } } 형태도 호환한다.
  const dataEnvelope = isRecord(payload.data) ? payload.data : payload;
  const data = isRecord(dataEnvelope.result) ? dataEnvelope.result : dataEnvelope;
  const taskIdValue = dataEnvelope.task_id ?? payload.task_id;
  const taskId = typeof taskIdValue === "string" && taskIdValue.trim()
    ? taskIdValue.trim()
    : null;
  const metadata = isRecord(data.search_metadata)
    ? (data.search_metadata as TalordataMetadata)
    : undefined;
  const message = providerMessage(payload, data, metadata);

  if (responseCode !== 0) {
    if (isAuthenticationFailure(message)) {
      throw new ApiError("INTERNAL", "SERP API 토큰이 유효하지 않습니다.");
    }
    if (isQuotaFailure(message)) {
      throw new ApiError(
        "RATE_LIMITED",
        "SERP API 사용량 한도에 도달했습니다. 대시보드에서 잔량을 확인하세요."
      );
    }
    if (isRetryableProviderFailure(message)) {
      throw new RetryableTalordataError(message, "provider", { code: payload.code });
    }
    throw new ApiError("INTERNAL", `SERP 제공사가 요청을 거부했습니다: ${message}`);
  }

  if (metadata?.status && metadata.status.toLowerCase() !== "success") {
    throw new RetryableTalordataError(message, "provider", {
      status: metadata.status,
    });
  }

  return { data, metadata, taskId };
}

export async function fetchSerp(
  query: SerpQuery,
  options: TalordataClientOptions = {}
): Promise<SerpResult> {
  const token = getToken();
  const engine = query.engine ?? "google";
  const body = new URLSearchParams({
    engine,
    q: query.q,
    num: String(Math.min(100, Math.max(1, query.num ?? 10))),
    json: "1",
  });
  const country = (query.gl ?? "kr").toLowerCase();
  const language = (query.hl ?? "ko").toLowerCase();
  if (engine === "google") {
    body.set("gl", country);
    body.set("hl", language);
    body.set("device", query.device ?? "desktop");
    if (query.aiOverview) {
      body.set("ai_overview", "true");
    }
    if (query.location && query.uule) {
      body.set("location", query.location);
      body.set("uule", query.uule);
    }
  } else {
    body.set("cc", country);
    body.set("mkt", `${language}-${country.toUpperCase()}`);
    if (query.location && query.latitude !== undefined && query.longitude !== undefined) {
      body.set("location", query.location);
      body.set("lat", String(query.latitude));
      body.set("lon", String(query.longitude));
    }
    // TalorData 가 tablet 계약 테스트를 통과한 환경에서만 호출부가 tablet 을 전달한다.
    body.set("device", query.device ?? "desktop");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = positiveInteger(options.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
  const maxAttempts = positiveInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS);
  const retryBaseDelayMs = Math.max(0, options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS);
  let lastFailure: RetryableTalordataError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { data, metadata, taskId } = await requestOnce({
        token,
        body,
        fetchImpl,
        timeoutMs,
        signal: options.signal,
      });

      const organicRaw = Array.isArray(data.organic)
        ? (data.organic as (TalordataOrganicRaw & { position?: number })[])
        : [];
      const organic: SerpOrganicItem[] = organicRaw
        .filter((item) => typeof item.link === "string" && item.link.length > 0)
        .map((item, index) => ({
          position:
            Number.isInteger(item.position) && (item.position as number) > 0
              ? (item.position as number)
              : index + 1,
          title: item.title ?? "",
          link: item.link!,
          domain: normalizeDomain(item.link!),
          displayLink: item.display_link ?? null,
          description: item.description ?? null,
        }));

      const paid = parsePaidResults(data);

      // 오가닉 0건은 "순위권 밖"이 아니라 제공사 차단/일시 오류 신호다.
      // 그대로 진행하면 순위가 null 로 덮여 이력이 오염되므로 재시도한다.
      if (organic.length === 0) {
        throw new RetryableTalordataError(
          "SERP 제공사가 빈 결과를 반환했습니다.",
          "invalid-response"
        );
      }

      const features = Object.entries(FEATURE_KEYS)
        .filter(([key]) => {
          const value = data[key];
          // google_ai_overview 같은 boolean 플래그와 배열/객체 피처를 모두 받는다.
          return value !== undefined && value !== null && value !== false;
        })
        .map(([, name]) => name);

      const hasAiOverview = Object.prototype.hasOwnProperty.call(data, "ai_overview");
      const hasGoogleAiOverview = Object.prototype.hasOwnProperty.call(
        data,
        "google_ai_overview",
      );
      const aiOverview = parseAiOverview(
        hasAiOverview ? data.ai_overview : data.google_ai_overview,
        hasAiOverview || hasGoogleAiOverview,
      );
      // 구조화된 AIO 본문이 있으면 features 에도 출현을 보장한다.
      if (aiOverview.present && !features.includes("ai_overview")) {
        features.push("ai_overview");
      }

      const localResults = parseLocalResults(data);
      if (localResults.length > 0 && !features.includes("local_pack")) {
        features.push("local_pack");
      }

      return {
        query: query.q,
        engine,
        organic,
        paid,
        shoppingAvailability: shoppingResponseAvailability(data),
        features: [...new Set(features)],
        aiOverview,
        localResults,
        provider: {
          id: metadata?.id ?? taskId,
          timeTakenSeconds: metadata?.total_time_taken ?? null,
        },
        capturedAt: new Date(),
      };
    } catch (error) {
      if (!(error instanceof RetryableTalordataError)) {
        throw error;
      }
      if (error.kind === "aborted") {
        // Worker shutdown은 provider 장애 재시도와 다르다. 동일한 중단 신호로
        // 외부 요청을 반복하지 않고 worker가 lease를 회수하도록 즉시 넘긴다.
        throw error;
      }
      lastFailure = error;
      if (attempt < maxAttempts) {
        await sleep(retryBaseDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  const attemptsText = `${maxAttempts}회 시도 후에도`;
  const message =
    lastFailure?.kind === "timeout"
      ? `SERP 제공사가 ${attemptsText} 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.`
      : `SERP 제공사의 수집 엔진이 ${attemptsText} 요청을 완료하지 못했습니다. 토큰 승인 문제는 아니며 잠시 후 다시 시도해 주세요.`;
  throw new ApiError("INTERNAL", message, {
    details: {
      attempts: maxAttempts,
      kind: lastFailure?.kind ?? "provider",
      reason: lastFailure?.message ?? "unknown",
    },
  });
}
