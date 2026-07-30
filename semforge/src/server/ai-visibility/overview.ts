import { and, desc, eq, inArray, isNull, max } from "drizzle-orm";
import { db } from "@/db/client";
import { aiVisibilityQueries, aiVisibilitySnapshots } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { normalizeDomain } from "@/lib/analytics/metrics";
import type { AuthContext } from "@/lib/session";

const TREND_SNAPSHOT_LIMIT = 200;

function parseJsonArray(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export interface AiVisibilityQueryStatus {
  id: string;
  query: string;
  countryCode: string;
  device: string;
  aioPresent: boolean | null;
  cited: boolean | null;
  citedUrl: string | null;
  organicPosition: number | null;
  features: string[];
  lastCapturedAt: string | null;
}

export interface AiVisibilityTrendPoint {
  date: string;
  collected: number;
  aioPresent: number;
}

export interface AiVisibilityOverview {
  domain: string;
  stats: {
    queryCount: number;
    collectedCount: number;
    aioCount: number;
    /** 인용 판정이 가능한 AIO 건수 (제공사가 본문을 준 경우). */
    judgeableAioCount: number;
    citedCount: number;
    /** AIO는 있으나 제공사 미제공으로 인용 판정 불가인 건수. */
    unknownCitationCount: number;
    lastCollectedAt: string | null;
  };
  trend: AiVisibilityTrendPoint[];
  /** AIO 인용 소스로 자주 확인되는 외부 도메인 (자사 제외, 실측 기반). */
  topCitedDomains: { domain: string; count: number }[];
  queries: AiVisibilityQueryStatus[];
}

/** 도메인의 AI 가시성 개요. 스냅샷 조회만 하며 외부 API 비용은 없다. */
export async function getAiVisibilityOverview(
  auth: AuthContext,
  domainInput: string
): Promise<AiVisibilityOverview> {
  const domain = normalizeDomain(domainInput);
  if (!domain) {
    throw new ApiError("VALIDATION_ERROR", "유효한 도메인을 입력해 주세요.");
  }

  const queries = await db
    .select()
    .from(aiVisibilityQueries)
    .where(
      and(
        eq(aiVisibilityQueries.workspaceId, auth.workspaceId),
        eq(aiVisibilityQueries.domain, domain),
        isNull(aiVisibilityQueries.deletedAt)
      )
    )
    .orderBy(desc(aiVisibilityQueries.createdAt));

  if (queries.length === 0) {
    return {
      domain,
      stats: {
        queryCount: 0,
        collectedCount: 0,
        aioCount: 0,
        judgeableAioCount: 0,
        citedCount: 0,
        unknownCitationCount: 0,
        lastCollectedAt: null,
      },
      trend: [],
      topCitedDomains: [],
      queries: [],
    };
  }

  const queryIds = queries.map((query) => query.id);

  // 쿼리별 최신 스냅샷 시각
  const latestRows = await db
    .select({ queryId: aiVisibilitySnapshots.queryId, latest: max(aiVisibilitySnapshots.capturedAt) })
    .from(aiVisibilitySnapshots)
    .where(inArray(aiVisibilitySnapshots.queryId, queryIds))
    .groupBy(aiVisibilitySnapshots.queryId);
  const latestByQuery = new Map(latestRows.map((row) => [row.queryId, row.latest]));

  const statuses: AiVisibilityQueryStatus[] = [];
  const citedDomainCount = new Map<string, number>();
  let lastCollectedAt: Date | null = null;

  for (const query of queries) {
    const latest = latestByQuery.get(query.id);
    if (!latest) {
      statuses.push({
        id: query.id,
        query: query.query,
        countryCode: query.countryCode,
        device: query.device,
        aioPresent: null,
        cited: null,
        citedUrl: null,
        organicPosition: null,
        features: [],
        lastCapturedAt: null,
      });
      continue;
    }

    const [snapshot] = await db
      .select()
      .from(aiVisibilitySnapshots)
      .where(
        and(
          eq(aiVisibilitySnapshots.queryId, query.id),
          eq(aiVisibilitySnapshots.capturedAt, latest)
        )
      )
      .orderBy(desc(aiVisibilitySnapshots.capturedAt))
      .limit(1);

    if (!snapshot) {
      statuses.push({
        id: query.id,
        query: query.query,
        countryCode: query.countryCode,
        device: query.device,
        aioPresent: null,
        cited: null,
        citedUrl: null,
        organicPosition: null,
        features: [],
        lastCapturedAt: null,
      });
      continue;
    }

    if (!lastCollectedAt || snapshot.capturedAt > lastCollectedAt) {
      lastCollectedAt = snapshot.capturedAt;
    }
    for (const citedDomain of parseJsonArray(snapshot.citedDomains)) {
      if (citedDomain === domain || citedDomain.endsWith(`.${domain}`)) continue;
      citedDomainCount.set(citedDomain, (citedDomainCount.get(citedDomain) ?? 0) + 1);
    }

    statuses.push({
      id: query.id,
      query: query.query,
      countryCode: query.countryCode,
      device: query.device,
      aioPresent: snapshot.aioPresent,
      cited: snapshot.cited,
      citedUrl: snapshot.citedUrl,
      organicPosition: snapshot.organicPosition,
      features: parseJsonArray(snapshot.features),
      lastCapturedAt: snapshot.capturedAt.toISOString(),
    });
  }

  // 추이: 최근 스냅샷들을 날짜(UTC) 단위로 묶어 AIO 출현 건수를 집계한다.
  const history = await db
    .select({
      queryId: aiVisibilitySnapshots.queryId,
      aioPresent: aiVisibilitySnapshots.aioPresent,
      capturedAt: aiVisibilitySnapshots.capturedAt,
    })
    .from(aiVisibilitySnapshots)
    .where(inArray(aiVisibilitySnapshots.queryId, queryIds))
    .orderBy(desc(aiVisibilitySnapshots.capturedAt))
    .limit(TREND_SNAPSHOT_LIMIT);

  const trendByDate = new Map<string, { collected: number; aioPresent: number }>();
  for (const row of history) {
    const date = row.capturedAt.toISOString().slice(0, 10);
    const bucket = trendByDate.get(date) ?? { collected: 0, aioPresent: 0 };
    bucket.collected += 1;
    if (row.aioPresent) bucket.aioPresent += 1;
    trendByDate.set(date, bucket);
  }
  const trend = [...trendByDate.entries()]
    .map(([date, bucket]) => ({ date, ...bucket }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const collectedStatuses = statuses.filter((status) => status.aioPresent !== null);
  const aioStatuses = collectedStatuses.filter((status) => status.aioPresent === true);

  return {
    domain,
    stats: {
      queryCount: queries.length,
      collectedCount: collectedStatuses.length,
      aioCount: aioStatuses.length,
      judgeableAioCount: aioStatuses.filter((status) => status.cited !== null).length,
      citedCount: statuses.filter((status) => status.cited === true).length,
      unknownCitationCount: aioStatuses.filter((status) => status.cited === null).length,
      lastCollectedAt: lastCollectedAt ? lastCollectedAt.toISOString() : null,
    },
    trend,
    topCitedDomains: [...citedDomainCount.entries()]
      .map(([citedDomain, count]) => ({ domain: citedDomain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    queries: statuses,
  };
}
