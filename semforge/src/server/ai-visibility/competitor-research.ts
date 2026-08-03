import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  aiVisibilityObservations,
  aiVisibilityPrompts,
  positionTrackingCampaigns,
  type AiVisibilityProvider,
} from "@/db/schema";
import type { AuthContext } from "@/lib/session";
import {
  getDiscoveredCompetitors,
  type DiscoveredCompetitor,
} from "@/server/position-tracking/insights";
import {
  getBrandPerformanceDashboard,
  type BrandPerformanceDashboardResponse,
  type BrandPerformanceReport,
} from "./brand-performance";

export interface CompetitorResearchObservationInput {
  id: string;
  prompt: string;
  topic: string;
  responseText: string;
  capturedAt: Date;
}

export interface CompetitorResearchBrand {
  id: string;
  name: string;
  domain: string | null;
  aliases: string[];
  source: "manual" | "detected" | "position_tracking" | "project";
  observed: boolean;
  mentionedAnswers: number;
  shareOfVoice: number | null;
  sentimentScore: number | null;
  sentiment: { positive: number; neutral: number; negative: number };
  sharedPromptCount: number;
  gapPromptCount: number;
  leadingThemes: { id: string; label: string; count: number }[];
  evidenceObservationIds: string[];
}

export interface CompetitorResearchPromptRow {
  observationId: string;
  prompt: string;
  topic: string;
  ownMentioned: boolean;
  competitorIds: string[];
  excerpt: string;
  capturedAt: string;
}

export interface CompetitorResearchView {
  summary: {
    observedCompetitors: number;
    ownShareOfVoice: number | null;
    leaderName: string | null;
    leaderShareOfVoice: number | null;
    sharedPromptCount: number;
    gapPromptCount: number;
  };
  ownBrand: CompetitorResearchBrand | null;
  competitors: CompetitorResearchBrand[];
  prompts: CompetitorResearchPromptRow[];
  insights: BrandPerformanceReport["insights"];
  opportunities: BrandPerformanceReport["opportunities"];
}

export interface CompetitorResearchDashboardResponse extends BrandPerformanceDashboardResponse {
  research: CompetitorResearchView;
  positionTracking: {
    campaignId: string | null;
    hasData: boolean;
    totalKeywords: number;
    keywordsWithSerp: number;
    candidates: DiscoveredCompetitor[];
  };
}

function emptyResearch(): CompetitorResearchView {
  return {
    summary: {
      observedCompetitors: 0,
      ownShareOfVoice: null,
      leaderName: null,
      leaderShareOfVoice: null,
      sharedPromptCount: 0,
      gapPromptCount: 0,
    },
    ownBrand: null,
    competitors: [],
    prompts: [],
    insights: [],
    opportunities: [],
  };
}

function excerpt(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > 420 ? `${clean.slice(0, 417)}…` : clean;
}

export function buildCompetitorResearch(
  report: BrandPerformanceReport | null,
  observations: CompetitorResearchObservationInput[],
  tracked: BrandPerformanceDashboardResponse["trackedBrands"],
): CompetitorResearchView {
  if (!report) return emptyResearch();

  const trackedByName = new Map(
    tracked.map((brand) => [brand.name.trim().toLocaleLowerCase(), brand]),
  );
  const reportOwn = report.brands.find((brand) => brand.kind === "own") ?? null;
  const evidenceByBrand = new Map(
    report.brands.map((brand) => [brand.id, new Set(brand.evidenceObservationIds)]),
  );
  const ownEvidence = reportOwn ? evidenceByBrand.get(reportOwn.id) ?? new Set<string>() : new Set<string>();

  const toBrand = (brand: BrandPerformanceReport["brands"][number]): CompetitorResearchBrand => {
    const trackedBrand = trackedByName.get(brand.name.trim().toLocaleLowerCase());
    const evidence = evidenceByBrand.get(brand.id) ?? new Set<string>();
    const sharedPromptCount = observations.filter(
      (row) => ownEvidence.has(row.id) && evidence.has(row.id),
    ).length;
    const gapPromptCount = observations.filter(
      (row) => !ownEvidence.has(row.id) && evidence.has(row.id),
    ).length;
    const leadingThemes = report.themes
      .map((theme) => ({ id: theme.id, label: theme.label, count: theme.counts[brand.id] ?? 0 }))
      .filter((theme) => theme.count > 0)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 3);
    return {
      id: brand.id,
      name: brand.name,
      domain: trackedBrand?.domain ?? null,
      aliases: trackedBrand?.aliases ?? [],
      source: trackedBrand?.source ?? (brand.kind === "own" ? "project" : "detected"),
      observed: brand.mentionedAnswers > 0,
      mentionedAnswers: brand.mentionedAnswers,
      shareOfVoice: brand.mediaShare,
      sentimentScore: brand.sentimentScore,
      sentiment: brand.sentiment,
      sharedPromptCount,
      gapPromptCount,
      leadingThemes,
      evidenceObservationIds: brand.evidenceObservationIds,
    };
  };

  const ownBrand = reportOwn ? toBrand(reportOwn) : null;
  const competitors = report.brands
    .filter((brand) => brand.kind === "competitor")
    .map(toBrand)
    .sort((a, b) => b.mentionedAnswers - a.mentionedAnswers || a.name.localeCompare(b.name));
  const prompts = observations.map((row) => ({
    observationId: row.id,
    prompt: row.prompt,
    topic: row.topic,
    ownMentioned: ownEvidence.has(row.id),
    competitorIds: competitors
      .filter((brand) => (evidenceByBrand.get(brand.id) ?? new Set<string>()).has(row.id))
      .map((brand) => brand.id),
    excerpt: excerpt(row.responseText),
    capturedAt: row.capturedAt.toISOString(),
  }));
  const observedBrands = [ownBrand, ...competitors]
    .filter((brand): brand is CompetitorResearchBrand => Boolean(brand?.observed));
  const leader = [...observedBrands].sort(
    (a, b) => (b.shareOfVoice ?? -1) - (a.shareOfVoice ?? -1) || b.mentionedAnswers - a.mentionedAnswers,
  )[0] ?? null;

  return {
    summary: {
      observedCompetitors: competitors.filter((brand) => brand.observed).length,
      ownShareOfVoice: ownBrand?.shareOfVoice ?? null,
      leaderName: leader?.name ?? null,
      leaderShareOfVoice: leader?.shareOfVoice ?? null,
      sharedPromptCount: prompts.filter((row) => row.ownMentioned && row.competitorIds.length > 0).length,
      gapPromptCount: prompts.filter((row) => !row.ownMentioned && row.competitorIds.length > 0).length,
    },
    ownBrand,
    competitors,
    prompts,
    insights: report.insights,
    opportunities: report.opportunities,
  };
}

