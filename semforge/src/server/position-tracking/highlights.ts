import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { keywordMetrics, serpSnapshots, trackedKeywords } from "@/db/schema";
import { normalizeDomain } from "@/lib/analytics/metrics";
import type { AuthContext } from "@/lib/session";
import {
  inferCountryCode,
  normalizeKeyword,
  requireCampaign,
  snapshotEngine,
} from "@/server/position-tracking/insights";
import { ctrForPosition, TRAFFIC_MODEL } from "@/server/position-tracking/overview";

/**
 * 현황 하단 하이라이트 집계 (상위/효율/비효율 키워드, 페이지 브레이크다운).
 *
 * 순위·URL 은 전부 실측(tracked_keywords / serp_snapshots)이고,
 * "가시성 기여/획득/손실"과 "예상 트래픽"은 CTR 곡선(clone-traffic-v1)
 * 계산식이다. UI 는 provenance 배지를 함께 표시해야 한다.
 */

const HIGHLIGHT_LIMIT = 10;

export interface HighlightKeyword {
  keyword: string;
  position: number | null;
  previousPosition: number | null;
  /** 캠페인 내 가시성 기여 % (CTR 합 대비). 계산식 값 */
  visibilityShare: number | null;
  /** CTR 곡선 기준 가시성 변화 (양수 = 획득). 계산식 값 */
  visibilityDelta: number | null;
}

