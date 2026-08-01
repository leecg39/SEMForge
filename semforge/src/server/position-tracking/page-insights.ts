/**
 * 저장된 SERP 행만 사용하는 페이지 단위 순수 집계 모듈.
 * 입력 필드는 serp_snapshots 실제 컬럼 이름을 따른다.
 */

export type SnapshotCapturedAt = Date | string | number;

export interface PageInsightSerpRow {
  keyword_metric_id: string;
  search_engine: string;
  domain: string;
  url: string;
  /** null은 0위가 아니라 100위 밖을 뜻한다. */
  position: number | null;
  is_ad: boolean;
  title: string | null;
  description: string | null;
  serp_features: string;
  source: string;
  captured_at: SnapshotCapturedAt;
}

export interface PageRanking {
  url: string;
  keywords: number;
  bestPosition: number | null;
  averagePosition: number | null;
  lastSeenAt: string | null;
}

export interface CannibalizationUrl {
  url: string;
  position: number | null;
}

export interface CannibalizationInsight {
  /** 입력에 키워드 본문이 없으므로 keyword_metric_id를 식별자로 쓴다. */
  keyword: string;
  urls: CannibalizationUrl[];
  bestPosition: number | null;
  competingCount: number;
}

export interface FeaturedSnippetObservation {
  /** 입력에 키워드 본문이 없으므로 keyword_metric_id를 식별자로 쓴다. */
  keyword: string;
  domain: string;
  url: string;
  position: number | null;
  capturedAt: string | null;
}

export interface FeaturedSnippetInsights {
  owned: FeaturedSnippetObservation[];
  competitors: FeaturedSnippetObservation[];
}

/** 공급자별 추천 스니펫 표기 변형. */
export const FEATURED_SNIPPET_TOKENS = [
  "featured_snippet",
  "featured-snippet",
  "featured snippet",
  "answer_box",
  "answer-box",
  "answer box",
  "direct_answer",
  "direct-answer",
  "direct answer",
  "position_zero",
  "position-zero",
  "position zero",
] as const;

function normalizeDomain(input: string): string {
  const trimmed = input.trim().toLocaleLowerCase("en-US");
  if (!trimmed) return "";
  try {
    const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    return new URL(withProtocol).hostname.replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return "";
  }
}

function belongsToDomain(candidate: string, target: string): boolean {
  const normalizedCandidate = normalizeDomain(candidate);
  const normalizedTarget = normalizeDomain(target);
  return Boolean(
    normalizedCandidate &&
      normalizedTarget &&
      (normalizedCandidate === normalizedTarget ||
        normalizedCandidate.endsWith(`.${normalizedTarget}`)),
  );
}

function timestampOf(value: SnapshotCapturedAt): number | null {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isoTimestamp(value: SnapshotCapturedAt): string | null {
  const timestamp = timestampOf(value);
  return timestamp === null ? null : new Date(timestamp).toISOString();
}

function bestPosition(positions: readonly (number | null)[]): number | null {
  const ranked = positions.filter((position): position is number => position !== null);
  return ranked.length > 0 ? Math.min(...ranked) : null;
}

function comparePositionAscending(left: number | null, right: number | null): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return left - right;
}

/** 자사 URL별 자연 검색 순위 관측을 집계한다. */
export function buildPageRankings(
  rows: readonly PageInsightSerpRow[],
  targetDomain: string,
): PageRanking[] {
  const pages = new Map<
    string,
    {
      keywordIds: Set<string>;
      positions: number[];
      lastSeenTimestamp: number | null;
    }
  >();

  for (const row of rows) {
    if (row.is_ad || !belongsToDomain(row.domain, targetDomain)) continue;

    const current = pages.get(row.url) ?? {
      keywordIds: new Set<string>(),
      positions: [],
      lastSeenTimestamp: null,
    };
    current.keywordIds.add(row.keyword_metric_id);
    if (row.position !== null) current.positions.push(row.position);

    const capturedAt = timestampOf(row.captured_at);
    if (
      capturedAt !== null &&
      (current.lastSeenTimestamp === null || capturedAt > current.lastSeenTimestamp)
    ) {
      current.lastSeenTimestamp = capturedAt;
    }
    pages.set(row.url, current);
  }

  return [...pages.entries()]
    .map(([url, page]): PageRanking => ({
      url,
      keywords: page.keywordIds.size,
      bestPosition: page.positions.length > 0 ? Math.min(...page.positions) : null,
      averagePosition:
        page.positions.length > 0
          ? page.positions.reduce((sum, position) => sum + position, 0) /
            page.positions.length
          : null,
      lastSeenAt:
        page.lastSeenTimestamp === null
          ? null
          : new Date(page.lastSeenTimestamp).toISOString(),
    }))
    .toSorted(
      (left, right) =>
        comparePositionAscending(left.bestPosition, right.bestPosition) ||
        comparePositionAscending(left.averagePosition, right.averagePosition) ||
        left.url.localeCompare(right.url),
    );
}

