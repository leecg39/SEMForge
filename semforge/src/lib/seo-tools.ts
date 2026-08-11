import type {
  AnalyticsRawDataset,
  DomainAnalyticsReport,
  RawKeywordMetric,
} from "@/lib/analytics/types";

export interface SeoTopPageRow {
  url: string;
  keywords: number;
  bestPosition: number;
  trafficEstimate: number | null;
}

export interface SeoDomainComparisonRow {
  domain: string;
  keywords: number;
  bestPosition: number | null;
  organicTrafficEstimate: number | null;
  authorityScore: number | null;
  backlinks: number | null;
}

export interface SeoKeywordGapRow {
  keyword: string;
  targetPosition: number | null;
  competitorPosition: number | null;
  gap: "missing" | "weak" | "shared" | "unique";
  volume: number | null;
  targetUrl: string | null;
  competitorUrl: string | null;
}

export interface SeoKeywordIdeaRow {
  keyword: string;
  volume: number | null;
  cpcCents: number | null;
  intent: RawKeywordMetric["intent"] | null;
  source: string;
  updatedAt: string;
}

export interface SeoSerpVolatilityRow {
  keyword: string;
  previousCapturedAt: string;
  latestCapturedAt: string;
  comparedUrls: number;
  movedUrls: number;
  averagePositionMovement: number | null;
}

function metricValue(metric: { value: number } | null): number | null {
  return metric?.value ?? null;
}

export function buildTopPages(report: DomainAnalyticsReport): SeoTopPageRow[] {
  const pages = new Map<string, SeoTopPageRow & { hasTraffic: boolean }>();
  for (const row of report.topKeywords) {
    const current = pages.get(row.url) ?? {
      url: row.url,
      keywords: 0,
      bestPosition: row.position,
      trafficEstimate: 0,
      hasTraffic: false,
    };
    current.keywords += 1;
    current.bestPosition = Math.min(current.bestPosition, row.position);
    if (row.trafficContribution !== null) {
      current.trafficEstimate = (current.trafficEstimate ?? 0) + row.trafficContribution;
      current.hasTraffic = true;
    }
    pages.set(row.url, current);
  }
  return [...pages.values()]
    .map(({ hasTraffic, ...row }) => ({
      ...row,
      trafficEstimate: hasTraffic ? row.trafficEstimate : null,
    }))
    .toSorted(
      (a, b) =>
        (b.trafficEstimate ?? -1) - (a.trafficEstimate ?? -1) ||
        b.keywords - a.keywords ||
        a.bestPosition - b.bestPosition,
    );
}

export function buildDomainComparison(
  reports: readonly DomainAnalyticsReport[],
): SeoDomainComparisonRow[] {
  return reports.map((report) => ({
    domain: report.query.domain,
    keywords: report.metrics.organicKeywords,
    bestPosition:
      report.topKeywords.length > 0
        ? Math.min(...report.topKeywords.map((row) => row.position))
        : null,
    organicTrafficEstimate: metricValue(report.metrics.organicTrafficEstimate),
    authorityScore: metricValue(report.metrics.authorityScore),
    backlinks: report.metrics.backlinks,
  }));
}

export function buildKeywordGap(
  target: DomainAnalyticsReport,
  competitor: DomainAnalyticsReport,
): SeoKeywordGapRow[] {
  const targetByKeyword = new Map(target.topKeywords.map((row) => [row.keyword, row]));
  const competitorByKeyword = new Map(competitor.topKeywords.map((row) => [row.keyword, row]));
  const keywords = new Set([...targetByKeyword.keys(), ...competitorByKeyword.keys()]);

  return [...keywords]
    .map((keyword): SeoKeywordGapRow => {
      const ours = targetByKeyword.get(keyword);
      const theirs = competitorByKeyword.get(keyword);
      const gap = !ours
        ? "missing"
        : !theirs
          ? "unique"
          : ours.position > theirs.position
            ? "weak"
            : "shared";
      return {
        keyword,
        targetPosition: ours?.position ?? null,
        competitorPosition: theirs?.position ?? null,
        gap,
        volume: ours?.volume ?? theirs?.volume ?? null,
        targetUrl: ours?.url ?? null,
        competitorUrl: theirs?.url ?? null,
      };
    })
    .toSorted(
      (a, b) =>
        ({ missing: 0, weak: 1, shared: 2, unique: 3 })[a.gap] -
          ({ missing: 0, weak: 1, shared: 2, unique: 3 })[b.gap] ||
        (a.competitorPosition ?? 101) - (b.competitorPosition ?? 101),
    );
}

