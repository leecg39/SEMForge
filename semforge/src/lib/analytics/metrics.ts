import type {
  AnalyticsIntent,
  AnalyticsRawDataset,
  DateValue,
  DomainAnalyticsReport,
  PositionBucketKey,
  RawClickstreamEvent,
  RawKeywordMetric,
  RawLinkGraphEdge,
  RawSerpSnapshot,
} from "@/lib/analytics/types";

const POSITION_BUCKET_ORDER: readonly PositionBucketKey[] = [
  "1-3",
  "4-10",
  "11-20",
  "21-50",
  "51-100",
];

const AUTHORITY_BUCKET_LABELS = [
  "0-10",
  "11-20",
  "21-30",
  "31-40",
  "41-50",
  "51-60",
  "61-70",
  "71-80",
  "81-90",
  "91-100",
] as const;

export const CTR_CURVE_V1: Readonly<Record<number, number>> = {
  1: 0.279,
  2: 0.153,
  3: 0.11,
  4: 0.08,
  5: 0.061,
  6: 0.048,
  7: 0.039,
  8: 0.033,
  9: 0.028,
  10: 0.024,
};

const MODEL_VERSIONS = {
  organicTraffic: "clone-organic-traffic-v1",
  clickstream: "clone-clickstream-v1",
  authority: "clone-authority-v1",
  keywordDifficulty: "clone-kd-v1",
} as const;

