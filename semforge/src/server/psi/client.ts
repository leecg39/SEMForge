import { ApiError } from "@/lib/api";

/**
 * Google PageSpeed Insights v5 클라이언트.
 * 문서: https://developers.google.com/speed/docs/insights/v5/about
 *   GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed
 *   ?url=<url>&strategy=mobile|desktop&category=PERFORMANCE...&key=<API 키>
 * API 키가 없어도 낮은 쿼터로 동작한다 (key 파라미터 생략).
 */

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const CATEGORIES = ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"] as const;
// PSI 는 Lighthouse 실행 특성상 수십 초가 걸릴 수 있어 타임아웃을 넉넉히 잡는다.
const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 1_000;

export type PsiStrategy = "mobile" | "desktop";

export interface PsiScores {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

export interface PsiCwv {
  /** Largest Contentful Paint (ms) */
  lcpMs?: number;
  /** Cumulative Layout Shift (단위 없음, 0~1 점수) */
  cls?: number;
  /** Interaction to Next Paint (ms). 필드 데이터에서만 존재한다. */
  inpMs?: number;
  /** First Contentful Paint (ms) */
  fcpMs?: number;
  /** Total Blocking Time (ms). 랩 데이터에서만 존재한다 (INP 의 랩 근사치). */
  tbtMs?: number;
  /**
   * field=CrUX 실사용자 데이터, lab=Lighthouse 합성 측정, none=둘 다 없음.
   * 필드 데이터가 없는 사이트는 랩 메트릭으로 폴백한다.
   */
  source: "field" | "lab" | "none";
  /** field 데이터가 URL 단위가 아니라 오리진 단위에서 온 경우 true */
  originLevel?: boolean;
}

export interface PsiResult {
  url: string;
  strategy: PsiStrategy;
  scores: PsiScores;
  cwv: PsiCwv;
  fetchedAt: Date;
}

/** 테스트와 운영 튜닝을 위한 선택적 의존성. 일반 호출부는 기본값을 사용한다. */
export interface PsiClientOptions {
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  requestTimeoutMs?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
}

type RetryableFailureKind = "timeout" | "network" | "provider" | "invalid-response";

class RetryablePsiError extends Error {
  constructor(
    message: string,
    readonly kind: RetryableFailureKind,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "RetryablePsiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0
    ? Math.floor(value)
    : fallback;
}

function googleErrorMessage(payload: Record<string, unknown>): string | null {
  const error = payload.error;
  if (!isRecord(error)) return null;
  const message = error.message;
  return typeof message === "string" && message.trim().length > 0
    ? message.trim()
    : null;
}

interface PsiRawMetric {
  percentile?: number;
}

interface PsiRawAudit {
  numericValue?: number;
}

/** PSI 필드(CrUX) 메트릭 묶음에서 CWV 값을 읽는다. 없는 지표는 undefined 로 둔다. */
function parseFieldMetrics(metrics: Record<string, unknown>): Omit<PsiCwv, "source"> {
  const read = (key: string): number | undefined => {
    const metric = metrics[key];
    if (!isRecord(metric)) return undefined;
    const percentile = (metric as PsiRawMetric).percentile;
    return typeof percentile === "number" && Number.isFinite(percentile)
      ? percentile
      : undefined;
  };
  const clsRaw = read("CUMULATIVE_LAYOUT_SHIFT_SCORE");
  return {
    lcpMs: read("LARGEST_CONTENTFUL_PAINT_MS"),
    // PSI 필드 데이터의 CLS percentile 은 1/100 단위로 표현된다 (12 → 0.12).
    cls: clsRaw === undefined ? undefined : clsRaw / 100,
    inpMs: read("INTERACTION_TO_NEXT_PAINT"),
    fcpMs: read("FIRST_CONTENTFUL_PAINT_MS"),
  };
}

/** Lighthouse 감사 결과에서 랩 CWV 값을 읽는다. 없는 지표는 undefined 로 둔다. */
function parseLabAudits(audits: Record<string, unknown>): Omit<PsiCwv, "source"> {
  const read = (key: string): number | undefined => {
    const audit = audits[key];
    if (!isRecord(audit)) return undefined;
    const numericValue = (audit as PsiRawAudit).numericValue;
    return typeof numericValue === "number" && Number.isFinite(numericValue)
      ? numericValue
      : undefined;
  };
  return {
    lcpMs: read("largest-contentful-paint"),
    cls: read("cumulative-layout-shift"),
    fcpMs: read("first-contentful-paint"),
    tbtMs: read("total-blocking-time"),
  };
}

function hasAnyMetric(cwv: Omit<PsiCwv, "source">): boolean {
  return (
    cwv.lcpMs !== undefined ||
    cwv.cls !== undefined ||
    cwv.inpMs !== undefined ||
    cwv.fcpMs !== undefined ||
    cwv.tbtMs !== undefined
  );
}

function parseCwv(payload: Record<string, unknown>): PsiCwv {
  // URL 단위 필드 데이터를 우선 쓰고, 없으면 오리진 단위로 폴백한다.
  const pageExperience = payload.loadingExperience;
  const originExperience = payload.originLoadingExperience;
  for (const [experience, originLevel] of [
    [pageExperience, false],
    [originExperience, true],
  ] as const) {
    if (!isRecord(experience) || !isRecord(experience.metrics)) continue;
    const field = parseFieldMetrics(experience.metrics);
    if (hasAnyMetric(field)) {
      return { ...field, source: "field", ...(originLevel ? { originLevel: true } : {}) };
    }
  }

  const lighthouse = payload.lighthouseResult;
  if (isRecord(lighthouse) && isRecord(lighthouse.audits)) {
    const lab = parseLabAudits(lighthouse.audits);
    if (hasAnyMetric(lab)) {
      return { ...lab, source: "lab" };
    }
  }
  return { source: "none" };
}

function readScore(categories: Record<string, unknown>, key: string): number {
  const category = categories[key];
  if (!isRecord(category)) return 0;
  const score = category.score;
  // Lighthouse 카테고리 점수는 0~1 실수다. 측정 불가(null)면 0 대신 보고하지 않는다.
  if (typeof score !== "number" || !Number.isFinite(score)) return 0;
  return Math.round(score * 100);
}

function parseScores(payload: Record<string, unknown>): PsiScores {
  const lighthouse = payload.lighthouseResult;
  const categories = isRecord(lighthouse) && isRecord(lighthouse.categories)
    ? lighthouse.categories
    : {};
  return {
    performance: readScore(categories, "performance"),
    accessibility: readScore(categories, "accessibility"),
    bestPractices: readScore(categories, "best-practices"),
    seo: readScore(categories, "seo"),
  };
}

async function requestOnce(input: {
  endpoint: URL;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  let response: Response;
  try {
    response = await input.fetchImpl(input.endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    throw new RetryablePsiError(
      controller.signal.aborted
        ? "PageSpeed Insights 응답이 시간 초과되었습니다."
        : "PageSpeed Insights 에 연결하지 못했습니다.",
      controller.signal.aborted ? "timeout" : "network",
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    clearTimeout(timer);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new RetryablePsiError(
      "PageSpeed Insights 가 올바른 JSON 응답을 반환하지 않았습니다.",
      "invalid-response",
      error instanceof Error ? error.message : String(error)
    );
  }
  if (!isRecord(payload)) {
    throw new RetryablePsiError(
      "PageSpeed Insights 가 객체 형태의 JSON 응답을 반환하지 않았습니다.",
      "invalid-response"
    );
  }

  if (!response.ok) {
    const providerMessage = googleErrorMessage(payload);
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(
        "INTERNAL",
        "PAGESPEED_API_KEY 가 유효하지 않거나 PageSpeed Insights API 가 활성화되지 않았습니다."
      );
    }
    if (response.status === 429) {
      throw new ApiError(
        "RATE_LIMITED",
        "PageSpeed Insights 사용량 한도에 도달했습니다. PAGESPEED_API_KEY 를 등록하면 쿼터가 올라갑니다."
      );
    }
    if (response.status === 408 || response.status >= 500) {
      throw new RetryablePsiError(
        `PageSpeed Insights 가 HTTP ${response.status} 를 반환했습니다.`,
        "provider",
        { status: response.status }
      );
    }
    // 400 계열은 대부분 분석 불가 URL (접속 실패, robots 차단 등) 이므로 사유를 그대로 노출한다.
    throw new ApiError(
      "INTERNAL",
      providerMessage
        ? `PageSpeed 분석에 실패했습니다: ${providerMessage}`
        : `PageSpeed Insights 가 HTTP ${response.status} 를 반환했습니다.`
    );
  }

  const providerError = googleErrorMessage(payload);
  if (providerError) {
    throw new ApiError("INTERNAL", `PageSpeed 분석에 실패했습니다: ${providerError}`);
  }
  return payload;
}

export async function runPageSpeedInsights(
  input: { url: string; strategy?: PsiStrategy },
  options: PsiClientOptions = {}
): Promise<PsiResult> {
  const strategy = input.strategy ?? "mobile";
  const endpoint = new URL(ENDPOINT);
  endpoint.searchParams.set("url", input.url);
  endpoint.searchParams.set("strategy", strategy);
  for (const category of CATEGORIES) {
    endpoint.searchParams.append("category", category);
  }
  // 키가 없으면 파라미터 자체를 생략해 익명(저쿼터) 모드로 호출한다.
  const apiKey = process.env.PAGESPEED_API_KEY?.trim();
  if (apiKey) {
    endpoint.searchParams.set("key", apiKey);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = positiveInteger(options.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
  const maxAttempts = positiveInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS);
  const retryBaseDelayMs = Math.max(0, options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS);
  let lastFailure: RetryablePsiError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const payload = await requestOnce({ endpoint, fetchImpl, timeoutMs });
      if (!isRecord(payload.lighthouseResult)) {
        throw new RetryablePsiError(
          "PageSpeed Insights 응답에 Lighthouse 결과가 없습니다.",
          "invalid-response"
        );
      }
      return {
        url: input.url,
        strategy,
        scores: parseScores(payload),
        cwv: parseCwv(payload),
        fetchedAt: new Date(),
      };
    } catch (error) {
      if (!(error instanceof RetryablePsiError)) {
        throw error;
      }
      lastFailure = error;
      if (attempt < maxAttempts) {
        await sleep(retryBaseDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  throw new ApiError(
    "INTERNAL",
    lastFailure?.kind === "timeout"
      ? `PageSpeed Insights 가 ${maxAttempts}회 시도 후에도 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.`
      : `PageSpeed Insights 요청이 ${maxAttempts}회 시도 후에도 완료되지 못했습니다. 잠시 후 다시 시도해 주세요.`,
    {
      details: {
        attempts: maxAttempts,
        reason: lastFailure?.message ?? "unknown",
      },
    }
  );
}
