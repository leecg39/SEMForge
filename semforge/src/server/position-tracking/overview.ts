import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  keywordMetrics,
  positionTrackingCampaigns,
  positionTrackingObservations,
  positionTrackingRunItems,
  positionTrackingRuns,
  positionTrackingVisibilityHistory,
  serpSnapshots,
  trackedKeywords,
} from "@/db/schema";
import { normalizeDomain } from "@/lib/analytics/metrics";
import type { AuthContext } from "@/lib/session";
import {
  bucketOf,
  findDomainPosition,
  inferCountryCode,
  normalizeKeyword,
  requireCampaign,
  snapshotEngine,
  type RankBucketKey,
} from "@/server/position-tracking/insights";

/**
 * 포지션 추적 현황(landscape) 집계.
 *
 * - 순위·버킷·페이지는 전부 실측(serp_snapshots / tracked_keywords)이다.
 * - 예상 트래픽만 계산식(clone-traffic-v1)이며, UI 는 반드시 provenance 배지를
 *   함께 표시해야 한다. 검색량(volume)이 없는 키워드는 추정하지 않고 제외한다.
 */

/**
 * clone-traffic-v1 — 순위별 오가닉 CTR 근사 곡선.
 * 공개된 업계 CTR 스터디(1위 ≈ 28~32%, 지수 감쇠)를 단순화한 상수 테이블로,
 * 예상 트래픽 = Σ(volume × ctr(position)) 로만 사용한다. ML 모델이 아니다.
 */
const CTR_CURVE: readonly number[] = [
  0.32, 0.15, 0.1, 0.07, 0.055, 0.045, 0.038, 0.032, 0.028, 0.025,
];

export const TRAFFIC_MODEL = "clone-traffic-v1" as const;

export function ctrForPosition(position: number | null): number {
  if (position === null || position < 1) return 0;
  if (position <= CTR_CURVE.length) return CTR_CURVE[position - 1];
  if (position <= 20) return 0.015;
  if (position <= 50) return 0.008;
  if (position <= 100) return 0.003;
  return 0;
}

/* ------------------------------------------------------------------ */
/* 랜딩: 프로젝트 목록 요약                                             */
/* ------------------------------------------------------------------ */

export interface CampaignListItem {
  id: string;
  name: string;
  domain: string;
  location: string;
  device: string;
  searchEngine: string;
  status: string;
  /** 최신 가시성 (수집 이력이 없으면 null) */
  visibility: number | null;
  /** 직전 수집 대비 가시성 차이 (이력이 2건 미만이면 null) */
  visibilityDiff: number | null;
  /** 직전 대비 순위가 오른 키워드 수 (신규 진입 포함) */
  improved: number;
  /** 직전 대비 순위가 내린 키워드 수 (순위권 이탈 포함) */
  declined: number;
  keywordCount: number;
  /** 마지막 수집 시각 (ISO). 수집 전이면 null */
  lastCollectedAt: string | null;
  /** 키워드가 하나도 없으면 false — 목록에서 "설정" 버튼을 노출한다 */
  configured: boolean;
}

