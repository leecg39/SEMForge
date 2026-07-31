import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { aiVisibilityAnswers, aiVisibilityPrompts } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId } from "@/lib/ids";
import type { AuthContext } from "@/lib/session";
import { selectAnswerProvider } from "@/server/ai-visibility/providers";
import type {
  AiAnswerDraft,
  AiAnswerProvider,
} from "@/server/ai-visibility/providers/types";
import { providerLive, type ProviderResult } from "@/server/providers/types";

/**
 * 프롬프트별 AI 답변 수집.
 *
 * 실과금 호출이므로 방어선을 세 겹 둔다.
 * 1. tracked=true 프롬프트만 일괄 수집 대상이다
 * 2. 같은 프롬프트·플랫폼을 TTL 안에 다시 부르지 않는다
 * 3. 한 번에 처리할 프롬프트 수에 상한이 있다
 *
 * 수집 실패는 행을 만들지 않는다. 빈 행을 남기면 "관측했으나 언급 없음"으로 오독된다.
 */

export const ANSWER_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_MAX_PROMPTS_PER_RUN = 10;

export interface CollectAnswerOptions {
  /** 테스트·전환용 주입. 없으면 env 로 선택한다. */
  provider?: AiAnswerProvider;
  /** TTL 을 무시하고 다시 수집한다. */
  forceRefresh?: boolean;
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

type AnswerRow = typeof aiVisibilityAnswers.$inferSelect;

/** 저장된 관측을 초안 형태로 되돌린다. 캐시 재사용이므로 billed 는 false 다. */
function toDraftFromRow(row: AnswerRow): AiAnswerDraft {
  return {
    platform: row.platform,
    model: row.model ?? "",
    answerText: row.answerText ?? "",
    mentionedBrands: parseJsonArray(row.mentionedBrands),
    citedDomains: parseJsonArray(row.citedDomains),
    structured: row.brandMentioned !== null,
    brandMentioned: row.brandMentioned,
    brandRank: row.brandRank,
    billed: false,
    source: row.source,
  };
}

async function loadPrompt(auth: AuthContext, promptId: string) {
  const [row] = await db
    .select()
    .from(aiVisibilityPrompts)
    .where(
      and(
        eq(aiVisibilityPrompts.id, promptId),
        eq(aiVisibilityPrompts.workspaceId, auth.workspaceId),
        isNull(aiVisibilityPrompts.deletedAt),
      ),
    )
    .limit(1);
  if (!row) {
    throw new ApiError("NOT_FOUND", "프롬프트를 찾을 수 없습니다.");
  }
  return row;
}

async function findFreshAnswer(
  promptId: string,
  platform: AiAnswerProvider["platform"],
  now: number,
): Promise<AnswerRow | null> {
  const [row] = await db
    .select()
    .from(aiVisibilityAnswers)
    .where(
      and(
        eq(aiVisibilityAnswers.promptId, promptId),
        eq(aiVisibilityAnswers.platform, platform),
        gte(aiVisibilityAnswers.capturedAt, new Date(now - ANSWER_TTL_MS)),
      ),
    )
    .orderBy(desc(aiVisibilityAnswers.capturedAt))
    .limit(1);
  return row ?? null;
}

export async function collectAnswerForPrompt(
  auth: AuthContext,
  promptId: string,
  options?: CollectAnswerOptions,
): Promise<ProviderResult<AiAnswerDraft>> {
  // 권한 확인을 제공자 호출보다 먼저 한다. 순서가 바뀌면 남의 워크스페이스 요청에도 과금된다.
  const prompt = await loadPrompt(auth, promptId);
  const provider = options?.provider ?? selectAnswerProvider(process.env);
  const now = Date.now();

  if (options?.forceRefresh !== true) {
    const fresh = await findFreshAnswer(prompt.id, provider.platform, now);
    if (fresh) {
      return providerLive<AiAnswerDraft>(fresh.source, toDraftFromRow(fresh));
    }
  }

  const result = await provider.collect({
    prompt: prompt.prompt,
    domain: prompt.domain,
    locale: prompt.locale,
  });
  if (result.status !== "live" || result.data === undefined) {
    return result;
  }

  const draft = result.data;
  try {
    await db.insert(aiVisibilityAnswers).values({
      id: newId(),
      promptId: prompt.id,
      platform: draft.platform,
      model: draft.model,
      answerText: draft.answerText,
      brandMentioned: draft.brandMentioned,
      brandRank: draft.brandRank,
      citedUrls: "[]",
      citedDomains: JSON.stringify(draft.citedDomains),
      mentionedBrands: JSON.stringify(draft.mentionedBrands),
      source: draft.source,
      billed: draft.billed,
      capturedAt: new Date(now),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ApiError("INTERNAL", `수집한 답변을 저장하지 못했습니다: ${detail}`);
  }

  return result;
}

export interface CollectTrackedOptions extends CollectAnswerOptions {
  /** 특정 도메인으로 좁힌다. */
  domain?: string;
  maxPrompts?: number;
}

export interface CollectTrackedResult {
  promptId: string;
  prompt: string;
  result: ProviderResult<AiAnswerDraft>;
}

export async function collectTrackedAnswers(
  auth: AuthContext,
  options?: CollectTrackedOptions,
): Promise<CollectTrackedResult[]> {
  const limit = options?.maxPrompts ?? DEFAULT_MAX_PROMPTS_PER_RUN;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new ApiError("VALIDATION_ERROR", "한 번에 수집할 프롬프트 수는 1 이상의 정수여야 합니다.");
  }

  const conditions = [
    eq(aiVisibilityPrompts.workspaceId, auth.workspaceId),
    eq(aiVisibilityPrompts.tracked, true),
    isNull(aiVisibilityPrompts.deletedAt),
  ];
  if (options?.domain) {
    conditions.push(eq(aiVisibilityPrompts.domain, options.domain));
  }

  const targets = await db
    .select({ id: aiVisibilityPrompts.id, prompt: aiVisibilityPrompts.prompt })
    .from(aiVisibilityPrompts)
    .where(and(...conditions))
    .orderBy(aiVisibilityPrompts.createdAt)
    .limit(limit);

  const results: CollectTrackedResult[] = [];
  // 실과금 호출이므로 순차 처리한다. 병렬로 돌리면 상한과 TTL 방어가 무의미해진다.
  for (const target of targets) {
    results.push({
      promptId: target.id,
      prompt: target.prompt,
      result: await collectAnswerForPrompt(auth, target.id, options),
    });
  }
  return results;
}
