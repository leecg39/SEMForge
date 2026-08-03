import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  aiVisibilityBrandReports,
  aiVisibilityObservations,
  aiVisibilityProjects,
  aiVisibilityPrompts,
  aiVisibilityRuns,
  aiVisibilityTrackedBrands,
  type AiVisibilityProvider,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId } from "@/lib/ids";
import { normalizeDomain } from "@/lib/analytics/metrics";
import type { AuthContext } from "@/lib/session";
import {
  DEFAULT_CONTENT_AI_PROFILE,
  type ContentAiProfileId,
} from "@/lib/content-ai";
import {
  getContentAiModelCapabilities,
  requestContentAiText,
} from "@/server/content/generation-providers";
import {
  getContentChatMockModel,
  requestChatMockText,
} from "@/server/chatmock/client";
import { getAiSearchCapabilities } from "@/server/ai-search/providers";
import {
  getAiVisibilityProjectBundle,
  getAiVisibilitySettings,
  listAiVisibilityFolders,
  requireAiVisibilityProject,
} from "./projects";

export const MAX_BRAND_PERFORMANCE_COMPETITORS = 4;
export const BRAND_PERFORMANCE_TEXT_PROVIDERS = [
  "chatgpt_web",
  "gemini_grounded",
] as const satisfies readonly AiVisibilityProvider[];

const sentimentSchema = z.enum(["positive", "neutral", "negative"]);
const modelAnalysisSchema = z.object({
  analyzedObservationIds: z.array(z.string()).max(100),
  brands: z.array(z.object({
    name: z.string().trim().min(2).max(100),
    aliases: z.array(z.string().trim().min(2).max(100)).max(5).default([]),
    isOwn: z.boolean().default(false),
    mentions: z.array(z.object({
      observationId: z.string(),
      sentiment: sentimentSchema,
      themes: z.array(z.string().trim().min(2).max(80)).max(8),
    })).max(100),
  })).max(20),
  insights: z.array(z.object({
    title: z.string().trim().min(3).max(120),
    body: z.string().trim().min(3).max(500),
    evidenceObservationIds: z.array(z.string()).min(1).max(20),
  })).max(6),
  opportunities: z.array(z.object({
    title: z.string().trim().min(3).max(160),
    summary: z.string().trim().min(3).max(600),
    recommendations: z.array(z.string().trim().min(3).max(400)).min(1).max(5),
    urgency: z.enum(["urgent", "medium"]),
    evidenceObservationIds: z.array(z.string()).min(1).max(20),
  })).max(8),
});

const sentimentDistributionSchema = z.object({
  positive: z.number().int().nonnegative(),
  neutral: z.number().int().nonnegative(),
  negative: z.number().int().nonnegative(),
});

const brandMetricSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["own", "competitor"]),
  color: z.string(),
  mentionedAnswers: z.number().int().nonnegative(),
  mediaShare: z.number().nullable(),
  sentimentScore: z.number().nullable(),
  sentiment: sentimentDistributionSchema,
  evidenceObservationIds: z.array(z.string()),
});

export const brandPerformanceReportSchema = z.object({
  generatedAt: z.string(),
  brands: z.array(brandMetricSchema).max(5),
  insights: z.array(z.object({
    id: z.string(),
    title: z.string(),
    body: z.string(),
    evidenceObservationIds: z.array(z.string()),
  })),
  themes: z.array(z.object({
    id: z.string(),
    label: z.string(),
    counts: z.record(z.string(), z.number().int().nonnegative()),
    total: z.number().int().nonnegative(),
  })),
  opportunities: z.array(z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    recommendations: z.array(z.string()),
    urgency: z.enum(["urgent", "medium"]),
    evidenceObservationIds: z.array(z.string()),
  })),
  formulas: z.object({
    mediaShare: z.string(),
    sentiment: z.string(),
    bubbleSize: z.string(),
    heatmap: z.string(),
  }),
});

export type BrandPerformanceReport = z.infer<typeof brandPerformanceReportSchema>;
export type BrandPerformanceBrandMetric = z.infer<typeof brandMetricSchema>;

export interface BrandPerformanceTrackedBrandView {
  id: string;
  name: string;
  aliases: string[];
  domain: string | null;
  kind: "own" | "competitor";
  source: "project" | "manual" | "detected" | "position_tracking";
  enabled: boolean;
}

export interface BrandPerformanceRunOption {
  runId: string;
  provider: AiVisibilityProvider;
  locationKey: string;
  countryCode: string;
  capturedAt: string;
  observations: number;
}

export interface BrandPerformanceDashboardResponse {
  scope: {
    fid: string;
    projectId: string | null;
    projectName: string;
    domain: string;
    brandName: string;
    promptCount: number;
  };
  projects: Awaited<ReturnType<typeof listAiVisibilityFolders>>;
  capabilities: {
    providers: ReturnType<typeof getAiSearchCapabilities>["providers"];
    textProviderAvailable: boolean;
    analyzerAvailable: boolean;
    analyzerReason: string | null;
  };
  filters: {
    runs: BrandPerformanceRunOption[];
    selected: {
      runId: string | null;
      provider: AiVisibilityProvider | null;
      locationKey: string | null;
    };
  };
  state:
    | "unconfigured"
    | "no_prompts"
    | "provider_unavailable"
    | "no_data"
    | "missing"
    | "pending"
    | "running"
    | "ready"
    | "partial"
    | "failed";
  eligibleForAnalysis: boolean;
  reportId: string | null;
  report: BrandPerformanceReport | null;
  trackedBrands: BrandPerformanceTrackedBrandView[];
  completeness: {
    observed: number;
    analyzed: number;
    ratio: number;
  };
  provenance: {
    source: string;
    analyzerProvider: string | null;
    analyzerModel: string | null;
    generatedAt: string | null;
    error: string | null;
  };
}

interface ObservationInput {
  id: string;
  runId: string;
  prompt: string;
  topic: string;
  provider: AiVisibilityProvider;
  countryCode: string;
  locationKey: string;
  responseText: string;
  capturedAt: Date;
}