function toTimestamp(value: DateValue): number {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isoOrNull(values: readonly DateValue[]): string | null {
  const timestamp = values.reduce<number>(
    (latest, value) => Math.max(latest, toTimestamp(value)),
    0,
  );
  return timestamp > 0 ? new Date(timestamp).toISOString() : null;
}

function monthKey(value: DateValue): string {
  const date = new Date(toTimestamp(value));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function median(values: readonly number[]): number {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function logNormalize(value: number, ceiling: number): number {
  if (value <= 0 || ceiling <= 1) return 0;
  return clampScore((Math.log1p(value) / Math.log1p(ceiling)) * 100);
}

export function ctrForPosition(position: number): number {
  if (!Number.isInteger(position) || position < 1) return 0;
  return CTR_CURVE_V1[position] ?? 0;
}

export function rollingAverageVolume(
  rows: readonly Pick<RawKeywordMetric, "periodStart" | "volume">[],
  months = 12,
): { value: number | null; monthsUsed: number } {
  const latestByMonth = new Map<string, { timestamp: number; volume: number }>();
  for (const row of rows) {
    if (!Number.isFinite(row.volume) || row.volume < 0) continue;
    const timestamp = toTimestamp(row.periodStart);
    if (timestamp <= 0) continue;
    const key = monthKey(row.periodStart);
    const current = latestByMonth.get(key);
    if (!current || timestamp > current.timestamp) {
      latestByMonth.set(key, { timestamp, volume: row.volume });
    }
  }
  const selected = [...latestByMonth.values()]
    .toSorted((a, b) => b.timestamp - a.timestamp)
    .slice(0, Math.max(1, months));
  if (selected.length === 0) return { value: null, monthsUsed: 0 };
  return {
    value: Math.round(selected.reduce((sum, row) => sum + row.volume, 0) / selected.length),
    monthsUsed: selected.length,
  };
}

export function estimateOrganicTraffic(
  rows: readonly { position: number; volume: number }[],
): number {
  return Math.round(
    rows.reduce(
      (total, row) => total + Math.max(0, row.volume) * ctrForPosition(row.position),
      0,
    ),
  );
}

export function summarizeWeightedClickstream(
  events: readonly Pick<
    RawClickstreamEvent,
    "sessionHash" | "anonymousUserHash" | "populationWeight"
  >[],
) {
  const sessions = new Map<
    string,
    { userHash: string; weight: number; pageViews: number }
  >();
  for (const event of events) {
    const weight = Math.max(0, event.populationWeight);
    const current = sessions.get(event.sessionHash);
    if (current) {
      current.pageViews += 1;
      current.weight = Math.max(current.weight, weight);
    } else {
      sessions.set(event.sessionHash, {
        userHash: event.anonymousUserHash,
        weight,
        pageViews: 1,
      });
    }
  }

  const userWeights = new Map<string, number>();
  let visitsEstimate = 0;
  let weightedPageViews = 0;
  let bouncedVisits = 0;
  for (const session of sessions.values()) {
    visitsEstimate += session.weight;
    weightedPageViews += session.weight * session.pageViews;
    if (session.pageViews === 1) bouncedVisits += session.weight;
    userWeights.set(
      session.userHash,
      Math.max(userWeights.get(session.userHash) ?? 0, session.weight),
    );
  }

  return {
    visitsEstimate: Math.round(visitsEstimate),
    uniqueVisitorsEstimate: Math.round(
      [...userWeights.values()].reduce((sum, weight) => sum + weight, 0),
    ),
    pagesPerVisit:
      visitsEstimate > 0 ? Math.round((weightedPageViews / visitsEstimate) * 100) / 100 : 0,
    bounceRate:
      visitsEstimate > 0 ? Math.round((bouncedVisits / visitsEstimate) * 1000) / 10 : 0,
  };
}

export interface LinkProfile {
  backlinks: number;
  referringDomains: number;
  followShare: number;
  averageSourceAuthority: number;
  networkConcentration: number;
  linkPower: number;
  spamScore: number;
}

export function calculateLinkProfile(edges: readonly RawLinkGraphEdge[]): LinkProfile {
  if (edges.length === 0) {
    return {
      backlinks: 0,
      referringDomains: 0,
      followShare: 0,
      averageSourceAuthority: 0,
      networkConcentration: 0,
      linkPower: 0,
      spamScore: 0,
    };
  }
  const referringDomains = new Set(edges.map((edge) => edge.sourceDomain)).size;
  const followCount = edges.filter((edge) => edge.isFollow).length;
  const averageSourceAuthority =
    edges.reduce((sum, edge) => sum + clampScore(edge.sourceAuthority), 0) / edges.length;
  const networkCounts = new Map<string, number>();
  for (const edge of edges) {
    networkCounts.set(edge.sourceNetwork, (networkCounts.get(edge.sourceNetwork) ?? 0) + 1);
  }
  const maxNetworkLinks = Math.max(...networkCounts.values());
  const networkConcentration = maxNetworkLinks / edges.length;
  const weightedQuality = edges.reduce(
    (sum, edge) =>
      sum + Math.log1p(clampScore(edge.sourceAuthority)) * (edge.isFollow ? 1 : 0.25),
    0,
  );
  const followShare = (followCount / edges.length) * 100;
  const linkPower = clampScore(100 * (1 - Math.exp(-weightedQuality / 120)));
  const spamScore = clampScore(
    Math.max(0, networkConcentration - 0.1) * 160 + (1 - followCount / edges.length) * 35,
  );
  return {
    backlinks: edges.length,
    referringDomains,
    followShare: Math.round(followShare * 10) / 10,
    averageSourceAuthority: Math.round(averageSourceAuthority * 10) / 10,
    networkConcentration: Math.round(networkConcentration * 1000) / 1000,
    linkPower: Math.round(linkPower * 10) / 10,
    spamScore: Math.round(spamScore * 10) / 10,
  };
}

export function calculateAuthorityScore(input: {
  linkPower: number;
  organicTrafficEstimate: number;
  spamScore: number;
}): number {
  const trafficScore = logNormalize(Math.max(0, input.organicTrafficEstimate), 1_000_000);
  return Math.round(
    clampScore(
      clampScore(input.linkPower) * 0.55 +
        trafficScore * 0.35 +
        (100 - clampScore(input.spamScore)) * 0.1,
    ),
  );
}

export function calculateKeywordDifficulty(input: {
  top10AuthorityScores: readonly number[];
  volume: number;
  medianReferringDomains: number;
  followShare: number;
  serpFeatureCount: number;
  isBranded: boolean;
}): number {
  const authority = clampScore(median(input.top10AuthorityScores.slice(0, 10)));
  const volume = logNormalize(Math.max(0, input.volume), 1_000_000);
  const referringDomains = logNormalize(Math.max(0, input.medianReferringDomains), 10_000);
  const followShare = clampScore(input.followShare);
  const serpFeatures = clampScore(input.serpFeatureCount * 35);
  const branded = input.isBranded ? 100 : 0;
  const concentration = input.top10AuthorityScores.length
    ? clampScore(Math.max(...input.top10AuthorityScores.slice(0, 10)))
    : 0;

  // 공개된 AS(16.99%)·볼륨(9.47%) 가중치와 클론용 나머지 피처 모델.
  return Math.round(
    clampScore(
      authority * 0.1699 +
        volume * 0.0947 +
        referringDomains * 0.42 +
        followShare * 0.12 +
        serpFeatures * 0.1 +
        branded * 0.05 +
        concentration * 0.0454,
    ),
  );
}

export function normalizeDomain(input: string): string {
  const trimmed = input.trim().toLocaleLowerCase("en-US");
  if (!trimmed) return "";
  try {
    const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const hostname = new URL(withProtocol).hostname.replace(/^www\./, "").replace(/\.$/, "");
    return hostname;
  } catch {
    return "";
  }
}

/** collect.ts 의 normalizeKeyword 와 같은 규칙 (공백 정리 + 소문자). */
function normalizeKeywordText(keyword: string): string {
  return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

export interface KeywordOverviewMetrics {
  /** 최근 12개월 평균 검색량. 관측이 없으면 0. */
  volume: number;
  volumeMonthsUsed: number;
  intent: AnalyticsIntent | null;
  cpcCents: number | null;
  /** clone-kd-v1 키워드 난이도 (0~100). */
  difficulty: number;
  /** 현재 SERP 도메인별 링크/권위 프로필. */
  domainStats: Map<
    string,
    { authorityScore: number; backlinks: number; referringDomains: number }
  >;
}

/**
 * 단일 키워드 관점의 파생 지표.
 * buildDomainAnalytics 와 같은 원천(키워드 메타 + SERP 스냅샷 + 링크 그래프)과
 * 같은 모델(clone-authority-v1, clone-kd-v1)을 사용하되, 방금 수집한 현재
 * SERP(results)를 입력으로 받아 그 상위 도메인들의 난이도를 계산한다.
 */
export function buildKeywordOverviewMetrics(
  dataset: AnalyticsRawDataset,
  query: {
    keyword: string;
    countryCode: string;
    device: "desktop" | "mobile";
    serpFeatureCount: number;
    /** 현재 SERP 의 (position, domain) 목록. 순서/순위 기준으로 상위 10개만 사용. */
    results: readonly { position: number; domain: string }[];
  },
): KeywordOverviewMetrics {
  const countryCode = query.countryCode.toUpperCase();
  const normalizedKeyword = normalizeKeywordText(query.keyword);
  const scopedKeywords = dataset.keywords.filter(
    (row) => row.countryCode === countryCode && row.device === query.device,
  );

  /* 검색량·의도: 같은 키워드의 월별 메타에서 12개월 평균을 만든다. */
  const keywordRows = scopedKeywords.filter(
    (row) => row.normalizedKeyword === normalizedKeyword,
  );
  const rolling = rollingAverageVolume(keywordRows);
  const latestRow = keywordRows.toSorted(
    (a, b) => toTimestamp(b.periodStart) - toTimestamp(a.periodStart),
  )[0];

  /* 도메인 권위 컨텍스트: buildDomainAnalytics 와 동일한 최신 스냅샷 스코프. */
  const scopedKeywordIds = new Set(scopedKeywords.map((row) => row.id));
  const scopedSerp = dataset.serp.filter(
    (row) =>
      scopedKeywordIds.has(row.keywordMetricId) &&
      row.searchEngine === "google" &&
      !row.isAd,
  );
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

  const keywordById = new Map(scopedKeywords.map((row) => [row.id, row]));
  const linksByTarget = new Map<string, RawLinkGraphEdge[]>();
  for (const edge of dataset.links) {
    const target = normalizeDomain(edge.targetDomain);
    const list = linksByTarget.get(target) ?? [];
    list.push(edge);
    linksByTarget.set(target, list);
  }
  const linkProfileByDomain = new Map<string, LinkProfile>();
  const linkProfile = (target: string) => {
    if (!linkProfileByDomain.has(target)) {
      linkProfileByDomain.set(target, calculateLinkProfile(linksByTarget.get(target) ?? []));
    }
    return linkProfileByDomain.get(target)!;
  };

  const organicByDomain = new Map<string, number>();
  for (const row of currentSerp) {
    const keyword = keywordById.get(row.keywordMetricId);
    if (!keyword) continue;
    const normalized = normalizeDomain(row.domain);
    organicByDomain.set(
      normalized,
      (organicByDomain.get(normalized) ?? 0) + keyword.volume * ctrForPosition(row.position),
    );
  }
  const domainAuthority = (target: string) => {
    const profile = linkProfile(target);
    return calculateAuthorityScore({
      linkPower: profile.linkPower,
      organicTrafficEstimate: organicByDomain.get(target) ?? 0,
      spamScore: profile.spamScore,
    });
  };

  /* 현재 SERP 상위 10개 도메인의 프로필로 KD 를 계산한다. */
  const top10 = query.results
    .toSorted((a, b) => a.position - b.position)
    .slice(0, 10)
    .map((row) => normalizeDomain(row.domain) || row.domain);
  const profiles = top10.map((domain) => linkProfile(domain));
  const volume = rolling.value ?? latestRow?.volume ?? 0;
  const intent = latestRow?.intent ?? null;
  const difficulty = calculateKeywordDifficulty({
    top10AuthorityScores: top10.map((domain) => domainAuthority(domain)),
    volume,
    medianReferringDomains: median(profiles.map((profile) => profile.referringDomains)),
    followShare: median(profiles.map((profile) => profile.followShare)),
    serpFeatureCount: query.serpFeatureCount,
    isBranded: intent === "navigational",
  });

  const domainStats = new Map<
    string,
    { authorityScore: number; backlinks: number; referringDomains: number }
  >();
  for (const domain of new Set(
    query.results.map((row) => normalizeDomain(row.domain) || row.domain),
  )) {
    const profile = linkProfile(domain);
    domainStats.set(domain, {
      authorityScore: domainAuthority(domain),
      backlinks: profile.backlinks,
      referringDomains: profile.referringDomains,
    });
  }

  return {
    volume,
    volumeMonthsUsed: rolling.monthsUsed,
    intent,
    cpcCents: latestRow?.cpcCents ?? null,
    difficulty,
    domainStats,
  };
}

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
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function latestMonthEvents(events: readonly RawClickstreamEvent[]): RawClickstreamEvent[] {
  const months = events.map((event) => monthKey(event.occurredAt)).toSorted();
  const latest = months.at(-1);
  return latest ? events.filter((event) => monthKey(event.occurredAt) === latest) : [];
}

export function buildDomainAnalytics(
  dataset: AnalyticsRawDataset,
  query: { domain: string; countryCode: string; device: "desktop" | "mobile" },
): DomainAnalyticsReport | null {
  const domain = normalizeDomain(query.domain);
  const countryCode = query.countryCode.toUpperCase();
  const scopedKeywords = dataset.keywords.filter(
    (row) => row.countryCode === countryCode && row.device === query.device,
  );
  const scopedKeywordIds = new Set(scopedKeywords.map((row) => row.id));
  const scopedSerp = dataset.serp.filter(
    (row) => scopedKeywordIds.has(row.keywordMetricId) && row.searchEngine === "google" && !row.isAd,
  );
  const scopedClicks = dataset.clickstream.filter(
    (row) => row.countryCode === countryCode && row.device === query.device,
  );

  // 같은 키워드에 여러 시점의 스냅샷이 있으면 최신 capturedAt 행만 현재 지표에 사용한다.
  // 과거 행은 trend 계산의 이력으로만 남긴다.
  const latestCapturedAt = new Map<string, number>();
  for (const row of scopedSerp) {
    const key = `${row.keywordMetricId}|${row.searchEngine}`;
    const timestamp = toTimestamp(row.capturedAt);
    if (timestamp > (latestCapturedAt.get(key) ?? 0)) {
      latestCapturedAt.set(key, timestamp);
    }
  }
  const currentSerp = scopedSerp.filter(
    (row) =>
      toTimestamp(row.capturedAt) ===
      latestCapturedAt.get(`${row.keywordMetricId}|${row.searchEngine}`),
  );

  // 조회 가능 도메인은 클릭스트림·SERP·링크 그래프 어느 원천에라도 잡힌 도메인의 합집합이다.
  // 클릭스트림이 없는 도메인은 visits 계열 지표가 0 으로 표시된다.
  const availableDomains = [
    ...new Set(
      [
        ...scopedClicks.map((row) => normalizeDomain(row.domain)),
        ...currentSerp.map((row) => normalizeDomain(row.domain)),
        ...dataset.links.map((row) => normalizeDomain(row.targetDomain)),
      ].filter(Boolean),
    ),
  ].toSorted();
  if (!domain || !availableDomains.includes(domain)) return null;

  const latestKeywords = latestKeywordRows(scopedKeywords);
  const latestKeywordIds = new Set(latestKeywords.map((row) => row.id));
  const latestSerp = currentSerp.filter((row) => latestKeywordIds.has(row.keywordMetricId));
  const keywordById = new Map(scopedKeywords.map((row) => [row.id, row]));
  const averageVolumeByKeyword = new Map(
    latestKeywords.map((row) => [
      row.normalizedKeyword,
      rollingAverageVolume(
        scopedKeywords.filter(
          (candidate) => candidate.normalizedKeyword === row.normalizedKeyword,
        ),
      ).value ?? row.volume,
    ]),
  );

  const linksByTarget = new Map<string, RawLinkGraphEdge[]>();
  for (const edge of dataset.links) {
    const target = normalizeDomain(edge.targetDomain);
    const list = linksByTarget.get(target) ?? [];
    list.push(edge);
    linksByTarget.set(target, list);
  }
  const linkProfileByDomain = new Map<string, LinkProfile>();
  const linkProfile = (target: string) => {
    if (!linkProfileByDomain.has(target)) {
      linkProfileByDomain.set(target, calculateLinkProfile(linksByTarget.get(target) ?? []));
    }
    return linkProfileByDomain.get(target)!;
  };

  const organicByDomain = new Map<string, number>();
  for (const row of latestSerp) {
    const keyword = keywordById.get(row.keywordMetricId);
    if (!keyword) continue;
    const normalized = normalizeDomain(row.domain);
    const averageVolume = averageVolumeByKeyword.get(keyword.normalizedKeyword) ?? keyword.volume;
    organicByDomain.set(
      normalized,
      (organicByDomain.get(normalized) ?? 0) + averageVolume * ctrForPosition(row.position),
    );
  }
  const authorityByDomain = new Map<string, number>();
  const domainAuthority = (target: string) => {
    if (!authorityByDomain.has(target)) {
      const profile = linkProfile(target);
      authorityByDomain.set(
        target,
        calculateAuthorityScore({
          linkPower: profile.linkPower,
          organicTrafficEstimate: organicByDomain.get(target) ?? 0,
          spamScore: profile.spamScore,
        }),
      );
    }
    return authorityByDomain.get(target)!;
  };

  const topKeywords = latestKeywords.flatMap((keyword) => {
    const ranking = latestSerp
      .filter((row) => row.keywordMetricId === keyword.id)
      .toSorted((a, b) => a.position - b.position);
    const target = ranking.find((row) => normalizeDomain(row.domain) === domain);
    if (!target) return [];
    const profiles = ranking.map((row) => linkProfile(normalizeDomain(row.domain)));
    const averageVolume = averageVolumeByKeyword.get(keyword.normalizedKeyword) ?? keyword.volume;
    const difficulty = calculateKeywordDifficulty({
      top10AuthorityScores: ranking.map((row) => domainAuthority(normalizeDomain(row.domain))),
      volume: averageVolume,
      medianReferringDomains: median(profiles.map((profile) => profile.referringDomains)),
      followShare: median(profiles.map((profile) => profile.followShare)),
      serpFeatureCount: new Set(ranking.flatMap(parseFeatures)).size,
      isBranded: keyword.intent === "navigational",
    });
    return [
      {
        keyword: keyword.keyword,
        intent: keyword.intent,
        position: target.position,
        volume: averageVolume,
        difficulty,
        trafficContribution: estimateOrganicTraffic([
          { position: target.position, volume: averageVolume },
        ]),
        url: target.url,
        cpcCents: keyword.cpcCents,
      },
    ];
  }).toSorted((a, b) => b.trafficContribution - a.trafficContribution);

  const organicTrafficEstimate = topKeywords.reduce(
    (sum, row) => sum + row.trafficContribution,
    0,
  );
  const targetLinks = dataset.links.filter(
    (edge) => normalizeDomain(edge.targetDomain) === domain,
  );
  const targetLinkProfile = linkProfile(domain);
  const authorityScore = domainAuthority(domain);
  const targetClicks = scopedClicks.filter((row) => normalizeDomain(row.domain) === domain);
  const currentClicks = latestMonthEvents(targetClicks);
  const clickSummary = summarizeWeightedClickstream(currentClicks);

  const organicByPeriod = new Map<string, number>();
  const keywordsByPeriod = new Map<string, number>();
  for (const keyword of scopedKeywords) {
    const target = scopedSerp.find(
      (row) =>
        row.keywordMetricId === keyword.id && normalizeDomain(row.domain) === domain,
    );
    const period = monthKey(keyword.periodStart);
    const contribution = target
      ? estimateOrganicTraffic([{ position: target.position, volume: keyword.volume }])
      : 0;
    organicByPeriod.set(period, (organicByPeriod.get(period) ?? 0) + contribution);
    if (target) keywordsByPeriod.set(period, (keywordsByPeriod.get(period) ?? 0) + 1);
  }
  const clicksByPeriod = new Map<string, RawClickstreamEvent[]>();
  for (const event of targetClicks) {
    const period = monthKey(event.occurredAt);
    const list = clicksByPeriod.get(period) ?? [];
    list.push(event);
    clicksByPeriod.set(period, list);
  }
  const periods = [...new Set([...organicByPeriod.keys(), ...clicksByPeriod.keys()])]
    .toSorted()
    .slice(-12);
  const trend = periods.map((period) => ({
    period,
    organicTrafficEstimate: organicByPeriod.get(period) ?? 0,
    visitsEstimate: summarizeWeightedClickstream(clicksByPeriod.get(period) ?? []).visitsEstimate,
    keywords: keywordsByPeriod.get(period) ?? 0,
  }));

  const channelVisits = new Map<RawClickstreamEvent["channel"], number>();
  const sessionsByChannel = new Map<string, RawClickstreamEvent>();
  for (const event of currentClicks) {
    if (!sessionsByChannel.has(event.sessionHash)) sessionsByChannel.set(event.sessionHash, event);
  }
  for (const event of sessionsByChannel.values()) {
    channelVisits.set(
      event.channel,
      (channelVisits.get(event.channel) ?? 0) + event.populationWeight,
    );
  }
  const channels = [...channelVisits.entries()]
    .map(([channel, visitsEstimate]) => ({
      channel,
      visitsEstimate: Math.round(visitsEstimate),
      share:
        clickSummary.visitsEstimate > 0
          ? Math.round((visitsEstimate / clickSummary.visitsEstimate) * 1000) / 10
          : 0,
    }))
    .toSorted((a, b) => b.visitsEstimate - a.visitsEstimate);

  /* ---- 도메인 개요 분포 레이어 (개요 화면의 도넛/분포 차트 입력) ---- */

  // 의도 분포: 상위 키워드 기준.
  const intentCounts = new Map<AnalyticsIntent, number>();
  for (const row of topKeywords) {
    intentCounts.set(row.intent, (intentCounts.get(row.intent) ?? 0) + 1);
  }
  const intentDistribution = [...intentCounts.entries()]
    .map(([intent, keywords]) => ({
      intent,
      keywords,
      share: topKeywords.length
        ? Math.round((keywords / topKeywords.length) * 1000) / 10
        : 0,
    }))
    .toSorted((a, b) => b.keywords - a.keywords);

  // SERP 피처: 도메인이 랭킹된 최신 키워드들의 SERP 에서 피처가 관찰된 비율.
  const rankedKeywordIds = new Set(
    latestSerp
      .filter((row) => normalizeDomain(row.domain) === domain)
      .map((row) => row.keywordMetricId),
  );
  const featureKeywords = new Map<string, Set<string>>();
  for (const row of latestSerp) {
    if (!rankedKeywordIds.has(row.keywordMetricId)) continue;
    for (const feature of parseFeatures(row)) {
      const keywordSet = featureKeywords.get(feature) ?? new Set<string>();
      keywordSet.add(row.keywordMetricId);
      featureKeywords.set(feature, keywordSet);
    }
  }
  const serpFeatures = [...featureKeywords.entries()]
    .map(([feature, keywordSet]) => ({
      feature,
      keywords: keywordSet.size,
      share: rankedKeywordIds.size
        ? Math.round((keywordSet.size / rankedKeywordIds.size) * 10000) / 100
        : 0,
    }))
    .toSorted((a, b) => b.share - a.share || a.feature.localeCompare(b.feature));

  // 포지션 분포: 최신 스냅샷에서 도메인의 순위 버킷.
  const positionBucketOf = (position: number): PositionBucketKey =>
    position <= 3
      ? "1-3"
      : position <= 10
        ? "4-10"
        : position <= 20
          ? "11-20"
          : position <= 50
            ? "21-50"
            : "51-100";
  const positionCounts = new Map<PositionBucketKey, number>();
  for (const row of latestSerp) {
    if (normalizeDomain(row.domain) !== domain) continue;
    const bucket = positionBucketOf(row.position);
    positionCounts.set(bucket, (positionCounts.get(bucket) ?? 0) + 1);
  }
  const positionDistribution = POSITION_BUCKET_ORDER.map((bucket) => {
    const keywords = positionCounts.get(bucket) ?? 0;
    return {
      bucket,
      keywords,
      share: rankedKeywordIds.size
        ? Math.round((keywords / rankedKeywordIds.size) * 1000) / 10
        : 0,
    };
  });

  // 브랜드/논브랜드 분할: 도메인 SLD 토큰 포함 여부의 휴리스틱.
  const brandTokens = (domain.split(".")[0] ?? "").split(/[-_]/).filter(Boolean);
  const isBrandedKeyword = (keyword: string) => {
    const normalized = keyword.toLocaleLowerCase("en-US");
    return brandTokens.some((token) => token.length >= 2 && normalized.includes(token));
  };
  const brandedRows = topKeywords.filter((row) => isBrandedKeyword(row.keyword));
  const nonBrandedRows = topKeywords.filter((row) => !isBrandedKeyword(row.keyword));
  const brandedTraffic = brandedRows.reduce((sum, row) => sum + row.trafficContribution, 0);
  const toBrandedRow = (row: (typeof topKeywords)[number]) => ({
    keyword: row.keyword,
    volume: row.volume,
    trafficContribution: row.trafficContribution,
  });
  const brandedSplit = {
    totalTraffic: organicTrafficEstimate,
    brandedTraffic,
    brandedShare:
      organicTrafficEstimate > 0
        ? Math.round((brandedTraffic / organicTrafficEstimate) * 1000) / 10
        : 0,
    brandedKeywords: brandedRows.slice(0, 5).map(toBrandedRow),
    nonBrandedKeywords: nonBrandedRows.slice(0, 5).map(toBrandedRow),
  };

  // 참조 도메인 권위 분포: 소스 도메인별 평균 sourceAuthority 를 10점 버킷으로.
  const authoritySumByRefDomain = new Map<string, { sum: number; count: number }>();
  for (const edge of targetLinks) {
    const entry = authoritySumByRefDomain.get(edge.sourceDomain) ?? { sum: 0, count: 0 };
    entry.sum += clampScore(edge.sourceAuthority);
    entry.count += 1;
    authoritySumByRefDomain.set(edge.sourceDomain, entry);
  }
  const authorityCounts = new Map<string, number>(
    AUTHORITY_BUCKET_LABELS.map((label) => [label, 0]),
  );
  for (const { sum, count } of authoritySumByRefDomain.values()) {
    const average = sum / count;
    const index = Math.min(9, Math.max(0, Math.floor(Math.max(0, average - 1) / 10)));
    const label = AUTHORITY_BUCKET_LABELS[index];
    authorityCounts.set(label, (authorityCounts.get(label) ?? 0) + 1);
  }
  const refDomainsByAuthority = AUTHORITY_BUCKET_LABELS.map((bucket) => ({
    bucket,
    referringDomains: authorityCounts.get(bucket) ?? 0,
  }));

  // 상위 링크 페이지: targetUrl 호스트별 백링크 수와 참조 도메인 수.
  const linkedPageMap = new Map<string, { backlinks: number; sources: Set<string> }>();
  for (const edge of targetLinks) {
    let host = "";
    try {
      host = new URL(edge.targetUrl).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    if (!host) continue;
    const entry = linkedPageMap.get(host) ?? { backlinks: 0, sources: new Set<string>() };
    entry.backlinks += 1;
    entry.sources.add(edge.sourceDomain);
    linkedPageMap.set(host, entry);
  }
  const topLinkedPages = [...linkedPageMap.entries()]
    .map(([host, entry]) => ({
      host,
      backlinks: entry.backlinks,
      referringDomains: entry.sources.size,
    }))
    .toSorted((a, b) => b.backlinks - a.backlinks || a.host.localeCompare(b.host))
    .slice(0, 5);

  const freshness = {
    keywordMetricsThrough: isoOrNull(scopedKeywords.map((row) => row.updatedAt)),
    serpCapturedAt: isoOrNull(scopedSerp.map((row) => row.capturedAt)),
    clickstreamThrough: isoOrNull(targetClicks.map((row) => row.occurredAt)),
    linksThrough: isoOrNull(targetLinks.map((row) => row.lastSeenAt)),
  };

  return {
    query: { domain, countryCode, device: query.device },
    availableDomains,
    metrics: {
      authorityScore: {
        value: authorityScore,
        kind: "modeled",
        modelVersion: MODEL_VERSIONS.authority,
        source: "link_graph + organic_traffic + spam signals",
        confidence: "medium",
      },
      organicTrafficEstimate: {
        value: organicTrafficEstimate,
        kind: "estimated",
        modelVersion: MODEL_VERSIONS.organicTraffic,
        source: "SERP positions × 12-month average keyword volume × CTR",
        confidence: "medium",
      },
      visitsEstimate: {
        value: clickSummary.visitsEstimate,
        kind: "estimated",
        modelVersion: MODEL_VERSIONS.clickstream,
        source: "weighted clickstream sessions",
        confidence: "low",
      },
      uniqueVisitorsEstimate: {
        value: clickSummary.uniqueVisitorsEstimate,
        kind: "estimated",
        modelVersion: MODEL_VERSIONS.clickstream,
        source: "weighted anonymous panel users",
        confidence: "low",
      },
      organicKeywords: topKeywords.length,
      backlinks: targetLinkProfile.backlinks,
      referringDomains: targetLinkProfile.referringDomains,
      pagesPerVisit: clickSummary.pagesPerVisit,
      bounceRate: clickSummary.bounceRate,
      followShare: targetLinkProfile.followShare,
    },
    trend,
    topKeywords,
    intentDistribution,
    serpFeatures,
    positionDistribution,
    brandedSplit,
    refDomainsByAuthority,
    topLinkedPages,
    channels,
    sources: [
      {
        key: "keyword_metrics",
        label: "Keyword metadata",
        records: scopedKeywords.length,
        lastUpdated: freshness.keywordMetricsThrough,
        cadence: "Monthly",
        role: "12-month average volume, CPC and intent",
      },
      {
        key: "serp_snapshots",
        label: "SERP snapshots",
        records: scopedSerp.length,
        lastUpdated: freshness.serpCapturedAt,
        cadence: "Daily–monthly",
        role: "Domain positions and SERP features",
      },
      {
        key: "clickstream_events",
        label: "Clickstream panel",
        records: targetClicks.length,
        lastUpdated: freshness.clickstreamThrough,
        cadence: "Daily",
        role: "Weighted visits, visitors and channels",
      },
      {
        key: "link_graph",
        label: "Link graph",
        records: targetLinks.length,
        lastUpdated: freshness.linksThrough,
        cadence: "Continuous crawl",
        role: "Backlinks, referring domains and link quality",
      },
    ],
    freshness,
    models: MODEL_VERSIONS,
  };
}
