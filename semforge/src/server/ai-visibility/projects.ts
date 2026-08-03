import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  AI_VISIBILITY_PROVIDERS,
  aiVisibilityCitations,
  aiVisibilityObservations,
  aiVisibilityProjects,
  aiVisibilityPrompts,
  aiVisibilityQueries,
  aiVisibilityScopes,
  aiVisibilitySnapshots,
  folders,
  positionTrackingCampaigns,
  trackedKeywords,
  type AiVisibilityProvider,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { newId } from "@/lib/ids";
import {
  defaultTrackingLocation,
  getTrackingLocation,
  TRACKING_LOCATIONS,
  type TrackingLocation,
} from "@/lib/position-tracking/locations";
import type { AuthContext } from "@/lib/session";
import { getAiSearchCapabilities } from "@/server/ai-search/providers";

export const MAX_AI_VISIBILITY_PROMPTS = 20;
export const MAX_AI_VISIBILITY_SCOPES = 2;
export const MAX_AI_VISIBILITY_ALIASES = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type AiVisibilitySchedule = "off" | "weekly";
export type AiVisibilityPromptSource = "manual" | "csv" | "position_tracking" | "legacy";

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

export function normalizeAiPrompt(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function cleanPrompt(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 300);
}

function cleanTopic(value: string | undefined): string {
  return (value?.trim().replace(/\s+/g, " ").slice(0, 80) || "미분류");
}

function cleanAliases(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const alias = raw.trim().replace(/\s+/g, " ").slice(0, 100);
    const normalized = alias.toLocaleLowerCase();
    if (!alias || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(alias);
    if (result.length >= MAX_AI_VISIBILITY_ALIASES) break;
  }
  return result;
}

function cleanProviders(values: readonly string[]): AiVisibilityProvider[] {
  const allowed = new Set<string>(AI_VISIBILITY_PROVIDERS);
  const providers = [...new Set(values.filter((value) => allowed.has(value)))] as AiVisibilityProvider[];
  if (providers.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "AI 플랫폼을 한 개 이상 선택해 주세요.");
  }
  return providers;
}

function cleanLocations(values: readonly string[]): TrackingLocation[] {
  const unique = [...new Set(values)];
  if (unique.length === 0 || unique.length > MAX_AI_VISIBILITY_SCOPES) {
    throw new ApiError(
      "PLAN_LIMIT",
      `프로젝트당 국가는 1~${MAX_AI_VISIBILITY_SCOPES}개까지 선택할 수 있습니다.`,
    );
  }
  const locations = unique.map((key) => getTrackingLocation(key));
  if (locations.some((location) => location === null)) {
    throw new ApiError("VALIDATION_ERROR", "지원하는 국가·위치를 선택해 주세요.");
  }
  const validLocations = locations as TrackingLocation[];
  if (new Set(validLocations.map((location) => location.countryCode)).size !== validLocations.length) {
    throw new ApiError("VALIDATION_ERROR", "한 국가에서는 대표 위치를 한 개만 선택할 수 있습니다.");
  }
  return validLocations;
}

export async function requireOwnedAiFolder(auth: AuthContext, folderId: string) {
  const [folder] = await db
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.workspaceId, auth.workspaceId),
        isNull(folders.deletedAt),
      ),
    )
    .limit(1);
  if (!folder) throw new ApiError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  return folder;
}

export async function findOwnedAiFolder(auth: AuthContext, folderId: string) {
  const [folder] = await db
    .select({ id: folders.id, name: folders.name, domain: folders.domain })
    .from(folders)
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.workspaceId, auth.workspaceId),
        isNull(folders.deletedAt),
      ),
    )
    .limit(1);
  return folder ?? null;
}

export async function findAiVisibilityProject(auth: AuthContext, folderId: string) {
  const [project] = await db
    .select()
    .from(aiVisibilityProjects)
    .where(
      and(
        eq(aiVisibilityProjects.folderId, folderId),
        eq(aiVisibilityProjects.workspaceId, auth.workspaceId),
        isNull(aiVisibilityProjects.deletedAt),
      ),
    )
    .limit(1);
  return project ?? null;
}

