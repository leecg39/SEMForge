import { ApiError } from "@/lib/api";
import { normalizeDomain } from "@/lib/analytics/metrics";

/**
 * TalorData SERP API 클라이언트.
 * 문서: https://docs.talordata.com/serp-api
 *   POST https://serpapi.talordata.net/serp/v1/request
 *   Authorization: Bearer <TALORDATA_API_TOKEN>, form-urlencoded 본문
 * 응답의 organic 배열 순서가 곧 순위다 (API가 position 필드를 주지 않는다).
 */

const ENDPOINT = "https://serpapi.talordata.net/serp/v1/request";
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 750;

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
  device?: "desktop" | "mobile";
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

/** AIO(Google AI 개요) 인용 소스 한 건. */
export interface AiOverviewCitation {
  url: string;
  domain: string;
  title: string | null;
}

export interface AiOverviewInfo {
  present: boolean;
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

interface TalordataMetadata {
  id?: string;
  status?: string;
  total_time_taken?: number;
}

/** 테스트와 운영 튜닝을 위한 선택적 의존성. 일반 호출부는 기본값을 사용한다. */
export interface TalordataClientOptions {
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  requestTimeoutMs?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
}

type RetryableFailureKind = "timeout" | "network" | "provider" | "invalid-response";

class RetryableTalordataError extends Error {
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

function getToken(): string {
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
  return /quota|rate\s*limit|usage\s*limit|insufficient|payment|required|credit/i.test(message);
}

function isRetryableProviderFailure(message: string): boolean {
  return /collection\s+failed|temporar|timeout|timed\s*out|try\s+again|unavailable|upstream|overload|internal\s+error/i.test(
    message
  );
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0
    ? Math.floor(value)
    : fallback;
}

/**
 * AIO 원본 페이로드에서 인용 소스(URL)를 방어적으로 추출한다.
 * 제공사 응답 형태가 boolean 플래그 / 블록 배열 / { sources: [...] } 객체 등으로
 * 다양하므로 깊이 제한 순회로 link/url 계열 필드를 전부 수집한다.
 */
function parseAiOverview(raw: unknown): AiOverviewInfo {
  if (raw === undefined || raw === null || raw === false) {
    return { present: false, citationsAvailable: false, citations: [] };
  }
  if (typeof raw !== "object") {
    // boolean true 등 출현만 알려주는 형태.
    return { present: true, citationsAvailable: false, citations: [] };
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
    citationsAvailable: true,
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

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function requestOnce(input: {
  token: string;
  body: URLSearchParams;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<{ data: Record<string, unknown>; metadata?: TalordataMetadata }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
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
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    throw new RetryableTalordataError(
      controller.signal.aborted
        ? "SERP 제공사 응답이 시간 초과되었습니다."
        : "SERP 제공사에 연결하지 못했습니다.",
      controller.signal.aborted ? "timeout" : "network",
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

  // 실제 응답 봉투: { code, data: {...}, task_id } — SERP 데이터는 data 아래에 있다.
  const data = isRecord(payload.data) ? payload.data : payload;
  const metadata = isRecord(data.search_metadata)
    ? (data.search_metadata as TalordataMetadata)
    : undefined;
  const message = providerMessage(payload, data, metadata);
  const hasResponseCode = payload.code !== undefined && payload.code !== null;
  const responseCode = hasResponseCode ? Number(payload.code) : 0;

  if (hasResponseCode && Number.isNaN(responseCode)) {
    throw new RetryableTalordataError(
      "SERP 제공사가 인식할 수 없는 상태 코드를 반환했습니다.",
      "invalid-response"
    );
  }

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

  return { data, metadata };
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
    gl: (query.gl ?? "kr").toLowerCase(),
    hl: (query.hl ?? "ko").toLowerCase(),
    device: query.device ?? "desktop",
    json: "1",
  });
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = positiveInteger(options.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
  const maxAttempts = positiveInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS);
  const retryBaseDelayMs = Math.max(0, options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS);
  let lastFailure: RetryableTalordataError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { data, metadata } = await requestOnce({
        token,
        body,
        fetchImpl,
        timeoutMs,
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

      const aiOverview = parseAiOverview(data.ai_overview ?? data.google_ai_overview);
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
        features: [...new Set(features)],
        aiOverview,
        localResults,
        provider: {
          id: metadata?.id ?? null,
          timeTakenSeconds: metadata?.total_time_taken ?? null,
        },
        capturedAt: new Date(),
      };
    } catch (error) {
      if (!(error instanceof RetryableTalordataError)) {
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
      reason: lastFailure?.message ?? "unknown",
    },
  });
}
