import { ApiError } from "@/lib/api";
import {
  CONTENT_AI_PROFILES,
  getContentAiProfile,
  type ContentAiProfileId,
} from "@/lib/content-ai";
import {
  getChatMockContentCapability,
  requestChatMockText,
  type ChatMockContentCapability,
} from "@/server/chatmock/client";

export type ContentAiModelCapability = (typeof CONTENT_AI_PROFILES)[number] & {
  enabled: boolean;
  reason: string | null;
};

export type ContentAiProvenance = {
  provider: "chatmock" | "xai" | "google";
  model: string;
  reasoningEffort: string | null;
  requestedAt: string;
};

function responsesOutputText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text.trim();
  const texts: string[] = [];
  for (const output of Array.isArray(payload.output) ? payload.output : []) {
    if (!output || typeof output !== "object") continue;
    const content = (output as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") texts.push(text);
    }
  }
  return texts.join("\n").trim();
}

function geminiOutputText(payload: Record<string, unknown>): string {
  const texts: string[] = [];
  for (const candidate of Array.isArray(payload.candidates) ? payload.candidates : []) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as { content?: unknown }).content;
    if (!content || typeof content !== "object") continue;
    const parts = (content as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (!part || typeof part !== "object" || (part as { thought?: unknown }).thought === true) continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") texts.push(text);
    }
  }
  return texts.join("\n").trim();
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const payload: unknown = await response.json();
    return payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function providerError(provider: "xAI" | "Gemini", response: Response): never {
  if (response.status === 401) {
    throw new ApiError("UNAUTHENTICATED", `${provider} API 키가 올바른지 확인해 주세요.`);
  }
  if (response.status === 403) {
    throw new ApiError(
      "UNAUTHENTICATED",
      provider === "xAI"
        ? "xAI API 권한이 거부되었습니다. xAI Console에서 API 키의 팀 권한과 결제 설정을 확인해 주세요."
        : "Gemini API 권한을 확인해 주세요.",
    );
  }
  if (response.status === 429) {
    throw new ApiError("RATE_LIMITED", `${provider} API 사용량 한도에 도달했습니다.`);
  }
  throw new ApiError("INTERNAL", `${provider} 콘텐츠 요청에 실패했습니다. (HTTP ${response.status})`);
}

async function requestXaiText(prompt: string): Promise<{ text: string; provenance: ContentAiProvenance }> {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) throw new ApiError("VALIDATION_ERROR", "XAI_API_KEY가 필요합니다.");
  const profile = getContentAiProfile("xai-grok-4.5");
  const requestedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: profile.model, input: prompt, store: false }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await readJson(response);
    if (!response.ok) providerError("xAI", response);
    const text = payload ? responsesOutputText(payload) : "";
    if (!text) throw new ApiError("INTERNAL", "Grok이 비어 있는 응답을 반환했습니다.");
    return {
      text,
      provenance: {
        provider: profile.provider,
        model: profile.model,
        reasoningEffort: profile.reasoningEffort,
        requestedAt,
      },
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "INTERNAL",
      controller.signal.aborted ? "Grok 콘텐츠 요청 시간이 초과되었습니다." : "xAI API에 연결하지 못했습니다.",
    );
  } finally {
    clearTimeout(timer);
  }
}

async function requestGeminiText(prompt: string): Promise<{ text: string; provenance: ContentAiProvenance }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new ApiError("VALIDATION_ERROR", "GEMINI_API_KEY가 필요합니다.");
  const profile = getContentAiProfile("google-gemini-3.5-flash");
  const requestedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${profile.model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
        cache: "no-store",
        signal: controller.signal,
      },
    );
    const payload = await readJson(response);
    if (!response.ok) providerError("Gemini", response);
    const text = payload ? geminiOutputText(payload) : "";
    if (!text) throw new ApiError("INTERNAL", "Gemini가 비어 있는 응답을 반환했습니다.");
    return {
      text,
      provenance: {
        provider: profile.provider,
        model: profile.model,
        reasoningEffort: profile.reasoningEffort,
        requestedAt,
      },
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "INTERNAL",
      controller.signal.aborted ? "Gemini 콘텐츠 요청 시간이 초과되었습니다." : "Gemini API에 연결하지 못했습니다.",
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function getContentAiModelCapabilities(
  chatMockCapability?: ChatMockContentCapability,
): Promise<ContentAiModelCapability[]> {
  const chatMock = chatMockCapability ?? await getChatMockContentCapability();
  const hasXai = Boolean(process.env.XAI_API_KEY?.trim());
  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  return CONTENT_AI_PROFILES.map((profile) => {
    if (profile.provider === "chatmock") {
      return {
        ...profile,
        enabled: chatMock.enabled,
        reason: chatMock.reason,
      };
    }
    if (profile.provider === "xai") {
      return {
        ...profile,
        enabled: hasXai,
        reason: hasXai ? null : "XAI_API_KEY가 필요합니다.",
      };
    }
    return {
      ...profile,
      enabled: hasGemini,
      reason: hasGemini ? null : "GEMINI_API_KEY가 필요합니다.",
    };
  });
}

export async function getContentAiModelCapability(profileId: ContentAiProfileId) {
  const profile = getContentAiProfile(profileId);
  if (profile.provider === "xai") {
    const enabled = Boolean(process.env.XAI_API_KEY?.trim());
    return { ...profile, enabled, reason: enabled ? null : "XAI_API_KEY가 필요합니다." } satisfies ContentAiModelCapability;
  }
  if (profile.provider === "google") {
    const enabled = Boolean(process.env.GEMINI_API_KEY?.trim());
    return { ...profile, enabled, reason: enabled ? null : "GEMINI_API_KEY가 필요합니다." } satisfies ContentAiModelCapability;
  }
  const capabilities = await getContentAiModelCapabilities();
  return capabilities.find((capability) => capability.id === profileId)!;
}

export async function requestContentAiText(prompt: string, profileId: ContentAiProfileId) {
  if (profileId === "chatmock-gpt-5.6-luna-xhigh") {
    const profile = getContentAiProfile(profileId);
    const response = await requestChatMockText(prompt, {
      model: profile.model,
      reasoningEffort: profile.reasoningEffort ?? undefined,
    });
    return {
      text: response.text,
      provenance: {
        provider: response.provenance.provider,
        model: response.provenance.model,
        reasoningEffort: response.provenance.reasoningEffort,
        requestedAt: response.provenance.requestedAt,
      } satisfies ContentAiProvenance,
    };
  }
  if (profileId === "xai-grok-4.5") return requestXaiText(prompt);
  return requestGeminiText(prompt);
}
