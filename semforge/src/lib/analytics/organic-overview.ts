import {
  ctrForPosition,
  estimateOrganicTraffic,
  normalizeDomain,
} from "@/lib/analytics/metrics";
import type {
  AnalyticsDevice,
  AnalyticsRawDataset,
  RawSerpSnapshot,
} from "@/lib/analytics/types";

/**
 * Organic Research 개요 화면 전용 파생 계산 (순수 함수).
 * buildDomainAnalytics 가 다루지 않는 화면 요소 — 월별 포지션 버킷 추세,
 * 포지션 변동(신규/누락/상승/하락), 경쟁자, 포지셔닝 버블, 키워드별 SERP 피처 —
 * 를 원천 스토어(serp_snapshots)에서만 계산한다. 실측 없는 값은 만들지 않는다.
 */

export interface OrganicTrendPointData {
  period: string;
  top3: number;
  p4_10: number;
  p11_20: number;
  p21_50: number;
  p51_100: number;
  serpFeatures: number;
}

export interface OrganicChangeRow {
  keyword: string;
  normalizedKeyword: string;
  from: number | null;
  to: number | null;
}

export interface OrganicCompetitorRow {
  domain: string;
  commonKeywords: number;
  levelPct: number;
}

export interface OrganicBubbleRow {
  domain: string;
  keywords: number;
  traffic: number;
}

export interface OrganicOverviewExtras {
  trendPoints: OrganicTrendPointData[];
  /** normalizedKeyword → 해당 키워드 SERP 에서 관찰된 피처 키 목록 */
  keywordFeatures: Record<string, string[]>;
  /** 피처 키 → 관찰 키워드 수 (도메인이 랭킹된 키워드 한정) */
  featureCounts: Record<string, number>;
  positionChanges: {
    new: OrganicChangeRow[];
    lost: OrganicChangeRow[];
    improved: OrganicChangeRow[];
    declined: OrganicChangeRow[];
  };
  serpFeatureChanges: {
    new: OrganicChangeRow[];
    lost: OrganicChangeRow[];
  };
  competitors: OrganicCompetitorRow[];
  competitorTotal: number;
  bubbles: OrganicBubbleRow[];
}

