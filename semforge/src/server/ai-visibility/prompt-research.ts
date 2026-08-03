import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  aiVisibilityCitations,
  aiVisibilityObservations,
  type AiVisibilityProvider,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import type { AuthContext } from "@/lib/session";
import {
  getContentAiModelCapabilities,
  requestContentAiText,
} from "@/server/content/generation-providers";
import {
  getContentChatMockModel,
  requestChatMockText,
} from "@/server/chatmock/client";
import {
  getBrandPerformanceDashboard,
  type BrandPerformanceDashboardResponse,
} from "./brand-performance";
import { getAiVisibilityProjectBundle } from "./projects";

export const PROMPT_RESEARCH_INTENTS = [
  "informational",
  "exploratory",
  "commercial",
  "transactional",
] as const;

export type PromptResearchIntent = (typeof PROMPT_RESEARCH_INTENTS)[number];
export type PromptResearchRelevance = "high" | "medium" | "low";

export interface PromptResearchPromptRow {
  id: string;
  prompt: string;
  topic: string;
  intent: PromptResearchIntent;
  relevance: PromptResearchRelevance;
  monitored: boolean;
  observed: boolean;
  responseCount: number;
  brandNames: string[];
  sourceDomains: string[];
  observationIds: string[];
  capturedAt: string | null;
}

export interface PromptResearchTopicRow {
  id: string;
  label: string;
  promptCount: number;
  monitoredCount: number;
  observedAnswers: number;
  relevance: PromptResearchRelevance;
  intents: Record<PromptResearchIntent, number>;
  brandNames: string[];
  sourceDomains: string[];
}

export interface PromptResearchEntityRow {
  id: string;
  label: string;
  promptCount: number;
  evidenceCount: number;
}

export interface PromptResearchDashboardResponse extends BrandPerformanceDashboardResponse {
  research: {
    summary: {
      relatedSearchDemand: number | null;
      topics: number;
      prompts: number;
      mentionedBrands: number;
      sourceDomains: number;
    };
    prompts: PromptResearchPromptRow[];
    topics: PromptResearchTopicRow[];
    brands: PromptResearchEntityRow[];
    sources: PromptResearchEntityRow[];
    generation: {
      available: boolean;
      reason: string | null;
      provider: string | null;
      model: string | null;
    };
  };
}

export interface PromptResearchGeneratedIdea {
  id: string;
  topic: string;
  prompt: string;
  intent: PromptResearchIntent;
  relevance: PromptResearchRelevance;
}

export interface PromptResearchGeneratedResponse {
  seed: string;
  generatedAt: string;
  ideas: PromptResearchGeneratedIdea[];
  provenance: {
    provider: string;
    model: string;
    reasoningEffort: string | null;
  };
}

interface ObservationRow {
  id: string;
  promptId: string;
  responseText: string | null;
  capturedAt: Date;
}

const generatedSchema = z.object({
  ideas: z.array(z.object({
    topic: z.string().trim().min(2).max(80),
    prompt: z.string().trim().min(5).max(300),
    intent: z.enum(PROMPT_RESEARCH_INTENTS),
    relevance: z.enum(["high", "medium", "low"]),
  })).min(1).max(12),
});

