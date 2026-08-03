import { ApiError } from "@/lib/api";
import { normalizeDomain } from "@/lib/analytics/metrics";
import type { TrackingLocation } from "@/lib/position-tracking/locations";
import {
  getContentChatMockModel,
  requestChatMockText,
} from "@/server/chatmock/client";
import { collectKeywordSerp } from "@/server/talordata/collect";

export const AI_SEARCH_PROVIDERS = [
  "google_aio",
  "chatgpt_web",
  "gemini_grounded",
] as const;
export type AiSearchProvider = (typeof AI_SEARCH_PROVIDERS)[number];
export type AiSearchVisibilityStatus = "visible" | "not_visible" | "unknown";

export interface AiSearchCitation {
  position: number;
  url: string;
  domain: string;
  title: string | null;
}

export interface AiSearchProviderInput {
  provider: AiSearchProvider;
  prompt: string;
  brandNames: string[];
  targetDomain: string;
  location: TrackingLocation;
  /** 수동 실행에서는 SERP 캐시를 우회해 현재 결과를 다시 측정한다. */
  forceRefresh?: boolean;
}

export interface AiSearchProviderResult {
  provider: AiSearchProvider;
  visibilityStatus: AiSearchVisibilityStatus;
  brandMentioned: boolean | null;
  citationsAvailable: boolean;
  citations: AiSearchCitation[];
  responseText: string | null;
  source: "talordata" | "openai" | "gemini" | "chatmock";
  fromCache: boolean;
  capturedAt: Date;
}

export interface AiSearchCapabilities {
  providers: Record<AiSearchProvider, { enabled: boolean; reason: string | null }>;
}

export interface AiSearchProviderDependencies {
  fetch?: typeof fetch;
  collectKeywordSerp?: typeof collectKeywordSerp;
  requestChatMockText?: typeof requestChatMockText;
  timeoutMs?: number;
}

export function getAiSearchCapabilities(): AiSearchCapabilities {
  const hasTalordata = Boolean(process.env.TALORDATA_API_TOKEN?.trim());
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY?.trim());
  const hasChatMock = process.env.CHATMOCK_AI_SEARCH_ENABLED?.trim().toLowerCase() === "true";
  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  return {
    providers: {
      google_aio: {
        enabled: hasTalordata,
        reason: hasTalordata ? null : "TALORDATA_API_TOKEN이 필요합니다.",
      },
      chatgpt_web: {
        enabled: hasOpenAi || hasChatMock,
        reason: hasOpenAi || hasChatMock
          ? null
          : "OPENAI_API_KEY 또는 ChatMock ChatGPT 연결이 필요합니다.",
      },
      gemini_grounded: {
        enabled: hasGemini,
        reason: hasGemini ? null : "GEMINI_API_KEY가 필요합니다.",
      },
    },
  };
}

