import { db } from "@/db/client";
import { mapRankSnapshots } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId } from "@/lib/ids";
import type { AuthContext } from "@/lib/session";
import type { LocalResultItem } from "@/server/talordata/client";
import { collectKeywordSerp } from "@/server/talordata/collect";
import { listMapRankKeywords } from "@/server/maprank/keywords";

/** 한 번의 수집 실행에서 처리할 키워드 상한 (크레딧 보호). */
const MAX_KEYWORDS_PER_RUN = 20;

export interface MapRankCollectOutcome {
  keywordId: string;
  keyword: string;
  localPackPresent: boolean;
  businessPosition: number | null;
  businesses: LocalResultItem[];
  fromCache: boolean;
  error?: string;
}

export interface MapRankCollectReport {
  collected: number;
  failed: number;
  outcomes: MapRankCollectOutcome[];
  capturedAt: string;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * 로컬팩 업체 목록에서 사업체명 위치를 찾는다.
 * 표시 이름은 지점명이 덧붙는 경우가 많아 정규화 후 포함 관계로 판정한다.
 */
function findBusinessPosition(
  businesses: LocalResultItem[],
  businessName: string
): number | null {
  const target = normalizeTitle(businessName);
  if (!target) return null;
  for (const business of businesses) {
    const title = normalizeTitle(business.title);
    if (title.includes(target) || target.includes(title)) {
      return business.position;
    }
  }
  return null;
}

/**
 * 추적 키워드 전체의 로컬팩 노출을 실측 수집한다.
 * SERP 조회는 collectKeywordSerp 의 TTL 캐시를 공유한다.
 */
export async function collectMapRanks(
  auth: AuthContext,
  input?: { forceRefresh?: boolean }
): Promise<MapRankCollectReport> {
  const keywords = (await listMapRankKeywords(auth)).slice(0, MAX_KEYWORDS_PER_RUN);
  if (keywords.length === 0) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "수집할 추적 키워드가 없습니다. 먼저 키워드를 추가해 주세요."
    );
  }

  const outcomes: MapRankCollectOutcome[] = [];
  let capturedAt = new Date();

  for (const tracked of keywords) {
    try {
      // 위치 근사: locationText 가 있으면 쿼리에 포함해 지역 의도를 강화한다.
      const query = tracked.locationText
        ? `${tracked.keyword} ${tracked.locationText}`
        : tracked.keyword;
      const collection = await collectKeywordSerp({
        keyword: query,
        countryCode: tracked.countryCode,
        device: "desktop",
        forceRefresh: input?.forceRefresh ?? false,
      });
      capturedAt = collection.capturedAt;

      const localResults = collection.localResults ?? [];
      const localPackPresent =
        localResults.length > 0 || collection.features.includes("local_pack");
      const businessPosition = localPackPresent
        ? findBusinessPosition(localResults, tracked.businessName)
        : null;

      await db.insert(mapRankSnapshots).values({
        id: newId("mrs"),
        keywordId: tracked.id,
        localPackPresent,
        businessPosition,
        businesses: JSON.stringify(localResults),
        source: "talordata",
        capturedAt: collection.capturedAt,
      });

      outcomes.push({
        keywordId: tracked.id,
        keyword: tracked.keyword,
        localPackPresent,
        businessPosition,
        businesses: localResults,
        fromCache: collection.fromCache,
      });
    } catch (error) {
      outcomes.push({
        keywordId: tracked.id,
        keyword: tracked.keyword,
        localPackPresent: false,
        businessPosition: null,
        businesses: [],
        fromCache: false,
        error: error instanceof ApiError ? error.message : "수집에 실패했습니다.",
      });
      if (error instanceof ApiError && (error.code === "RATE_LIMITED" || error.code === "INTERNAL")) {
        break;
      }
    }
  }

  return {
    collected: outcomes.filter((outcome) => !outcome.error).length,
    failed: outcomes.filter((outcome) => outcome.error).length,
    outcomes,
    capturedAt: capturedAt.toISOString(),
  };
}
