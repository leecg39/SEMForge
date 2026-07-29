import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { keywordMetrics, serpSnapshots } from "@/db/schema";
import {
  buildKeywordOverviewMetrics,
  normalizeDomain,
  type KeywordOverviewMetrics,
} from "@/lib/analytics/metrics";
import { getAnalyticsDataset } from "@/server/analytics";
import type { SerpEngine, SerpOrganicItem } from "@/server/talordata/client";
import { collectKeywordSerp } from "@/server/talordata/collect";

/**
 * Keyword Overview 리포트 빌더.
 *
 * 1) collectKeywordSerp 로 현재 SERP 를 확보한다 — TTL(24h) 이내 스냅샷이 있으면
 *    외부 API 호출 없이 재사용하고(fromCache), 없으면 TalorData 를 호출해 적재한다.
 * 2) 원천 스토어(keyword_metrics + serp_snapshots + link_graph_edges)로
 *    검색량·KD·도메인 권위를 계산한다 (clone-kd-v1 / clone-authority-v1).
 * 3) 직전 수집분과 비교한 순위 변동, 수집 이력을 붙인다.
 */

export interface KeywordOverviewResult extends SerpOrganicItem {
  authorityScore: number;
  backlinks: number;
  referringDomains: number;
  /** 직전 수집에서의 순위. 그때 없었으면 null (신규 진입). */
  previousPosition: number | null;
}

export interface KeywordOverviewReport {
  keyword: string;
  countryCode: string;
  device: "desktop" | "mobile";
  engine: SerpEngine;
  keywordMetricId: string;
  capturedAt: string;
  fromCache: boolean;
  volume: number;
  volumeMonthsUsed: number;
  intent: string | null;
  cpcCents: number | null;
  difficulty: number;
  features: string[];
  results: KeywordOverviewResult[];
  /** 이 키워드의 라이브 수집 이력 (최신순, 최대 10회). */
  captures: Array<{ capturedAt: string; results: number }>;
  /** domain 파라미터를 준 경우 해당 도메인의 순위. */
  rank: { position: number; url: string } | null;
}

function normalizeKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

/** 이 키워드 스코프의 라이브 수집 이력과 직전 수집분 순위를 읽는다. */
async function loadCaptureHistory(input: {
  keyword: string;
  countryCode: string;
  device: "desktop" | "mobile";
  engine: SerpEngine;
  currentCapturedAt: Date;
}): Promise<{
  captures: Array<{ capturedAt: string; results: number }>;
  previousPositions: Map<string, number>;
}> {
  const metricRows = await db
    .select({ id: keywordMetrics.id })
    .from(keywordMetrics)
    .where(
      and(
        eq(keywordMetrics.normalizedKeyword, normalizeKeyword(input.keyword)),
        eq(keywordMetrics.countryCode, input.countryCode),
        eq(keywordMetrics.device, input.device)
      )
    );
  if (metricRows.length === 0) {
    return { captures: [], previousPositions: new Map() };
  }

  const rows = await db
    .select({
      capturedAt: serpSnapshots.capturedAt,
      domain: serpSnapshots.domain,
      position: serpSnapshots.position,
    })
    .from(serpSnapshots)
    .where(
      and(
        inArray(
          serpSnapshots.keywordMetricId,
          metricRows.map((row) => row.id)
        ),
        eq(serpSnapshots.searchEngine, input.engine),
        eq(serpSnapshots.source, "talordata")
      )
    )
    .orderBy(desc(serpSnapshots.capturedAt));

  const byCapture = new Map<number, { capturedAt: Date; count: number }>();
  for (const row of rows) {
    const key = row.capturedAt.getTime();
    const entry = byCapture.get(key) ?? { capturedAt: row.capturedAt, count: 0 };
    entry.count += 1;
    byCapture.set(key, entry);
  }
  const captures = [...byCapture.values()]
    .toSorted((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())
    .slice(0, 10)
    .map((entry) => ({
      capturedAt: entry.capturedAt.toISOString(),
      results: entry.count,
    }));

  // 직전 수집분: 현재 수집 시각보다 오래된 것 중 가장 최근.
  const currentTime = input.currentCapturedAt.getTime();
  const previousTime = [...byCapture.keys()]
    .filter((time) => time < currentTime)
    .toSorted((a, b) => b - a)[0];
  const previousPositions = new Map<string, number>();
  if (previousTime !== undefined) {
    for (const row of rows) {
      if (row.capturedAt.getTime() !== previousTime) continue;
      const domain = normalizeDomain(row.domain) || row.domain;
      if (!previousPositions.has(domain)) {
        previousPositions.set(domain, row.position);
      }
    }
  }
  return { captures, previousPositions };
}

export async function getKeywordOverview(input: {
  keyword: string;
  countryCode: string;
  device: "desktop" | "mobile";
  engine?: SerpEngine;
  num?: number;
  domain?: string;
  forceRefresh?: boolean;
}): Promise<KeywordOverviewReport> {
  const countryCode = input.countryCode.toUpperCase();
  const engine = input.engine ?? "google";

  const collection = await collectKeywordSerp({
    keyword: input.keyword,
    countryCode,
    device: input.device,
    engine,
    num: input.num,
    forceRefresh: input.forceRefresh,
  });

  const [dataset, history] = await Promise.all([
    getAnalyticsDataset({ countryCode, device: input.device }),
    loadCaptureHistory({
      keyword: input.keyword,
      countryCode,
      device: input.device,
      engine,
      currentCapturedAt: collection.capturedAt,
    }),
  ]);

  const metrics: KeywordOverviewMetrics = buildKeywordOverviewMetrics(dataset, {
    keyword: input.keyword,
    countryCode,
    device: input.device,
    serpFeatureCount: collection.features.length,
    results: collection.results.map((item) => ({
      position: item.position,
      domain: item.domain || item.link,
    })),
  });

  const results: KeywordOverviewResult[] = collection.results.map((item) => {
    const domain = normalizeDomain(item.domain) || item.domain;
    const stats = metrics.domainStats.get(domain);
    return {
      ...item,
      authorityScore: stats?.authorityScore ?? 0,
      backlinks: stats?.backlinks ?? 0,
      referringDomains: stats?.referringDomains ?? 0,
      previousPosition: history.previousPositions.get(domain) ?? null,
    };
  });

  const normalizedTarget = input.domain ? normalizeDomain(input.domain) : "";
  const rankHit = normalizedTarget
    ? (results.find(
        (item) =>
          item.domain === normalizedTarget || item.domain.endsWith(`.${normalizedTarget}`)
      ) ?? null)
    : null;

  return {
    keyword: input.keyword,
    countryCode,
    device: input.device,
    engine,
    keywordMetricId: collection.keywordMetricId,
    capturedAt: collection.capturedAt.toISOString(),
    fromCache: collection.fromCache,
    volume: metrics.volume,
    volumeMonthsUsed: metrics.volumeMonthsUsed,
    intent: metrics.intent,
    cpcCents: metrics.cpcCents,
    difficulty: metrics.difficulty,
    features: collection.features,
    results,
    captures: history.captures,
    rank: rankHit ? { position: rankHit.position, url: rankHit.link } : null,
  };
}
