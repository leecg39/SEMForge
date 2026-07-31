import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { keywordInsights } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId } from "@/lib/ids";
import { fetchTrendsTimeseries, type TrendPoint } from "@/server/talordata/trends";

/**
 * 키워드 인사이트 수집기 (Google Trends 계열).
 *
 * kind 별 TTL 캐시를 keyword_insights(append-only)에서 판정하고, 미스일 때만
 * TalorData 를 호출해 적재한다. kind 하나의 실패가 다른 kind 를 막지 않도록
 * kind 별 결과/오류를 독립적으로 반환한다 (부분 실패 허용).
 *
 * P1 은 trend_timeseries 만 지원한다. related_queries 등 나머지 kind 는
 * 스키마에 예약되어 있고 P2 에서 페이로드 구조 확인 후 수집기를 등록한다.
 */

export const TREND_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const SUPPORTED_INSIGHT_KINDS = ["trend_timeseries"] as const;
export type InsightKind = (typeof SUPPORTED_INSIGHT_KINDS)[number];

/** trend_timeseries 의 payload JSON 항목 (직렬화 형태). */
export interface TrendSeriesPoint {
  label: string;
  /** 구간 시작 (ISO). */
  periodStart: string;
  /** 상대 관심도 0~100 (절대 검색량 아님). */
  value: number;
}

export type InsightOutcome =
  | {
      status: "ok";
      payload: TrendSeriesPoint[];
      capturedAt: string;
      fromCache: boolean;
      source: string;
    }
  | { status: "error"; error: string };

export interface KeywordInsightsReport {
  keyword: string;
  countryCode: string;
  insights: Partial<Record<InsightKind, InsightOutcome>>;
}

/** collect.ts 와 같은 키워드 정규화 규칙 (공백 정리 + 소문자). */
function normalizeKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

function serializePoints(points: readonly TrendPoint[]): TrendSeriesPoint[] {
  return points.map((point) => ({
    label: point.label,
    periodStart: point.periodStart.toISOString(),
    value: point.value,
  }));
}

function parseStoredPoints(json: string): TrendSeriesPoint[] | null {
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return null;
    const points: TrendSeriesPoint[] = [];
    for (const item of value) {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof (item as TrendSeriesPoint).periodStart !== "string" ||
        typeof (item as TrendSeriesPoint).value !== "number"
      ) {
        return null;
      }
      points.push({
        label: typeof (item as TrendSeriesPoint).label === "string" ? (item as TrendSeriesPoint).label : "",
        periodStart: (item as TrendSeriesPoint).periodStart,
        value: (item as TrendSeriesPoint).value,
      });
    }
    return points;
  } catch {
    return null;
  }
}

async function findFreshInsight(input: {
  normalizedKeyword: string;
  countryCode: string;
  kind: InsightKind;
  maxAgeMs: number;
}) {
  const [latest] = await db
    .select()
    .from(keywordInsights)
    .where(
      and(
        eq(keywordInsights.normalizedKeyword, input.normalizedKeyword),
        eq(keywordInsights.countryCode, input.countryCode),
        eq(keywordInsights.kind, input.kind)
      )
    )
    .orderBy(desc(keywordInsights.capturedAt))
    .limit(1);
  if (!latest) return null;
  if (Date.now() - latest.capturedAt.getTime() > input.maxAgeMs) return null;
  return latest;
}

async function collectTrendTimeseries(input: {
  keyword: string;
  countryCode: string;
  forceRefresh: boolean;
}): Promise<InsightOutcome> {
  const normalized = normalizeKeyword(input.keyword);

  if (!input.forceRefresh) {
    const cached = await findFreshInsight({
      normalizedKeyword: normalized,
      countryCode: input.countryCode,
      kind: "trend_timeseries",
      maxAgeMs: TREND_TTL_MS,
    });
    if (cached) {
      const points = parseStoredPoints(cached.payload);
      // 저장 payload 가 손상됐으면 캐시를 버리고 재수집으로 진행한다.
      if (points !== null) {
        return {
          status: "ok",
          payload: points,
          capturedAt: cached.capturedAt.toISOString(),
          fromCache: true,
          source: cached.source,
        };
      }
    }
  }

  const result = await fetchTrendsTimeseries({
    q: input.keyword,
    geo: input.countryCode,
  });
  const payload = serializePoints(result.points);

  await db.insert(keywordInsights).values({
    id: newId("kwi"),
    keyword: input.keyword.trim(),
    normalizedKeyword: normalized,
    countryCode: input.countryCode,
    kind: "trend_timeseries",
    payload: JSON.stringify(payload),
    source: "talordata-trends",
    capturedAt: result.capturedAt,
  });

  return {
    status: "ok",
    payload,
    capturedAt: result.capturedAt.toISOString(),
    fromCache: false,
    source: "talordata-trends",
  };
}

export async function getKeywordInsights(input: {
  keyword: string;
  countryCode: string;
  kinds: readonly InsightKind[];
  forceRefresh?: boolean;
}): Promise<KeywordInsightsReport> {
  const countryCode = input.countryCode.toUpperCase();
  const insights: Partial<Record<InsightKind, InsightOutcome>> = {};

  // kind 별 순차 수집 (제공사 부하 억제). 실패는 해당 kind 에만 기록한다.
  for (const kind of new Set(input.kinds)) {
    try {
      if (kind === "trend_timeseries") {
        insights[kind] = await collectTrendTimeseries({
          keyword: input.keyword,
          countryCode,
          forceRefresh: input.forceRefresh ?? false,
        });
      }
    } catch (error) {
      insights[kind] = {
        status: "error",
        error:
          error instanceof ApiError
            ? error.message
            : "인사이트를 수집하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      };
    }
  }

  return { keyword: input.keyword, countryCode, insights };
}
