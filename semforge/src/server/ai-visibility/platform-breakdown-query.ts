import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { aiVisibilityAnswers, aiVisibilityPrompts } from "@/db/schema";
import type { AiAnswerPlatform } from "@/db/schema/ai-visibility";
import type { AuthContext } from "@/lib/session";
import {
  buildPlatformBreakdown,
  type PlatformBreakdown,
  type PlatformObservationCounts,
} from "@/server/ai-visibility/platform-breakdown";
import { providerError, providerLive, type ProviderResult } from "@/server/providers/types";

/**
 * 플랫폼별 언급 분포 조회.
 *
 * 집계 규칙 자체는 platform-breakdown.ts(순수)가 갖고, 이 모듈은 DB 조회와
 * 자격증명 감지만 담당한다.
 */

const SOURCE = "ai-visibility-breakdown";

type EnvLike = Record<string, string | undefined>;

/**
 * 플랫폼별 수집 가능 여부.
 *
 * grok 은 두 경로가 있다. 크레딧 경로(XAI_API_KEY)와 계정 인증 경로(cursor-grok)다.
 * 기본 제공자가 계정 인증이면 키가 없어도 로컬 수집이 가능하므로 true 로 본다.
 * 나머지 플랫폼은 연동 자체가 없어 항상 false 다.
 */
export function detectPlatformCredentials(env: EnvLike): Record<AiAnswerPlatform, boolean> {
  const provider = (env.AI_ANSWER_PROVIDER ?? "cursor-grok").trim();
  const hasXaiKey = Boolean(env.XAI_API_KEY?.trim());

  return {
    google_aio: Boolean(env.TALORDATA_API_TOKEN?.trim()),
    grok: provider === "cursor-grok" ? true : hasXaiKey,
    google_ai_mode: false,
    chatgpt: false,
    gemini: false,
    perplexity: false,
  };
}

export async function loadPlatformBreakdown(
  auth: AuthContext,
  domain?: string,
  env: EnvLike = process.env,
): Promise<ProviderResult<PlatformBreakdown>> {
  const conditions = [
    eq(aiVisibilityPrompts.workspaceId, auth.workspaceId),
    isNull(aiVisibilityPrompts.deletedAt),
  ];
  if (domain) {
    conditions.push(eq(aiVisibilityPrompts.domain, domain));
  }

  try {
    const rows = await db
      .select({
        platform: aiVisibilityAnswers.platform,
        observed: sql<number>`count(*)`,
        mentioned: sql<number>`sum(case when ${aiVisibilityAnswers.brandMentioned} = 1 then 1 else 0 end)`,
        unknownMentionCount: sql<number>`sum(case when ${aiVisibilityAnswers.brandMentioned} is null then 1 else 0 end)`,
      })
      .from(aiVisibilityAnswers)
      .innerJoin(aiVisibilityPrompts, eq(aiVisibilityAnswers.promptId, aiVisibilityPrompts.id))
      .where(and(...conditions))
      .groupBy(aiVisibilityAnswers.platform);

    const observations: Partial<Record<AiAnswerPlatform, PlatformObservationCounts>> = {};
    for (const row of rows) {
      observations[row.platform] = {
        observed: Number(row.observed ?? 0),
        mentioned: Number(row.mentioned ?? 0),
        unknownMentionCount: Number(row.unknownMentionCount ?? 0),
      };
    }

    return providerLive<PlatformBreakdown>(
      SOURCE,
      buildPlatformBreakdown({ credentials: detectPlatformCredentials(env), observations }),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return providerError<PlatformBreakdown>(
      SOURCE,
      `플랫폼 분포를 집계하지 못했습니다: ${detail}`,
    );
  }
}
