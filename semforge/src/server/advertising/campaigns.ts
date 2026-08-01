import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  advertisingAdGroups,
  advertisingCampaigns,
  advertisingCreatives,
  advertisingKeywords,
  advertisingRecommendations,
  folders,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { newId } from "@/lib/ids";
import {
  assertCan,
  assertOwnershipOrAdmin,
  assertSameWorkspace,
} from "@/lib/rbac";
import type { AuthContext } from "@/lib/session";
import {
  getChatMockAdvertisingModel,
  googleAdUnits,
  generateAdvertisingPlan,
} from "@/server/advertising/ai";
import { getAdvertisingBrandContext } from "@/server/advertising/context";
import {
  parseJson,
  type AdCampaignDraft,
  type AdRecommendation,
  type CampaignCreativeInput,
  type CampaignDraftInput,
  type CampaignDraftPatch,
  type CampaignKeywordInput,
  type RecommendationKind,
} from "@/server/advertising/contracts";

function safeHttpUrl(value: string, field = "finalUrl"): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "올바른 HTTP(S) 랜딩 URL을 입력해 주세요.", {
      fields: { [field]: "예: https://example.com/product" },
    });
  }
}

function validateCreative(
  platform: "google" | "meta",
  creative: CampaignCreativeInput,
): CampaignCreativeInput {
  const headlines = creative.headlines.map((value) => value.trim()).filter(Boolean).slice(0, 15);
  const descriptions = creative.descriptions
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (platform === "google") {
    if (headlines.some((value) => googleAdUnits(value) > 30)) {
      throw new ApiError("VALIDATION_ERROR", "Google 헤드라인은 30자 이하여야 합니다.", {
        fields: { headlines: "한글·CJK 문자는 2자로 계산합니다." },
      });
    }
    if (descriptions.some((value) => googleAdUnits(value) > 90)) {
      throw new ApiError("VALIDATION_ERROR", "Google 설명은 90자 이하여야 합니다.");
    }
    if ([creative.path1, creative.path2].some((value) => value && googleAdUnits(value) > 15)) {
      throw new ApiError("VALIDATION_ERROR", "Google 표시 경로는 15자 이하여야 합니다.");
    }
  }
  return {
    ...creative,
    headlines,
    descriptions,
    finalUrl: safeHttpUrl(creative.finalUrl),
    path1: creative.path1?.trim() || null,
    path2: creative.path2?.trim() || null,
    primaryText: creative.primaryText?.trim() || null,
    callToAction: creative.callToAction?.trim() || null,
  };
}

async function assertFolder(auth: AuthContext, folderId?: string | null): Promise<void> {
  if (!folderId) return;
  const [folder] = await db
    .select({ workspaceId: folders.workspaceId })
    .from(folders)
    .where(and(eq(folders.id, folderId), isNull(folders.deletedAt)))
    .limit(1);
  assertSameWorkspace(auth, folder, "폴더");
}

async function requireCampaign(auth: AuthContext, id: string) {
  const [campaign] = await db
    .select()
    .from(advertisingCampaigns)
    .where(and(eq(advertisingCampaigns.id, id), isNull(advertisingCampaigns.deletedAt)))
    .limit(1);
  assertSameWorkspace(auth, campaign, "광고 캠페인");
  return campaign;
}