export async function requireAiVisibilityProject(auth: AuthContext, folderId: string) {
  await requireOwnedAiFolder(auth, folderId);
  const project = await findAiVisibilityProject(auth, folderId);
  if (!project) {
    throw new ApiError("VALIDATION_ERROR", "먼저 AI 가시성 프로젝트를 설정해 주세요.");
  }
  return project;
}

export interface AiVisibilityProjectListItem {
  id: string;
  name: string;
  domain: string;
  configured: boolean;
  projectId: string | null;
}

export async function listAiVisibilityFolders(
  auth: AuthContext,
): Promise<AiVisibilityProjectListItem[]> {
  const folderRows = await db
    .select({ id: folders.id, name: folders.name, domain: folders.domain })
    .from(folders)
    .where(and(eq(folders.workspaceId, auth.workspaceId), isNull(folders.deletedAt)))
    .orderBy(desc(folders.pinned), asc(folders.name));
  if (folderRows.length === 0) return [];
  const projectRows = await db
    .select({ id: aiVisibilityProjects.id, folderId: aiVisibilityProjects.folderId })
    .from(aiVisibilityProjects)
    .where(
      and(
        eq(aiVisibilityProjects.workspaceId, auth.workspaceId),
        inArray(aiVisibilityProjects.folderId, folderRows.map((folder) => folder.id)),
        isNull(aiVisibilityProjects.deletedAt),
      ),
    );
  const projectByFolder = new Map(projectRows.map((project) => [project.folderId, project.id]));
  return folderRows.map((folder) => ({
    ...folder,
    configured: projectByFolder.has(folder.id),
    projectId: projectByFolder.get(folder.id) ?? null,
  }));
}

/** 설정 완료 프로젝트를 우선하고, 없으면 핀·최근 수정 순으로 기본 프로젝트를 고른다. */
export async function resolveDefaultAiVisibilityFolder(
  auth: AuthContext,
): Promise<string | null> {
  const folderRows = await db
    .select({
      id: folders.id,
      pinned: folders.pinned,
      updatedAt: folders.updatedAt,
    })
    .from(folders)
    .where(and(eq(folders.workspaceId, auth.workspaceId), isNull(folders.deletedAt)))
    .orderBy(desc(folders.pinned), desc(folders.updatedAt));
  if (folderRows.length === 0) return null;
  const projectRows = await db
    .select({ folderId: aiVisibilityProjects.folderId })
    .from(aiVisibilityProjects)
    .where(
      and(
        eq(aiVisibilityProjects.workspaceId, auth.workspaceId),
        inArray(aiVisibilityProjects.folderId, folderRows.map((folder) => folder.id)),
        isNull(aiVisibilityProjects.deletedAt),
      ),
    );
  const configured = new Set(projectRows.map((project) => project.folderId));
  return folderRows.find((folder) => configured.has(folder.id))?.id ?? folderRows[0].id;
}

/** 구 domain 링크는 현재 워크스페이스에서 정확히 하나의 활성 폴더와 일치할 때만 fid로 승격한다. */
export async function resolveAiVisibilityFolderByDomain(
  auth: AuthContext,
  domainInput: string,
): Promise<string | null> {
  const domain = normalizeDomain(domainInput);
  if (!domain) return null;
  const rows = await db
    .select({ id: folders.id, domain: folders.domain })
    .from(folders)
    .where(and(eq(folders.workspaceId, auth.workspaceId), isNull(folders.deletedAt)));
  const matches = rows.filter((row) => normalizeDomain(row.domain) === domain);
  return matches.length === 1 ? matches[0].id : null;
}

export interface AiVisibilitySettingsView {
  folder: { id: string; name: string; domain: string };
  project: {
    id: string;
    brandName: string;
    brandAliases: string[];
    providers: AiVisibilityProvider[];
    locationKeys: string[];
    schedule: AiVisibilitySchedule;
    nextRunAt: string | null;
    lastRunAt: string | null;
  } | null;
  defaults: {
    brandName: string;
    providers: AiVisibilityProvider[];
    locationKeys: string[];
    schedule: AiVisibilitySchedule;
  };
  capabilities: ReturnType<typeof getAiSearchCapabilities>;
  locations: { key: string; countryCode: string; country: string; city: string; label: string }[];
  imports: {
    positionTracking: {
      available: boolean;
      keywordCount: number;
      reason: string | null;
    };
  };
  limits: { prompts: number; scopes: number; aliases: number };
}

