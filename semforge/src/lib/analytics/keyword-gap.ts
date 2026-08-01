import {
  calculateAuthorityScore,
  calculateKeywordDifficulty,
  calculateLinkProfile,
  ctrForPosition,
  median,
  normalizeDomain,
  rollingAverageVolume,
  type LinkProfile,
} from "@/lib/analytics/metrics";
import type {
  AnalyticsDevice,
  AnalyticsIntent,
  AnalyticsRawDataset,
  DateValue,
  RawKeywordMetric,
  RawLinkGraphEdge,
  RawSerpSnapshot,
} from "@/lib/analytics/types";

/**
 * 키워드 갭(Keyword Gap) 계산 엔진.
 *
 * TalorData 는 키워드→SERP 조회만 제공하므로 Semrush 식 "도메인→랭킹 키워드"
 * 역조회 인덱스가 없다. 대신 이 워크스페이스가 실제로 수집한 키워드 유니버스
 * (keyword_metrics × 키워드별 최신 serp_snapshots)를 기준으로 최대 5개 대상의
 * 포지션을 같은 스냅샷에서 판정한다 — 추가 외부 API 비용은 0이다.
 *
 * 카테고리 의미론은 Semrush Keyword Gap 과 동일하다 ('나' = targets[0]):
 *   shared   모든 대상이 순위 보유
 *   missing  나만 없고 경쟁자 전원이 보유
 *   weak     내 순위가 순위 보유 경쟁자 전원보다 낮음(숫자가 큼)
 *   strong   내 순위가 순위 보유 경쟁자 전원보다 높음(숫자가 작음)
 *   untapped 나는 없고 경쟁자 1곳 이상이 보유 (missing ⊂ untapped)
 *   unique   나만 보유
 */

export const MAX_GAP_TARGETS = 5;

export type GapScope = "root" | "sub" | "folder" | "url";

export interface GapTarget {
  /** 사용자가 입력한 원본 값 (도메인·호스트·URL·폴더 프리픽스) */
  value: string;
  scope: GapScope;
}

export type GapCategory =
  | "shared"
  | "missing"
  | "weak"
  | "strong"
  | "untapped"
  | "unique";

export const GAP_CATEGORIES: readonly GapCategory[] = [
  "shared",
  "missing",
  "weak",
  "strong",
  "untapped",
  "unique",
];

export interface GapKeywordRow {
  keyword: string;
  intent: AnalyticsIntent;
  /** 최근 12개월 평균 검색량 (관측 없으면 0) */
  volume: number;
  /** clone-kd-v1 점수 (0~100) */
  difficulty: number;
  /** 0 이면 관측된 CPC 소스 없음 — UI 는 "—" 로 표시한다 */
  cpcCents: number;
  /** targets 와 인덱스가 정렬된 포지션. 순위권 밖이면 null */
  positions: (number | null)[];
  /** 매칭된 결과 URL (없으면 null) */
  urls: (string | null)[];
  categories: GapCategory[];
  /** 이 키워드의 최신 스냅샷 수집 시각 (ISO) */
  capturedAt: string | null;
}

export interface GapTargetSummary {
  target: GapTarget;
  /** 정규화된 표시 라벨 (루트/하위 도메인은 호스트, 폴더/URL 은 프로토콜 제거 값) */
  label: string;
  /** 유니버스에서 이 대상이 순위를 보유한 키워드 수 */
  rankedKeywords: number;
}

export interface KeywordGapReport {
  query: {
    targets: GapTarget[];
    countryCode: string;
    device: AnalyticsDevice;
  };
  targets: GapTargetSummary[];
  /** 1곳 이상 순위를 보유한 키워드 행 (검색량 내림차순) */
  rows: GapKeywordRow[];
  counts: Record<GapCategory | "all", number>;
  /** i<j 쌍별 랭킹 키워드 교집합 크기 (겹침 벤 다이어그램용) */
  overlaps: Array<{ a: number; b: number; count: number }>;
  universe: {
    /** (국가·기기) 스코프의 수집된 키워드 수 */
    keywordCount: number;
    /** 그중 1곳 이상 순위가 확인된 키워드 수 (= rows.length) */
    comparedKeywordCount: number;
    lastCapturedAt: string | null;
  };
  models: {
    keywordDifficulty: "clone-kd-v1";
    intent: "clone-intent-v1";
  };
  /** 서버 저장소 경계(getKeywordGap)에서 채운다 */
  provenance?: "live";
}