function normalizePrompt(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function identifier(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `pri_${(hash >>> 0).toString(36)}`;
}

export function classifyPromptIntent(prompt: string): PromptResearchIntent {
  const value = prompt.toLocaleLowerCase();
  if (/가격|비용|견적|구매|신청|계약|도입|결제|price|cost|buy|hire/u.test(value)) return "transactional";
  if (/비교|추천|대안|경쟁|장단점|순위|best|versus|\bvs\b/u.test(value)) return "commercial";
  if (/무엇|의미|방법|가이드|정보|설명|왜|어떻게|what|why|how/u.test(value)) return "informational";
  return "exploratory";
}

function relevanceFor(prompt: string, topic: string, query: string, observed: boolean): PromptResearchRelevance {
  const normalizedQuery = normalizePrompt(query);
  if (!normalizedQuery) return observed ? "high" : "medium";
  const terms = normalizedQuery.split(" ").filter((term) => term.length >= 2);
  const haystack = normalizePrompt(`${topic} ${prompt}`);
  if (terms.length > 0 && terms.every((term) => haystack.includes(term))) return "high";
  if (terms.some((term) => haystack.includes(term))) return "medium";
  return "low";
}

function emptyIntents(): Record<PromptResearchIntent, number> {
  return { informational: 0, exploratory: 0, commercial: 0, transactional: 0 };
}

export function buildPromptResearchView(
  prompts: { id: string; prompt: string; topic: string }[],
  observations: ObservationRow[],
  report: BrandPerformanceDashboardResponse["report"],
  citations: { observationId: string; domain: string }[],
  query = "",
) {
  const observationsByPrompt = new Map<string, ObservationRow[]>();
  for (const observation of observations) {
    const rows = observationsByPrompt.get(observation.promptId) ?? [];
    rows.push(observation);
    observationsByPrompt.set(observation.promptId, rows);
  }
  const citationsByObservation = new Map<string, Set<string>>();
  for (const citation of citations) {
    const domains = citationsByObservation.get(citation.observationId) ?? new Set<string>();
    domains.add(citation.domain);
    citationsByObservation.set(citation.observationId, domains);
  }
  const reportBrands = report?.brands ?? [];
  const rows: PromptResearchPromptRow[] = prompts.map((prompt) => {
    const promptObservations = observationsByPrompt.get(prompt.id) ?? [];
    const observationIds = promptObservations.map((observation) => observation.id);
    const observedSet = new Set(observationIds);
    const brandNames = reportBrands
      .filter((brand) => brand.evidenceObservationIds.some((id) => observedSet.has(id)))
      .map((brand) => brand.name);
    const sourceDomains = [...new Set(promptObservations.flatMap(
      (observation) => [...(citationsByObservation.get(observation.id) ?? [])],
    ))];
    const observed = promptObservations.some((observation) => Boolean(observation.responseText?.trim()));
    return {
      id: prompt.id,
      prompt: prompt.prompt,
      topic: prompt.topic,
      intent: classifyPromptIntent(prompt.prompt),
      relevance: relevanceFor(prompt.prompt, prompt.topic, query, observed),
      monitored: true,
      observed,
      responseCount: promptObservations.length,
      brandNames,
      sourceDomains,
      observationIds,
      capturedAt: promptObservations
        .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())[0]?.capturedAt.toISOString() ?? null,
    };
  });
  const topicMap = new Map<string, PromptResearchTopicRow>();
  for (const row of rows) {
    const key = normalizePrompt(row.topic);
    const topic = topicMap.get(key) ?? {
      id: identifier(key),
      label: row.topic,
      promptCount: 0,
      monitoredCount: 0,
      observedAnswers: 0,
      relevance: "low" as PromptResearchRelevance,
      intents: emptyIntents(),
      brandNames: [],
      sourceDomains: [],
    };
    topic.promptCount += 1;
    topic.monitoredCount += 1;
    topic.observedAnswers += row.observed ? 1 : 0;
    topic.intents[row.intent] += 1;
    topic.brandNames = [...new Set([...topic.brandNames, ...row.brandNames])];
    topic.sourceDomains = [...new Set([...topic.sourceDomains, ...row.sourceDomains])];
    if (row.relevance === "high" || (row.relevance === "medium" && topic.relevance === "low")) {
      topic.relevance = row.relevance;
    }
    topicMap.set(key, topic);
  }
  const topics = [...topicMap.values()].sort(
    (a, b) => b.observedAnswers - a.observedAnswers || b.promptCount - a.promptCount || a.label.localeCompare(b.label),
  );
  const brands = reportBrands
    .filter((brand) => brand.mentionedAnswers > 0)
    .map((brand) => ({
      id: brand.id,
      label: brand.name,
      promptCount: rows.filter((row) => brand.evidenceObservationIds.some((id) => row.observationIds.includes(id))).length,
      evidenceCount: brand.evidenceObservationIds.length,
    }))
    .sort((a, b) => b.evidenceCount - a.evidenceCount || a.label.localeCompare(b.label));
  const sourceCounts = new Map<string, { prompts: Set<string>; evidence: number }>();
  for (const citation of citations) {
    const row = rows.find((prompt) => prompt.observationIds.includes(citation.observationId));
    const current = sourceCounts.get(citation.domain) ?? { prompts: new Set<string>(), evidence: 0 };
    if (row) current.prompts.add(row.id);
    current.evidence += 1;
    sourceCounts.set(citation.domain, current);
  }
  const sources = [...sourceCounts.entries()].map(([domain, counts]) => ({
    id: identifier(domain),
    label: domain,
    promptCount: counts.prompts.size,
    evidenceCount: counts.evidence,
  })).sort((a, b) => b.evidenceCount - a.evidenceCount || a.label.localeCompare(b.label));
  return { rows, topics, brands, sources };
}

