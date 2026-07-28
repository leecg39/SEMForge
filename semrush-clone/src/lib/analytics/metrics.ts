import type {
  AnalyticsRawDataset,
  DateValue,
  DomainAnalyticsReport,
  RawClickstreamEvent,
  RawKeywordMetric,
  RawLinkGraphEdge,
  RawSerpSnapshot,
} from "@/lib/analytics/types";

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
  const availableDomains = [...new Set(scopedClicks.map((row) => normalizeDomain(row.domain)))]
    .filter(Boolean)
    .toSorted();
  if (!domain || !availableDomains.includes(domain)) return null;

  const latestKeywords = latestKeywordRows(scopedKeywords);
  const latestKeywordIds = new Set(latestKeywords.map((row) => row.id));
  const latestSerp = scopedSerp.filter((row) => latestKeywordIds.has(row.keywordMetricId));
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