/* ------------------------------------------------------------------ */
/* URL 파라미터 인코딩                                                  */
/* ------------------------------------------------------------------ */

const SCOPE_PREFIXES: readonly GapScope[] = ["sub", "folder", "url"];

/**
 * `?you=uinus.co.kr&c1=sub:blog.a.com&c2=folder:b.com/docs/` 형태의 값 하나를
 * 해석한다. scope 접두어가 없으면 root 로 본다. 유효하지 않으면 null.
 */
export function parseGapTargetParam(raw: string | null | undefined): GapTarget | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  const colon = trimmed.indexOf(":");
  if (colon > 0) {
    const maybeScope = trimmed.slice(0, colon).toLowerCase();
    if ((SCOPE_PREFIXES as readonly string[]).includes(maybeScope)) {
      const value = trimmed.slice(colon + 1).trim();
      if (!value) return null;
      const target: GapTarget = { value, scope: maybeScope as GapScope };
      return gapTargetLabel(target) ? target : null;
    }
  }
  const target: GapTarget = { value: trimmed, scope: "root" };
  return gapTargetLabel(target) ? target : null;
}

export function formatGapTargetParam(target: GapTarget): string {
  return target.scope === "root" ? target.value : `${target.scope}:${target.value}`;
}

/** 프로토콜·선행 www. 를 제거하고 소문자로 맞춘 URL 비교용 문자열. */
function normalizeUrlish(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/^[a-z][a-z\d+.-]*:\/\//, "")
    .replace(/^www\./, "");
}

/** 대상의 표시 라벨. 빈 문자열이면 유효하지 않은 입력이다. */
export function gapTargetLabel(target: GapTarget): string {
  if (target.scope === "root" || target.scope === "sub") {
    const host = normalizeDomain(target.value);
    return host.includes(".") ? host : "";
  }
  const normalized = normalizeUrlish(target.value).replace(/\/+$/, "");
  return normalized.includes(".") ? normalized : "";
}

/* ------------------------------------------------------------------ */
/* 스냅샷 매칭                                                          */
/* ------------------------------------------------------------------ */

interface PreparedTarget {
  target: GapTarget;
  label: string;
  /** root/sub 매칭용 호스트 */
  host: string;
  /** folder/url 매칭용 프리픽스 (프로토콜·www 제거) */
  prefix: string;
}

function prepareTarget(target: GapTarget): PreparedTarget {
  return {
    target,
    label: gapTargetLabel(target),
    host: normalizeDomain(target.value),
    prefix: normalizeUrlish(target.value).replace(/\/+$/, ""),
  };
}

function matchesTarget(
  row: Pick<RawSerpSnapshot, "domain" | "url">,
  prepared: PreparedTarget,
): boolean {
  switch (prepared.target.scope) {
    case "root": {
      const domain = normalizeDomain(row.domain) || row.domain;
      return domain === prepared.host || domain.endsWith(`.${prepared.host}`);
    }
    case "sub": {
      const domain = normalizeDomain(row.domain) || row.domain;
      return domain === prepared.host;
    }
    case "folder": {
      const url = normalizeUrlish(row.url);
      return url.startsWith(prepared.prefix.endsWith("/") ? prepared.prefix : `${prepared.prefix}/`);
    }
    case "url": {
      const url = normalizeUrlish(row.url).replace(/\/+$/, "");
      return url === prepared.prefix;
    }
  }
}

/* ------------------------------------------------------------------ */
/* 리포트 빌더                                                          */
/* ------------------------------------------------------------------ */