function normalizedText(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function mentionsAnyBrand(text: string, brandNames: readonly string[]): boolean {
  const haystack = normalizedText(text);
  if (!haystack) return false;
  return brandNames
    .map(normalizedText)
    .filter((name) => name.length >= 2)
    .some((name) => haystack.includes(name));
}

export function domainMatches(candidate: string, target: string): boolean {
  const normalizedCandidate = normalizeDomain(candidate);
  const normalizedTarget = normalizeDomain(target);
  return Boolean(normalizedCandidate && normalizedTarget) && (
    normalizedCandidate === normalizedTarget ||
    normalizedCandidate.endsWith(`.${normalizedTarget}`)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function providerJson(
  url: string,
  init: RequestInit,
  label: string,
  dependencies?: AiSearchProviderDependencies,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), dependencies?.timeoutMs ?? 90_000);
  try {
    const response = await (dependencies?.fetch ?? fetch)(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 429) {
        throw new ApiError("RATE_LIMITED", `${label} API 사용량 한도에 도달했습니다.`);
      }
      const details = isRecord(payload)
        ? JSON.stringify(payload).slice(0, 300)
        : `HTTP ${response.status}`;
      throw new ApiError("INTERNAL", `${label} API 요청에 실패했습니다.`, { details });
    }
    if (!isRecord(payload)) {
      throw new ApiError("INTERNAL", `${label} API 응답 형식이 올바르지 않습니다.`);
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "INTERNAL",
      controller.signal.aborted
        ? `${label} API 응답이 시간 초과되었습니다.`
        : `${label} API에 연결하지 못했습니다.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function aiPrompt(input: AiSearchProviderInput): string {
  return [
    `You are answering a normal user's web search from ${input.location.label}.`,
    "Use live web search and cite the sources used for the answer.",
    "Do not favor or exclude any particular company or domain.",
    `Search query: ${input.prompt}`,
  ].join("\n");
}

function uniqueCitations(
  values: { url: string; title: string | null }[],
): AiSearchCitation[] {
  const seen = new Set<string>();
  const result: AiSearchCitation[] = [];
  for (const value of values) {
    if (!/^https?:\/\//i.test(value.url) || seen.has(value.url)) continue;
    const domain = normalizeDomain(value.url);
    if (!domain) continue;
    seen.add(value.url);
    result.push({
      position: result.length + 1,
      url: value.url,
      domain,
      title: value.title,
    });
  }
  return result;
}

function openAiOutput(payload: Record<string, unknown>) {
  const citations: { url: string; title: string | null }[] = [];
  const texts: string[] = [];
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!isRecord(content)) continue;
      if (typeof content.text === "string") texts.push(content.text);
      const annotations = Array.isArray(content.annotations) ? content.annotations : [];
      for (const annotation of annotations) {
        if (
          !isRecord(annotation) ||
          annotation.type !== "url_citation" ||
          typeof annotation.url !== "string"
        ) continue;
        citations.push({
          url: annotation.url,
          title: typeof annotation.title === "string" ? annotation.title : null,
        });
      }
    }
  }
  return { text: texts.join("\n").slice(0, 30_000), citations: uniqueCitations(citations) };
}

function geminiOutput(payload: Record<string, unknown>) {
  const citations: { url: string; title: string | null }[] = [];
  const texts: string[] = [];
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    if (isRecord(candidate.content) && Array.isArray(candidate.content.parts)) {
      for (const part of candidate.content.parts) {
        if (isRecord(part) && typeof part.text === "string") texts.push(part.text);
      }
    }
    const metadata = isRecord(candidate.groundingMetadata)
      ? candidate.groundingMetadata
      : null;
    const chunks = metadata && Array.isArray(metadata.groundingChunks)
      ? metadata.groundingChunks
      : [];
    for (const chunk of chunks) {
      if (!isRecord(chunk) || !isRecord(chunk.web) || typeof chunk.web.uri !== "string") {
        continue;
      }
      citations.push({
        url: chunk.web.uri,
        title: typeof chunk.web.title === "string" ? chunk.web.title : null,
      });
    }
  }
  return { text: texts.join("\n").slice(0, 30_000), citations: uniqueCitations(citations) };
}

function visibilityFrom(
  input: AiSearchProviderInput,
  text: string,
  citations: AiSearchCitation[],
): { visibilityStatus: AiSearchVisibilityStatus; brandMentioned: boolean } {
  const brandMentioned = mentionsAnyBrand(text, input.brandNames);
  const ownCitation = citations.some((citation) =>
    domainMatches(citation.domain, input.targetDomain)
  );
  return {
    visibilityStatus: brandMentioned || ownCitation ? "visible" : "not_visible",
    brandMentioned,
  };
}

