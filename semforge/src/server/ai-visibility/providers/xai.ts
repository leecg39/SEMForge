import {
  buildCollectionPrompt,
  detectBrandMention,
  parseProviderOutput,
} from "@/server/ai-visibility/providers/parse";
import type {
  AiAnswerDraft,
  AiAnswerProvider,
  AiAnswerRequest,
} from "@/server/ai-visibility/providers/types";
import {
  providerError,
  providerLive,
  providerUnavailable,
  type ProviderResult,
} from "@/server/providers/types";

/**
 * 크레딧 경로의 Grok 수집기 (xAI HTTP API).
 *
 * 계정 인증 경로와 달리 배포 가능하다. 크레딧이 충전되면 AI_ANSWER_PROVIDER=xai 로
 * 전환하는 것만으로 이 어댑터가 쓰인다.
 *
 * 모델 식별자는 /v1/models 가 크레딧 없음(403)으로 막혀 확인하지 못했다.
 * 충전 후 실제 목록으로 확인하고 필요하면 XAI_MODEL 로 덮어쓴다.
 */

const SOURCE = "xai";
const ENDPOINT = "https://api.x.ai/v1/chat/completions";
const DEFAULT_MODEL = "grok-4.5";
const REQUEST_TIMEOUT_MS = 120_000;

export interface XaiOptions {
  apiKey: string | null;
  model?: string;
  fetchImpl?: typeof fetch;
}

interface XaiChoice {
  message?: { content?: unknown };
}

function extractContent(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const content = (choices[0] as XaiChoice).message?.content;
  return typeof content === "string" ? content : "";
}

function extractErrorText(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === "object" && parsed !== null) {
      const error = (parsed as { error?: unknown }).error;
      if (typeof error === "string") return error;
    }
  } catch {
    // 본문이 JSON 이 아니면 원문 일부를 쓴다.
  }
  return body.slice(0, 200);
}

export function createXaiProvider(options: XaiOptions): AiAnswerProvider {
  const model = options.model ?? DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    id: SOURCE,
    platform: "grok",
    source: SOURCE,
    deployable: true,

    async collect(request: AiAnswerRequest): Promise<ProviderResult<AiAnswerDraft>> {
      const apiKey = options.apiKey?.trim();
      if (!apiKey) {
        return providerUnavailable<AiAnswerDraft>(
          SOURCE,
          "XAI_API_KEY 가 설정되지 않았습니다. 키를 등록하면 Grok 수집이 활성화됩니다.",
        );
      }

      let response: Response;
      try {
        response = await fetchImpl(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: buildCollectionPrompt(request) }],
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: "no-store",
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return providerError<AiAnswerDraft>(SOURCE, `xAI 요청에 실패했습니다: ${detail}`);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const detail = extractErrorText(body);
        const hint =
          response.status === 403
            ? " xAI 콘솔에서 크레딧을 충전해야 합니다."
            : "";
        return providerError<AiAnswerDraft>(
          SOURCE,
          `xAI 응답 오류 (HTTP ${response.status}): ${detail}.${hint}`,
        );
      }

      const parsed = parseProviderOutput(extractContent(await response.json().catch(() => null)));
      if (parsed.answerText.length === 0) {
        return providerError<AiAnswerDraft>(SOURCE, "모델이 빈 응답을 반환했습니다.");
      }

      const mention = detectBrandMention({
        domain: request.domain,
        answerText: parsed.answerText,
        mentionedBrands: parsed.mentionedBrands,
        citedDomains: parsed.citedDomains,
        structured: parsed.structured,
      });

      return providerLive<AiAnswerDraft>(SOURCE, {
        platform: "grok",
        model,
        answerText: parsed.answerText,
        mentionedBrands: parsed.mentionedBrands,
        citedDomains: parsed.citedDomains,
        structured: parsed.structured,
        brandMentioned: mention.brandMentioned,
        brandRank: mention.brandRank,
        billed: true,
        source: SOURCE,
      });
    },
  };
}
