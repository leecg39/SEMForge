import { createCursorGrokProvider } from "@/server/ai-visibility/providers/cursor-grok";
import { createXaiProvider } from "@/server/ai-visibility/providers/xai";
import type { AiAnswerProvider } from "@/server/ai-visibility/providers/types";

/**
 * 답변 제공자 선택.
 *
 * 기본값은 계정 인증 경로(cursor-grok)다. xAI 크레딧이 충전되면
 * AI_ANSWER_PROVIDER=xai 한 줄로 배포 가능한 HTTP 경로로 전환된다.
 */

export const ANSWER_PROVIDER_IDS = ["cursor-grok", "xai"] as const;
export type AnswerProviderId = (typeof ANSWER_PROVIDER_IDS)[number];

const DEFAULT_PROVIDER: AnswerProviderId = "cursor-grok";

type EnvLike = Record<string, string | undefined>;

export function selectAnswerProvider(env: EnvLike): AiAnswerProvider {
  const id = (env.AI_ANSWER_PROVIDER ?? DEFAULT_PROVIDER).trim();

  if (id === "cursor-grok") {
    return createCursorGrokProvider(env.CURSOR_GROK_MODEL ? { model: env.CURSOR_GROK_MODEL } : undefined);
  }
  if (id === "xai") {
    return createXaiProvider({
      apiKey: env.XAI_API_KEY ?? null,
      ...(env.XAI_MODEL ? { model: env.XAI_MODEL } : {}),
    });
  }

  throw new Error(
    `[ai-visibility] 알 수 없는 답변 제공자입니다: ${id}. ${ANSWER_PROVIDER_IDS.join(" 또는 ")} 만 사용할 수 있습니다.`,
  );
}

export type { AiAnswerDraft, AiAnswerProvider, AiAnswerRequest } from "@/server/ai-visibility/providers/types";
