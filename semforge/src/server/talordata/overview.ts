import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { keywordMetrics, serpSnapshots } from "@/db/schema";
import { classifyIntent, type IntentEvidence } from "@/lib/analytics/intent";
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

/**
 * KD 게이팅 임계값 (계획서 R6 채택안): top10 결과 중 링크 그래프 프로필
 * (백링크/참조 도메인)이 확인된 도메인이 이 값 미만이면 KD 를 제공하지 않는다.
 * 근거 부족 상태에서 0~100 숫자를 내보내면 가짜 확신을 주기 때문이다.
 */
export const KD_MIN_PROFILE_DOMAINS = 5;

export interface KeywordDifficultyReport {
  /** clone-kd-v1 점수 (0~100). 근거 부족(sufficientEvidence=false)이면 null. */
  score: number | null;
  /** top10 결과 도메인 수. */
  top10Count: number;
  /** top10 중 링크 그래프 프로필이 확인된 도메인 수. */
  top10WithProfile: number;
  sufficientEvidence: boolean;
  model: "clone-kd-v1";
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
  /** clone-intent-v1 판정 근거 (매칭된 키워드 패턴/SERP 피처). */
  intentEvidence: IntentEvidence[];
  intentModel: "clone-intent-v1";
  cpcCents: number | null;
  difficulty: number;
  /** KD 게이팅 결과. UI 는 difficulty 대신 이 필드를 사용한다. */
  kd: KeywordDifficultyReport;
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

  // KD 게이팅: top10 중 링크 그래프 프로필이 확인된 도메인 수가 임계값 미만이면
  // 점수를 제공하지 않는다 (정직한 미제공).
  const top10 = results.filter((item) => item.position <= 10);
  const top10WithProfile = top10.filter(
    (item) => item.referringDomains > 0 || item.backlinks > 0
  ).length;
  const sufficientEvidence = top10WithProfile >= KD_MIN_PROFILE_DOMAINS;
  const kd: KeywordDifficultyReport = {
    score: sufficientEvidence ? metrics.difficulty : null,
    top10Count: top10.length,
    top10WithProfile,
    sufficientEvidence,
    model: "clone-kd-v1",
  };

  // 의도는 방금 확보한 SERP 피처로 라이브 분류한다 (clone-intent-v1).
  // DB의 metric.intent 는 신규 행 삽입 시점의 분류라 과거 기본값(informational)이
  // 남아 있을 수 있어 리포트에서는 항상 재계산 결과를 쓴다.
  const intentClassification = classifyIntent({
    keyword: input.keyword,
    serpFeatures: collection.features,
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
    intent: intentClassification.intent,
    intentEvidence: intentClassification.evidence,
    intentModel: intentClassification.model,
    cpcCents: metrics.cpcCents,
    difficulty: metrics.difficulty,
    kd,
    features: collection.features,
    results,
    captures: history.captures,
    rank: rankHit ? { position: rankHit.position, url: rankHit.link } : null,
  };
}
