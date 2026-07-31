import { ApiError } from "@/lib/api";
import {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_RETRY_BASE_DELAY_MS,
  RetryableTalordataError,
  defaultSleep,
  getToken,
  isRecord,
  positiveInteger,
  requestOnce,
  type TalordataClientOptions,
} from "@/server/talordata/client";

/**
 * TalorData Google Trends 클라이언트 (engine=google_trends).
 * 문서: https://docs.talordata.com/serp-api/query-parameters/google-serp-api-query-parameters/google-trends-serp-api-parameters-guide
 *
 * 2026-07-31 실측 프로브로 확인된 TIMESERIES 응답 형태:
 *   { code: 0, data: { trends_results: [{ date: "Jul 27–Aug 2, 2025",
 *     timestamp: "1753574400", value: "32" }], search_metadata, cache_status } }
 *   - 값은 절대 검색량이 아니라 Google Trends 상대 관심도(0~100)다.
 *   - 12개월 조회 시 주 단위 약 53개 포인트가 온다.
 *   - geo 를 지정하지 않으면 제공사가 US 로 기본 처리한다 (문서의
 *     "Worldwide 기본"과 다름) — 그래서 geo 는 필수 인자로 받는다.
 */

export interface TrendsTimeseriesQuery {
  q: string;
  /** Google Trends geo 코드 (KR, US 등). */
  geo: string;
  /** 조회 기간. 기본 "today 12-m" (지난 12개월, 주 단위). */
  date?: string;
  /** 인터페이스 언어. 기본은 geo=KR 이면 ko, 그 외 en. */
  hl?: string;
}

export interface TrendPoint {
  /** 제공사 표시용 구간 라벨 (예: "Jul 27–Aug 2, 2025"). */
  label: string;
  /** 구간 시작 시각 (UTC). 제공사 timestamp(초) 기반. */
  periodStart: Date;
  /** 상대 관심도 0~100. Google Trends 의 "<1" 은 0 으로 정규화한다. */
  value: number;
}

export interface TrendsTimeseriesResult {
  query: string;
  geo: string;
  date: string;
  /** 빈 배열이면 "이 키워드는 추세 데이터 없음" (정상 empty 상태). */
  points: TrendPoint[];
  provider: { id: string | null; cacheStatus: boolean | null };
  capturedAt: Date;
}

interface TrendsRawPoint {
  date?: unknown;
  timestamp?: unknown;
  value?: unknown;
}

/** "32" / 32 / "<1" 을 0~100 정수로 정규화한다. 판독 불가 값은 null. */
function parseInterestValue(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.min(100, Math.max(0, Math.round(raw)));
  }
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "" ) return null;
  if (trimmed.startsWith("<")) return 0;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function parseTimestampSeconds(raw: unknown): Date | null {
  const seconds =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000);
}

function parsePoints(rawList: readonly unknown[]): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (const raw of rawList) {
    if (!isRecord(raw)) continue;
    const item = raw as TrendsRawPoint;
    const value = parseInterestValue(item.value);
    const periodStart = parseTimestampSeconds(item.timestamp);
    if (value === null || periodStart === null) continue;
    points.push({
      label: typeof item.date === "string" ? item.date : "",
      periodStart,
      value,
    });
  }
  return points.toSorted((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
}

export async function fetchTrendsTimeseries(
  query: TrendsTimeseriesQuery,
  options: TalordataClientOptions = {}
): Promise<TrendsTimeseriesResult> {
  const token = getToken();
  const geo = query.geo.trim().toUpperCase();
  if (!geo) {
    throw new ApiError("VALIDATION_ERROR", "Google Trends geo 코드를 지정해 주세요.");
  }
  const date = query.date ?? "today 12-m";
  const body = new URLSearchParams({
    engine: "google_trends",
    q: query.q,
    data_type: "TIMESERIES",
    date,
    geo,
    hl: (query.hl ?? (geo === "KR" ? "ko" : "en")).toLowerCase(),
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
      const { data, metadata } = await requestOnce({ token, body, fetchImpl, timeoutMs });

      // trends_results 키 자체가 없으면 파싱 실패(제공사 이상 응답)로 보고 재시도한다.
      // 키는 있는데 빈 배열이면 "추세 데이터 없음" — 정상 empty 로 그대로 반환한다.
      const rawResults = data.trends_results;
      if (!Array.isArray(rawResults)) {
        throw new RetryableTalordataError(
          "Trends 제공사 응답에 trends_results 가 없습니다.",
          "invalid-response"
        );
      }

      return {
        query: query.q,
        geo,
        date,
        points: parsePoints(rawResults),
        provider: {
          id: metadata?.id ?? null,
          cacheStatus: typeof data.cache_status === "boolean" ? data.cache_status : null,
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
      ? `Trends 제공사가 ${attemptsText} 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.`
      : `Trends 제공사의 수집 엔진이 ${attemptsText} 요청을 완료하지 못했습니다. 토큰 승인 문제는 아니며 잠시 후 다시 시도해 주세요.`;
  throw new ApiError("INTERNAL", message, {
    details: {
      attempts: maxAttempts,
      reason: lastFailure?.message ?? "unknown",
    },
  });
}