async function positionTrackingResearch(auth: AuthContext, folderId: string) {
  const [campaign] = await db
    .select({ id: positionTrackingCampaigns.id, searchEngine: positionTrackingCampaigns.searchEngine })
    .from(positionTrackingCampaigns)
    .where(and(
      eq(positionTrackingCampaigns.workspaceId, auth.workspaceId),
      eq(positionTrackingCampaigns.folderId, folderId),
      isNull(positionTrackingCampaigns.deletedAt),
    ))
    .orderBy(desc(positionTrackingCampaigns.updatedAt))
    .limit(1);
  if (!campaign || (campaign.searchEngine !== "google" && campaign.searchEngine !== "bing")) {
    return {
      campaignId: campaign?.id ?? null,
      hasData: false,
      totalKeywords: 0,
      keywordsWithSerp: 0,
      candidates: [] as DiscoveredCompetitor[],
    };
  }
  const discovered = await getDiscoveredCompetitors(auth, campaign.id);
  return {
    campaignId: campaign.id,
    hasData: discovered.hasData,
    totalKeywords: discovered.totalKeywords,
    keywordsWithSerp: discovered.keywordsWithSerp,
    candidates: discovered.competitors,
  };
}

export async function getCompetitorResearchDashboard(
  auth: AuthContext,
  folderId: string,
  options: {
    runId?: string;
    provider?: AiVisibilityProvider;
    locationKey?: string;
  } = {},
): Promise<CompetitorResearchDashboardResponse> {
  const performance = await getBrandPerformanceDashboard(auth, folderId, options);
  const selected = performance.filters.selected;
  const [observations, positionTracking] = await Promise.all([
    selected.runId && selected.provider && selected.locationKey && performance.scope.projectId
      ? db
        .select({
          id: aiVisibilityObservations.id,
          prompt: aiVisibilityPrompts.prompt,
          topic: aiVisibilityPrompts.topic,
          responseText: aiVisibilityObservations.responseText,
          capturedAt: aiVisibilityObservations.capturedAt,
        })
        .from(aiVisibilityObservations)
        .innerJoin(aiVisibilityPrompts, eq(aiVisibilityPrompts.id, aiVisibilityObservations.promptId))
        .where(and(
          eq(aiVisibilityObservations.projectId, performance.scope.projectId),
          eq(aiVisibilityObservations.runId, selected.runId),
          eq(aiVisibilityObservations.provider, selected.provider),
          eq(aiVisibilityObservations.locationKey, selected.locationKey),
        ))
        .orderBy(aiVisibilityPrompts.createdAt)
      : Promise.resolve([]),
    positionTrackingResearch(auth, folderId),
  ]);
  const inputs = observations
    .filter((row): row is typeof row & { responseText: string } => Boolean(row.responseText?.trim()))
    .map((row) => ({ ...row, responseText: row.responseText! }));
  return {
    ...performance,
    research: buildCompetitorResearch(performance.report, inputs, performance.trackedBrands),
    positionTracking,
  };
}
