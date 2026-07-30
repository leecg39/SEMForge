import { and, asc, desc, eq, inArray, isNull, max } from "drizzle-orm";
import { db } from "@/db/client";
import {
  keywordMetrics,
  positionTrackingCampaigns,
  positionTrackingCompetitors,
  serpSnapshots,
  trackedKeywords,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { normalizeDomain } from "@/lib/analytics/metrics";
import type { AuthContext } from "@/lib/session";

/**
 * 포지션 추적 인사이트 집계.
 *
 * 두 집계 모두 원천 스토어(serp_snapshots)에 적재된 실제 수집분만 사용한다.
 * 추정치나 모델 값으로 채우지 않으며, 수집 이력이 없으면 hasData=false 로
 * 정직한 빈 상태를 돌려준다.
 */

/** collect.ts 의 정규화 규칙과 동일하게 맞춘다 (collect.ts 내부 함수는 비수출). */
function normalizeKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

/** collect.ts 의 지역 → 국가 추론과 동일 규칙. */
function inferCountryCode(location: string | null | undefined): string {
  if (!location) return "KR";
  return /korea|seoul|대한|서울/i.test(location) ? "KR" : "US";
}

/** 캠페인 소유권 확인. 없으면 404. */
async function requireCampaign(auth: AuthContext, campaignId: string) {
  const [campaign] = await db
    .select()
    .from(positionTrackingCampaigns)
    .where(
      and(
        eq(positionTrackingCampaigns.id, campaignId),
        eq(positionTrackingCampaigns.workspaceId, auth.workspaceId),
        isNull(positionTrackingCampaigns.deletedAt)
      )
    )
    .limit(1);
  if (!campaign) {
    throw new ApiError("NOT_FOUND", "포지션 추적 캠페인을 찾을 수 없습니다.");
  }
  return campaign;
}

type CampaignRow = typeof positionTrackingCampaigns.$inferSelect;

export interface SnapshotSerpRow {
  domain: string;
  url: string;
  position: number;
}

export interface KeywordLatestSnapshot {
  trackedKeywordId: string;
  keyword: string;
  capturedAt: Date;
  rows: SnapshotSerpRow[];
}

/** 캠페인 엔진을 SERP 스냅샷 엔진 값으로 변환. chatgpt 는 SERP 집계 불가라 null. */
function snapshotEngine(campaign: CampaignRow): "google" | "bing" | null {
  if (campaign.searchEngine === "bing") return "bing";
  if (campaign.searchEngine === "google") return "google";
  return null;
}

/**
 * 추적 키워드별 최신 SERP 스냅샷을 읽는다.
 * listTrackedKeywords(src/server/talordata/collect.ts)와 같은 해석 규칙:
 * 캠페인의 국가/기기/엔진 조건에 맞는 최신 기간 메트릭의 최신 capturedAt 행 묶음.
 */
async function loadLatestSnapshotsByKeyword(
  campaign: CampaignRow,
  keywords: { id: string; keyword: string }[]
): Promise<Map<string, KeywordLatestSnapshot>> {
  const result = new Map<string, KeywordLatestSnapshot>();
  if (keywords.length === 0) return result;

  const engine = snapshotEngine(campaign);
  if (!engine) return result;

  const countryCode = inferCountryCode(campaign.location);
  const device = campaign.device === "mobile" ? "mobile" : "desktop";
  const normalizedList = [...new Set(keywords.map((row) => normalizeKeyword(row.keyword)))];

  const metricRows = await db
    .select({
      id: keywordMetrics.id,
      normalizedKeyword: keywordMetrics.normalizedKeyword,
      periodStart: keywordMetrics.periodStart,
    })
    .from(keywordMetrics)
    .where(
      and(
        inArray(keywordMetrics.normalizedKeyword, normalizedList),
        eq(keywordMetrics.countryCode, countryCode),
        eq(keywordMetrics.device, device)
      )
    )
    .orderBy(desc(keywordMetrics.periodStart));

  // 정규화 키워드당 가장 최근 기간의 메트릭 하나만 사용한다.
  const metricByKeyword = new Map<string, string>();
  for (const row of metricRows) {
    if (!metricByKeyword.has(row.normalizedKeyword)) {
      metricByKeyword.set(row.normalizedKeyword, row.id);
    }
  }

  const metricIds = [...new Set(metricRows.map((row) => row.id))];
  if (metricIds.length === 0) return result;

  const latestRows = await db
    .select({
      keywordMetricId: serpSnapshots.keywordMetricId,
      latest: max(serpSnapshots.capturedAt),
    })
    .from(serpSnapshots)
    .where(
      and(
        inArray(serpSnapshots.keywordMetricId, metricIds),
        eq(serpSnapshots.searchEngine, engine)
      )
    )
    .groupBy(serpSnapshots.keywordMetricId);

  const latestByMetric = new Map<string, Date>();
  for (const row of latestRows) {
    if (row.latest) latestByMetric.set(row.keywordMetricId, row.latest);
  }

  for (const keyword of keywords) {
    const metricId = metricByKeyword.get(normalizeKeyword(keyword.keyword));
    const latest = metricId ? latestByMetric.get(metricId) : undefined;
    if (!metricId || !latest) continue;

    const rows = await db
      .select({
        domain: serpSnapshots.domain,
        url: serpSnapshots.url,
        position: serpSnapshots.position,
      })
      .from(serpSnapshots)
      .where(
        and(
          eq(serpSnapshots.keywordMetricId, metricId),
          eq(serpSnapshots.searchEngine, engine),
          eq(serpSnapshots.capturedAt, latest),
          eq(serpSnapshots.isAd, false)
        )
      )
      .orderBy(asc(serpSnapshots.position));

    if (rows.length > 0) {
      result.set(keyword.id, {
        trackedKeywordId: keyword.id,
        keyword: keyword.keyword,
        capturedAt: latest,
        rows,
      });
    }
  }
  return result;
}

/** 스냅샷 행 묶음에서 대상 도메인(서브도메인 포함)의 순위를 찾는다. */
function findDomainPosition(
  rows: SnapshotSerpRow[],
  targetDomain: string
): { position: number; url: string } | null {
  const target = normalizeDomain(targetDomain);
  if (!target) return null;
  for (const row of rows) {
    if (row.domain === target || row.domain.endsWith(`.${target}`)) {
      return { position: row.position, url: row.url };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 순위 분포                                                           */
/* ------------------------------------------------------------------ */

export type RankBucketKey = "top3" | "top10" | "top20" | "top50" | "top100" | "unranked";

export interface RankBucket {
  key: RankBucketKey;
  /** 버킷 순위 범위 (unranked 는 null) */
  min: number | null;
  max: number | null;
  count: number;
  keywords: string[];
}

export interface RankDistribution {
  campaignId: string;
  engine: "google" | "bing";
  totalKeywords: number;
  /** 최신 스냅샷이 존재하는 키워드 수 (집계 모수) */
  collectedKeywords: number;
  /** 한 번도 수집되지 않은 키워드 수 (버킷에서 제외) */
  uncollectedKeywords: number;
  /** 키워드별 최신 스냅샷 중 가장 최근 시각 */
  capturedAt: string | null;
  hasData: boolean;
  buckets: RankBucket[];
}

const BUCKET_RANGES: { key: RankBucketKey; min: number | null; max: number | null }[] = [
  { key: "top3", min: 1, max: 3 },
  { key: "top10", min: 4, max: 10 },
  { key: "top20", min: 11, max: 20 },
  { key: "top50", min: 21, max: 50 },
  { key: "top100", min: 51, max: 100 },
  { key: "unranked", min: null, max: null },
];

function bucketOf(position: number | null): RankBucketKey {
  if (position === null) return "unranked";
  if (position <= 3) return "top3";
  if (position <= 10) return "top10";
  if (position <= 20) return "top20";
  if (position <= 50) return "top50";
  if (position <= 100) return "top100";
  return "unranked";
}

/**
 * 순위 분포 탭 집계.
 * 캠페인 키워드의 최신 스냅샷에서 자사 도메인 순위를 버킷으로 나눈다.
 * 스냅샷이 없는 키워드는 버킷에서 제외하고 uncollectedKeywords 로만 보고한다.
 */
export async function getRankDistribution(
  auth: AuthContext,
  campaignId: string
): Promise<RankDistribution> {
  const campaign = await requireCampaign(auth, campaignId);
  const engine = snapshotEngine(campaign);
  if (!engine) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "ChatGPT 엔진 캠페인은 SERP 순위 분포를 제공할 수 없습니다."
    );
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

  const snapshots = await loadLatestSnapshotsByKeyword(campaign, keywords);

  const buckets: RankBucket[] = BUCKET_RANGES.map((range) => ({
    ...range,
    count: 0,
    keywords: [],
  }));
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  let capturedAt: Date | null = null;
  for (const keyword of keywords) {
    const snapshot = snapshots.get(keyword.id);
    if (!snapshot) continue;
    const own = findDomainPosition(snapshot.rows, campaign.domain);
    const bucket = bucketByKey.get(bucketOf(own?.position ?? null));
    if (!bucket) continue;
    bucket.count += 1;
    bucket.keywords.push(keyword.keyword);
    if (!capturedAt || snapshot.capturedAt > capturedAt) {
      capturedAt = snapshot.capturedAt;
    }
  }

  const collectedKeywords = snapshots.size;
  return {
    campaignId,
    engine,
    totalKeywords: keywords.length,
    collectedKeywords,
    uncollectedKeywords: keywords.length - collectedKeywords,
    capturedAt: capturedAt?.toISOString() ?? null,
    hasData: collectedKeywords > 0,
    buckets,
  };
}

/* ------------------------------------------------------------------ */
/* 경쟁자 발견                                                         */
/* ------------------------------------------------------------------ */

export interface DiscoveredCompetitor {
  domain: string;
  /** 해당 도메인이 상위권에 발견된 추적 키워드 수 */
  appearances: number;
  /** 키워드별 최고 순위의 평균 (소수 첫째 자리) */
  avgPosition: number;
  bestPosition: number;
  /** 최고 순위를 기록한 결과 URL */
  sampleUrl: string | null;
  /** 이미 추적 중인 경쟁사면 true */
  tracked: boolean;
}

export interface DiscoveredCompetitors {
  campaignId: string;
  engine: "google" | "bing";
  totalKeywords: number;
  /** SERP 스냅샷이 존재하는 키워드 수 (집계 모수) */
  keywordsWithSerp: number;
  hasData: boolean;
  competitors: DiscoveredCompetitor[];
}

const MAX_DISCOVERED_COMPETITORS = 20;

/**
 * 경쟁자 발견 탭 집계.
 * 수집된 SERP 전체에서 자사 외 도메인의 등장 빈도(키워드 수)와 평균 순위를
 * 실제 수집 데이터로만 계산한다. 추정치가 아니라 관측값이다.
 */
export async function getDiscoveredCompetitors(
  auth: AuthContext,
  campaignId: string
): Promise<DiscoveredCompetitors> {
  const campaign = await requireCampaign(auth, campaignId);
  const engine = snapshotEngine(campaign);
  if (!engine) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "ChatGPT 엔진 캠페인은 경쟁자 발견을 제공할 수 없습니다."
    );
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

  const snapshots = await loadLatestSnapshotsByKeyword(campaign, keywords);

  const trackedCompetitorRows = await db
    .select({ domain: positionTrackingCompetitors.domain })
    .from(positionTrackingCompetitors)
    .where(
      and(
        eq(positionTrackingCompetitors.campaignId, campaignId),
        isNull(positionTrackingCompetitors.deletedAt)
      )
    );
  const trackedDomains = new Set(
    trackedCompetitorRows.map((row) => normalizeDomain(row.domain))
  );

  const ownDomain = normalizeDomain(campaign.domain);
  const isOwn = (domain: string) =>
    ownDomain !== "" && (domain === ownDomain || domain.endsWith(`.${ownDomain}`));

  interface Aggregate {
    domain: string;
    appearances: number;
    positionSum: number;
    bestPosition: number;
    sampleUrl: string | null;
  }
  const byDomain = new Map<string, Aggregate>();

  for (const snapshot of snapshots.values()) {
    // 같은 SERP 에 같은 도메인이 여러 순위로 나오면 최고 순위만 등장 1회로 센다.
    const bestByDomain = new Map<string, SnapshotSerpRow>();
    for (const row of snapshot.rows) {
      const domain = normalizeDomain(row.domain);
      if (!domain || isOwn(domain)) continue;
      const existing = bestByDomain.get(domain);
      if (!existing || row.position < existing.position) {
        bestByDomain.set(domain, row);
      }
    }
    for (const [domain, row] of bestByDomain) {
      const aggregate = byDomain.get(domain) ?? {
        domain,
        appearances: 0,
        positionSum: 0,
        bestPosition: row.position,
        sampleUrl: null,
      };
      aggregate.appearances += 1;
      aggregate.positionSum += row.position;
      if (row.position < aggregate.bestPosition) {
        aggregate.bestPosition = row.position;
        aggregate.sampleUrl = row.url;
      }
      byDomain.set(domain, aggregate);
    }
  }

  const competitors: DiscoveredCompetitor[] = [...byDomain.values()]
    .map((aggregate) => ({
      domain: aggregate.domain,
      appearances: aggregate.appearances,
      avgPosition: Math.round((aggregate.positionSum / aggregate.appearances) * 10) / 10,
      bestPosition: aggregate.bestPosition,
      sampleUrl: aggregate.sampleUrl,
      tracked: trackedDomains.has(aggregate.domain),
    }))
    .sort(
      (a, b) =>
        b.appearances - a.appearances ||
        a.avgPosition - b.avgPosition ||
        a.domain.localeCompare(b.domain)
    )
    .slice(0, MAX_DISCOVERED_COMPETITORS);

  return {
    campaignId,
    engine,
    totalKeywords: keywords.length,
    keywordsWithSerp: snapshots.size,
    hasData: snapshots.size > 0,
    competitors,
  };
}