export function buildKeywordIdeas(
  dataset: AnalyticsRawDataset,
  seed: string,
): SeoKeywordIdeaRow[] {
  const normalizedSeed = seed.trim().toLocaleLowerCase();
  if (!normalizedSeed) return [];
  const latest = new Map<string, RawKeywordMetric>();
  for (const row of dataset.keywords) {
    if (!row.normalizedKeyword.toLocaleLowerCase().includes(normalizedSeed)) continue;
    const current = latest.get(row.normalizedKeyword);
    if (!current || new Date(row.updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
      latest.set(row.normalizedKeyword, row);
    }
  }
  return [...latest.values()]
    .map((row) => {
      const hasMetrics = row.source !== "talordata-serp";
      return {
        keyword: row.keyword,
        volume: hasMetrics ? row.volume : null,
        cpcCents: hasMetrics && row.cpcCents > 0 ? row.cpcCents : null,
        intent: hasMetrics ? row.intent : null,
        source: row.source,
        updatedAt: new Date(row.updatedAt).toISOString(),
      };
    })
    .toSorted((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || a.keyword.localeCompare(b.keyword));
}

/**
 * 키워드별 최근 두 실제 SERP 스냅샷에서 동일 URL의 절대 순위 이동을 계산한다.
 * 새로 등장하거나 사라진 URL에는 임의의 대체 순위를 부여하지 않는다.
 */
export function buildSerpVolatility(
  dataset: AnalyticsRawDataset,
  searchEngine: "google" | "bing",
): SeoSerpVolatilityRow[] {
  const keywordByMetricId = new Map(dataset.keywords.map((row) => [row.id, row.keyword]));
  const snapshotsByMetric = new Map<string, Map<number, Map<string, number>>>();

  for (const row of dataset.serp) {
    if (row.searchEngine !== searchEngine || row.isAd || !keywordByMetricId.has(row.keywordMetricId)) {
      continue;
    }
    const capturedAt = new Date(row.capturedAt).getTime();
    if (!Number.isFinite(capturedAt)) continue;
    const captures = snapshotsByMetric.get(row.keywordMetricId) ?? new Map();
    const positions = captures.get(capturedAt) ?? new Map<string, number>();
    const current = positions.get(row.url);
    if (current === undefined || row.position < current) positions.set(row.url, row.position);
    captures.set(capturedAt, positions);
    snapshotsByMetric.set(row.keywordMetricId, captures);
  }

  const rows: SeoSerpVolatilityRow[] = [];
  for (const [metricId, captures] of snapshotsByMetric) {
    const timestamps = [...captures.keys()].toSorted((a, b) => b - a);
    if (timestamps.length < 2) continue;
    const [latestAt, previousAt] = timestamps;
    const latest = captures.get(latestAt);
    const previous = captures.get(previousAt);
    if (!latest || !previous) continue;
    const movements: number[] = [];
    for (const [url, latestPosition] of latest) {
      const previousPosition = previous.get(url);
      if (previousPosition === undefined) continue;
      movements.push(Math.abs(latestPosition - previousPosition));
    }
    rows.push({
      keyword: keywordByMetricId.get(metricId) ?? metricId,
      previousCapturedAt: new Date(previousAt).toISOString(),
      latestCapturedAt: new Date(latestAt).toISOString(),
      comparedUrls: movements.length,
      movedUrls: movements.filter((movement) => movement > 0).length,
      averagePositionMovement:
        movements.length > 0
          ? movements.reduce((sum, movement) => sum + movement, 0) / movements.length
          : null,
    });
  }
  return rows.toSorted(
    (a, b) =>
      (b.averagePositionMovement ?? -1) - (a.averagePositionMovement ?? -1) ||
      a.keyword.localeCompare(b.keyword),
  );
}