async function generationCapability() {
  const capabilities = await getContentAiModelCapabilities();
  const enabled = capabilities.find((capability) => capability.enabled) ?? null;
  return {
    available: Boolean(enabled),
    reason: enabled ? null : capabilities.map((capability) => capability.reason).filter(Boolean).join(" ") || "프롬프트 생성 모델이 필요합니다.",
    provider: enabled?.provider ?? null,
    model: enabled?.model ?? null,
    profileId: enabled?.id ?? null,
  };
}

export async function getPromptResearchDashboard(
  auth: AuthContext,
  folderId: string,
  options: { runId?: string; provider?: AiVisibilityProvider; locationKey?: string; query?: string } = {},
): Promise<PromptResearchDashboardResponse> {
  const [performance, generation] = await Promise.all([
    getBrandPerformanceDashboard(auth, folderId, options),
    generationCapability(),
  ]);
  const bundle = performance.scope.projectId ? await getAiVisibilityProjectBundle(auth, folderId) : null;
  const selected = performance.filters.selected;
  const observations = bundle && selected.runId && selected.provider && selected.locationKey
    ? await db.select({
      id: aiVisibilityObservations.id,
      promptId: aiVisibilityObservations.promptId,
      responseText: aiVisibilityObservations.responseText,
      capturedAt: aiVisibilityObservations.capturedAt,
    }).from(aiVisibilityObservations).where(and(
      eq(aiVisibilityObservations.projectId, bundle.project.id),
      eq(aiVisibilityObservations.runId, selected.runId),
      eq(aiVisibilityObservations.provider, selected.provider),
      eq(aiVisibilityObservations.locationKey, selected.locationKey),
    ))
    : [];
  const observationIds = observations.map((row) => row.id);
  const citations = observationIds.length > 0
    ? await db.select({ observationId: aiVisibilityCitations.observationId, domain: aiVisibilityCitations.domain })
      .from(aiVisibilityCitations)
      .where(inArray(aiVisibilityCitations.observationId, observationIds))
    : [];
  const activePrompts = (bundle?.prompts ?? []).filter((prompt) => prompt.enabled).map((prompt) => ({
    id: prompt.id,
    prompt: prompt.prompt,
    topic: prompt.topic,
  }));
  const view = buildPromptResearchView(activePrompts, observations, performance.report, citations, options.query);
  return {
    ...performance,
    research: {
      summary: {
        relatedSearchDemand: null,
        topics: view.topics.length,
        prompts: view.rows.length,
        mentionedBrands: view.brands.length,
        sourceDomains: view.sources.length,
      },
      prompts: view.rows,
      topics: view.topics,
      brands: view.brands,
      sources: view.sources,
      generation: {
        available: generation.available,
        reason: generation.reason,
        provider: generation.provider,
        model: generation.model,
      },
    },
  };
}