/** 랜딩 프로젝트 목록. 캠페인별 최신 지표를 실측 데이터로만 요약한다. */
export async function getCampaignListSummary(
  auth: AuthContext
): Promise<CampaignListItem[]> {
  const campaigns = await db
    .select()
    .from(positionTrackingCampaigns)
    .where(
      and(
        eq(positionTrackingCampaigns.workspaceId, auth.workspaceId),
        isNull(positionTrackingCampaigns.deletedAt)
      )
    )
    .orderBy(desc(positionTrackingCampaigns.updatedAt));
  if (campaigns.length === 0) return [];

  const campaignIds = campaigns.map((campaign) => campaign.id);

  const keywordRows = await db
    .select({
      campaignId: trackedKeywords.campaignId,
      position: trackedKeywords.position,
      previousPosition: trackedKeywords.previousPosition,
    })
    .from(trackedKeywords)
    .where(
      and(
        inArray(trackedKeywords.campaignId, campaignIds),
        isNull(trackedKeywords.deletedAt)
      )
    );

  const historyRows = await db
    .select({
      campaignId: positionTrackingVisibilityHistory.campaignId,
      visibility: positionTrackingVisibilityHistory.visibility,
      capturedAt: positionTrackingVisibilityHistory.capturedAt,
    })
    .from(positionTrackingVisibilityHistory)
    .where(inArray(positionTrackingVisibilityHistory.campaignId, campaignIds))
    .orderBy(desc(positionTrackingVisibilityHistory.capturedAt));

  interface KeywordAgg {
    count: number;
    improved: number;
    declined: number;
  }
  const keywordAgg = new Map<string, KeywordAgg>();
  for (const row of keywordRows) {
    const agg = keywordAgg.get(row.campaignId) ?? {
      count: 0,
      improved: 0,
      declined: 0,
    };
    agg.count += 1;
    const { position, previousPosition } = row;
    if (position !== null && previousPosition === null) agg.improved += 1;
    else if (position === null && previousPosition !== null) agg.declined += 1;
    else if (position !== null && previousPosition !== null) {
      if (position < previousPosition) agg.improved += 1;
      else if (position > previousPosition) agg.declined += 1;
    }
    keywordAgg.set(row.campaignId, agg);
  }

  // capturedAt 내림차순이므로 캠페인별 첫 두 건이 최신·직전이다.
  const latestHistory = new Map<string, { visibility: number; capturedAt: Date }>();
  const previousHistory = new Map<string, number>();
  for (const row of historyRows) {
    if (!latestHistory.has(row.campaignId)) {
      latestHistory.set(row.campaignId, {
        visibility: row.visibility,
        capturedAt: row.capturedAt,
      });
    } else if (!previousHistory.has(row.campaignId)) {
      previousHistory.set(row.campaignId, row.visibility);
    }
  }

  return campaigns.map((campaign) => {
    const agg = keywordAgg.get(campaign.id) ?? { count: 0, improved: 0, declined: 0 };
    const latest = latestHistory.get(campaign.id) ?? null;
    const previous = previousHistory.get(campaign.id);
    return {
      id: campaign.id,
      name: campaign.name,
      domain: campaign.domain,
      location: campaign.location,
      device: campaign.device,
      searchEngine: campaign.searchEngine,
      status: campaign.status,
      visibility: latest?.visibility ?? campaign.visibility,
      visibilityDiff:
        latest && previous !== undefined ? latest.visibility - previous : null,
      improved: agg.improved,
      declined: agg.declined,
      keywordCount: agg.count,
      lastCollectedAt: latest?.capturedAt.toISOString() ?? null,
      configured: agg.count > 0,
    };
  });
}

/* ------------------------------------------------------------------ */
/* 상세: KPI 카드 + 키워드 버킷 카드                                    */
/* ------------------------------------------------------------------ */

export interface CampaignOverview {
  campaignId: string;
  domain: string;
  visibility: {
    current: number | null;
    diff: number | null;
    series: { capturedAt: string; visibility: number }[];
  };
  avgPosition: {
    current: number | null;
    diff: number | null;
    rankedCount: number;
  };
  estimatedTraffic: {
    current: number | null;
    diff: number | null;
    /** volume 과 순위가 모두 있어 계산에 포함된 키워드 수 */
    coveredKeywords: number;
    totalKeywords: number;
    model: typeof TRAFFIC_MODEL;
  };
  /** 상위 N 버킷 카운트와 직전 대비 진입/이탈 (누적 기준: top10 = 1~10위) */
  topBuckets: {
    key: "top3" | "top10" | "top20" | "top100";
    threshold: number;
    count: number;
    entered: number;
    left: number;
  }[];
  rising: number;
  falling: number;
  newRanked: number;
  dropped: number;
  keywordCount: number;
  /** 최신 종료 실행의 키워드별 공급자 실측값. KPI 계산 근거를 화면에 공개한다. */
  latestCollection: {
    runId: string;
    trigger: "initial" | "manual" | "scheduled";
    status: "completed" | "partial" | "failed" | "cancelled";
    total: number;
    succeeded: number;
    failed: number;
    completedAt: string | null;
    capturedAt: string | null;
    results: {
      keywordId: string;
      keyword: string;
      status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
      attempts: number;
      error: string | null;
      measurementKind: "organic_rank" | "citation_rank" | null;
      position: number | null;
      url: string | null;
      mentioned: boolean;
      localPackPosition: number | null;
      features: string[];
      citationCount: number;
      source: string | null;
      capturedAt: string | null;
    }[];
  } | null;
}

