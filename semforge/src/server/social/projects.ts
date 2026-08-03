import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  folders,
  socialConnections,
  socialProfiles,
  socialProjects,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId } from "@/lib/ids";
import type { AuthContext } from "@/lib/session";
import { getGbpConnection } from "@/server/gbp/connections";
import { getGbpOAuthConfig } from "@/server/gbp/oauth";
import { socialPublicBaseUrl } from "./media";
import type {
  SocialPlatform,
  SocialProfileView,
  SocialProjectListItem,
  SocialProviderCapabilities,
  SocialSettingsView,
} from "@/types/social";

function livePublishingEnabled() {
  return (
    process.env.SOCIAL_LIVE_PUBLISH_ENABLED?.trim().toLowerCase() === "true"
  );
}

function metaConfigured() {
  return Boolean(
    process.env.META_APP_ID?.trim() &&
    process.env.META_APP_SECRET?.trim() &&
    process.env.META_REDIRECT_URI?.trim() &&
    process.env.META_GRAPH_API_VERSION?.trim(),
  );
}

export function getSocialCapabilities(): Record<
  SocialPlatform,
  SocialProviderCapabilities
> {
  const live = livePublishingEnabled();
  const meta = metaConfigured();
  const publicMedia = Boolean(
    socialPublicBaseUrl() && process.env.APP_SECRET?.trim(),
  );
  const gbp = Boolean(getGbpOAuthConfig());
  return {
    facebook_page: {
      connect: meta,
      publishText: live && meta,
      publishImage: live && meta && publicMedia,
      insights: meta,
      competitorDiscovery: false,
      reason: !meta
        ? "Meta 앱 ID·시크릿·리디렉션 URI·Graph API 버전이 필요합니다."
        : !live
          ? "SOCIAL_LIVE_PUBLISH_ENABLED=true로 실제 발행을 활성화해야 합니다."
          : null,
    },
    instagram_professional: {
      connect: meta,
      publishText: false,
      publishImage: live && meta && publicMedia,
      insights: meta,
      competitorDiscovery: meta,
      reason: !meta
        ? "Meta 앱 설정과 Instagram Professional 권한이 필요합니다."
        : !live
          ? "SOCIAL_LIVE_PUBLISH_ENABLED=true로 실제 발행을 활성화해야 합니다."
          : !publicMedia
            ? "APP_PUBLIC_URL(HTTPS)과 APP_SECRET이 있어야 Instagram이 이미지를 가져갈 수 있습니다."
            : null,
    },
    google_business_profile: {
      connect: gbp,
      publishText: live && gbp,
      publishImage: live && gbp && publicMedia,
      insights: gbp,
      competitorDiscovery: false,
      reason: !gbp
        ? "Google OAuth 클라이언트 설정이 필요합니다."
        : !live
          ? "SOCIAL_LIVE_PUBLISH_ENABLED=true로 실제 발행을 활성화해야 합니다."
          : null,
    },
  };
}

export async function requireOwnedSocialFolder(
  auth: AuthContext,
  folderId: string,
) {
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
  if (!folder) throw new ApiError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  return folder;
}

export async function findSocialProject(auth: AuthContext, folderId: string) {
  const [project] = await db
    .select()
    .from(socialProjects)
    .where(
      and(
        eq(socialProjects.workspaceId, auth.workspaceId),
        eq(socialProjects.folderId, folderId),
        isNull(socialProjects.deletedAt),
      ),
    )
    .limit(1);
  return project ?? null;
}

export async function ensureSocialProject(auth: AuthContext, folderId: string) {
  await requireOwnedSocialFolder(auth, folderId);
  const existing = await findSocialProject(auth, folderId);
  if (existing) return existing;
  const [created] = await db
    .insert(socialProjects)
    .values({
      id: newId("sop"),
      workspaceId: auth.workspaceId,
      folderId,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    })
    .returning();
  return created;
}

export async function requireSocialProject(
  auth: AuthContext,
  folderId: string,
) {
  await requireOwnedSocialFolder(auth, folderId);
  const project = await findSocialProject(auth, folderId);
  if (!project)
    throw new ApiError("NOT_FOUND", "소셜 프로젝트가 설정되지 않았습니다.");
  return project;
}