function toTimestamp(value: DateValue): number {
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/** 정규화 키워드당 가장 최근 periodStart 의 메트릭 행만 남긴다. */
function latestKeywordRows(rows: readonly RawKeywordMetric[]): RawKeywordMetric[] {
  const byKeyword = new Map<string, RawKeywordMetric>();
  for (const row of rows) {
    const current = byKeyword.get(row.normalizedKeyword);
    if (!current || toTimestamp(row.periodStart) > toTimestamp(current.periodStart)) {
      byKeyword.set(row.normalizedKeyword, row);
    }
  }
  return [...byKeyword.values()];
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

export function classifyGapCategories(positions: readonly (number | null)[]): GapCategory[] {
  const [myPosition, ...rest] = positions;
  const rankedCompetitors = rest.filter((position): position is number => position !== null);
  const competitorTotal = rest.length;
  const categories: GapCategory[] = [];

  if (positions.every((position) => position !== null) && positions.length > 1) {
    categories.push("shared");
  }
  if (myPosition === null || myPosition === undefined) {
    if (competitorTotal > 0 && rankedCompetitors.length === competitorTotal) {
      categories.push("missing");
    }
    if (rankedCompetitors.length >= 1) {
      categories.push("untapped");
    }
  } else {
    if (rankedCompetitors.length === 0) {
      categories.push("unique");
    } else {
      if (rankedCompetitors.every((position) => position < myPosition)) {
        categories.push("weak");
      }
      if (rankedCompetitors.every((position) => position > myPosition)) {
        categories.push("strong");
      }
    }
  }
  return categories;
}

export function buildKeywordGap(
  dataset: AnalyticsRawDataset,
  query: { targets: GapTarget[]; countryCode: string; device: AnalyticsDevice },
): KeywordGapReport {
  const countryCode = query.countryCode.toUpperCase();
  const prepared = query.targets.slice(0, MAX_GAP_TARGETS).map(prepareTarget);

  const scopedKeywords = dataset.keywords.filter(
    (row) => row.countryCode === countryCode && row.device === query.device,
  );
  const scopedKeywordIds = new Set(scopedKeywords.map((row) => row.id));
  const scopedSerp = dataset.serp.filter(
    (row) =>
      scopedKeywordIds.has(row.keywordMetricId) &&
      row.searchEngine === "google" &&
      !row.isAd,
  );

  // 키워드(metric)별 최신 capturedAt 스냅샷만 현재 비교에 사용한다.
  const latestCapturedAt = new Map<string, number>();
  for (const row of scopedSerp) {
    const timestamp = toTimestamp(row.capturedAt);
    if (timestamp > (latestCapturedAt.get(row.keywordMetricId) ?? 0)) {
      latestCapturedAt.set(row.keywordMetricId, timestamp);
    }
  }
  const currentSerp = scopedSerp.filter(
    (row) => toTimestamp(row.capturedAt) === latestCapturedAt.get(row.keywordMetricId),
  );

  const latestKeywords = latestKeywordRows(scopedKeywords);
  const serpByMetric = new Map<string, RawSerpSnapshot[]>();
  for (const row of currentSerp) {
    const list = serpByMetric.get(row.keywordMetricId) ?? [];
    list.push(row);
    serpByMetric.set(row.keywordMetricId, list);
  }

  const averageVolumeByKeyword = new Map<string, number>(
    latestKeywords.map((row) => [
      row.normalizedKeyword,
      rollingAverageVolume(
        scopedKeywords.filter(
          (candidate) => candidate.normalizedKeyword === row.normalizedKeyword,
        ),
      ).value ?? row.volume,
    ]),
  );

  // KD 계산용 링크 프로필·도메인 권위 캐시 (buildDomainAnalytics 와 같은 모델).
  const linksByTarget = new Map<string, RawLinkGraphEdge[]>();
  for (const edge of dataset.links) {
    const target = normalizeDomain(edge.targetDomain);
    const list = linksByTarget.get(target) ?? [];
    list.push(edge);
    linksByTarget.set(target, list);
  }
  const linkProfileByDomain = new Map<string, LinkProfile>();
  const linkProfile = (domain: string): LinkProfile => {
    if (!linkProfileByDomain.has(domain)) {
      linkProfileByDomain.set(domain, calculateLinkProfile(linksByTarget.get(domain) ?? []));
    }
    return linkProfileByDomain.get(domain)!;
  };
  const keywordById = new Map(scopedKeywords.map((row) => [row.id, row]));
  const organicByDomain = new Map<string, number>();
  for (const row of currentSerp) {
    const keyword = keywordById.get(row.keywordMetricId);
    if (!keyword) continue;
    const domain = normalizeDomain(row.domain) || row.domain;
    const averageVolume = averageVolumeByKeyword.get(keyword.normalizedKeyword) ?? keyword.volume;
    organicByDomain.set(
      domain,
      (organicByDomain.get(domain) ?? 0) + averageVolume * ctrForPosition(row.position),
    );
  }
  const authorityByDomain = new Map<string, number>();
  const domainAuthority = (domain: string): number => {
    if (!authorityByDomain.has(domain)) {
      const profile = linkProfile(domain);
      authorityByDomain.set(
        domain,
        calculateAuthorityScore({
          linkPower: profile.linkPower,
          organicTrafficEstimate: organicByDomain.get(domain) ?? 0,
          spamScore: profile.spamScore,
        }),
      );
    }
    return authorityByDomain.get(domain)!;
  };

  let lastCapturedAt = 0;
  const rows: GapKeywordRow[] = [];
  for (const keyword of latestKeywords) {
    const ranking = (serpByMetric.get(keyword.id) ?? []).toSorted(
      (a, b) => a.position - b.position,
    );
    if (ranking.length === 0) continue;

    const positions: (number | null)[] = [];
    const urls: (string | null)[] = [];
    for (const target of prepared) {
      const hit = ranking.find((row) => matchesTarget(row, target));
      positions.push(hit?.position ?? null);
      urls.push(hit?.url ?? null);
    }
    if (positions.every((position) => position === null)) continue;

    const capturedAtMs = toTimestamp(ranking[0].capturedAt);
    if (capturedAtMs > lastCapturedAt) lastCapturedAt = capturedAtMs;

    const averageVolume = averageVolumeByKeyword.get(keyword.normalizedKeyword) ?? keyword.volume;
    const profiles = ranking.map((row) => linkProfile(normalizeDomain(row.domain) || row.domain));
    const difficulty = calculateKeywordDifficulty({
      top10AuthorityScores: ranking.map((row) =>
        domainAuthority(normalizeDomain(row.domain) || row.domain),
      ),
      volume: averageVolume,
      medianReferringDomains: median(profiles.map((profile) => profile.referringDomains)),
      followShare: median(profiles.map((profile) => profile.followShare)),
      serpFeatureCount: new Set(ranking.flatMap(parseFeatures)).size,
      isBranded: keyword.intent === "navigational",
    });

    rows.push({
      keyword: keyword.keyword,
      intent: keyword.intent,
      volume: averageVolume,
      difficulty,
      cpcCents: keyword.cpcCents,
      positions,
      urls,
      categories: classifyGapCategories(positions),
      capturedAt: capturedAtMs > 0 ? new Date(capturedAtMs).toISOString() : null,
    });
  }
  rows.sort((a, b) => b.volume - a.volume || a.keyword.localeCompare(b.keyword));

  const counts: Record<GapCategory | "all", number> = {
    all: rows.length,
    shared: 0,
    missing: 0,
    weak: 0,
    strong: 0,
    untapped: 0,
    unique: 0,
  };
  for (const row of rows) {
    for (const category of row.categories) counts[category] += 1;
  }

  const overlaps: Array<{ a: number; b: number; count: number }> = [];
  for (let a = 0; a < prepared.length; a += 1) {
    for (let b = a + 1; b < prepared.length; b += 1) {
      overlaps.push({
        a,
        b,
        count: rows.filter((row) => row.positions[a] !== null && row.positions[b] !== null)
          .length,
      });
    }
  }

  return {
    query: { targets: prepared.map((item) => item.target), countryCode, device: query.device },
    targets: prepared.map((item, index) => ({
      target: item.target,
      label: item.label,
      rankedKeywords: rows.filter((row) => row.positions[index] !== null).length,
    })),
    rows,
    counts,
    overlaps,
    universe: {
      keywordCount: latestKeywords.length,
      comparedKeywordCount: rows.length,
      lastCapturedAt: lastCapturedAt > 0 ? new Date(lastCapturedAt).toISOString() : null,
    },
    models: { keywordDifficulty: "clone-kd-v1", intent: "clone-intent-v1" },
  };
}