export async function getAiVisibilitySettings(
  auth: AuthContext,
  folderId: string,
): Promise<AiVisibilitySettingsView> {
  const folder = await requireOwnedAiFolder(auth, folderId);
  const project = await findAiVisibilityProject(auth, folderId);
  const defaultLocation = defaultTrackingLocation(folder.domain);
  const capabilities = getAiSearchCapabilities();
  const availableProviders = AI_VISIBILITY_PROVIDERS.filter(
    (provider) => capabilities.providers[provider].enabled,
  );
  const [scopes, positionCampaignRows] = await Promise.all([
    project
      ? db
        .select()
        .from(aiVisibilityScopes)
        .where(
          and(
            eq(aiVisibilityScopes.projectId, project.id),
            isNull(aiVisibilityScopes.deletedAt),
          ),
        )
        .orderBy(asc(aiVisibilityScopes.createdAt))
      : Promise.resolve([]),
    db
      .select({ id: positionTrackingCampaigns.id })
      .from(positionTrackingCampaigns)
      .where(
        and(
          eq(positionTrackingCampaigns.workspaceId, auth.workspaceId),
          eq(positionTrackingCampaigns.folderId, folderId),
          isNull(positionTrackingCampaigns.deletedAt),
        ),
      )
      .orderBy(desc(positionTrackingCampaigns.updatedAt))
      .limit(1),
  ]);
  const positionKeywordRows = positionCampaignRows[0]
    ? await db
        .select({ id: trackedKeywords.id })
        .from(trackedKeywords)
        .where(
          and(
            eq(trackedKeywords.campaignId, positionCampaignRows[0].id),
            isNull(trackedKeywords.deletedAt),
          ),
        )
    : [];
  const positionImportReason = !positionCampaignRows[0]
    ? "이 프로젝트에 연결된 포지션 추적 캠페인이 없습니다."
    : positionKeywordRows.length === 0
      ? "포지션 추적에 가져올 활성 키워드가 없습니다."
      : null;
  return {
    folder: { id: folder.id, name: folder.name, domain: normalizeDomain(folder.domain) },
    project: project
      ? {
          id: project.id,
          brandName: project.brandName,
          brandAliases: parseStringArray(project.brandAliases),
          providers: cleanProviders(parseStringArray(project.providers)),
          locationKeys: scopes.map((scope) => scope.locationKey),
          schedule: project.schedule,
          nextRunAt: project.nextRunAt?.toISOString() ?? null,
          lastRunAt: project.lastRunAt?.toISOString() ?? null,
        }
      : null,
    defaults: {
      brandName: folder.name,
      providers: availableProviders.length > 0 ? availableProviders : ["google_aio"],
      locationKeys: [defaultLocation.key],
      schedule: "weekly",
    },
    capabilities,
    locations: TRACKING_LOCATIONS.map(({ key, countryCode, country, city, label }) => ({
      key,
      countryCode,
      country,
      city,
      label,
    })),
    imports: {
      positionTracking: {
        available: positionImportReason === null,
        keywordCount: positionKeywordRows.length,
        reason: positionImportReason,
      },
    },
    limits: {
      prompts: MAX_AI_VISIBILITY_PROMPTS,
      scopes: MAX_AI_VISIBILITY_SCOPES,
      aliases: MAX_AI_VISIBILITY_ALIASES,
    },
  };
}