function recommendationView(
  row: typeof advertisingRecommendations.$inferSelect,
): AdRecommendation {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    rationale: row.rationale,
    beforeValue: parseJson(row.beforeValue, null),
    afterValue: parseJson(row.afterValue, {}),
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getAdvertisingCampaign(
  auth: AuthContext,
  id: string,
): Promise<AdCampaignDraft> {
  const campaign = await requireCampaign(auth, id);
  const [groups, keywords, creatives, recommendations] = await Promise.all([
    db
      .select()
      .from(advertisingAdGroups)
      .where(and(eq(advertisingAdGroups.campaignId, id), isNull(advertisingAdGroups.deletedAt)))
      .orderBy(advertisingAdGroups.createdAt),
    db
      .select()
      .from(advertisingKeywords)
      .where(and(eq(advertisingKeywords.campaignId, id), isNull(advertisingKeywords.deletedAt)))
      .orderBy(advertisingKeywords.createdAt),
    db
      .select()
      .from(advertisingCreatives)
      .where(and(eq(advertisingCreatives.campaignId, id), isNull(advertisingCreatives.deletedAt)))
      .orderBy(advertisingCreatives.createdAt),
    db
      .select()
      .from(advertisingRecommendations)
      .where(
        and(
          eq(advertisingRecommendations.campaignId, id),
          isNull(advertisingRecommendations.deletedAt),
        ),
      )
      .orderBy(desc(advertisingRecommendations.createdAt)),
  ]);
  const group = groups[0];
  const creative = creatives[0];
  if (!group || !creative) throw new ApiError("INTERNAL", "캠페인 초안 구성이 올바르지 않습니다.");
  return {
    id: campaign.id,
    folderId: campaign.folderId,
    name: campaign.name,
    domain: campaign.domain,
    platform: campaign.platform,
    goal: campaign.goal,
    countryCode: campaign.countryCode,
    languageCode: campaign.languageCode,
    dailyBudgetCents: campaign.dailyBudgetCents,
    currencyCode: campaign.currencyCode,
    status: campaign.status,
    version: campaign.version,
    updatedAt: campaign.updatedAt.toISOString(),
    adGroup: { id: group.id, name: group.name, finalUrl: group.finalUrl },
    keywords: keywords.map((keyword) => ({
      id: keyword.id,
      keyword: keyword.keyword,
      matchType: keyword.matchType,
      negative: keyword.negative,
      source: keyword.source,
      volume: keyword.volume,
      cpcCents: keyword.cpcCents,
    })),
    creative: {
      id: creative.id,
      headlines: parseJson<string[]>(creative.headlines, []),
      descriptions: parseJson<string[]>(creative.descriptions, []),
      primaryText: creative.primaryText,
      path1: creative.path1,
      path2: creative.path2,
      callToAction: creative.callToAction,
      finalUrl: creative.finalUrl,
      source: creative.source,
    },
    recommendations: recommendations.map(recommendationView),
  };
}

export async function listAdvertisingCampaigns(auth: AuthContext): Promise<AdCampaignDraft[]> {
  const rows = await db
    .select({ id: advertisingCampaigns.id })
    .from(advertisingCampaigns)
    .where(
      and(
        eq(advertisingCampaigns.workspaceId, auth.workspaceId),
        isNull(advertisingCampaigns.deletedAt),
      ),
    )
    .orderBy(desc(advertisingCampaigns.updatedAt))
    .limit(50);
  return Promise.all(rows.map((row) => getAdvertisingCampaign(auth, row.id)));
}

export async function createAdvertisingCampaign(
  auth: AuthContext,
  input: CampaignDraftInput,
): Promise<{ campaign: AdCampaignDraft; reused: boolean }> {
  assertCan(auth, "create");
  const domain = normalizeDomain(input.domain);
  if (!domain || !domain.includes(".")) {
    throw new ApiError("VALIDATION_ERROR", "유효한 도메인을 입력해 주세요.");
  }
  await assertFolder(auth, input.folderId);
  if (input.requestId) {
    const [existing] = await db
      .select({ id: advertisingCampaigns.id })
      .from(advertisingCampaigns)
      .where(
        and(
          eq(advertisingCampaigns.workspaceId, auth.workspaceId),
          eq(advertisingCampaigns.requestId, input.requestId),
          isNull(advertisingCampaigns.deletedAt),
        ),
      )
      .limit(1);
    if (existing) return { campaign: await getAdvertisingCampaign(auth, existing.id), reused: true };
  }
  const id = newId("adc");
  const groupId = newId("adg");
  const creativeId = newId("adv");
  const finalUrl = safeHttpUrl(input.finalUrl || `https://${domain}`);
  const creative = validateCreative(input.platform, input.creative ?? {
    headlines: [],
    descriptions: [],
    finalUrl,
  });
  const now = new Date();
  db.transaction((tx) => {
    tx.insert(advertisingCampaigns)
      .values({
        id,
        workspaceId: auth.workspaceId,
        folderId: input.folderId ?? null,
        requestId: input.requestId ?? null,
        name: input.name.trim(),
        domain,
        platform: input.platform,
        goal: input.goal,
        countryCode: input.countryCode.toUpperCase(),
        languageCode: input.languageCode,
        dailyBudgetCents: Math.max(0, Math.round(input.dailyBudgetCents)),
        currencyCode: input.currencyCode.toUpperCase(),
        status: input.status ?? "draft",
        createdBy: auth.userId,
        updatedBy: auth.userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    tx.insert(advertisingAdGroups)
      .values({
        id: groupId,
        workspaceId: auth.workspaceId,
        campaignId: id,
        name: input.adGroupName.trim() || "기본 광고 그룹",
        finalUrl,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      })
      .run();
    tx.insert(advertisingCreatives)
      .values({
        id: creativeId,
        workspaceId: auth.workspaceId,
        campaignId: id,
        adGroupId: groupId,
        format: input.platform === "google" ? "google_rsa" : "meta_primary",
        headlines: JSON.stringify(creative.headlines),
        descriptions: JSON.stringify(creative.descriptions),
        primaryText: creative.primaryText ?? null,
        path1: creative.path1 ?? null,
        path2: creative.path2 ?? null,
        callToAction: creative.callToAction ?? null,
        finalUrl,
        source: "manual",
        createdBy: auth.userId,
        updatedBy: auth.userId,
      })
      .run();
    if (input.keywords?.length) {
      const unique = dedupeKeywordInputs(input.keywords);
      tx.insert(advertisingKeywords)
        .values(
          unique.map((keyword) => ({
            id: newId("adk"),
            workspaceId: auth.workspaceId,
            campaignId: id,
            adGroupId: groupId,
            keyword: keyword.keyword,
            matchType: keyword.matchType,
            negative: keyword.negative,
            source: keyword.source ?? "manual",
            volume: keyword.volume ?? null,
            cpcCents: keyword.cpcCents ?? null,
            createdBy: auth.userId,
            updatedBy: auth.userId,
          })),
        )
        .run();
    }
  });
  writeAudit(auth, {
    action: "create",
    entityType: "advertising_campaign",
    entityId: id,
    entityLabel: input.name,
    after: { domain, platform: input.platform, goal: input.goal },
  });
  return { campaign: await getAdvertisingCampaign(auth, id), reused: false };
}

function dedupeKeywordInputs(values: CampaignKeywordInput[]): CampaignKeywordInput[] {
  const seen = new Set<string>();
  return values
    .map((item) => ({ ...item, keyword: item.keyword.trim().replace(/\s+/g, " ") }))
    .filter((item) => {
      if (!item.keyword) return false;
      const key = `${item.keyword.toLocaleLowerCase()}\u0000${item.matchType}\u0000${item.negative}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 200);
}

async function syncKeywords(
  auth: AuthContext,
  campaignId: string,
  adGroupId: string,
  values: CampaignKeywordInput[],
): Promise<void> {
  const current = await db
    .select()
    .from(advertisingKeywords)
    .where(and(eq(advertisingKeywords.campaignId, campaignId), isNull(advertisingKeywords.deletedAt)));
  const byId = new Map(current.map((row) => [row.id, row]));
  const keep = new Set<string>();
  const now = new Date();
  for (const item of dedupeKeywordInputs(values)) {
    const existing = item.id ? byId.get(item.id) : undefined;
    if (existing) {
      keep.add(existing.id);
      await db
        .update(advertisingKeywords)
        .set({
          keyword: item.keyword,
          matchType: item.matchType,
          negative: item.negative,
          source: item.source ?? existing.source,
          volume: item.volume ?? null,
          cpcCents: item.cpcCents ?? null,
          updatedAt: now,
          updatedBy: auth.userId,
          version: sql`${advertisingKeywords.version} + 1`,
        })
        .where(eq(advertisingKeywords.id, existing.id));
    } else {
      const id = newId("adk");
      keep.add(id);
      await db.insert(advertisingKeywords).values({
        id,
        workspaceId: auth.workspaceId,
        campaignId,
        adGroupId,
        keyword: item.keyword,
        matchType: item.matchType,
        negative: item.negative,
        source: item.source ?? "manual",
        volume: item.volume ?? null,
        cpcCents: item.cpcCents ?? null,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      });
    }
  }
  for (const row of current) {
    if (keep.has(row.id)) continue;
    await db
      .update(advertisingKeywords)
      .set({ deletedAt: now, deletedBy: auth.userId, updatedAt: now, updatedBy: auth.userId })
      .where(eq(advertisingKeywords.id, row.id));
  }
}

export async function updateAdvertisingCampaign(
  auth: AuthContext,
  id: string,
  input: CampaignDraftPatch,
): Promise<AdCampaignDraft> {
  assertCan(auth, "update");
  const before = await requireCampaign(auth, id);
  assertOwnershipOrAdmin(auth, before);
  if (before.version !== input.version) {
    throw new ApiError("VERSION_CONFLICT", "다른 변경사항이 먼저 저장되었습니다. 최신 초안을 다시 불러와 주세요.");
  }
  await assertFolder(auth, input.folderId);
  const [group] = await db
    .select()
    .from(advertisingAdGroups)
    .where(and(eq(advertisingAdGroups.campaignId, id), isNull(advertisingAdGroups.deletedAt)))
    .limit(1);
  const [creativeRow] = await db
    .select()
    .from(advertisingCreatives)
    .where(and(eq(advertisingCreatives.campaignId, id), isNull(advertisingCreatives.deletedAt)))
    .limit(1);
  if (!group || !creativeRow) throw new ApiError("INTERNAL", "캠페인 초안 구성이 올바르지 않습니다.");
  const platform = input.platform ?? before.platform;
  const creative = input.creative ? validateCreative(platform, input.creative) : null;
  const now = new Date();
  const update: Partial<typeof advertisingCampaigns.$inferInsert> = {
    updatedAt: now,
    updatedBy: auth.userId,
  };
  if (input.folderId !== undefined) update.folderId = input.folderId;
  if (input.name !== undefined) update.name = input.name.trim();
  if (input.platform !== undefined) update.platform = input.platform;
  if (input.goal !== undefined) update.goal = input.goal;
  if (input.countryCode !== undefined) update.countryCode = input.countryCode.toUpperCase();
  if (input.languageCode !== undefined) update.languageCode = input.languageCode;
  if (input.dailyBudgetCents !== undefined) update.dailyBudgetCents = Math.max(0, Math.round(input.dailyBudgetCents));
  if (input.currencyCode !== undefined) update.currencyCode = input.currencyCode.toUpperCase();
  if (input.status !== undefined) update.status = input.status;

  const changed = db
    .update(advertisingCampaigns)
    .set({ ...update, version: sql`${advertisingCampaigns.version} + 1` })
    .where(and(eq(advertisingCampaigns.id, id), eq(advertisingCampaigns.version, input.version)))
    .run();
  if (changed.changes !== 1) throw new ApiError("VERSION_CONFLICT", "최신 초안을 다시 불러와 주세요.");

  if (input.adGroupName !== undefined || input.finalUrl !== undefined) {
    const finalUrl = input.finalUrl ? safeHttpUrl(input.finalUrl) : group.finalUrl;
    await db
      .update(advertisingAdGroups)
      .set({
        name: input.adGroupName?.trim() || group.name,
        finalUrl,
        updatedAt: now,
        updatedBy: auth.userId,
        version: sql`${advertisingAdGroups.version} + 1`,
      })
      .where(eq(advertisingAdGroups.id, group.id));
  }
  if (input.keywords) await syncKeywords(auth, id, group.id, input.keywords);
  if (creative) {
    await db
      .update(advertisingCreatives)
      .set({
        format: platform === "google" ? "google_rsa" : "meta_primary",
        headlines: JSON.stringify(creative.headlines),
        descriptions: JSON.stringify(creative.descriptions),
        primaryText: creative.primaryText ?? null,
        path1: creative.path1 ?? null,
        path2: creative.path2 ?? null,
        callToAction: creative.callToAction ?? null,
        finalUrl: creative.finalUrl,
        source: "manual",
        updatedAt: now,
        updatedBy: auth.userId,
        version: sql`${advertisingCreatives.version} + 1`,
      })
      .where(eq(advertisingCreatives.id, creativeRow.id));
  }
  writeAudit(auth, {
    action: "update",
    entityType: "advertising_campaign",
    entityId: id,
    entityLabel: input.name ?? before.name,
    before,
    after: input,
  });
  return getAdvertisingCampaign(auth, id);
}

export async function deleteAdvertisingCampaign(auth: AuthContext, id: string): Promise<void> {
  assertCan(auth, "delete");
  const campaign = await requireCampaign(auth, id);
  assertOwnershipOrAdmin(auth, campaign);
  const now = new Date();
  await db
    .update(advertisingCampaigns)
    .set({ deletedAt: now, deletedBy: auth.userId, updatedAt: now, updatedBy: auth.userId })
    .where(eq(advertisingCampaigns.id, id));
  writeAudit(auth, {
    action: "delete",
    entityType: "advertising_campaign",
    entityId: id,
    entityLabel: campaign.name,
    before: campaign,
  });
}

export async function generateCampaignRecommendations(
  auth: AuthContext,
  campaignId: string,
): Promise<AdCampaignDraft> {
  assertCan(auth, "update");
  const campaign = await getAdvertisingCampaign(auth, campaignId);
  const campaignRow = await requireCampaign(auth, campaignId);
  assertOwnershipOrAdmin(auth, campaignRow);
  const context = await getAdvertisingBrandContext(campaign.domain);
  const plan = await generateAdvertisingPlan(campaign, context);
  const now = new Date();
  const applicableModelRecommendations = plan.recommendations.filter((recommendation) =>
    prepareRecommendationValue(
      recommendation.kind,
      recommendation.afterValue,
      campaign.platform,
      campaign.creative,
    ).applicable
  );
  const generated: Array<{
    kind: RecommendationKind;
    rationale: string;
    beforeValue: unknown;
    afterValue: unknown;
  }> = [
    {
      kind: "rewrite_copy",
      rationale: "웹사이트 문맥과 현재 키워드를 바탕으로 채널 규격에 맞춘 광고 문구 초안입니다.",
      beforeValue: campaign.creative,
      afterValue: {
        headlines: plan.headlines,
        descriptions: plan.descriptions,
        primaryText: plan.primaryText ?? null,
        path1: plan.path1 ?? null,
        path2: plan.path2 ?? null,
      },
    },
    ...plan.keywordSuggestions.slice(0, 8).map((keyword) => ({
      kind: "add_keyword" as const,
      rationale: "웹사이트와 기존 키워드 문맥에서 발견한 검토용 키워드입니다.",
      beforeValue: null,
      afterValue: { keyword, matchType: "phrase", negative: false },
    })),
    ...applicableModelRecommendations.map((recommendation) => ({
      kind: recommendation.kind,
      rationale: recommendation.rationale,
      beforeValue: null,
      afterValue: recommendation.afterValue,
    })),
  ];
  await db.insert(advertisingRecommendations).values(
    generated.slice(0, 20).map((recommendation) => ({
      id: newId("rec"),
      workspaceId: auth.workspaceId,
      campaignId,
      kind: recommendation.kind,
      rationale: recommendation.rationale,
      beforeValue: JSON.stringify(recommendation.beforeValue),
      afterValue: JSON.stringify(recommendation.afterValue),
      source: `chatmock:${getChatMockAdvertisingModel()}`,
      createdBy: auth.userId,
      updatedBy: auth.userId,
      createdAt: now,
      updatedAt: now,
    })),
  );
  writeAudit(auth, {
    action: "create",
    entityType: "advertising_recommendations",
    entityId: campaignId,
    entityLabel: campaign.name,
    after: { count: generated.length, source: "chatmock" },
  });
  return getAdvertisingCampaign(auth, campaignId);
}

const addKeywordValue = z.object({
  keyword: z.string().trim().min(1).max(100),
  matchType: z.enum(["broad", "phrase", "exact"]).default("phrase"),
  negative: z.boolean().default(false),
});
const rewriteValue = z.object({
  headlines: z.array(z.string()).min(1).max(15),
  descriptions: z.array(z.string()).min(1).max(4),
  primaryText: z.string().nullable().optional(),
  path1: z.string().nullable().optional(),
  path2: z.string().nullable().optional(),
});

type PreparedRecommendationValue = {
  applicable: boolean;
  value: Record<string, unknown>;
  keyword: z.infer<typeof addKeywordValue> | null;
  creative: CampaignCreativeInput | null;
  budget: number | null;
  finalUrl: string | null;
  groupName: string | null;
  removeKeywordId: string | null;
  removeKeyword: string | null;
};

function prepareRecommendationValue(
  kind: RecommendationKind,
  rawValue: unknown,
  platform: "google" | "meta",
  currentCreative: Pick<CampaignCreativeInput, "finalUrl" | "callToAction">,
): PreparedRecommendationValue {
  const value = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
    ? rawValue as Record<string, unknown>
    : {};
  const prepared: PreparedRecommendationValue = {
    applicable: false,
    value,
    keyword: null,
    creative: null,
    budget: null,
    finalUrl: null,
    groupName: null,
    removeKeywordId: null,
    removeKeyword: null,
  };

  try {
    if (kind === "add_keyword") {
      const parsed = addKeywordValue.safeParse(value);
      if (parsed.success) return { ...prepared, applicable: true, keyword: parsed.data };
      return prepared;
    }
    if (kind === "remove_keyword") {
      const keywordId = typeof value.keywordId === "string" ? value.keywordId.trim() : "";
      const keyword = typeof value.keyword === "string" ? value.keyword.trim() : "";
      return keywordId || keyword
        ? { ...prepared, applicable: true, removeKeywordId: keywordId || null, removeKeyword: keyword || null }
        : prepared;
    }
    if (kind === "rewrite_copy") {
      const parsed = rewriteValue.safeParse(value);
      if (!parsed.success) return prepared;
      const creative = validateCreative(platform, {
        ...parsed.data,
        finalUrl: currentCreative.finalUrl,
        callToAction: currentCreative.callToAction,
      });
      return { ...prepared, applicable: true, creative };
    }
    if (kind === "budget") {
      const budget = Number(value.dailyBudgetCents);
      return Number.isFinite(budget) && budget >= 0
        ? { ...prepared, applicable: true, budget: Math.round(budget) }
        : prepared;
    }
    if (kind === "landing_page") {
      if (typeof value.finalUrl !== "string") return prepared;
      return { ...prepared, applicable: true, finalUrl: safeHttpUrl(value.finalUrl) };
    }
    const groupName = typeof value.name === "string" ? value.name.trim().slice(0, 100) : "";
    return groupName ? { ...prepared, applicable: true, groupName } : prepared;
  } catch {
    return prepared;
  }
}

export async function resolveAdvertisingRecommendation(
  auth: AuthContext,
  campaignId: string,
  recommendationId: string,
  action: "apply" | "reject",
): Promise<AdCampaignDraft> {
  assertCan(auth, "update");
  const campaign = await requireCampaign(auth, campaignId);
  assertOwnershipOrAdmin(auth, campaign);
  const [recommendation] = await db
    .select()
    .from(advertisingRecommendations)
    .where(
      and(
        eq(advertisingRecommendations.id, recommendationId),
        eq(advertisingRecommendations.campaignId, campaignId),
        isNull(advertisingRecommendations.deletedAt),
      ),
    )
    .limit(1);
  assertSameWorkspace(auth, recommendation, "광고 추천");
  if (recommendation.status !== "pending") {
    throw new ApiError("VERSION_CONFLICT", "이미 처리된 추천입니다.");
  }
  const now = new Date();
  let resolutionStatus: "applied" | "rejected" = action === "apply" ? "applied" : "rejected";
  if (action === "apply") {
    const value = parseJson<Record<string, unknown>>(recommendation.afterValue, {});
    const [group] = await db
      .select()
      .from(advertisingAdGroups)
      .where(and(eq(advertisingAdGroups.campaignId, campaignId), isNull(advertisingAdGroups.deletedAt)))
      .limit(1);
    const [creative] = await db
      .select()
      .from(advertisingCreatives)
      .where(and(eq(advertisingCreatives.campaignId, campaignId), isNull(advertisingCreatives.deletedAt)))
      .limit(1);
    if (!group || !creative) throw new ApiError("INTERNAL", "캠페인 초안 구성이 올바르지 않습니다.");
    const prepared = prepareRecommendationValue(
      recommendation.kind,
      value,
      campaign.platform,
      creative,
    );
    if (!prepared.applicable) {
      resolutionStatus = "rejected";
    } else if (recommendation.kind === "add_keyword" && prepared.keyword) {
      await db
        .insert(advertisingKeywords)
        .values({
          id: newId("adk"),
          workspaceId: auth.workspaceId,
          campaignId,
          adGroupId: group.id,
          keyword: prepared.keyword.keyword,
          matchType: prepared.keyword.matchType,
          negative: prepared.keyword.negative,
          source: "ai",
          createdBy: auth.userId,
          updatedBy: auth.userId,
        })
        .onConflictDoNothing();
    } else if (recommendation.kind === "remove_keyword") {
      await db
        .update(advertisingKeywords)
        .set({ deletedAt: now, deletedBy: auth.userId, updatedAt: now, updatedBy: auth.userId })
        .where(
          and(
            eq(advertisingKeywords.campaignId, campaignId),
            prepared.removeKeywordId
              ? eq(advertisingKeywords.id, prepared.removeKeywordId)
              : eq(advertisingKeywords.keyword, prepared.removeKeyword!),
            isNull(advertisingKeywords.deletedAt),
          ),
        );
    } else if (recommendation.kind === "rewrite_copy" && prepared.creative) {
      await db
        .update(advertisingCreatives)
        .set({
          headlines: JSON.stringify(prepared.creative.headlines),
          descriptions: JSON.stringify(prepared.creative.descriptions),
          primaryText: prepared.creative.primaryText ?? null,
          path1: prepared.creative.path1 ?? null,
          path2: prepared.creative.path2 ?? null,
          source: "ai",
          updatedAt: now,
          updatedBy: auth.userId,
          version: sql`${advertisingCreatives.version} + 1`,
        })
        .where(eq(advertisingCreatives.id, creative.id));
    } else if (recommendation.kind === "budget" && prepared.budget !== null) {
      await db
        .update(advertisingCampaigns)
        .set({ dailyBudgetCents: prepared.budget, updatedAt: now, updatedBy: auth.userId })
        .where(eq(advertisingCampaigns.id, campaignId));
    } else if (recommendation.kind === "landing_page" && prepared.finalUrl) {
      await Promise.all([
        db.update(advertisingAdGroups).set({ finalUrl: prepared.finalUrl, updatedAt: now, updatedBy: auth.userId }).where(eq(advertisingAdGroups.id, group.id)),
        db.update(advertisingCreatives).set({ finalUrl: prepared.finalUrl, updatedAt: now, updatedBy: auth.userId }).where(eq(advertisingCreatives.id, creative.id)),
      ]);
    } else if (recommendation.kind === "restructure_ad_group" && prepared.groupName) {
      await db.update(advertisingAdGroups).set({ name: prepared.groupName, updatedAt: now, updatedBy: auth.userId }).where(eq(advertisingAdGroups.id, group.id));
    }
    if (resolutionStatus === "applied") {
      await db
        .update(advertisingCampaigns)
        .set({ updatedAt: now, updatedBy: auth.userId, version: sql`${advertisingCampaigns.version} + 1` })
        .where(eq(advertisingCampaigns.id, campaignId));
    }
  }
  await db
    .update(advertisingRecommendations)
    .set({
      status: resolutionStatus,
      resolvedAt: now,
      resolvedBy: auth.userId,
      updatedAt: now,
      updatedBy: auth.userId,
      version: sql`${advertisingRecommendations.version} + 1`,
    })
    .where(eq(advertisingRecommendations.id, recommendationId));
  writeAudit(auth, {
    action: "update",
    entityType: "advertising_recommendation",
    entityId: recommendationId,
    entityLabel: recommendation.kind,
    before: { status: "pending" },
    after: { status: resolutionStatus },
  });
  return getAdvertisingCampaign(auth, campaignId);
}

export async function applyAllAdvertisingRecommendations(
  auth: AuthContext,
  campaignId: string,
): Promise<AdCampaignDraft> {
  assertCan(auth, "update");
  const campaign = await requireCampaign(auth, campaignId);
  assertOwnershipOrAdmin(auth, campaign);
  const [recommendations, groups, creatives] = await Promise.all([
    db
      .select()
      .from(advertisingRecommendations)
      .where(
        and(
          eq(advertisingRecommendations.campaignId, campaignId),
          eq(advertisingRecommendations.status, "pending"),
          isNull(advertisingRecommendations.deletedAt),
        ),
      )
      .orderBy(asc(advertisingRecommendations.createdAt)),
    db
      .select()
      .from(advertisingAdGroups)
      .where(and(eq(advertisingAdGroups.campaignId, campaignId), isNull(advertisingAdGroups.deletedAt)))
      .limit(1),
    db
      .select()
      .from(advertisingCreatives)
      .where(and(eq(advertisingCreatives.campaignId, campaignId), isNull(advertisingCreatives.deletedAt)))
      .limit(1),
  ]);
  if (!recommendations.length) return getAdvertisingCampaign(auth, campaignId);
  const group = groups[0];
  const creative = creatives[0];
  if (!group || !creative) throw new ApiError("INTERNAL", "캠페인 초안 구성이 올바르지 않습니다.");

  const prepared = recommendations.map((recommendation) => {
    assertSameWorkspace(auth, recommendation, "광고 추천");
    const value = parseJson<Record<string, unknown>>(recommendation.afterValue, {});
    return {
      recommendation,
      ...prepareRecommendationValue(recommendation.kind, value, campaign.platform, creative),
    };
  });
  const appliedCount = prepared.filter((item) => item.applicable).length;
  const rejectedCount = prepared.length - appliedCount;
  const now = new Date();

  db.transaction((tx) => {
    for (const item of prepared) {
      const { recommendation } = item;
      if (item.applicable && recommendation.kind === "add_keyword" && item.keyword) {
        tx.insert(advertisingKeywords)
          .values({
            id: newId("adk"),
            workspaceId: auth.workspaceId,
            campaignId,
            adGroupId: group.id,
            keyword: item.keyword.keyword,
            matchType: item.keyword.matchType,
            negative: item.keyword.negative,
            source: "ai",
            createdBy: auth.userId,
            updatedBy: auth.userId,
          })
          .onConflictDoNothing()
          .run();
      } else if (item.applicable && recommendation.kind === "remove_keyword") {
        tx.update(advertisingKeywords)
          .set({ deletedAt: now, deletedBy: auth.userId, updatedAt: now, updatedBy: auth.userId })
          .where(
            and(
              eq(advertisingKeywords.campaignId, campaignId),
              item.removeKeywordId
                ? eq(advertisingKeywords.id, item.removeKeywordId)
                : eq(advertisingKeywords.keyword, item.removeKeyword!),
              isNull(advertisingKeywords.deletedAt),
            ),
          )
          .run();
      } else if (item.applicable && recommendation.kind === "rewrite_copy" && item.creative) {
        tx.update(advertisingCreatives)
          .set({
            headlines: JSON.stringify(item.creative.headlines),
            descriptions: JSON.stringify(item.creative.descriptions),
            primaryText: item.creative.primaryText ?? null,
            path1: item.creative.path1 ?? null,
            path2: item.creative.path2 ?? null,
            source: "ai",
            updatedAt: now,
            updatedBy: auth.userId,
            version: sql`${advertisingCreatives.version} + 1`,
          })
          .where(eq(advertisingCreatives.id, creative.id))
          .run();
      } else if (item.applicable && recommendation.kind === "budget" && item.budget !== null) {
        tx.update(advertisingCampaigns)
          .set({ dailyBudgetCents: item.budget, updatedAt: now, updatedBy: auth.userId })
          .where(eq(advertisingCampaigns.id, campaignId))
          .run();
      } else if (item.applicable && recommendation.kind === "landing_page" && item.finalUrl) {
        tx.update(advertisingAdGroups)
          .set({ finalUrl: item.finalUrl, updatedAt: now, updatedBy: auth.userId })
          .where(eq(advertisingAdGroups.id, group.id))
          .run();
        tx.update(advertisingCreatives)
          .set({ finalUrl: item.finalUrl, updatedAt: now, updatedBy: auth.userId })
          .where(eq(advertisingCreatives.id, creative.id))
          .run();
      } else if (item.applicable && recommendation.kind === "restructure_ad_group" && item.groupName) {
        tx.update(advertisingAdGroups)
          .set({ name: item.groupName, updatedAt: now, updatedBy: auth.userId })
          .where(eq(advertisingAdGroups.id, group.id))
          .run();
      }

      tx.update(advertisingRecommendations)
        .set({
          status: item.applicable ? "applied" : "rejected",
          resolvedAt: now,
          resolvedBy: auth.userId,
          updatedAt: now,
          updatedBy: auth.userId,
          version: sql`${advertisingRecommendations.version} + 1`,
        })
        .where(
          and(
            eq(advertisingRecommendations.id, recommendation.id),
            eq(advertisingRecommendations.status, "pending"),
          ),
        )
        .run();
    }
    if (appliedCount > 0) {
      tx.update(advertisingCampaigns)
        .set({ updatedAt: now, updatedBy: auth.userId, version: sql`${advertisingCampaigns.version} + 1` })
        .where(eq(advertisingCampaigns.id, campaignId))
        .run();
    }
  });

  writeAudit(auth, {
    action: "update",
    entityType: "advertising_recommendations",
    entityId: campaignId,
    entityLabel: campaign.name,
    before: { status: "pending", count: recommendations.length },
    after: { status: "resolved", appliedCount, rejectedCount },
  });
  return getAdvertisingCampaign(auth, campaignId);
}

export async function markAdvertisingCampaignExported(
  auth: AuthContext,
  campaignId: string,
): Promise<void> {
  assertCan(auth, "export");
  const campaign = await requireCampaign(auth, campaignId);
  await db
    .update(advertisingCampaigns)
    .set({ status: "exported", exportedAt: new Date(), updatedAt: new Date(), updatedBy: auth.userId })
    .where(and(eq(advertisingCampaigns.id, campaignId), ne(advertisingCampaigns.status, "exported")));
  writeAudit(auth, {
    action: "export",
    entityType: "advertising_campaign",
    entityId: campaignId,
    entityLabel: campaign.name,
  });
}