export async function listSocialProjects(
  auth: AuthContext,
): Promise<SocialProjectListItem[]> {
  const rows = await db
    .select({
      id: folders.id,
      name: folders.name,
      domain: folders.domain,
      pinned: folders.pinned,
      updatedAt: folders.updatedAt,
      projectId: socialProjects.id,
    })
    .from(folders)
    .leftJoin(
      socialProjects,
      and(
        eq(socialProjects.folderId, folders.id),
        isNull(socialProjects.deletedAt),
      ),
    )
    .where(
      and(eq(folders.workspaceId, auth.workspaceId), isNull(folders.deletedAt)),
    )
    .orderBy(desc(folders.pinned), desc(folders.updatedAt));
  const projectIds = rows.flatMap((row) =>
    row.projectId ? [row.projectId] : [],
  );
  const profileRows =
    projectIds.length > 0
      ? await db
          .select({ projectId: socialProfiles.projectId, value: count() })
          .from(socialProfiles)
          .where(
            and(
              inArray(socialProfiles.projectId, projectIds),
              eq(socialProfiles.enabled, true),
              isNull(socialProfiles.deletedAt),
            ),
          )
          .groupBy(socialProfiles.projectId)
      : [];
  const counts = new Map(profileRows.map((row) => [row.projectId, row.value]));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    domain: row.domain,
    configured: Boolean(row.projectId),
    profileCount: row.projectId ? (counts.get(row.projectId) ?? 0) : 0,
  }));
}

export async function resolveDefaultSocialFolder(
  auth: AuthContext,
): Promise<string | null> {
  const projects = await listSocialProjects(auth);
  return (
    projects.find((project) => project.configured)?.id ??
    projects[0]?.id ??
    null
  );
}

function parseCapabilities(
  value: string,
  platform: SocialPlatform,
): SocialProviderCapabilities {
  try {
    const parsed = JSON.parse(value) as Partial<SocialProviderCapabilities>;
    const base = getSocialCapabilities()[platform];
    return {
      connect: base.connect && parsed.connect !== false,
      publishText: base.publishText && parsed.publishText !== false,
      publishImage: base.publishImage && parsed.publishImage !== false,
      insights: base.insights && parsed.insights !== false,
      competitorDiscovery:
        base.competitorDiscovery && parsed.competitorDiscovery !== false,
      reason: base.reason ?? parsed.reason ?? null,
    };
  } catch {
    return getSocialCapabilities()[platform];
  }
}

export function socialProfileView(
  row: typeof socialProfiles.$inferSelect,
): SocialProfileView {
  return {
    id: row.id,
    platform: row.platform,
    externalId: row.externalId,
    displayName: row.displayName,
    handle: row.handle,
    avatarUrl: row.avatarUrl,
    enabled: row.enabled,
    capabilities: parseCapabilities(row.capabilities, row.platform),
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    lastError: row.lastError,
  };
}

export async function getSocialSettings(
  auth: AuthContext,
  folderId: string,
): Promise<SocialSettingsView> {
  const folder = await requireOwnedSocialFolder(auth, folderId);
  const project = await ensureSocialProject(auth, folderId);
  const [profiles, connections, gbpConnection] = await Promise.all([
    db
      .select()
      .from(socialProfiles)
      .where(
        and(
          eq(socialProfiles.projectId, project.id),
          isNull(socialProfiles.deletedAt),
        ),
      )
      .orderBy(asc(socialProfiles.createdAt)),
    db
      .select()
      .from(socialConnections)
      .where(
        and(
          eq(socialConnections.workspaceId, auth.workspaceId),
          isNull(socialConnections.deletedAt),
        ),
      ),
    getGbpConnection(auth),
  ]);
  const meta = connections.find((connection) => connection.provider === "meta");
  return {
    project: {
      id: project.id,
      folderId,
      name: folder.name,
      domain: folder.domain,
    },
    timezone: project.timezone,
    approvalRequired: project.approvalRequired,
    syncEnabled: project.syncEnabled,
    profiles: profiles.map(socialProfileView),
    capabilities: getSocialCapabilities(),
    connections: [
      {
        provider: "meta",
        status: meta?.status ?? "unavailable",
        accountName: meta?.accountName ?? null,
        reason: meta
          ? meta.lastError
          : metaConfigured()
            ? "Meta 계정을 연결해 주세요."
            : "Meta 앱 환경 설정이 필요합니다.",
      },
      {
        provider: "google_business_profile",
        status: gbpConnection ? "active" : "unavailable",
        accountName: gbpConnection?.email ?? gbpConnection?.accountName ?? null,
        reason: gbpConnection
          ? null
          : "Google Business Profile을 연결해 주세요.",
      },
    ],
  };
}