export async function saveAiVisibilitySettings(
  auth: AuthContext,
  folderId: string,
  input: {
    brandName: string;
    brandAliases?: string[];
    providers: string[];
    locationKeys: string[];
    schedule: AiVisibilitySchedule;
  },
) {
  const folder = await requireOwnedAiFolder(auth, folderId);
  const brandName = input.brandName.trim().replace(/\s+/g, " ").slice(0, 100);
  if (!brandName) {
    throw new ApiError("VALIDATION_ERROR", "브랜드명을 입력해 주세요.", {
      fields: { brandName: "브랜드명은 필수입니다." },
    });
  }
  const aliases = cleanAliases(input.brandAliases ?? []);
  const providers = cleanProviders(input.providers);
  const capabilities = getAiSearchCapabilities();
  const unavailableProviders = providers.filter(
    (provider) => !capabilities.providers[provider].enabled,
  );
  if (unavailableProviders.length > 0) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `연결되지 않은 AI 플랫폼은 선택할 수 없습니다: ${unavailableProviders.join(", ")}`,
    );
  }
  const locations = cleanLocations(input.locationKeys);
  const existing = await findAiVisibilityProject(auth, folderId);
  const projectId = existing?.id ?? newId("avp");
  const now = new Date();
  const nextRunAt = input.schedule === "weekly"
    ? existing?.nextRunAt ?? new Date(now.getTime() + WEEK_MS)
    : null;

  db.transaction((tx) => {
    if (existing) {
      tx.update(aiVisibilityProjects)
        .set({
          domain: normalizeDomain(folder.domain),
          brandName,
          brandAliases: JSON.stringify(aliases),
          providers: JSON.stringify(providers),
          schedule: input.schedule,
          nextRunAt,
          updatedAt: now,
          updatedBy: auth.userId,
        })
        .where(eq(aiVisibilityProjects.id, existing.id))
        .run();
    } else {
      tx.insert(aiVisibilityProjects)
        .values({
          id: projectId,
          workspaceId: auth.workspaceId,
          folderId,
          domain: normalizeDomain(folder.domain),
          brandName,
          brandAliases: JSON.stringify(aliases),
          providers: JSON.stringify(providers),
          schedule: input.schedule,
          nextRunAt,
          createdBy: auth.userId,
          updatedBy: auth.userId,
        })
        .run();
    }
    tx.update(aiVisibilityScopes)
      .set({ deletedAt: now, deletedBy: auth.userId })
      .where(
        and(
          eq(aiVisibilityScopes.projectId, projectId),
          isNull(aiVisibilityScopes.deletedAt),
        ),
      )
      .run();
    tx.insert(aiVisibilityScopes)
      .values(locations.map((location) => ({
        id: newId("avs"),
        projectId,
        countryCode: location.countryCode,
        locationKey: location.key,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      })))
      .run();
  });

  await migrateLegacyAiVisibilityForProject(auth, projectId, folderId);

  return getAiVisibilitySettings(auth, folderId);
}

/**
 * 구 AIO MVP 데이터를 새 프로젝트 구조로 멱등 이관한다.
 * URL이 없는 과거 외부 인용 도메인은 인용 URL로 추정하지 않는다.
 */
