import { db } from "@/db/client";
import {
  clickstreamEvents,
  keywordMetrics,
  linkGraphEdges,
  serpSnapshots,
} from "@/db/schema";
import { newId } from "@/lib/ids";

const DAY = 24 * 60 * 60 * 1000;

const CORE_DOMAINS = [
  "northwind.example.com",
  "acme.example.com",
  "globex.example.com",
] as const;

const COMPETITOR_DOMAINS = [
  "atlas.example",
  "marketpilot.example",
  "searchscope.example",
  "storefrontlabs.example",
  "retailstack.example",
  "growthgrid.example",
  "contentforge.example",
  "dataridge.example",
] as const;

const keywordSeeds = [
  { keyword: "marketing automation", volume: 12100, cpcCents: 890, intent: "commercial" as const, positions: [3, 6, 9] },
  { keyword: "seo analytics", volume: 9900, cpcCents: 720, intent: "commercial" as const, positions: [5, 4, 10] },
  { keyword: "competitor traffic analysis", volume: 6600, cpcCents: 1140, intent: "commercial" as const, positions: [7, 3, 8] },
  { keyword: "online store analytics", volume: 5400, cpcCents: 630, intent: "transactional" as const, positions: [4, 8, 7] },
  { keyword: "customer loyalty metrics", volume: 4400, cpcCents: 510, intent: "informational" as const, positions: [8, 5, 10] },
  { keyword: "inventory forecasting", volume: 3600, cpcCents: 970, intent: "informational" as const, positions: [6, 9, 8] },
  { keyword: "retail trend report", volume: 2900, cpcCents: 460, intent: "informational" as const, positions: [2, 7, 9] },
  { keyword: "ecommerce benchmark", volume: 2400, cpcCents: 580, intent: "navigational" as const, positions: [9, 2, 6] },
];

const historyDrift = [4, 4, 3, 3, 2, 2, 1, 1, 0, 0, 0, 0];

function monthDate(now: number, monthIndex: number): Date {
  const date = new Date(now);
  date.setUTCDate(1);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCMonth(date.getUTCMonth() - (11 - monthIndex));
  return date;
}

function rankingFor(
  keywordIndex: number,
  monthIndex: number,
  device: "desktop" | "mobile",
): string[] {
  const targets = keywordSeeds[keywordIndex].positions;
  const candidateScores = [
    ...CORE_DOMAINS.map((domain, index) => ({
      domain,
      score:
        targets[index] +
        historyDrift[monthIndex] * (index === 0 ? 0.45 : index === 1 ? 0.2 : 0.1) +
        (device === "mobile" ? ((keywordIndex + index) % 3) * 0.35 : 0),
    })),
    ...COMPETITOR_DOMAINS.map((domain, index) => ({
      domain,
      score: 1.3 + ((index * 2 + keywordIndex * 3) % 10) + index / 100,
    })),
  ];

  return candidateScores
    .sort((a, b) => a.score - b.score || a.domain.localeCompare(b.domain))
    .slice(0, 10)
    .map((row) => row.domain);
}