function toTimestamp(value: Date | string | number): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function monthKey(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseFeatures(row: RawSerpSnapshot): string[] {
  try {
    const parsed: unknown = JSON.parse(row.serpFeatures);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function bucketOf(position: number): keyof Pick<
  OrganicTrendPointData,
  "top3" | "p4_10" | "p11_20" | "p21_50" | "p51_100"
> {
  if (position <= 3) return "top3";
  if (position <= 10) return "p4_10";
  if (position <= 20) return "p11_20";
  if (position <= 50) return "p21_50";
  return "p51_100";
}

/** DB 탭 카운트용: 해당 국가/기기에서 도메인이 랭킹된 키워드 수 (최신 캡처 기준). */
export function countRankedKeywords(
  dataset: AnalyticsRawDataset,
  query: { domain: string; countryCode: string; device: AnalyticsDevice },
): number {
  const domain = normalizeDomain(query.domain);
  const countryCode = query.countryCode.toUpperCase();
  const keywordIds = new Set(
    dataset.keywords
      .filter((row) => row.countryCode === countryCode && row.device === query.device)
      .map((row) => row.id),
  );
  const latestByKeyword = new Map<string, number>();
  for (const row of dataset.serp) {
    if (!keywordIds.has(row.keywordMetricId) || row.searchEngine !== "google" || row.isAd) continue;
    const ts = toTimestamp(row.capturedAt);
    if (ts > (latestByKeyword.get(row.keywordMetricId) ?? 0)) {
      latestByKeyword.set(row.keywordMetricId, ts);
    }
  }
  const ranked = new Set<string>();
  for (const row of dataset.serp) {
    if (!keywordIds.has(row.keywordMetricId) || row.searchEngine !== "google" || row.isAd) continue;
    if (toTimestamp(row.capturedAt) !== latestByKeyword.get(row.keywordMetricId)) continue;
    if (normalizeDomain(row.domain) === domain) ranked.add(row.keywordMetricId);
  }
  return ranked.size;
}

export function buildOrganicOverviewExtras(
  dataset: AnalyticsRawDataset,
  query: { domain: string; countryCode: string; device: AnalyticsDevice },
): OrganicOverviewExtras {
  const domain = normalizeDomain(query.domain);
  const countryCode = query.countryCode.toUpperCase();

  const scopedKeywords = dataset.keywords.filter(
    (row) => row.countryCode === countryCode && row.device === query.device,
  );
  const keywordById = new Map(scopedKeywords.map((row) => [row.id, row]));
  const scopedSerp = dataset.serp.filter(
    (row) =>
      keywordById.has(row.keywordMetricId) && row.searchEngine === "google" && !row.isAd,
  );

  /* ---- 키워드별 캡처 이력 (capturedAt 내림차순 그룹) ---- */
  const capturesByKeyword = new Map<string, Map<number, RawSerpSnapshot[]>>();
  for (const row of scopedSerp) {
    const byTime = capturesByKeyword.get(row.keywordMetricId) ?? new Map<number, RawSerpSnapshot[]>();
    const ts = toTimestamp(row.capturedAt);
    const list = byTime.get(ts) ?? [];
    list.push(row);
    byTime.set(ts, list);
    capturesByKeyword.set(row.keywordMetricId, byTime);
  }

  const latestRows: RawSerpSnapshot[] = [];
  const previousRowsByKeyword = new Map<string, RawSerpSnapshot[]>();
  for (const [keywordId, byTime] of capturesByKeyword) {
    const times = [...byTime.keys()].toSorted((a, b) => b - a);
    latestRows.push(...(byTime.get(times[0]) ?? []));
    if (times.length >= 2) {
      previousRowsByKeyword.set(keywordId, byTime.get(times[1]) ?? []);
    }
  }

  const rankedLatest = latestRows.filter((row) => normalizeDomain(row.domain) === domain);
  const rankedKeywordIds = new Set(rankedLatest.map((row) => row.keywordMetricId));

  /* ---- 키워드별 SERP 피처 + 피처 카운트 ---- */
  const keywordFeatures: Record<string, string[]> = {};
  const featureKeywordSets = new Map<string, Set<string>>();
  for (const row of latestRows) {
    if (!rankedKeywordIds.has(row.keywordMetricId)) continue;
    const keyword = keywordById.get(row.keywordMetricId);
    if (!keyword) continue;
    const features = parseFeatures(row);
    if (!features.length) continue;
    const existing = keywordFeatures[keyword.normalizedKeyword] ?? [];
    keywordFeatures[keyword.normalizedKeyword] = [...new Set([...existing, ...features])];
    for (const feature of features) {
      const set = featureKeywordSets.get(feature) ?? new Set<string>();
      set.add(row.keywordMetricId);
      featureKeywordSets.set(feature, set);
    }
  }
  const featureCounts: Record<string, number> = {};
  for (const [feature, set] of featureKeywordSets) featureCounts[feature] = set.size;

  /* ---- 월별 버킷 추세 (키워드 periodStart 기준, 도메인 최신 포지션) ---- */
  const pointsByPeriod = new Map<string, OrganicTrendPointData>();
  for (const row of rankedLatest) {
    const keyword = keywordById.get(row.keywordMetricId);
    if (!keyword) continue;
    const period = monthKey(keyword.periodStart);
    const point =
      pointsByPeriod.get(period) ??
      ({ period, top3: 0, p4_10: 0, p11_20: 0, p21_50: 0, p51_100: 0, serpFeatures: 0 } satisfies OrganicTrendPointData);
    point[bucketOf(row.position)] += 1;
    if ((keywordFeatures[keyword.normalizedKeyword] ?? []).length > 0) point.serpFeatures += 1;
    pointsByPeriod.set(period, point);
  }
  const trendPoints = [...pointsByPeriod.values()].toSorted((a, b) =>
    a.period.localeCompare(b.period),
  );

  /* ---- 포지션 변동: 직전 캡처와 비교 (이력 2회 이상인 키워드만) ---- */
  const positionChanges: OrganicOverviewExtras["positionChanges"] = {
    new: [],
    lost: [],
    improved: [],
    declined: [],
  };
  const serpFeatureChanges: OrganicOverviewExtras["serpFeatureChanges"] = { new: [], lost: [] };
  for (const [keywordId, previousRows] of previousRowsByKeyword) {
    const keyword = keywordById.get(keywordId);
    if (!keyword) continue;
    const currentRows = capturesByKeyword.get(keywordId);
    if (!currentRows) continue;
    const latestTs = [...currentRows.keys()].toSorted((a, b) => b - a)[0];
    const nowRow = (currentRows.get(latestTs) ?? []).find(
      (row) => normalizeDomain(row.domain) === domain,
    );
    const prevRow = previousRows.find((row) => normalizeDomain(row.domain) === domain);
    const base = {
      keyword: keyword.keyword,
      normalizedKeyword: keyword.normalizedKeyword,
    };
    if (nowRow && !prevRow) {
      positionChanges.new.push({ ...base, from: null, to: nowRow.position });
    } else if (!nowRow && prevRow) {
      positionChanges.lost.push({ ...base, from: prevRow.position, to: null });
    } else if (nowRow && prevRow && nowRow.position !== prevRow.position) {
      const row = { ...base, from: prevRow.position, to: nowRow.position };
      if (nowRow.position < prevRow.position) positionChanges.improved.push(row);
      else positionChanges.declined.push(row);
    }

    // SERP 피처 등장/소멸 (해당 키워드 SERP 전체 기준)
    const nowFeatures = new Set((currentRows.get(latestTs) ?? []).flatMap(parseFeatures));
    const prevFeatures = new Set(previousRows.flatMap(parseFeatures));
    const appeared = [...nowFeatures].some((f) => !prevFeatures.has(f));
    const disappeared = [...prevFeatures].some((f) => !nowFeatures.has(f));
    if (appeared) serpFeatureChanges.new.push({ ...base, from: null, to: null });
    if (disappeared) serpFeatureChanges.lost.push({ ...base, from: null, to: null });
  }

  /* ---- 경쟁자: 우리 도메인이 랭킹된 키워드를 공유하는 도메인 ---- */
  const competitorKeywordSets = new Map<string, Set<string>>();
  const domainKeywordSets = new Map<string, Set<string>>();
  for (const row of latestRows) {
    const rowDomain = normalizeDomain(row.domain);
    if (!rowDomain) continue;
    const all = domainKeywordSets.get(rowDomain) ?? new Set<string>();
    all.add(row.keywordMetricId);
    domainKeywordSets.set(rowDomain, all);
    if (!rankedKeywordIds.has(row.keywordMetricId)) continue;
    const set = competitorKeywordSets.get(rowDomain) ?? new Set<string>();
    set.add(row.keywordMetricId);
    competitorKeywordSets.set(rowDomain, set);
  }
  const ourKeywordCount = rankedKeywordIds.size;
  const competitorsAll = [...competitorKeywordSets.entries()]
    .map(([candidate, set]) => ({
      domain: candidate,
      commonKeywords: set.size,
      levelPct: ourKeywordCount
        ? Math.round((set.size / ourKeywordCount) * 100)
        : 0,
    }))
    .toSorted((a, b) => b.levelPct - a.levelPct || a.domain.localeCompare(b.domain));
  const others = competitorsAll.filter((row) => row.domain !== domain);
  const self = competitorsAll.find((row) => row.domain === domain);
  const competitors = [...others.slice(0, 5), ...(self ? [self] : [])];

  /* ---- 포지셔닝 버블: 자신 + 상위 경쟁자 (스토어 실측 범위) ---- */
  const bubbleDomains = [...new Set([...others.slice(0, 5).map((row) => row.domain), domain])];
  const bubbles = bubbleDomains.map((candidate) => {
    const keywordIds = domainKeywordSets.get(candidate) ?? new Set<string>();
    let traffic = 0;
    for (const row of latestRows) {
      if (normalizeDomain(row.domain) !== candidate) continue;
      const keyword = keywordById.get(row.keywordMetricId);
      if (!keyword) continue;
      traffic += estimateOrganicTraffic([{ position: row.position, volume: keyword.volume }]);
      // volume=0 소스일 때도 순위 자체는 실측이므로 CTR 가중 키워드 수로 최소 신호 유지
      if (keyword.volume === 0) traffic += ctrForPosition(row.position);
    }
    return {
      domain: candidate,
      keywords: keywordIds.size,
      traffic: Math.round(traffic * 100) / 100,
    };
  });

  return {
    trendPoints,
    keywordFeatures,
    featureCounts,
    positionChanges,
    serpFeatureChanges,
    competitors,
    competitorTotal: others.length,
    bubbles,
  };
}
