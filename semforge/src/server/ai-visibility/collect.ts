import { db } from "@/db/client";
import { aiVisibilitySnapshots } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { newId } from "@/lib/ids";
import type { AuthContext } from "@/lib/session";
import { collectKeywordSerp } from "@/server/talordata/collect";
import { listAiVisibilityQueries } from "@/server/ai-visibility/queries";

/** 한 번의 수집 실행에서 처리할 쿼리 상한 (크레딧 보호). */
const MAX_QUERIES_PER_RUN = 20;

export interface AiVisibilityCollectOutcome {
  queryId: string;
  query: string;
  aioPresent: boolean;
  /** null = 제공사가 AIO 본문을 주지 않아 인용 판정 불가. */
  cited: boolean | null;
  citedUrl: string | null;
  citedDomains: string[];
  organicPosition: number | null;
  fromCache: boolean;
  error?: string;
}

export interface AiVisibilityCollectReport {
  domain: string;
  collected: number;
  failed: number;
  outcomes: AiVisibilityCollectOutcome[];
  capturedAt: string;
}

function domainMatches(candidate: string, target: string): boolean {
  return candidate === target || candidate.endsWith(`.${target}`);
}

/**
 * 도메인의 추적 쿼리 전체를 순회하며 AIO 출현/인용을 실측 수집한다.
 * SERP 조회는 collectKeywordSerp 의 TTL 캐시를 공유하므로 포지션 추적과
 * 같은 키워드를 중복 과금하지 않는다.
 */
export async function collectAiVisibility(
  auth: AuthContext,
  input: { domain: string; forceRefresh?: boolean }
): Promise<AiVisibilityCollectReport> {
  const domain = normalizeDomain(input.domain);
  if (!domain || !domain.includes(".")) {
    throw new ApiError("VALIDATION_ERROR", "유효한 도메인을 입력해 주세요.", {
      fields: { domain: "예: example.com" },
    });
  }

  const queries = (await listAiVisibilityQueries(auth, domain)).slice(0, MAX_QUERIES_PER_RUN);
  if (queries.length === 0) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "수집할 추적 쿼리가 없습니다. 먼저 쿼리를 추가해 주세요."
    );
  }

  const outcomes: AiVisibilityCollectOutcome[] = [];
  let capturedAt = new Date();

  for (const tracked of queries) {
    try {
      const collection = await collectKeywordSerp({
        keyword: tracked.query,
        countryCode: tracked.countryCode,
        device: tracked.device,
        forceRefresh: input.forceRefresh ?? false,
      });
      capturedAt = collection.capturedAt;

      const aioPresent =
        collection.aiOverview?.present ?? collection.features.includes("ai_overview");
      const citations = collection.aiOverview?.citations ?? [];
      const citationsAvailable = collection.aiOverview?.citationsAvailable ?? false;
      const ownCitation = citations.find((citation) => domainMatches(citation.domain, domain));
      const organicHit = collection.results.find((item) =>
        domainMatches(item.domain, domain)
      );

      // AIO 없음 → 인용됨=false(확정). AIO 있음+본문 제공 → 판정 가능.
      // AIO 있음+본문 미제공(또는 캐시 재사용) → null(판정 불가)로 둔다.
      const cited: boolean | null = !aioPresent
        ? false
        : citationsAvailable
          ? Boolean(ownCitation)
          : null;
      const citedDomains = citationsAvailable ? citations.map((c) => c.domain) : [];

      await db.insert(aiVisibilitySnapshots).values({
        id: newId("avs"),
        queryId: tracked.id,
        aioPresent,
        cited,
        citedUrl: ownCitation?.url ?? null,
        citedDomains: JSON.stringify(citedDomains),
        organicPosition: organicHit?.position ?? null,
        features: JSON.stringify(collection.features),
        source: "talordata",
        capturedAt: collection.capturedAt,
      });

      outcomes.push({
        queryId: tracked.id,
        query: tracked.query,
        aioPresent,
        cited,
        citedUrl: ownCitation?.url ?? null,
        citedDomains,
        organicPosition: organicHit?.position ?? null,
        fromCache: collection.fromCache,
      });
    } catch (error) {
      outcomes.push({
        queryId: tracked.id,
        query: tracked.query,
        aioPresent: false,
        cited: null,
        citedUrl: null,
        citedDomains: [],
        organicPosition: null,
        fromCache: false,
        error: error instanceof ApiError ? error.message : "수집에 실패했습니다.",
      });
      // 사용량 한도/제공사 오류는 나머지 쿼리도 실패하므로 중단한다.
      if (error instanceof ApiError && (error.code === "RATE_LIMITED" || error.code === "INTERNAL")) {
        break;
      }
    }
  }

  return {
    domain,
    collected: outcomes.filter((outcome) => !outcome.error).length,
    failed: outcomes.filter((outcome) => outcome.error).length,
    outcomes,
    capturedAt: capturedAt.toISOString(),
  };
}