async function collectGoogleAio(
  input: AiSearchProviderInput,
  dependencies?: AiSearchProviderDependencies,
): Promise<AiSearchProviderResult> {
  const collection = await (dependencies?.collectKeywordSerp ?? collectKeywordSerp)({
    keyword: input.prompt,
    countryCode: input.location.countryCode,
    device: "desktop",
    forceRefresh: input.forceRefresh ?? false,
  });
  const aioPresent =
    collection.aiOverview?.present ?? collection.features.includes("ai_overview");
  const citationsAvailable = collection.aiOverview?.citationsAvailable ?? false;
  const citations = (collection.aiOverview?.citations ?? []).map((citation, index) => ({
    position: index + 1,
    url: citation.url,
    domain: citation.domain,
    title: citation.title,
  }));
  const ownCitation = citations.some((citation) =>
    domainMatches(citation.domain, input.targetDomain)
  );
  const visibilityStatus: AiSearchVisibilityStatus = !aioPresent
    ? "not_visible"
    : !citationsAvailable
      ? "unknown"
      : ownCitation
        ? "visible"
        : "not_visible";
  return {
    provider: "google_aio",
    visibilityStatus,
    brandMentioned: null,
    citationsAvailable,
    citations: citationsAvailable ? citations : [],
    responseText: null,
    source: "talordata",
    fromCache: collection.fromCache,
    capturedAt: collection.capturedAt,
  };
}

async function collectChatGpt(
  input: AiSearchProviderInput,
  dependencies?: AiSearchProviderDependencies,
): Promise<AiSearchProviderResult> {
  const token = process.env.OPENAI_API_KEY?.trim();
  if (!token) {
    const local = await (dependencies?.requestChatMockText ?? requestChatMockText)(
      aiPrompt(input),
      {
        model: process.env.CHATMOCK_AI_SEARCH_MODEL?.trim() || getContentChatMockModel(),
        reasoningEffort: "medium",
      },
    );
    const visibility = visibilityFrom(input, local.text, []);
    return {
      provider: "chatgpt_web",
      ...visibility,
      citationsAvailable: false,
      citations: [],
      responseText: local.text.slice(0, 30_000),
      source: "chatmock",
      fromCache: false,
      capturedAt: new Date(),
    };
  }
  const payload = await providerJson(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_POSITION_MODEL?.trim() || "gpt-5.6",
        tools: [{ type: "web_search" }],
        input: aiPrompt(input),
      }),
    },
    "OpenAI",
    dependencies,
  );
  const output = openAiOutput(payload);
  const visibility = visibilityFrom(input, output.text, output.citations);
  return {
    provider: "chatgpt_web",
    ...visibility,
    citationsAvailable: true,
    citations: output.citations,
    responseText: output.text,
    source: "openai",
    fromCache: false,
    capturedAt: new Date(),
  };
}

async function collectGemini(
  input: AiSearchProviderInput,
  dependencies?: AiSearchProviderDependencies,
): Promise<AiSearchProviderResult> {
  const token = process.env.GEMINI_API_KEY?.trim();
  if (!token) throw new ApiError("INTERNAL", "GEMINI_API_KEY가 설정되지 않았습니다.");
  const model = process.env.GEMINI_POSITION_MODEL?.trim() || "gemini-2.5-flash";
  const payload = await providerJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: aiPrompt(input) }] }],
        tools: [{ google_search: {} }],
      }),
    },
    "Gemini",
    dependencies,
  );
  const output = geminiOutput(payload);
  const visibility = visibilityFrom(input, output.text, output.citations);
  return {
    provider: "gemini_grounded",
    ...visibility,
    citationsAvailable: true,
    citations: output.citations,
    responseText: output.text,
    source: "gemini",
    fromCache: false,
    capturedAt: new Date(),
  };
}

export async function collectAiSearchObservation(
  input: AiSearchProviderInput,
  dependencies?: AiSearchProviderDependencies,
): Promise<AiSearchProviderResult> {
  const capability = getAiSearchCapabilities().providers[input.provider];
  if (!capability.enabled) {
    throw new ApiError("VALIDATION_ERROR", capability.reason ?? "공급자를 사용할 수 없습니다.");
  }
  if (input.provider === "google_aio") return collectGoogleAio(input, dependencies);
  if (input.provider === "chatgpt_web") return collectChatGpt(input, dependencies);
  return collectGemini(input, dependencies);
}