/** 같은 키워드에서 서로 경쟁하는 자사 자연 검색 URL을 찾는다. */
export function detectCannibalization(
  rows: readonly PageInsightSerpRow[],
  targetDomain: string,
): CannibalizationInsight[] {
  const snapshots = new Map<
    string,
    { keyword: string; positionsByUrl: Map<string, (number | null)[]> }
  >();

  for (const row of rows) {
    if (row.is_ad || !belongsToDomain(row.domain, targetDomain)) continue;
    const capturedAt = timestampOf(row.captured_at);
    const snapshotKey = JSON.stringify([
      row.keyword_metric_id,
      row.search_engine,
      capturedAt ?? String(row.captured_at),
    ]);
    const snapshot = snapshots.get(snapshotKey) ?? {
      keyword: row.keyword_metric_id,
      positionsByUrl: new Map<string, (number | null)[]>(),
    };
    const positions = snapshot.positionsByUrl.get(row.url) ?? [];
    positions.push(row.position);
    snapshot.positionsByUrl.set(row.url, positions);
    snapshots.set(snapshotKey, snapshot);
  }

  const candidates = [...snapshots.values()]
    .filter((snapshot) => snapshot.positionsByUrl.size >= 2)
    .map(({ keyword, positionsByUrl }): CannibalizationInsight => {
      const urls = [...positionsByUrl.entries()]
        .map(([url, positions]) => ({ url, position: bestPosition(positions) }))
        .toSorted(
          (left, right) =>
            comparePositionAscending(left.position, right.position) ||
            left.url.localeCompare(right.url),
        );
      return {
        keyword,
        urls,
        bestPosition: bestPosition(urls.map((row) => row.position)),
        competingCount: urls.length,
      };
    });

  const compareSeverity = (
    left: CannibalizationInsight,
    right: CannibalizationInsight,
  ): number => {
    if (left.competingCount !== right.competingCount) {
      return right.competingCount - left.competingCount;
    }
    if (left.bestPosition === null) {
      return right.bestPosition === null ? left.keyword.localeCompare(right.keyword) : -1;
    }
    if (right.bestPosition === null) return 1;
    return right.bestPosition - left.bestPosition || left.keyword.localeCompare(right.keyword);
  };

  // 같은 키워드의 여러 시점 중 가장 심각한 동시 경쟁 관측 하나를 대표값으로 쓴다.
  const worstByKeyword = new Map<string, CannibalizationInsight>();
  for (const candidate of candidates) {
    const current = worstByKeyword.get(candidate.keyword);
    if (!current || compareSeverity(candidate, current) < 0) {
      worstByKeyword.set(candidate.keyword, candidate);
    }
  }
  return [...worstByKeyword.values()].toSorted(compareSeverity);
}

function normalizeFeatureToken(token: string): string {
  return token.trim().toLocaleLowerCase("en-US").replace(/[\s-]+/g, "_");
}

const NORMALIZED_FEATURED_SNIPPET_TOKENS = new Set(
  FEATURED_SNIPPET_TOKENS.map(normalizeFeatureToken),
);

function parseSerpFeatures(serialized: string): string[] {
  try {
    const parsed: unknown = JSON.parse(serialized);
    return Array.isArray(parsed)
      ? parsed.filter((feature): feature is string => typeof feature === "string")
      : [];
  } catch {
    return [];
  }
}

function isFeaturedSnippetRow(row: PageInsightSerpRow): boolean {
  return parseSerpFeatures(row.serp_features).some((feature) =>
    NORMALIZED_FEATURED_SNIPPET_TOKENS.has(normalizeFeatureToken(feature)),
  );
}

function compareSnippetObservation(
  left: FeaturedSnippetObservation,
  right: FeaturedSnippetObservation,
): number {
  return (
    comparePositionAscending(left.position, right.position) ||
    left.keyword.localeCompare(right.keyword) ||
    left.url.localeCompare(right.url)
  );
}

/** 추천 스니펫 관측을 자사 점유와 경쟁사 점유로 나눈다. */
export function extractFeaturedSnippets(
  rows: readonly PageInsightSerpRow[],
  targetDomain: string,
): FeaturedSnippetInsights {
  const owned: FeaturedSnippetObservation[] = [];
  const competitors: FeaturedSnippetObservation[] = [];
  const holderBySnapshot = new Map<string, PageInsightSerpRow>();

  for (const row of rows) {
    if (row.is_ad || !isFeaturedSnippetRow(row)) continue;
    const capturedAt = timestampOf(row.captured_at);
    const snapshotKey = JSON.stringify([
      row.keyword_metric_id,
      row.search_engine,
      capturedAt ?? String(row.captured_at),
    ]);
    const current = holderBySnapshot.get(snapshotKey);
    if (
      !current ||
      comparePositionAscending(row.position, current.position) < 0 ||
      (row.position === current.position && row.url.localeCompare(current.url) < 0)
    ) {
      holderBySnapshot.set(snapshotKey, row);
    }
  }

  // 수집기는 SERP 수준 피처를 모든 결과 행에 반복 저장하므로 최상위 행만 점유자다.
  for (const row of holderBySnapshot.values()) {
    const observation: FeaturedSnippetObservation = {
      keyword: row.keyword_metric_id,
      domain: row.domain,
      url: row.url,
      position: row.position,
      capturedAt: isoTimestamp(row.captured_at),
    };
    if (belongsToDomain(row.domain, targetDomain)) owned.push(observation);
    else competitors.push(observation);
  }

  return {
    owned: owned.toSorted(compareSnippetObservation),
    competitors: competitors.toSorted(compareSnippetObservation),
  };
}