export async function updateSocialSettings(
  auth: AuthContext,
  folderId: string,
  input: { timezone: string; approvalRequired: boolean; syncEnabled: boolean },
) {
  const project = await ensureSocialProject(auth, folderId);
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timezone }).format(
      new Date(),
    );
  } catch {
    throw new ApiError(
      "VALIDATION_ERROR",
      "올바른 IANA 시간대를 입력해 주세요.",
    );
  }
  await db
    .update(socialProjects)
    .set({
      timezone: input.timezone,
      approvalRequired: input.approvalRequired,
      syncEnabled: input.syncEnabled,
      nextSyncAt: input.syncEnabled ? (project.nextSyncAt ?? new Date()) : null,
      updatedAt: new Date(),
      updatedBy: auth.userId,
    })
    .where(eq(socialProjects.id, project.id));
  return getSocialSettings(auth, folderId);
}

export async function upsertSocialProfile(
  auth: AuthContext,
  folderId: string,
  input: {
    platform: SocialPlatform;
    externalId: string;
    parentExternalId?: string | null;
    displayName: string;
    handle?: string | null;
    avatarUrl?: string | null;
    connectionId?: string | null;
    encryptedAccessToken?: string | null;
    capabilities?: Partial<SocialProviderCapabilities>;
  },
) {
  const project = await ensureSocialProject(auth, folderId);
  const [existing] = await db
    .select()
    .from(socialProfiles)
    .where(
      and(
        eq(socialProfiles.projectId, project.id),
        eq(socialProfiles.platform, input.platform),
        eq(socialProfiles.externalId, input.externalId),
        isNull(socialProfiles.deletedAt),
      ),
    )
    .limit(1);
  const values = {
    connectionId: input.connectionId ?? null,
    parentExternalId: input.parentExternalId ?? null,
    displayName: input.displayName.trim(),
    handle: input.handle?.trim() || null,
    avatarUrl: input.avatarUrl?.trim() || null,
    accessToken: input.encryptedAccessToken ?? null,
    capabilities: JSON.stringify({
      ...getSocialCapabilities()[input.platform],
      ...(input.capabilities ?? {}),
    }),
    enabled: true,
    updatedAt: new Date(),
    updatedBy: auth.userId,
  };
  if (existing) {
    const [updated] = await db
      .update(socialProfiles)
      .set(values)
      .where(eq(socialProfiles.id, existing.id))
      .returning();
    if (project.syncEnabled && !project.nextSyncAt)
      await db
        .update(socialProjects)
        .set({ nextSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(socialProjects.id, project.id));
    return socialProfileView(updated);
  }
  const [created] = await db
    .insert(socialProfiles)
    .values({
      id: newId("spf"),
      projectId: project.id,
      platform: input.platform,
      externalId: input.externalId,
      ...values,
      createdBy: auth.userId,
    })
    .returning();
  if (project.syncEnabled && !project.nextSyncAt)
    await db
      .update(socialProjects)
      .set({ nextSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(socialProjects.id, project.id));
  return socialProfileView(created);
}

export async function disableSocialProfile(
  auth: AuthContext,
  folderId: string,
  profileId: string,
) {
  const project = await requireSocialProject(auth, folderId);
  const [profile] = await db
    .select()
    .from(socialProfiles)
    .where(
      and(
        eq(socialProfiles.id, profileId),
        eq(socialProfiles.projectId, project.id),
        isNull(socialProfiles.deletedAt),
      ),
    )
    .limit(1);
  if (!profile)
    throw new ApiError("NOT_FOUND", "소셜 프로필을 찾을 수 없습니다.");
  await db
    .update(socialProfiles)
    .set({ deletedAt: new Date(), deletedBy: auth.userId, enabled: false })
    .where(eq(socialProfiles.id, profile.id));
}