async function migrateLegacyAiVisibilityForProject(
  auth: AuthContext,
  projectId: string,
  folderId: string,
): Promise<void> {
  const folder = await requireOwnedAiFolder(auth, folderId);
  const domain = normalizeDomain(folder.domain);
  const ownedFolders = await db
    .select({ id: folders.id, domain: folders.domain })
    .from(folders)
    .where(and(eq(folders.workspaceId, auth.workspaceId), isNull(folders.deletedAt)));
  if (ownedFolders.filter((row) => normalizeDomain(row.domain) === domain).length !== 1) return;
  const legacyQueries = await db
    .select()
    .from(aiVisibilityQueries)
    .where(
      and(
        eq(aiVisibilityQueries.workspaceId, auth.workspaceId),
        eq(aiVisibilityQueries.domain, domain),
        isNull(aiVisibilityQueries.deletedAt),
      ),
    )
    .orderBy(asc(aiVisibilityQueries.createdAt));
  if (legacyQueries.length === 0) return;

  const currentPrompts = await db
    .select()
    .from(aiVisibilityPrompts)
    .where(
      and(
        eq(aiVisibilityPrompts.projectId, projectId),
        isNull(aiVisibilityPrompts.deletedAt),
      ),
    );
  const promptByNormalized = new Map(
    currentPrompts.map((prompt) => [prompt.normalizedPrompt, prompt]),
  );
  for (const legacy of legacyQueries) {
    if (promptByNormalized.size >= MAX_AI_VISIBILITY_PROMPTS) break;
    const normalizedPrompt = normalizeAiPrompt(legacy.query);
    if (promptByNormalized.has(normalizedPrompt)) continue;
    const [created] = await db
      .insert(aiVisibilityPrompts)
      .values({
        id: newId("avq"),
        projectId,
        prompt: cleanPrompt(legacy.query),
        normalizedPrompt,
        topic: "미분류",
        source: "legacy",
        createdBy: auth.userId,
        updatedBy: auth.userId,
      })
      .returning();
    if (created) promptByNormalized.set(normalizedPrompt, created);
  }

  for (const legacy of legacyQueries) {
    const prompt = promptByNormalized.get(normalizeAiPrompt(legacy.query));
    if (!prompt) continue;
    const location = TRACKING_LOCATIONS.find(
      (item) => item.countryCode === legacy.countryCode,
    ) ?? defaultTrackingLocation(domain);
    const snapshots = await db
      .select()
      .from(aiVisibilitySnapshots)
      .where(eq(aiVisibilitySnapshots.queryId, legacy.id))
      .orderBy(asc(aiVisibilitySnapshots.capturedAt));
    for (const snapshot of snapshots) {
      const [duplicate] = await db
        .select({ id: aiVisibilityObservations.id })
        .from(aiVisibilityObservations)
        .where(
          and(
            eq(aiVisibilityObservations.projectId, projectId),
            eq(aiVisibilityObservations.promptId, prompt.id),
            eq(aiVisibilityObservations.provider, "google_aio"),
            eq(aiVisibilityObservations.locationKey, location.key),
            eq(aiVisibilityObservations.capturedAt, snapshot.capturedAt),
            eq(aiVisibilityObservations.source, "legacy-talordata"),
          ),
        )
        .limit(1);
      if (duplicate) continue;
      const observationId = newId("avo");
      await db.insert(aiVisibilityObservations).values({
        id: observationId,
        projectId,
        promptId: prompt.id,
        provider: "google_aio",
        countryCode: legacy.countryCode,
        locationKey: location.key,
        visibilityStatus: snapshot.cited === true
          ? "visible"
          : snapshot.cited === false
            ? "not_visible"
            : "unknown",
        brandMentioned: null,
        citationsAvailable: snapshot.cited !== null,
        responseText: null,
        source: "legacy-talordata",
        capturedAt: snapshot.capturedAt,
      });
      if (snapshot.citedUrl) {
        await db.insert(aiVisibilityCitations).values({
          id: newId("avc"),
          observationId,
          position: 1,
          url: snapshot.citedUrl,
          domain: normalizeDomain(snapshot.citedUrl),
          title: null,
          isOwnDomain: true,
        });
      }
    }
  }
}

export async function listAiVisibilityPrompts(auth: AuthContext, folderId: string) {
  const project = await requireAiVisibilityProject(auth, folderId);
  return db
    .select()
    .from(aiVisibilityPrompts)
    .where(
      and(
        eq(aiVisibilityPrompts.projectId, project.id),
        isNull(aiVisibilityPrompts.deletedAt),
      ),
    )
    .orderBy(desc(aiVisibilityPrompts.enabled), asc(aiVisibilityPrompts.createdAt));
}

export async function addAiVisibilityPrompts(
  auth: AuthContext,
  folderId: string,
  input: {
    prompts: { prompt: string; topic?: string }[];
    source: Exclude<AiVisibilityPromptSource, "position_tracking" | "legacy">;
  },
) {
  const project = await requireAiVisibilityProject(auth, folderId);
  const existing = await listAiVisibilityPrompts(auth, folderId);
  const existingKeys = new Set(existing.map((row) => row.normalizedPrompt));
  const additions: { prompt: string; normalizedPrompt: string; topic: string }[] = [];
  for (const item of input.prompts) {
    const prompt = cleanPrompt(item.prompt);
    const normalizedPrompt = normalizeAiPrompt(prompt);
    if (!prompt || existingKeys.has(normalizedPrompt)) continue;
    existingKeys.add(normalizedPrompt);
    additions.push({ prompt, normalizedPrompt, topic: cleanTopic(item.topic) });
  }
  if (existing.length + additions.length > MAX_AI_VISIBILITY_PROMPTS) {
    throw new ApiError(
      "PLAN_LIMIT",
      `활성 프롬프트는 프로젝트당 최대 ${MAX_AI_VISIBILITY_PROMPTS}개입니다.`,
    );
  }
  if (additions.length > 0) {
    await db.insert(aiVisibilityPrompts).values(additions.map((item) => ({
      id: newId("avq"),
      projectId: project.id,
      ...item,
      source: input.source,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    })));
  }
  return { added: additions.length, prompts: await listAiVisibilityPrompts(auth, folderId) };
}