interface AnalyzerResult {
  text: string;
  provenance: {
    provider: string;
    model: string;
    reasoningEffort: string | null;
  };
}

const BRAND_COLORS = ["#6c5ce7", "#48d9b0", "#b084f5", "#f3b316", "#ef6a76"];

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function normalizeBrandName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function cleanBrandName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 100);
}

function normalizedText(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function brandPerformanceInputHash(
  rows: Pick<ObservationInput, "id" | "capturedAt" | "responseText">[],
): string {
  const payload = rows
    .map((row) => `${row.id}:${row.capturedAt.getTime()}:${row.responseText}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(payload).digest("hex");
}

function outputText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text.trim();
  const texts: string[] = [];
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") texts.push(text);
    }
  }
  return texts.join("\n").trim();
}

async function analyzerCapability(): Promise<{
  available: boolean;
  reason: string | null;
  profileId: ContentAiProfileId | null;
}> {
  if (process.env.OPENAI_API_KEY?.trim()) {
    return { available: true, reason: null, profileId: null };
  }
  try {
    const capabilities = await getContentAiModelCapabilities();
    const preferred = capabilities.find((item) => item.id === DEFAULT_CONTENT_AI_PROFILE && item.enabled)
      ?? capabilities.find((item) => item.enabled);
    return preferred
      ? { available: true, reason: null, profileId: preferred.id }
      : {
          available: false,
          reason: "브랜드 분석용 OpenAI, ChatMock, xAI 또는 Gemini 연결이 필요합니다.",
          profileId: null,
        };
  } catch {
    return {
      available: false,
      reason: "브랜드 분석 모델의 연결 상태를 확인하지 못했습니다.",
      profileId: null,
    };
  }
}

async function requestOpenAiAnalysis(prompt: string): Promise<AnalyzerResult> {
  const token = process.env.OPENAI_API_KEY?.trim();
  if (!token) throw new ApiError("VALIDATION_ERROR", "OPENAI_API_KEY가 필요합니다.");
  const model = process.env.OPENAI_BRAND_ANALYSIS_MODEL?.trim()
    || process.env.OPENAI_POSITION_MODEL?.trim()
    || "gpt-5.6";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input: prompt, store: false }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(
        response.status === 429 ? "RATE_LIMITED" : "INTERNAL",
        response.status === 429
          ? "브랜드 분석 모델의 사용량 한도에 도달했습니다."
          : `브랜드 분석 요청에 실패했습니다. (HTTP ${response.status})`,
      );
    }
    const text = payload && typeof payload === "object"
      ? outputText(payload as Record<string, unknown>)
      : "";
    if (!text) throw new ApiError("INTERNAL", "브랜드 분석 모델이 빈 응답을 반환했습니다.");
    return {
      text,
      provenance: { provider: "openai", model, reasoningEffort: null },
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "INTERNAL",
      controller.signal.aborted
        ? "브랜드 분석 시간이 초과되었습니다."
        : "브랜드 분석 모델에 연결하지 못했습니다.",
    );
  } finally {
    clearTimeout(timer);
  }
}

async function requestAnalyzer(prompt: string): Promise<AnalyzerResult> {
  const capability = await analyzerCapability();
  if (!capability.available) {
    throw new ApiError("VALIDATION_ERROR", capability.reason ?? "브랜드 분석 모델이 필요합니다.");
  }
  if (process.env.OPENAI_API_KEY?.trim()) return requestOpenAiAnalysis(prompt);
  const profileId = capability.profileId ?? DEFAULT_CONTENT_AI_PROFILE;
  if (profileId === "chatmock-gpt-5.6-luna-xhigh") {
    const result = await requestChatMockText(prompt, {
      model: getContentChatMockModel(),
      reasoningEffort: "medium",
    });
    return {
      text: result.text,
      provenance: {
        provider: result.provenance.provider,
        model: result.provenance.model,
        reasoningEffort: result.provenance.reasoningEffort,
      },
    };
  }
  const result = await requestContentAiText(prompt, profileId);
  return {
    text: result.text,
    provenance: {
      provider: result.provenance.provider,
      model: result.provenance.model,
      reasoningEffort: result.provenance.reasoningEffort,
    },
  };
}

function jsonObjectCandidates(text: string): string[] {
  const cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
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
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          candidates.push(text.slice(start, index + 1));
          break;
        }
      }
    }
  }
  return [...new Set(candidates)];
}

export function parseBrandPerformanceModelJson(text: string) {
  let lastError: unknown;
  for (const candidate of jsonObjectCandidates(text)) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      const strict = modelAnalysisSchema.safeParse(parsed);
      if (strict.success) return strict.data;
      const normalized = normalizeModelAnalysisCandidate(parsed);
      const repaired = modelAnalysisSchema.safeParse(normalized);
      if (repaired.success) return repaired.data;
      lastError = repaired.error;
    } catch (error) {
      lastError = error;
    }
  }
  throw new ApiError("INTERNAL", "브랜드 분석 응답 형식이 올바르지 않습니다.", {
    details: lastError instanceof Error ? lastError.message.slice(0, 500) : undefined,
  });
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanModelString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().replace(/\s+/g, " ").slice(0, max);
  return clean || null;
}

function cleanModelStrings(value: unknown, maxItems: number, maxLength: number, minLength = 1) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => cleanModelString(item, maxLength))
    .filter((item): item is string => Boolean(item && item.length >= minLength)))]
    .slice(0, maxItems);
}

/**
 * 모델이 한 선택 필드를 누락하거나 잘못된 하위 항목을 섞어도 유효한 근거까지
 * 전부 버리지 않도록 항목 단위로 정리한다. 반환값은 반드시 strict Zod 스키마로
 * 다시 검증되며, 존재하지 않는 관측 ID와 브랜드명은 보고서 집계 단계에서 재검증한다.
 */
function normalizeModelAnalysisCandidate(value: unknown) {
  const root = objectValue(value) ?? {};
  const brands = (Array.isArray(root.brands) ? root.brands : []).flatMap((item) => {
    const brand = objectValue(item);
    const name = cleanModelString(brand?.name, 100);
    if (!brand || !name || name.length < 2) return [];
    const mentions = (Array.isArray(brand.mentions) ? brand.mentions : []).flatMap((entry) => {
      const mention = objectValue(entry);
      const observationId = cleanModelString(mention?.observationId, 100);
      const rawSentiment = cleanModelString(mention?.sentiment, 20)?.toLocaleLowerCase();
      const sentiment = rawSentiment === "positive" || rawSentiment === "neutral" || rawSentiment === "negative"
        ? rawSentiment
        : null;
      if (!mention || !observationId || !sentiment) return [];
      return [{
        observationId,
        sentiment,
        themes: cleanModelStrings(mention.themes, 8, 80, 2),
      }];
    }).slice(0, 100);
    return [{
      name,
      aliases: cleanModelStrings(brand.aliases, 5, 100, 2),
      isOwn: brand.isOwn === true || brand.isOwn === "true",
      mentions,
    }];
  }).slice(0, 20);
  const insights = (Array.isArray(root.insights) ? root.insights : []).flatMap((item) => {
    const insight = objectValue(item);
    const title = cleanModelString(insight?.title, 120);
    const body = cleanModelString(insight?.body, 500);
    const evidenceObservationIds = cleanModelStrings(insight?.evidenceObservationIds, 20, 100);
    return insight && title && title.length >= 3 && body && body.length >= 3 && evidenceObservationIds.length > 0
      ? [{ title, body, evidenceObservationIds }]
      : [];
  }).slice(0, 6);
  const opportunities = (Array.isArray(root.opportunities) ? root.opportunities : []).flatMap((item) => {
    const opportunity = objectValue(item);
    const title = cleanModelString(opportunity?.title, 160);
    const summary = cleanModelString(opportunity?.summary, 600);
    const recommendations = cleanModelStrings(opportunity?.recommendations, 5, 400, 3);
    const evidenceObservationIds = cleanModelStrings(opportunity?.evidenceObservationIds, 20, 100);
    const rawUrgency = cleanModelString(opportunity?.urgency, 20)?.toLocaleLowerCase();
    const urgency = rawUrgency === "urgent" || rawUrgency === "high"
      ? "urgent"
      : rawUrgency === "medium"
        ? "medium"
        : null;
    return opportunity && title && title.length >= 3 && summary && summary.length >= 3
      && recommendations.length > 0 && evidenceObservationIds.length > 0 && urgency
      ? [{ title, summary, recommendations, urgency, evidenceObservationIds }]
      : [];
  }).slice(0, 8);
  return {
    analyzedObservationIds: cleanModelStrings(root.analyzedObservationIds, 100, 100),
    brands,
    insights,
    opportunities,
  };
}

function analysisPrompt(
  project: { brandName: string; brandAliases: string },
  observations: ObservationInput[],
) {
  const inputs = observations.map((row) => ({
    observationId: row.id,
    prompt: row.prompt,
    topic: row.topic,
    response: row.responseText,
  }));
  return [
    "Analyze the following real AI answers for brand performance.",
    `The owned brand is ${project.brandName}. Known aliases: ${parseStringArray(project.brandAliases).join(", ") || "none"}.`,
    "Return JSON only. Do not invent a brand, theme, fact, or evidence ID.",
    "The first character must be { and the last character must be }. Do not use Markdown or explanatory text.",
    "Every field shown in the required shape must be present. Use empty arrays when no valid item exists.",
    "Use only the exact enum values positive, neutral, negative for sentiment and urgent, medium for urgency.",
    "A competitor brand is valid only if its exact name appears in at least one supplied response.",
    "Include every observation you successfully assessed in analyzedObservationIds, including answers with no brand mention.",
    "Classify each real brand mention as positive, neutral, or negative and attach 1-8 concise recurring business themes.",
    "Insights and opportunities must cite supplied observation IDs. Recommendations must be supported by those answers.",
    "Required shape:",
    JSON.stringify({
      analyzedObservationIds: ["observation-id"],
      brands: [{
        name: "Brand",
        aliases: ["Alias"],
        isOwn: false,
        mentions: [{ observationId: "observation-id", sentiment: "neutral", themes: ["Theme"] }],
      }],
      insights: [{ title: "Title", body: "Evidence-backed explanation", evidenceObservationIds: ["observation-id"] }],
      opportunities: [{
        title: "Title",
        summary: "Evidence-backed explanation",
        recommendations: ["Concrete action"],
        urgency: "medium",
        evidenceObservationIds: ["observation-id"],
      }],
    }),
    "Observations:",
    JSON.stringify(inputs),
  ].join("\n");
}

async function loadObservationInputs(
  projectId: string,
  runId: string,
  provider: AiVisibilityProvider,
  locationKey: string,
): Promise<ObservationInput[]> {
  const rows = await db
    .select({
      id: aiVisibilityObservations.id,
      runId: aiVisibilityObservations.runId,
      prompt: aiVisibilityPrompts.prompt,
      topic: aiVisibilityPrompts.topic,
      provider: aiVisibilityObservations.provider,
      countryCode: aiVisibilityObservations.countryCode,
      locationKey: aiVisibilityObservations.locationKey,
      responseText: aiVisibilityObservations.responseText,
      capturedAt: aiVisibilityObservations.capturedAt,
    })
    .from(aiVisibilityObservations)
    .innerJoin(aiVisibilityPrompts, eq(aiVisibilityPrompts.id, aiVisibilityObservations.promptId))
    .where(and(
      eq(aiVisibilityObservations.projectId, projectId),
      eq(aiVisibilityObservations.runId, runId),
      eq(aiVisibilityObservations.provider, provider),
      eq(aiVisibilityObservations.locationKey, locationKey),
      isNotNull(aiVisibilityObservations.responseText),
      ne(aiVisibilityObservations.responseText, ""),
    ))
    .orderBy(asc(aiVisibilityObservations.capturedAt));
  return rows.map((row) => ({
    ...row,
    runId: row.runId!,
    responseText: row.responseText!,
  }));
}

async function listTrackedBrands(project: {
  id: string;
  brandName: string;
  brandAliases: string;
  domain: string;
}): Promise<BrandPerformanceTrackedBrandView[]> {
  const rows = await db
    .select()
    .from(aiVisibilityTrackedBrands)
    .where(and(
      eq(aiVisibilityTrackedBrands.projectId, project.id),
      isNull(aiVisibilityTrackedBrands.deletedAt),
    ))
    .orderBy(asc(aiVisibilityTrackedBrands.kind), asc(aiVisibilityTrackedBrands.createdAt));
  const views = rows.map((row) => ({
    id: row.id,
    name: row.name,
    aliases: parseStringArray(row.aliases),
    domain: row.domain,
    kind: row.kind,
    source: row.source,
    enabled: row.enabled,
  }));
  const ownNames = new Set([
    normalizeBrandName(project.brandName),
    ...parseStringArray(project.brandAliases).map(normalizeBrandName),
  ]);
  const deduplicated = views.filter((row) => row.kind === "own" || ![row.name, ...row.aliases]
    .map(normalizeBrandName)
    .some((name) => ownNames.has(name)));
  if (!deduplicated.some((row) => row.kind === "own")) {
    deduplicated.unshift({
      id: `virtual-own:${project.id}`,
      name: project.brandName,
      aliases: parseStringArray(project.brandAliases),
      domain: project.domain,
      kind: "own",
      source: "project",
      enabled: true,
    });
  }
  return deduplicated;
}

async function ensureOwnBrand(
  project: { id: string; brandName: string; brandAliases: string; domain: string },
  userId: string,
) {
  const [existing] = await db
    .select()
    .from(aiVisibilityTrackedBrands)
    .where(and(
      eq(aiVisibilityTrackedBrands.projectId, project.id),
      eq(aiVisibilityTrackedBrands.kind, "own"),
      isNull(aiVisibilityTrackedBrands.deletedAt),
    ))
    .limit(1);
  const now = new Date();
  if (existing) {
    await db.update(aiVisibilityTrackedBrands).set({
      name: project.brandName,
      normalizedName: normalizeBrandName(project.brandName),
      aliases: project.brandAliases,
      domain: project.domain,
      enabled: true,
      updatedAt: now,
      updatedBy: userId,
    }).where(eq(aiVisibilityTrackedBrands.id, existing.id));
    return existing.id;
  }
  const id = newId("avb");
  await db.insert(aiVisibilityTrackedBrands).values({
    id,
    projectId: project.id,
    name: project.brandName,
    normalizedName: normalizeBrandName(project.brandName),
    aliases: project.brandAliases,
    domain: project.domain,
    kind: "own",
    source: "project",
    enabled: true,
    createdBy: userId,
    updatedBy: userId,
  });
  return id;
}

async function upsertDetectedCompetitors(
  projectId: string,
  names: string[],
  userId: string,
  ownNames: string[],
) {
  const existing = await db
    .select()
    .from(aiVisibilityTrackedBrands)
    .where(and(
      eq(aiVisibilityTrackedBrands.projectId, projectId),
      eq(aiVisibilityTrackedBrands.kind, "competitor"),
      isNull(aiVisibilityTrackedBrands.deletedAt),
    ));
  const normalizedOwnNames = new Set(ownNames.map(normalizeBrandName));
  const now = new Date();
  const collisions = existing.filter((row) => row.source === "detected" && normalizedOwnNames.has(row.normalizedName));
  if (collisions.length > 0) {
    await db.update(aiVisibilityTrackedBrands).set({
      enabled: false,
      deletedAt: now,
      deletedBy: userId,
      updatedAt: now,
      updatedBy: userId,
    }).where(inArray(aiVisibilityTrackedBrands.id, collisions.map((row) => row.id)));
  }
  const usableExisting = existing.filter((row) => !collisions.some((collision) => collision.id === row.id));
  const byName = new Map(usableExisting.map((row) => [row.normalizedName, row]));
  let enabledCount = usableExisting.filter((row) => row.enabled).length;
  for (const rawName of names) {
    const name = cleanBrandName(rawName);
    const normalizedName = normalizeBrandName(name);
    if (!name || normalizedName.length < 2 || byName.has(normalizedName)) continue;
    const enabled = enabledCount < MAX_BRAND_PERFORMANCE_COMPETITORS;
    const row = {
      id: newId("avb"),
      projectId,
      name,
      normalizedName,
      aliases: "[]",
      domain: null,
      kind: "competitor" as const,
      source: "detected" as const,
      enabled,
      createdBy: userId,
      updatedBy: userId,
    };
    await db.insert(aiVisibilityTrackedBrands).values(row);
    byName.set(normalizedName, { ...row, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, deletedBy: null, version: 1 });
    if (enabled) enabledCount += 1;
  }
}

function evidenceIds(values: string[], allowed: Set<string>): string[] {
  return [...new Set(values.filter((id) => allowed.has(id)))];
}

export function buildBrandPerformanceReport(
  project: { brandName: string; brandAliases: string },
  observations: ObservationInput[],
  trackedBrands: BrandPerformanceTrackedBrandView[],
  analysis: z.infer<typeof modelAnalysisSchema>,
): { report: BrandPerformanceReport; analyzedCount: number } {
  const observationById = new Map(observations.map((row) => [row.id, row]));
  const allowed = new Set(observationById.keys());
  const ownNames = new Set([
    normalizeBrandName(project.brandName),
    ...parseStringArray(project.brandAliases).map(normalizeBrandName),
  ]);
  const signals = new Map<string, {
    name: string;
    mentions: { observationId: string; sentiment: "positive" | "neutral" | "negative"; themes: string[] }[];
  }>();
  for (const brand of analysis.brands) {
    const normalizedName = normalizeBrandName(brand.name);
    if (!normalizedName) continue;
    const mentions = brand.mentions.filter((mention) => {
      const observation = observationById.get(mention.observationId);
      if (!observation) return false;
      return ownNames.has(normalizedName)
        || normalizedText(observation.responseText).includes(normalizedName);
    });
    if (mentions.length === 0 && !ownNames.has(normalizedName)) continue;
    const current = signals.get(normalizedName) ?? { name: cleanBrandName(brand.name), mentions: [] };
    const seen = new Set(current.mentions.map((mention) => mention.observationId));
    for (const mention of mentions) {
      if (seen.has(mention.observationId)) continue;
      current.mentions.push({
        observationId: mention.observationId,
        sentiment: mention.sentiment,
        themes: [...new Set(mention.themes.map((theme) => theme.trim()).filter(Boolean))],
      });
      seen.add(mention.observationId);
    }
    signals.set(normalizedName, current);
  }

  const trackedOwnNames = new Set(trackedBrands
    .filter((brand) => brand.kind === "own")
    .flatMap((brand) => [brand.name, ...brand.aliases])
    .map(normalizeBrandName));
  const activeBrands = trackedBrands
    .filter((brand) => brand.kind === "own" || (
      brand.enabled
      && ![brand.name, ...brand.aliases].map(normalizeBrandName).some((name) => trackedOwnNames.has(name))
    ))
    .slice(0, 1 + MAX_BRAND_PERFORMANCE_COMPETITORS);
  const mentionCounts = activeBrands.map((brand) => {
    const names = [brand.name, ...brand.aliases].map(normalizeBrandName);
    const signal = names.map((name) => signals.get(name)).find(Boolean);
    return signal?.mentions.length ?? 0;
  });
  const totalMentions = mentionCounts.reduce((sum, count) => sum + count, 0);
  const brands: BrandPerformanceBrandMetric[] = activeBrands.map((brand, index) => {
    const names = [brand.name, ...brand.aliases].map(normalizeBrandName);
    const signal = names.map((name) => signals.get(name)).find(Boolean);
    const mentions = signal?.mentions ?? [];
    const sentiment = {
      positive: mentions.filter((mention) => mention.sentiment === "positive").length,
      neutral: mentions.filter((mention) => mention.sentiment === "neutral").length,
      negative: mentions.filter((mention) => mention.sentiment === "negative").length,
    };
    const classified = sentiment.positive + sentiment.neutral + sentiment.negative;
    return {
      id: brand.id,
      name: brand.name,
      kind: brand.kind,
      color: BRAND_COLORS[index % BRAND_COLORS.length],
      mentionedAnswers: mentions.length,
      mediaShare: mentions.length > 0 && totalMentions > 0
        ? round((mentions.length / totalMentions) * 100)
        : null,
      sentimentScore: classified > 0
        ? round(((sentiment.positive + sentiment.neutral * 0.5) / classified) * 100)
        : null,
      sentiment,
      evidenceObservationIds: mentions.map((mention) => mention.observationId),
    };
  });

  const trackedByNormalized = new Map(activeBrands.flatMap((brand) =>
    [brand.name, ...brand.aliases].map((name) => [normalizeBrandName(name), brand.id] as const)
  ));
  const themeCounts = new Map<string, Record<string, number>>();
  for (const [name, signal] of signals) {
    const brandId = trackedByNormalized.get(name);
    if (!brandId) continue;
    for (const mention of signal.mentions) {
      for (const theme of mention.themes) {
        const counts = themeCounts.get(theme) ?? {};
        counts[brandId] = (counts[brandId] ?? 0) + 1;
        themeCounts.set(theme, counts);
      }
    }
  }
  const themes = [...themeCounts.entries()]
    .map(([label, counts], index) => ({
      id: `theme-${index + 1}`,
      label,
      counts,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  const insights = analysis.insights
    .map((insight, index) => ({
      id: `insight-${index + 1}`,
      title: insight.title,
      body: insight.body,
      evidenceObservationIds: evidenceIds(insight.evidenceObservationIds, allowed),
    }))
    .filter((insight) => insight.evidenceObservationIds.length > 0)
    .slice(0, 4);
  const own = brands.find((brand) => brand.kind === "own");
  if (insights.length === 0 && own?.mentionedAnswers === 0 && observations.length > 0) {
    insights.push({
      id: "insight-own-absent",
      title: "브랜드 언급이 관측되지 않았습니다",
      body: "선택한 실제 AI 답변에서 자사 브랜드의 명시적 언급을 확인하지 못했습니다. 프롬프트 범위를 넓히고 다음 수집에서 다시 확인하세요.",
      evidenceObservationIds: observations.map((row) => row.id).slice(0, 20),
    });
  }

  const opportunities = analysis.opportunities
    .map((opportunity, index) => ({
      id: `opportunity-${index + 1}`,
      title: opportunity.title,
      summary: opportunity.summary,
      recommendations: opportunity.recommendations,
      urgency: opportunity.urgency,
      evidenceObservationIds: evidenceIds(opportunity.evidenceObservationIds, allowed),
    }))
    .filter((opportunity) => opportunity.evidenceObservationIds.length > 0)
    .slice(0, 6);

  const analyzedCount = evidenceIds(analysis.analyzedObservationIds, allowed).length;
  return {
    analyzedCount,
    report: {
      generatedAt: new Date().toISOString(),
      brands,
      insights,
      themes,
      opportunities,
      formulas: {
        mediaShare: "브랜드 언급 답변 수 ÷ 선택 브랜드 전체 언급 답변 수",
        sentiment: "(긍정 + 중립×0.5) ÷ 감정 분류된 언급 답변",
        bubbleSize: "브랜드 언급 답변 수",
        heatmap: "브랜드와 주제가 함께 확인된 답변 수",
      },
    },
  };
}

export async function prepareBrandPerformanceAnalysis(
  auth: AuthContext,
  input: {
    fid: string;
    runId: string;
    provider: AiVisibilityProvider;
    locationKey: string;
    retry?: boolean;
  },
) {
  const project = await requireAiVisibilityProject(auth, input.fid);
  const [run] = await db
    .select({ id: aiVisibilityRuns.id, projectId: aiVisibilityRuns.projectId })
    .from(aiVisibilityRuns)
    .where(and(
      eq(aiVisibilityRuns.id, input.runId),
      eq(aiVisibilityRuns.projectId, project.id),
      eq(aiVisibilityRuns.workspaceId, auth.workspaceId),
      inArray(aiVisibilityRuns.status, ["completed", "partial"]),
    ))
    .limit(1);
  if (!run) throw new ApiError("NOT_FOUND", "분석할 AI 가시성 실행을 찾을 수 없습니다.");
  const observations = await loadObservationInputs(project.id, input.runId, input.provider, input.locationKey);
  if (observations.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "응답 본문이 있는 실제 AI 관측값이 없습니다.");
  }
  const inputHash = brandPerformanceInputHash(observations);
  const [existing] = await db
    .select()
    .from(aiVisibilityBrandReports)
    .where(and(
      eq(aiVisibilityBrandReports.runId, input.runId),
      eq(aiVisibilityBrandReports.provider, input.provider),
      eq(aiVisibilityBrandReports.locationKey, input.locationKey),
    ))
    .limit(1);
  if (
    existing
    && !input.retry
    && existing.inputHash === inputHash
    && ["pending", "running", "completed", "partial"].includes(existing.status)
  ) {
    return { reportId: existing.id, reused: true, status: existing.status };
  }
  const countryCode = observations[0].countryCode;
  if (existing) {
    await db.update(aiVisibilityBrandReports).set({
      inputHash,
      countryCode,
      status: "pending",
      reportJson: null,
      observationCount: observations.length,
      analyzedCount: 0,
      errorMessage: null,
      analyzerProvider: null,
      analyzerModel: null,
      analyzerReasoning: null,
      generatedAt: null,
      updatedAt: new Date(),
    }).where(eq(aiVisibilityBrandReports.id, existing.id));
    return { reportId: existing.id, reused: false, status: "pending" as const };
  }
  const reportId = newId("avbr");
  await db.insert(aiVisibilityBrandReports).values({
    id: reportId,
    projectId: project.id,
    runId: input.runId,
    provider: input.provider,
    countryCode,
    locationKey: input.locationKey,
    inputHash,
    observationCount: observations.length,
    createdBy: auth.userId,
  });
  return { reportId, reused: false, status: "pending" as const };
}

export async function generateBrandPerformanceAnalysis(
  auth: AuthContext,
  reportId: string,
) {
  const [owned] = await db
    .select({ report: aiVisibilityBrandReports, project: aiVisibilityProjects })
    .from(aiVisibilityBrandReports)
    .innerJoin(aiVisibilityProjects, eq(aiVisibilityProjects.id, aiVisibilityBrandReports.projectId))
    .where(and(
      eq(aiVisibilityBrandReports.id, reportId),
      eq(aiVisibilityProjects.workspaceId, auth.workspaceId),
      isNull(aiVisibilityProjects.deletedAt),
    ))
    .limit(1);
  if (!owned) throw new ApiError("NOT_FOUND", "브랜드 성과 분석 작업을 찾을 수 없습니다.");
  if (["completed", "partial"].includes(owned.report.status) && owned.report.reportJson) {
    return { reportId, status: owned.report.status };
  }
  await db.update(aiVisibilityBrandReports).set({
    status: "running",
    errorMessage: null,
    updatedAt: new Date(),
  }).where(eq(aiVisibilityBrandReports.id, reportId));
  try {
    const observations = await loadObservationInputs(
      owned.project.id,
      owned.report.runId,
      owned.report.provider,
      owned.report.locationKey,
    );
    if (observations.length === 0) {
      throw new ApiError("VALIDATION_ERROR", "분석할 실제 AI 응답이 없습니다.");
    }
    const prompt = analysisPrompt(owned.project, observations);
    let result = await requestAnalyzer(prompt);
    let analysis: z.infer<typeof modelAnalysisSchema>;
    try {
      analysis = parseBrandPerformanceModelJson(result.text);
    } catch (error) {
      const validationDetails = error instanceof ApiError && typeof error.details === "string"
        ? error.details
        : "The response was not valid JSON matching the required shape.";
      result = await requestAnalyzer([
        prompt,
        "Your previous response was rejected. Correct it without changing or inventing evidence.",
        `Validation error: ${validationDetails}`,
        "Previous response:",
        result.text.slice(0, 30_000),
        "Return the corrected JSON object only.",
      ].join("\n"));
      analysis = parseBrandPerformanceModelJson(result.text);
    }
    const ownNames = [
      owned.project.brandName,
      ...parseStringArray(owned.project.brandAliases),
    ];
    const normalizedOwnNames = new Set(ownNames.map(normalizeBrandName));
    const competitors = analysis.brands
      .filter((brand) => !brand.isOwn && !normalizedOwnNames.has(normalizeBrandName(brand.name)) && brand.mentions.length > 0)
      .sort((a, b) => b.mentions.length - a.mentions.length)
      .map((brand) => brand.name);
    await ensureOwnBrand(owned.project, auth.userId);
    await upsertDetectedCompetitors(owned.project.id, competitors, auth.userId, ownNames);
    const trackedBrands = await listTrackedBrands(owned.project);
    const built = buildBrandPerformanceReport(owned.project, observations, trackedBrands, analysis);
    const status = built.analyzedCount < observations.length ? "partial" : "completed";
    await db.update(aiVisibilityBrandReports).set({
      status,
      reportJson: JSON.stringify(built.report),
      observationCount: observations.length,
      analyzedCount: built.analyzedCount,
      errorMessage: built.analyzedCount < observations.length
        ? `${observations.length - built.analyzedCount}개 응답은 분석 결과에서 확인되지 않았습니다.`
        : null,
      analyzerProvider: result.provenance.provider,
      analyzerModel: result.provenance.model,
      analyzerReasoning: result.provenance.reasoningEffort,
      generatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(aiVisibilityBrandReports.id, reportId));
    return { reportId, status };
  } catch (error) {
    const message = error instanceof ApiError || error instanceof Error
      ? error.message
      : "브랜드 성과 분석에 실패했습니다.";
    await db.update(aiVisibilityBrandReports).set({
      status: "failed",
      errorMessage: message.slice(0, 500),
      updatedAt: new Date(),
    }).where(eq(aiVisibilityBrandReports.id, reportId));
    throw error;
  }
}

export async function generateBrandPerformanceReportsForRun(
  auth: AuthContext,
  runId: string,
) {
  const [owned] = await db
    .select({ projectId: aiVisibilityRuns.projectId, folderId: aiVisibilityProjects.folderId })
    .from(aiVisibilityRuns)
    .innerJoin(aiVisibilityProjects, eq(aiVisibilityProjects.id, aiVisibilityRuns.projectId))
    .where(and(
      eq(aiVisibilityRuns.id, runId),
      eq(aiVisibilityRuns.workspaceId, auth.workspaceId),
    ))
    .limit(1);
  if (!owned) return [];
  const observations = await db
    .select({
      provider: aiVisibilityObservations.provider,
      locationKey: aiVisibilityObservations.locationKey,
    })
    .from(aiVisibilityObservations)
    .where(and(
      eq(aiVisibilityObservations.runId, runId),
      isNotNull(aiVisibilityObservations.responseText),
      ne(aiVisibilityObservations.responseText, ""),
    ));
  const cells = [...new Map(observations.map((row) => [
    `${row.provider}:${row.locationKey}`,
    row,
  ])).values()];
  const results: { reportId: string; status: string }[] = [];
  for (const cell of cells) {
    try {
      const prepared = await prepareBrandPerformanceAnalysis(auth, {
        fid: owned.folderId,
        runId,
        provider: cell.provider,
        locationKey: cell.locationKey,
      });
      if (prepared.status === "pending") {
        const generated = await generateBrandPerformanceAnalysis(auth, prepared.reportId);
        results.push(generated);
      } else {
        results.push({ reportId: prepared.reportId, status: prepared.status });
      }
    } catch (error) {
      console.error(`[brand-performance] run ${runId} ${cell.provider}/${cell.locationKey} failed`, error);
    }
  }
  return results;
}

function mergeTrackedBrands(
  report: BrandPerformanceReport,
  tracked: BrandPerformanceTrackedBrandView[],
): BrandPerformanceReport {
  const enabled = tracked.filter((brand) => brand.kind === "own" || brand.enabled)
    .slice(0, 1 + MAX_BRAND_PERFORMANCE_COMPETITORS);
  const existingByName = new Map(report.brands.map((brand) => [normalizeBrandName(brand.name), brand]));
  const brands = enabled.map((brand, index) => existingByName.get(normalizeBrandName(brand.name)) ?? {
    id: brand.id,
    name: brand.name,
    kind: brand.kind,
    color: BRAND_COLORS[index % BRAND_COLORS.length],
    mentionedAnswers: 0,
    mediaShare: null,
    sentimentScore: null,
    sentiment: { positive: 0, neutral: 0, negative: 0 },
    evidenceObservationIds: [],
  });
  return { ...report, brands };
}

export async function getBrandPerformanceDashboard(
  auth: AuthContext,
  folderId: string,
  options: {
    runId?: string;
    provider?: AiVisibilityProvider;
    locationKey?: string;
  } = {},
): Promise<BrandPerformanceDashboardResponse> {
  const [settings, projects, analyzer] = await Promise.all([
    getAiVisibilitySettings(auth, folderId),
    listAiVisibilityFolders(auth),
    analyzerCapability(),
  ]);
  const capabilities = settings.capabilities;
  const textProviderAvailable = BRAND_PERFORMANCE_TEXT_PROVIDERS.some(
    (provider) => capabilities.providers[provider].enabled,
  );
  const scopeBase = {
    fid: folderId,
    projectId: settings.project?.id ?? null,
    projectName: settings.folder.name,
    domain: settings.folder.domain,
    brandName: settings.project?.brandName ?? settings.defaults.brandName,
    promptCount: 0,
  };
  const emptyBase = {
    projects,
    capabilities: {
      providers: capabilities.providers,
      textProviderAvailable,
      analyzerAvailable: analyzer.available,
      analyzerReason: analyzer.reason,
    },
    filters: { runs: [], selected: { runId: null, provider: null, locationKey: null } },
    eligibleForAnalysis: false,
    reportId: null,
    report: null,
    trackedBrands: [],
    completeness: { observed: 0, analyzed: 0, ratio: 0 },
    provenance: {
      source: "실제 AI 응답",
      analyzerProvider: null,
      analyzerModel: null,
      generatedAt: null,
      error: null,
    },
  } satisfies Omit<BrandPerformanceDashboardResponse, "scope" | "state">;
  if (!settings.project) {
    return { scope: scopeBase, state: "unconfigured", ...emptyBase };
  }

  const bundle = await getAiVisibilityProjectBundle(auth, folderId);
  const promptCount = bundle.prompts.filter((prompt) => prompt.enabled).length;
  const scope = { ...scopeBase, projectId: bundle.project.id, promptCount };
  const trackedBrands = await listTrackedBrands(bundle.project);
  if (promptCount === 0) {
    return { scope, state: "no_prompts", ...emptyBase, trackedBrands };
  }

  const observations = await db
    .select({
      runId: aiVisibilityObservations.runId,
      provider: aiVisibilityObservations.provider,
      locationKey: aiVisibilityObservations.locationKey,
      countryCode: aiVisibilityObservations.countryCode,
      capturedAt: aiVisibilityObservations.capturedAt,
    })
    .from(aiVisibilityObservations)
    .innerJoin(aiVisibilityRuns, eq(aiVisibilityRuns.id, aiVisibilityObservations.runId))
    .where(and(
      eq(aiVisibilityObservations.projectId, bundle.project.id),
      inArray(aiVisibilityRuns.status, ["completed", "partial"]),
      isNotNull(aiVisibilityObservations.responseText),
      ne(aiVisibilityObservations.responseText, ""),
    ))
    .orderBy(desc(aiVisibilityObservations.capturedAt));
  const grouped = new Map<string, BrandPerformanceRunOption>();
  for (const row of observations) {
    if (!row.runId) continue;
    const key = `${row.runId}:${row.provider}:${row.locationKey}`;
    const current = grouped.get(key);
    if (current) current.observations += 1;
    else grouped.set(key, {
      runId: row.runId,
      provider: row.provider,
      locationKey: row.locationKey,
      countryCode: row.countryCode,
      capturedAt: row.capturedAt.toISOString(),
      observations: 1,
    });
  }
  const runs = [...grouped.values()].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  if (runs.length === 0) {
    return {
      scope,
      state: textProviderAvailable ? "no_data" : "provider_unavailable",
      ...emptyBase,
      trackedBrands,
    };
  }
  const selected = runs.find((run) =>
    (!options.runId || run.runId === options.runId)
    && (!options.provider || run.provider === options.provider)
    && (!options.locationKey || run.locationKey === options.locationKey)
  ) ?? runs[0];
  const [stored] = await db
    .select()
    .from(aiVisibilityBrandReports)
    .where(and(
      eq(aiVisibilityBrandReports.runId, selected.runId),
      eq(aiVisibilityBrandReports.provider, selected.provider),
      eq(aiVisibilityBrandReports.locationKey, selected.locationKey),
    ))
    .limit(1);
  let report: BrandPerformanceReport | null = null;
  if (stored?.reportJson) {
    const parsed = brandPerformanceReportSchema.safeParse(JSON.parse(stored.reportJson));
    if (parsed.success) report = mergeTrackedBrands(parsed.data, trackedBrands);
  }
  const state = !stored
    ? "missing"
    : stored.status === "completed"
      ? "ready"
      : stored.status;
  const observed = stored?.observationCount ?? selected.observations;
  const analyzed = stored?.analyzedCount ?? 0;
  return {
    scope,
    projects,
    capabilities: {
      providers: capabilities.providers,
      textProviderAvailable,
      analyzerAvailable: analyzer.available,
      analyzerReason: analyzer.reason,
    },
    filters: {
      runs,
      selected: {
        runId: selected.runId,
        provider: selected.provider,
        locationKey: selected.locationKey,
      },
    },
    state,
    eligibleForAnalysis: analyzer.available && (state === "missing" || state === "failed"),
    reportId: stored?.id ?? null,
    report,
    trackedBrands,
    completeness: {
      observed,
      analyzed,
      ratio: observed > 0 ? round((analyzed / observed) * 100) : 0,
    },
    provenance: {
      source: `${selected.provider} 실제 응답`,
      analyzerProvider: stored?.analyzerProvider ?? null,
      analyzerModel: stored?.analyzerModel ?? null,
      generatedAt: stored?.generatedAt?.toISOString() ?? null,
      error: stored?.errorMessage ?? null,
    },
  };
}

export async function saveBrandPerformanceBrands(
  auth: AuthContext,
  folderId: string,
  brands: { name: string; aliases?: string[]; domain?: string | null }[],
) {
  if (brands.length > MAX_BRAND_PERFORMANCE_COMPETITORS) {
    throw new ApiError("PLAN_LIMIT", `경쟁 브랜드는 최대 ${MAX_BRAND_PERFORMANCE_COMPETITORS}개까지 선택할 수 있습니다.`);
  }
  const project = await requireAiVisibilityProject(auth, folderId);
  const cleaned = brands.map((brand) => ({
    name: cleanBrandName(brand.name),
    normalizedName: normalizeBrandName(brand.name),
    aliases: [...new Set((brand.aliases ?? []).map(cleanBrandName).filter(Boolean))].slice(0, 5),
    domain: brand.domain ? normalizeDomain(brand.domain) : null,
  }));
  if (cleaned.some((brand) => !brand.name || brand.normalizedName.length < 2)) {
    throw new ApiError("VALIDATION_ERROR", "경쟁 브랜드명을 두 글자 이상 입력해 주세요.");
  }
  if (new Set(cleaned.map((brand) => brand.normalizedName)).size !== cleaned.length) {
    throw new ApiError("VALIDATION_ERROR", "같은 경쟁 브랜드를 중복해서 선택할 수 없습니다.");
  }
  await ensureOwnBrand(project, auth.userId);
  const existing = await db
    .select()
    .from(aiVisibilityTrackedBrands)
    .where(and(
      eq(aiVisibilityTrackedBrands.projectId, project.id),
      eq(aiVisibilityTrackedBrands.kind, "competitor"),
      isNull(aiVisibilityTrackedBrands.deletedAt),
    ));
  const byName = new Map(existing.map((row) => [row.normalizedName, row]));
  await db.update(aiVisibilityTrackedBrands).set({
    enabled: false,
    updatedAt: new Date(),
    updatedBy: auth.userId,
  }).where(and(
    eq(aiVisibilityTrackedBrands.projectId, project.id),
    eq(aiVisibilityTrackedBrands.kind, "competitor"),
    isNull(aiVisibilityTrackedBrands.deletedAt),
  ));
  for (const brand of cleaned) {
    const row = byName.get(brand.normalizedName);
    if (row) {
      await db.update(aiVisibilityTrackedBrands).set({
        name: brand.name,
        aliases: JSON.stringify(brand.aliases),
        domain: brand.domain,
        source: "manual",
        enabled: true,
        updatedAt: new Date(),
        updatedBy: auth.userId,
      }).where(eq(aiVisibilityTrackedBrands.id, row.id));
    } else {
      await db.insert(aiVisibilityTrackedBrands).values({
        id: newId("avb"),
        projectId: project.id,
        name: brand.name,
        normalizedName: brand.normalizedName,
        aliases: JSON.stringify(brand.aliases),
        domain: brand.domain,
        kind: "competitor",
        source: "manual",
        enabled: true,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      });
    }
  }
  return listTrackedBrands(project);
}