export interface KeywordHighlights {
  campaignId: string;
  hasData: boolean;
  model: typeof TRAFFIC_MODEL;
  /** 순위 오름차순 상위 키워드 */
  top: HighlightKeyword[];
  /** 직전 대비 가시성 획득 순 (효율적인 키워드) */
  gainers: HighlightKeyword[];
  /** 직전 대비 가시성 손실 순 (비효율적인 키워드) */
  losers: HighlightKeyword[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 상위/효율/비효율 키워드. 효율성은 CTR 곡선 기반 가시성 변화로 정렬한다. */
export async function getKeywordHighlights(
  auth: AuthContext,
  campaignId: string
): Promise<KeywordHighlights> {
  await requireCampaign(auth, campaignId);

  const keywords = await db
    .select({
      keyword: trackedKeywords.keyword,
      position: trackedKeywords.position,
      previousPosition: trackedKeywords.previousPosition,
    })
    .from(trackedKeywords)
    .where(
      and(
        eq(trackedKeywords.campaignId, campaignId),
        isNull(trackedKeywords.deletedAt)
      )
    );

  const ranked = keywords.filter((row) => row.position !== null);
  const ctrTotal = ranked.reduce((sum, row) => sum + ctrForPosition(row.position), 0);

  const withMetrics: HighlightKeyword[] = keywords.map((row) => {
    const currentCtr = ctrForPosition(row.position);
    const previousCtr = ctrForPosition(row.previousPosition);
    const touched = row.position !== null || row.previousPosition !== null;
    return {
      keyword: row.keyword,
      position: row.position,
      previousPosition: row.previousPosition,
      visibilityShare:
        row.position !== null && ctrTotal > 0
          ? round2((currentCtr / ctrTotal) * 100)
          : null,
      visibilityDelta: touched ? round2((currentCtr - previousCtr) * 100) : null,
    };
  });

  const top = withMetrics
    .filter((row) => row.position !== null)
    .sort((a, b) => a.position! - b.position! || a.keyword.localeCompare(b.keyword))
    .slice(0, HIGHLIGHT_LIMIT);

  const gainers = withMetrics
    .filter((row) => (row.visibilityDelta ?? 0) > 0)
    .sort((a, b) => b.visibilityDelta! - a.visibilityDelta!)
    .slice(0, HIGHLIGHT_LIMIT);

  const losers = withMetrics
    .filter((row) => (row.visibilityDelta ?? 0) < 0)
    .sort((a, b) => a.visibilityDelta! - b.visibilityDelta!)
    .slice(0, HIGHLIGHT_LIMIT);

  return {
    campaignId,
    hasData: ranked.length > 0 || gainers.length > 0 || losers.length > 0,
    model: TRAFFIC_MODEL,
    top,
    gainers,
    losers,
  };
}

/* ------------------------------------------------------------------ */
/* 페이지 브레이크다운                                                  */
/* ------------------------------------------------------------------ */

export interface PageBreakdownRow {
  url: string;
  /** 이 URL 이 순위에 오른 추적 키워드 수 (최신 스냅샷 기준) */
  keywords: number;
  avgPosition: number;
  /** 직전 스냅샷 대비 평균 포지션 변화 (음수 = 개선). 비교 불가면 null */
  avgPositionDiff: number | null;
  /** CTR 곡선 × 검색량 예상 트래픽. 계산식 값 */
  estTraffic: number;
  estTrafficDiff: number | null;
}

export interface PagesBreakdown {
  campaignId: string;
  hasData: boolean;
  model: typeof TRAFFIC_MODEL;
  /** 최신 스냅샷 시점 */
  capturedAt: string | null;
  pages: PageBreakdownRow[];
}

interface SnapshotHit {
  url: string;
  position: number;
}

/**
 * 키워드별 최신·직전 스냅샷에서 자사 도메인 히트를 뽑는다.
 * 직전 스냅샷이 없는 키워드는 diff 계산에서 제외한다 (null 처리).
 */
export async function getPagesBreakdown(
  auth: AuthContext,
  campaignId: string
): Promise<PagesBreakdown> {
  const campaign = await requireCampaign(auth, campaignId);
  const engine = snapshotEngine(campaign);
  if (!engine) {
    return {
      campaignId,
      hasData: false,
      model: TRAFFIC_MODEL,
      capturedAt: null,
      pages: [],
    };
  }

  const keywords = await db
    .select({
      id: trackedKeywords.id,
      keyword: trackedKeywords.keyword,
      volume: trackedKeywords.volume,
    })
    .from(trackedKeywords)
    .where(
      and(
        eq(trackedKeywords.campaignId, campaignId),
        isNull(trackedKeywords.deletedAt)
      )
    );
  if (keywords.length === 0) {
    return {
      campaignId,
      hasData: false,
      model: TRAFFIC_MODEL,
      capturedAt: null,
      pages: [],
    };
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
    )
    // 정규화 키워드당 가장 최근 기간의 메트릭 하나만 쓴다 (collect.ts 와 동일 규칙).
    .orderBy(desc(keywordMetrics.periodStart));
  const metricByKeyword = new Map<string, string>();
  for (const row of metricRows) {
    if (!metricByKeyword.has(row.normalizedKeyword)) {
      metricByKeyword.set(row.normalizedKeyword, row.id);
    }
  }
  const metricIds = [...metricByKeyword.values()];
  if (metricIds.length === 0) {
    return {
      campaignId,
      hasData: false,
      model: TRAFFIC_MODEL,
      capturedAt: null,
      pages: [],
    };
  }

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
        eq(serpSnapshots.isAd, false)
      )
    )
    .orderBy(desc(serpSnapshots.capturedAt));

  const ownDomain = normalizeDomain(campaign.domain);
  const isOwn = (domain: string) => {
    const normalized = normalizeDomain(domain);
    return (
      ownDomain !== "" &&
      (normalized === ownDomain || normalized.endsWith(`.${ownDomain}`))
    );
  };