export async function importPositionTrackingPrompts(
  auth: AuthContext,
  folderId: string,
) {
  const project = await requireAiVisibilityProject(auth, folderId);
  const existing = await listAiVisibilityPrompts(auth, folderId);
  const existingKeys = new Set(existing.map((row) => row.normalizedPrompt));
  const rows = await db
    .select({ keyword: trackedKeywords.keyword, tags: trackedKeywords.tags })
    .from(trackedKeywords)
    .innerJoin(
      positionTrackingCampaigns,
      eq(positionTrackingCampaigns.id, trackedKeywords.campaignId),
    )
    .where(
      and(
        eq(positionTrackingCampaigns.folderId, folderId),
        eq(positionTrackingCampaigns.workspaceId, auth.workspaceId),
        isNull(positionTrackingCampaigns.deletedAt),
        isNull(trackedKeywords.deletedAt),
      ),
    )
    .orderBy(asc(trackedKeywords.createdAt));

  const additions: { prompt: string; normalizedPrompt: string; topic: string }[] = [];
  for (const row of rows) {
    if (existing.length + additions.length >= MAX_AI_VISIBILITY_PROMPTS) break;
    const prompt = cleanPrompt(row.keyword);
    const normalizedPrompt = normalizeAiPrompt(prompt);
    if (!prompt || existingKeys.has(normalizedPrompt)) continue;
    existingKeys.add(normalizedPrompt);
    const [firstTag] = parseStringArray(row.tags);
    additions.push({ prompt, normalizedPrompt, topic: cleanTopic(firstTag) });
  }
  if (additions.length > 0) {
    await db.insert(aiVisibilityPrompts).values(additions.map((item) => ({
      id: newId("avq"),
      projectId: project.id,
      ...item,
      source: "position_tracking" as const,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    })));
  }
  return { added: additions.length, prompts: await listAiVisibilityPrompts(auth, folderId) };
}

export async function removeAiVisibilityPrompt(
  auth: AuthContext,
  folderId: string,
  promptId: string,
) {
  const project = await requireAiVisibilityProject(auth, folderId);
  const [prompt] = await db
    .select({ id: aiVisibilityPrompts.id })
    .from(aiVisibilityPrompts)
    .where(
      and(
        eq(aiVisibilityPrompts.id, promptId),
        eq(aiVisibilityPrompts.projectId, project.id),
        isNull(aiVisibilityPrompts.deletedAt),
      ),
    )
    .limit(1);
  if (!prompt) throw new ApiError("NOT_FOUND", "프롬프트를 찾을 수 없습니다.");
  await db
    .update(aiVisibilityPrompts)
    .set({ deletedAt: new Date(), deletedBy: auth.userId, enabled: false })
    .where(eq(aiVisibilityPrompts.id, promptId));
  return { id: promptId, deleted: true };
}

export async function getAiVisibilityProjectBundle(auth: AuthContext, folderId: string) {
  const project = await requireAiVisibilityProject(auth, folderId);
  const [scopes, prompts] = await Promise.all([
    db
      .select()
      .from(aiVisibilityScopes)
      .where(
        and(
          eq(aiVisibilityScopes.projectId, project.id),
          isNull(aiVisibilityScopes.deletedAt),
        ),
      )
      .orderBy(asc(aiVisibilityScopes.createdAt)),
    db
      .select()
      .from(aiVisibilityPrompts)
      .where(
        and(
          eq(aiVisibilityPrompts.projectId, project.id),
          eq(aiVisibilityPrompts.enabled, true),
          isNull(aiVisibilityPrompts.deletedAt),
        ),
      )
      .orderBy(asc(aiVisibilityPrompts.createdAt)),
  ]);
  return {
    project,
    scopes,
    prompts,
    providers: cleanProviders(parseStringArray(project.providers)),
    brandAliases: parseStringArray(project.brandAliases),
  };
}