type LatestCollectionStatus = NonNullable<CampaignOverview["latestCollection"]>["status"];

const TOP_THRESHOLDS = [
  { key: "top3", threshold: 3 },
  { key: "top10", threshold: 10 },
  { key: "top20", threshold: 20 },
  { key: "top100", threshold: 100 },
] as const;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseJsonArray(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseStringArray(value: string | null): string[] {
  return parseJsonArray(value).filter(
    (item): item is string => typeof item === "string"
  );
}

/** KPI 카드 집계. 순위·검색량은 실측이고 예상 트래픽만 clone-traffic-v1 계산식이다. */
export async function getCampaignOverview(
  auth: AuthContext,
  campaignId: string
): Promise<CampaignOverview> {
  const campaign = await requireCampaign(auth, campaignId);

  const keywords = await db
    .select({
      position: trackedKeywords.position,
      previousPosition: trackedKeywords.previousPosition,
      volume: trackedKeywords.volume,
    })
    .from(trackedKeywords)
    .where(
      and(
        eq(trackedKeywords.campaignId, campaignId),
        isNull(trackedKeywords.deletedAt)
      )
    );

  const history = await db
    .select({
      visibility: positionTrackingVisibilityHistory.visibility,
      capturedAt: positionTrackingVisibilityHistory.capturedAt,
    })
    .from(positionTrackingVisibilityHistory)
    .where(eq(positionTrackingVisibilityHistory.campaignId, campaignId))
    .orderBy(desc(positionTrackingVisibilityHistory.capturedAt))
    .limit(30);

  const [latestRun] = await db
    .select({
      id: positionTrackingRuns.id,
      trigger: positionTrackingRuns.trigger,
      status: positionTrackingRuns.status,
      total: positionTrackingRuns.totalCount,
      succeeded: positionTrackingRuns.successCount,
      failed: positionTrackingRuns.failedCount,
      completedAt: positionTrackingRuns.completedAt,
    })
    .from(positionTrackingRuns)
    .where(
      and(
        eq(positionTrackingRuns.campaignId, campaignId),
        inArray(positionTrackingRuns.status, ["completed", "partial", "failed", "cancelled"])
      )
    )
    .orderBy(desc(positionTrackingRuns.completedAt), desc(positionTrackingRuns.createdAt))
    .limit(1);

  const latestRows = latestRun
    ? await db
        .select({
          keywordId: trackedKeywords.id,
          keyword: trackedKeywords.keyword,
          status: positionTrackingRunItems.status,
          attempts: positionTrackingRunItems.attemptCount,
          error: positionTrackingRunItems.errorMessage,
          measurementKind: positionTrackingObservations.measurementKind,
          position: positionTrackingObservations.position,
          url: positionTrackingObservations.url,
          mentioned: positionTrackingObservations.mentioned,
          localPackPosition: positionTrackingObservations.localPackPosition,
          features: positionTrackingObservations.features,
          citations: positionTrackingObservations.citations,
          source: positionTrackingObservations.source,
          capturedAt: positionTrackingObservations.capturedAt,
        })
        .from(positionTrackingRunItems)
        .innerJoin(
          trackedKeywords,
          eq(trackedKeywords.id, positionTrackingRunItems.trackedKeywordId)
        )
        .leftJoin(
          positionTrackingObservations,
          and(
            eq(positionTrackingObservations.runId, latestRun.id),
            eq(
              positionTrackingObservations.trackedKeywordId,
              positionTrackingRunItems.trackedKeywordId
            )
          )
        )
        .where(eq(positionTrackingRunItems.runId, latestRun.id))
        .orderBy(asc(trackedKeywords.createdAt))
    : [];

  const latestResults = latestRows.map((row) => ({
    keywordId: row.keywordId,
    keyword: row.keyword,
    status: row.status,
    attempts: row.attempts,
    error: row.error,
    measurementKind: row.measurementKind,
    position: row.position,
    url: row.url,
    mentioned: row.mentioned ?? false,
    localPackPosition: row.localPackPosition,
    features: parseStringArray(row.features),
    citationCount: parseJsonArray(row.citations).length,
    source: row.source,
    capturedAt: row.capturedAt?.toISOString() ?? null,
  }));
  const latestCapturedAt = latestRows.reduce<Date | null>((latest, row) => {
    if (!row.capturedAt) return latest;
    return !latest || row.capturedAt > latest ? row.capturedAt : latest;
  }, null);

  const series = history
    .slice()
    .reverse()
    .map((row) => ({
      capturedAt: row.capturedAt.toISOString(),
      visibility: row.visibility,
    }));
  const currentVisibility = history[0]?.visibility ?? campaign.visibility ?? null;
  const previousVisibility = history[1]?.visibility ?? null;

  const ranked = keywords.filter((row) => row.position !== null);
  const previouslyRanked = keywords.filter((row) => row.previousPosition !== null);

  const avgCurrent =
    ranked.length > 0
      ? round2(ranked.reduce((sum, row) => sum + row.position!, 0) / ranked.length)
      : null;
  const avgPrevious =
    previouslyRanked.length > 0
      ? round2(
          previouslyRanked.reduce((sum, row) => sum + row.previousPosition!, 0) /
            previouslyRanked.length
        )
      : null;

  let trafficCurrent = 0;
  let trafficPrevious = 0;
  let covered = 0;
  for (const row of keywords) {
    if (row.volume === null) continue;
    covered += 1;
    if (row.position !== null) {
      trafficCurrent += row.volume * ctrForPosition(row.position);
    }
    if (row.previousPosition !== null) {
      trafficPrevious += row.volume * ctrForPosition(row.previousPosition);
    }
  }

  const topBuckets = TOP_THRESHOLDS.map(({ key, threshold }) => {
    let count = 0;
    let entered = 0;
    let left = 0;
    for (const row of keywords) {
      const inNow = row.position !== null && row.position <= threshold;
      const inBefore =
        row.previousPosition !== null && row.previousPosition <= threshold;
      if (inNow) count += 1;
      if (inNow && !inBefore) entered += 1;
      if (!inNow && inBefore) left += 1;
    }
    return { key, threshold, count, entered, left };
  });

  let rising = 0;
  let falling = 0;
  let newRanked = 0;
  let dropped = 0;
  for (const row of keywords) {
    const { position, previousPosition } = row;
    if (position !== null && previousPosition === null) newRanked += 1;
    else if (position === null && previousPosition !== null) dropped += 1;
    else if (position !== null && previousPosition !== null) {
      if (position < previousPosition) rising += 1;
      else if (position > previousPosition) falling += 1;
    }
  }

  return {
    campaignId,
    domain: campaign.domain,
    visibility: {
      current: currentVisibility,
      diff:
        currentVisibility !== null && previousVisibility !== null
          ? currentVisibility - previousVisibility
          : null,
      series,
    },
    avgPosition: {
      current: avgCurrent,
      diff: avgCurrent !== null && avgPrevious !== null ? round2(avgCurrent - avgPrevious) : null,
      rankedCount: ranked.length,
    },
    estimatedTraffic: {
      current: covered > 0 ? round2(trafficCurrent) : null,
      diff:
        covered > 0 && previousVisibility !== null
          ? round2(trafficCurrent - trafficPrevious)
          : null,
      coveredKeywords: covered,
      totalKeywords: keywords.length,
      model: TRAFFIC_MODEL,
    },
    topBuckets,
    rising,
    falling,
    newRanked,
    dropped,
    keywordCount: keywords.length,
    latestCollection: latestRun
      ? {
          runId: latestRun.id,
          trigger: latestRun.trigger,
          // SQL 조건에서 종료 상태만 조회한다. Drizzle의 inArray는 TS union을 축소하지 않는다.
          status: latestRun.status as LatestCollectionStatus,
          total: latestRun.total,
          succeeded: latestRun.succeeded,
          failed: latestRun.failed,
          completedAt: latestRun.completedAt?.toISOString() ?? null,
          capturedAt:
            latestCapturedAt?.toISOString() ?? latestRun.completedAt?.toISOString() ?? null,
          results: latestResults,
        }
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* 상세: 순위 분포 일별 이력                                            */
/* ------------------------------------------------------------------ */

export interface RankHistoryDay {
  /** UTC 기준 날짜 (YYYY-MM-DD) */
  date: string;
  counts: Record<RankBucketKey, number>;
  total: number;
}

export interface RankDistributionHistory {
  campaignId: string;
  days: number;
  hasData: boolean;
  history: RankHistoryDay[];
}

const EMPTY_COUNTS = (): Record<RankBucketKey, number> => ({
  top3: 0,
  top10: 0,
  top20: 0,
  top50: 0,
  top100: 0,
  unranked: 0,
});

/**
 * 일별 순위 분포. 키워드마다 날짜별 최신 스냅샷에서 대상 도메인(기본: 자사)
 * 순위를 버킷으로 집계한다. viewDomain 을 주면 경쟁자 관점으로 다시 집계한다.
 * 스냅샷이 없는 날은 데이터 없음으로 두고 0 으로 채우지 않는다.
 */
export async function getRankDistributionHistory(
  auth: AuthContext,
  campaignId: string,
  days = 14,
  viewDomain?: string
): Promise<RankDistributionHistory> {
  const campaign = await requireCampaign(auth, campaignId);
  const engine = snapshotEngine(campaign);
  const boundedDays = Math.min(Math.max(days, 1), 90);
  if (!engine) {
    return { campaignId, days: boundedDays, hasData: false, history: [] };
  }

  const keywords = await db
    .select({ id: trackedKeywords.id, keyword: trackedKeywords.keyword })
    .from(trackedKeywords)
    .where(
      and(
        eq(trackedKeywords.campaignId, campaignId),
        isNull(trackedKeywords.deletedAt)
      )
    );
  if (keywords.length === 0) {
    return { campaignId, days: boundedDays, hasData: false, history: [] };
  }

  const countryCode = inferCountryCode(campaign.location);
  const device = campaign.device === "mobile" ? "mobile" : "desktop";
  const normalizedList = [...new Set(keywords.map((row) => normalizeKeyword(row.keyword)))];

  const metricRows = await db
    .select({
      id: keywordMetrics.id,
      normalizedKeyword: keywordMetrics.normalizedKeyword,
    })
    .from(keywordMetrics)
    .where(
      and(
        inArray(keywordMetrics.normalizedKeyword, normalizedList),
        eq(keywordMetrics.countryCode, countryCode),
        eq(keywordMetrics.device, device)
      )
    );
  const metricIds = [...new Set(metricRows.map((row) => row.id))];
  if (metricIds.length === 0) {
    return { campaignId, days: boundedDays, hasData: false, history: [] };
  }

  const since = new Date(Date.now() - boundedDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      keywordMetricId: serpSnapshots.keywordMetricId,
      domain: serpSnapshots.domain,
      url: serpSnapshots.url,
      position: serpSnapshots.position,
      capturedAt: serpSnapshots.capturedAt,
    })
    .from(serpSnapshots)
    .where(
      and(
        inArray(serpSnapshots.keywordMetricId, metricIds),
        eq(serpSnapshots.searchEngine, engine),
        eq(serpSnapshots.isAd, false),
        gte(serpSnapshots.capturedAt, since)
      )
    );

  // (metricId, day) 별 최신 capturedAt 스냅샷 묶음만 사용한다.
  interface DaySnapshot {
    capturedAt: number;
    rows: { domain: string; url: string; position: number }[];
  }
  const byMetricDay = new Map<string, DaySnapshot>();
  for (const row of rows) {
    const day = row.capturedAt.toISOString().slice(0, 10);
    const key = `${row.keywordMetricId}:${day}`;
    const capturedAt = row.capturedAt.getTime();
    const existing = byMetricDay.get(key);
    if (!existing || capturedAt > existing.capturedAt) {
      byMetricDay.set(key, {
        capturedAt,
        rows: [{ domain: row.domain, url: row.url, position: row.position }],
      });
    } else if (capturedAt === existing.capturedAt) {
      existing.rows.push({ domain: row.domain, url: row.url, position: row.position });
    }
  }

  const targetDomain = normalizeDomain(viewDomain?.trim() || campaign.domain);
  const byDay = new Map<string, Record<RankBucketKey, number>>();
  for (const [key, snapshot] of byMetricDay) {
    const day = key.slice(key.indexOf(":") + 1);
    const counts = byDay.get(day) ?? EMPTY_COUNTS();
    const own = findDomainPosition(snapshot.rows, targetDomain);
    counts[bucketOf(own?.position ?? null)] += 1;
    byDay.set(day, counts);
  }

  const history: RankHistoryDay[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({
      date,
      counts,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    }));

  return {
    campaignId,
    days: boundedDays,
    hasData: history.length > 0,
    history,
  };
}
