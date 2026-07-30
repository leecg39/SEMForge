import { and, desc, eq, inArray, isNull, max } from "drizzle-orm";
import { db } from "@/db/client";
import { mapRankKeywords, mapRankSnapshots } from "@/db/schema";
import type { AuthContext } from "@/lib/session";
import type { LocalResultItem } from "@/server/talordata/client";

const TREND_SNAPSHOT_LIMIT = 200;

export interface MapRankKeywordStatus {
  id: string;
  businessName: string;
  keyword: string;
  locationText: string;
  countryCode: string;
  localPackPresent: boolean | null;
  businessPosition: number | null;
  businesses: LocalResultItem[];
  lastCapturedAt: string | null;
}

export interface MapRankTrendPoint {
  date: string;
  collected: number;
  inPack: number;
}

export interface MapRankOverview {
  stats: {
    keywordCount: number;
    collectedCount: number;
    localPackCount: number;
    inPackCount: number;
    bestPosition: number | null;
    lastCollectedAt: string | null;
  };
  trend: MapRankTrendPoint[];
  keywords: MapRankKeywordStatus[];
}

function parseBusinesses(json: string): LocalResultItem[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? (value as LocalResultItem[]) : [];
  } catch {
    return [];
  }
}

/** 지도 순위 개요. 스냅샷 조회만 하며 외부 API 비용은 없다. */
export async function getMapRankOverview(auth: AuthContext): Promise<MapRankOverview> {
  const keywords = await db
    .select()
    .from(mapRankKeywords)
    .where(and(eq(mapRankKeywords.workspaceId, auth.workspaceId), isNull(mapRankKeywords.deletedAt)))
    .orderBy(desc(mapRankKeywords.createdAt));

  if (keywords.length === 0) {
    return {
      stats: {
        keywordCount: 0,
        collectedCount: 0,
        localPackCount: 0,
        inPackCount: 0,
        bestPosition: null,
        lastCollectedAt: null,
      },
      trend: [],
      keywords: [],
    };
  }

  const keywordIds = keywords.map((keyword) => keyword.id);
  const latestRows = await db
    .select({ keywordId: mapRankSnapshots.keywordId, latest: max(mapRankSnapshots.capturedAt) })
    .from(mapRankSnapshots)
    .where(inArray(mapRankSnapshots.keywordId, keywordIds))
    .groupBy(mapRankSnapshots.keywordId);
  const latestByKeyword = new Map(latestRows.map((row) => [row.keywordId, row.latest]));

  const statuses: MapRankKeywordStatus[] = [];
  let lastCollectedAt: Date | null = null;

  for (const keyword of keywords) {
    const latest = latestByKeyword.get(keyword.id);
    if (!latest) {
      statuses.push({
        id: keyword.id,
        businessName: keyword.businessName,
        keyword: keyword.keyword,
        locationText: keyword.locationText,
        countryCode: keyword.countryCode,
        localPackPresent: null,
        businessPosition: null,
        businesses: [],
        lastCapturedAt: null,
      });
      continue;
    }

    const [snapshot] = await db
      .select()
      .from(mapRankSnapshots)
      .where(
        and(eq(mapRankSnapshots.keywordId, keyword.id), eq(mapRankSnapshots.capturedAt, latest))
      )
      .orderBy(desc(mapRankSnapshots.capturedAt))
      .limit(1);

    if (!snapshot) {
      statuses.push({
        id: keyword.id,
        businessName: keyword.businessName,
        keyword: keyword.keyword,
        locationText: keyword.locationText,
        countryCode: keyword.countryCode,
        localPackPresent: null,
        businessPosition: null,
        businesses: [],
        lastCapturedAt: null,
      });
      continue;
    }

    if (!lastCollectedAt || snapshot.capturedAt > lastCollectedAt) {
      lastCollectedAt = snapshot.capturedAt;
    }

    statuses.push({
      id: keyword.id,
      businessName: keyword.businessName,
      keyword: keyword.keyword,
      locationText: keyword.locationText,
      countryCode: keyword.countryCode,
      localPackPresent: snapshot.localPackPresent,
      businessPosition: snapshot.businessPosition,
      businesses: parseBusinesses(snapshot.businesses),
      lastCapturedAt: snapshot.capturedAt.toISOString(),
    });
  }

  const history = await db
    .select({
      keywordId: mapRankSnapshots.keywordId,
      businessPosition: mapRankSnapshots.businessPosition,
      capturedAt: mapRankSnapshots.capturedAt,
    })
    .from(mapRankSnapshots)
    .where(inArray(mapRankSnapshots.keywordId, keywordIds))
    .orderBy(desc(mapRankSnapshots.capturedAt))
    .limit(TREND_SNAPSHOT_LIMIT);

  const trendByDate = new Map<string, { collected: number; inPack: number }>();
  for (const row of history) {
    const date = row.capturedAt.toISOString().slice(0, 10);
    const bucket = trendByDate.get(date) ?? { collected: 0, inPack: 0 };
    bucket.collected += 1;
    if (row.businessPosition !== null) bucket.inPack += 1;
    trendByDate.set(date, bucket);
  }
  const trend = [...trendByDate.entries()]
    .map(([date, bucket]) => ({ date, ...bucket }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const collected = statuses.filter((status) => status.localPackPresent !== null);
  const positions = statuses
    .map((status) => status.businessPosition)
    .filter((position): position is number => position !== null);

  return {
    stats: {
      keywordCount: keywords.length,
      collectedCount: collected.length,
      localPackCount: statuses.filter((status) => status.localPackPresent === true).length,
      inPackCount: positions.length,
      bestPosition: positions.length > 0 ? Math.min(...positions) : null,
      lastCollectedAt: lastCollectedAt ? lastCollectedAt.toISOString() : null,
    },
    trend,
    keywords: statuses,
  };
}