  // metricId 별 capturedAt 내림차순 순서를 유지하면서 최신·직전 시점을 찾는다.
  interface MetricTimeline {
    latestAt: number | null;
    previousAt: number | null;
    latestHit: SnapshotHit | null;
    previousHit: SnapshotHit | null;
  }
  const timelines = new Map<string, MetricTimeline>();
  for (const row of rows) {
    const timeline = timelines.get(row.keywordMetricId) ?? {
      latestAt: null,
      previousAt: null,
      latestHit: null,
      previousHit: null,
    };
    const at = row.capturedAt.getTime();
    if (timeline.latestAt === null) timeline.latestAt = at;
    let slot: "latest" | "previous" | null = null;
    if (at === timeline.latestAt) slot = "latest";
    else {
      if (timeline.previousAt === null) timeline.previousAt = at;
      if (at === timeline.previousAt) slot = "previous";
    }
    // 최신·직전 이외의 과거 시점은 페이지 diff 에 쓰지 않는다.
    if (slot && isOwn(row.domain)) {
      const key = slot === "latest" ? "latestHit" : "previousHit";
      const existing = timeline[key];
      if (!existing || row.position < existing.position) {
        timeline[key] = { url: row.url, position: row.position };
      }
    }
    timelines.set(row.keywordMetricId, timeline);
  }

  interface PageAggregate {
    url: string;
    keywords: number;
    positionSum: number;
    estTraffic: number;
    previousKeywords: number;
    previousPositionSum: number;
    previousTraffic: number;
  }
  const byUrl = new Map<string, PageAggregate>();
  let capturedAt: number | null = null;

  for (const keyword of keywords) {
    const metricId = metricByKeyword.get(normalizeKeyword(keyword.keyword));
    if (!metricId) continue;
    const timeline = timelines.get(metricId);
    if (!timeline) continue;
    if (timeline.latestAt !== null && (capturedAt === null || timeline.latestAt > capturedAt)) {
      capturedAt = timeline.latestAt;
    }

    if (timeline.latestHit) {
      const aggregate = byUrl.get(timeline.latestHit.url) ?? {
        url: timeline.latestHit.url,
        keywords: 0,
        positionSum: 0,
        estTraffic: 0,
        previousKeywords: 0,
        previousPositionSum: 0,
        previousTraffic: 0,
      };
      aggregate.keywords += 1;
      aggregate.positionSum += timeline.latestHit.position;
      aggregate.estTraffic +=
        (keyword.volume ?? 0) * ctrForPosition(timeline.latestHit.position);
      byUrl.set(timeline.latestHit.url, aggregate);
    }
    if (timeline.previousHit) {
      const aggregate = byUrl.get(timeline.previousHit.url) ?? {
        url: timeline.previousHit.url,
        keywords: 0,
        positionSum: 0,
        estTraffic: 0,
        previousKeywords: 0,
        previousPositionSum: 0,
        previousTraffic: 0,
      };
      aggregate.previousKeywords += 1;
      aggregate.previousPositionSum += timeline.previousHit.position;
      aggregate.previousTraffic +=
        (keyword.volume ?? 0) * ctrForPosition(timeline.previousHit.position);
      byUrl.set(timeline.previousHit.url, aggregate);
    }
  }

  const pages: PageBreakdownRow[] = [...byUrl.values()]
    .filter((aggregate) => aggregate.keywords > 0)
    .map((aggregate) => {
      const avgPosition = round2(aggregate.positionSum / aggregate.keywords);
      const previousAvg =
        aggregate.previousKeywords > 0
          ? aggregate.previousPositionSum / aggregate.previousKeywords
          : null;
      return {
        url: aggregate.url,
        keywords: aggregate.keywords,
        avgPosition,
        avgPositionDiff:
          previousAvg !== null ? round2(avgPosition - previousAvg) : null,
        estTraffic: round2(aggregate.estTraffic),
        estTrafficDiff:
          aggregate.previousKeywords > 0
            ? round2(aggregate.estTraffic - aggregate.previousTraffic)
            : null,
      };
    })
    .sort((a, b) => b.estTraffic - a.estTraffic || a.avgPosition - b.avgPosition);

  return {
    campaignId,
    hasData: pages.length > 0,
    model: TRAFFIC_MODEL,
    capturedAt: capturedAt !== null ? new Date(capturedAt).toISOString() : null,
    pages,
  };
}