function jsonCandidates(text: string): string[] {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  const candidates = [cleaned];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1]?.trim();
  if (fenced) candidates.push(fenced);
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
      } else if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) {
        candidates.push(text.slice(start, index + 1));
        break;
      }
    }
  }
  return [...new Set(candidates)];
}

export function parseGeneratedPromptIdeas(text: string) {
  let lastError: unknown;
  for (const candidate of jsonCandidates(text)) {
    try {
      return generatedSchema.parse(JSON.parse(candidate));
    } catch (error) {
      lastError = error;
    }
  }
  throw new ApiError("INTERNAL", "프롬프트 리서치 응답 형식이 올바르지 않습니다.", {
    details: lastError instanceof Error ? lastError.message.slice(0, 500) : undefined,
  });
}

export async function generatePromptResearchIdeas(
  auth: AuthContext,
  input: { fid: string; seed: string; count?: number },
): Promise<PromptResearchGeneratedResponse> {
  const bundle = await getAiVisibilityProjectBundle(auth, input.fid);
  const seed = input.seed.trim().replace(/\s+/g, " ").slice(0, 150);
  if (seed.length < 2) throw new ApiError("VALIDATION_ERROR", "두 글자 이상의 조사 주제를 입력해 주세요.");
  const count = Math.min(12, Math.max(4, input.count ?? 10));
  const capability = await generationCapability();
  if (!capability.available || !capability.profileId) {
    throw new ApiError("VALIDATION_ERROR", capability.reason ?? "프롬프트 생성 모델이 필요합니다.");
  }
  const existing = bundle.prompts.filter((prompt) => prompt.enabled).map((prompt) => prompt.prompt);
  const prompt = [
    "Generate a Korean AI-search prompt research set from the supplied seed.",
    `Brand: ${bundle.project.brandName}. Domain: ${bundle.project.domain}.`,
    `Seed: ${seed}`,
    `Return exactly ${count} distinct, natural questions that a real buyer, researcher, or decision maker could ask ChatGPT or Gemini.`,
    "Cover informational, exploratory, commercial, and transactional intent. Group them into concise Korean topics.",
    "Do not provide search volume. Do not claim these prompts were observed; they are model-generated research candidates.",
    `Avoid exact duplicates of existing monitored prompts: ${JSON.stringify(existing)}`,
    "Return JSON only with shape:",
    JSON.stringify({ ideas: [{ topic: "주제", prompt: "자연어 질문", intent: "commercial", relevance: "high" }] }),
    `Allowed intent values: ${PROMPT_RESEARCH_INTENTS.join(", ")}. Allowed relevance values: high, medium, low.`,
  ].join("\n");
  const result = capability.provider === "chatmock"
    ? await requestChatMockText(prompt, { model: getContentChatMockModel(), reasoningEffort: "low" })
    : await requestContentAiText(prompt, capability.profileId);
  const parsed = parseGeneratedPromptIdeas(result.text);
  const existingNormalized = new Set(existing.map(normalizePrompt));
  const seen = new Set<string>();
  const ideas = parsed.ideas.flatMap((idea) => {
    const normalized = normalizePrompt(idea.prompt);
    if (existingNormalized.has(normalized) || seen.has(normalized)) return [];
    seen.add(normalized);
    return [{ ...idea, id: identifier(`${seed}:${normalized}`) }];
  }).slice(0, count);
  if (ideas.length === 0) throw new ApiError("INTERNAL", "새로운 프롬프트 후보를 생성하지 못했습니다.");
  return {
    seed,
    generatedAt: new Date().toISOString(),
    ideas,
    provenance: {
      provider: result.provenance.provider,
      model: result.provenance.model,
      reasoningEffort: result.provenance.reasoningEffort,
    },
  };
}