/** docs/data-architecture.md를 실제 화면에서 탐색할 수 있게 하는 결정적 데모 원천 데이터. */
export async function seedAnalyticsData(now = Date.now()) {
  console.log("[seed] SERP · 클릭스트림 · 링크 그래프 원천 데이터");

  for (const device of ["desktop", "mobile"] as const) {
    for (const [keywordIndex, spec] of keywordSeeds.entries()) {
      for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
        const capturedAt = monthDate(now, monthIndex);
        const keywordMetricId = newId("kwm");
        const seasonalFactor = 0.92 + ((monthIndex + keywordIndex) % 5) * 0.04;
        await db.insert(keywordMetrics).values({
          id: keywordMetricId,
          keyword: spec.keyword,
          normalizedKeyword: spec.keyword.toLocaleLowerCase("en-US"),
          countryCode: "US",
          device,
          periodStart: capturedAt,
          volume: Math.round(spec.volume * seasonalFactor),
          cpcCents: spec.cpcCents,
          currencyCode: "USD",
          intent: spec.intent,
          source: "demo-keyword-model",
          updatedAt: capturedAt,
        });

        const snapshots: (typeof serpSnapshots.$inferInsert)[] = [];
        const ranking = rankingFor(keywordIndex, monthIndex, device);
        for (const [rankIndex, domain] of ranking.entries()) {
          const position = rankIndex + 1;
          const features =
            position === 1 && keywordIndex % 3 === 0
              ? ["featured_snippet"]
              : position === 3 && keywordIndex % 4 === 0
                ? ["people_also_ask"]
                : [];
          snapshots.push({
            id: newId("srp"),
            keywordMetricId,
            searchEngine: "google",
            domain,
            url: `https://${domain}/${spec.keyword.replaceAll(" ", "-")}`,
            position,
            isAd: false,
            serpFeatures: JSON.stringify(features),
            source: "demo-serp-collector",
            capturedAt,
          });
        }
        await db.insert(serpSnapshots).values(snapshots);
      }
    }
  }

  const paths = ["/", "/features", "/pricing", "/blog", "/compare"];
  const channels = ["organic", "direct", "referral", "social", "paid", "email"] as const;
  const baseSessions = [14, 18, 9];
  const monthlyGrowth = [0.9, 1.15, 0.45];

  for (const [domainIndex, domain] of CORE_DOMAINS.entries()) {
    for (const device of ["desktop", "mobile"] as const) {
      for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
        const deviceFactor = device === "mobile" ? 0.72 : 1;
        const sessionCount = Math.max(
          4,
          Math.round((baseSessions[domainIndex] + monthlyGrowth[domainIndex] * monthIndex) * deviceFactor),
        );
        const eventRows: (typeof clickstreamEvents.$inferInsert)[] = [];
        for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex += 1) {
          const sessionHash = `sha256:demo-session-${domainIndex}-${device}-${monthIndex}-${sessionIndex}`;
          const eventCount = 1 + ((sessionIndex + domainIndex) % 3 === 0 ? 1 : 0);
          for (let eventIndex = 0; eventIndex < eventCount; eventIndex += 1) {
            const occurredAt = new Date(
              monthDate(now, monthIndex).getTime() +
                ((sessionIndex * 37 + eventIndex * 11) % 24) * DAY,
            );
            eventRows.push({
              id: newId("clk"),
              anonymousUserHash: `sha256:demo-user-${(Math.floor(sessionIndex / 2) + domainIndex * 17) % 53}`,
              sessionHash,
              domain,
              path: paths[(sessionIndex + eventIndex) % paths.length],
              countryCode: "US",
              device,
              channel: channels[(sessionIndex + monthIndex + domainIndex) % channels.length],
              populationWeight:
                1020 + domainIndex * 85 + monthIndex * 11 + (device === "mobile" ? 90 : 0),
              source: "demo-panel",
              occurredAt,
            });
          }
        }
        await db.insert(clickstreamEvents).values(eventRows);
      }
    }
  }

  const linkTargets = [...CORE_DOMAINS, ...COMPETITOR_DOMAINS];
  const edgeCounts = [42, 55, 26, 34, 31, 28, 25, 24, 22, 20, 18];
  for (const [targetIndex, targetDomain] of linkTargets.entries()) {
    const rows: (typeof linkGraphEdges.$inferInsert)[] = [];
    const edgeCount = edgeCounts[targetIndex];
    const referringDomainCount = Math.max(8, Math.round(edgeCount * 0.68));
    for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
      const refIndex = edgeIndex % referringDomainCount;
      const sourceDomain = `publisher-${targetIndex}-${refIndex}.example`;
      const repeatedIp = targetDomain === "globex.example.com" && refIndex % 3 === 0;
      const sourceNetwork = repeatedIp
        ? "network:shared-44"
        : `203.${targetIndex + 10}.${Math.floor(refIndex / 200)}.${(refIndex % 200) + 1}`;
      rows.push({
        id: newId("lnk"),
        sourceDomain,
        targetDomain,
        sourceUrl: `https://${sourceDomain}/article-${edgeIndex}`,
        targetUrl: `https://${targetDomain}/${edgeIndex % 4 === 0 ? "features" : ""}`,
        sourceNetwork,
        isFollow: edgeIndex % 5 !== 0,
        sourceAuthority: 24 + ((edgeIndex * 17 + targetIndex * 7) % 72),
        source: "demo-link-crawler",
        firstSeenAt: new Date(now - (180 - (edgeIndex % 150)) * DAY),
        lastSeenAt: new Date(now - (edgeIndex % 18) * DAY),
      });
    }
    await db.insert(linkGraphEdges).values(rows);
  }
}
