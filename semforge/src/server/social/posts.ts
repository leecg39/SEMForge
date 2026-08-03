import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  socialMediaAssets,
  socialPostApprovals,
  socialPosts,
  socialPostTags,
  socialPostTargets,
  socialProfiles,
  socialProjects,
  socialTags,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId } from "@/lib/ids";
import { assertOwnershipOrAdmin, hasRole } from "@/lib/rbac";
import type { AuthContext } from "@/lib/session";
import type { SocialPostStatus, SocialPostView } from "@/types/social";
import { ensureSocialProject, requireOwnedSocialFolder } from "./projects";

export interface SocialPostInput {
  text?: string;
  linkUrl?: string | null;
  utm?: Record<string, string>;
  publishMode: "draft" | "now" | "scheduled" | "recurring";
  scheduledAt?: string | null;
  recurrence?: { frequency?: "weekly"; weekday?: number; time?: string };
  recurrenceEndAt?: string | null;
  profileIds: string[];
  tagIds?: string[];
  mediaAssetId?: string | null;
  idempotencyKey?: string;
}

function jsonObject(value: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function recurrenceObject(value: string): {
  frequency?: "weekly";
  weekday?: number;
  time?: string;
} {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function safeDate(
  value: string | null | undefined,
  label: string,
): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new ApiError("VALIDATION_ERROR", `${label}이 올바르지 않습니다.`);
  return date;
}

function validateInput(input: SocialPostInput) {
  const text = input.text?.trim() ?? "";
  const link = input.linkUrl?.trim() || null;
  if (!text && !link && !input.mediaAssetId)
    throw new ApiError(
      "VALIDATION_ERROR",
      "본문, 링크 또는 이미지 중 하나가 필요합니다.",
    );
  if (text.length > 2_200)
    throw new ApiError(
      "VALIDATION_ERROR",
      "게시물 본문은 2,200자 이하여야 합니다.",
    );
  if (link) {
    try {
      const url = new URL(link);
      if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error();
    } catch {
      throw new ApiError(
        "VALIDATION_ERROR",
        "게시물 링크가 올바른 HTTP(S) URL이 아닙니다.",
      );
    }
  }
  if (input.profileIds.length === 0)
    throw new ApiError(
      "VALIDATION_ERROR",
      "게시할 프로필을 하나 이상 선택해 주세요.",
    );
  if (new Set(input.profileIds).size !== input.profileIds.length)
    throw new ApiError(
      "VALIDATION_ERROR",
      "같은 프로필을 중복 선택할 수 없습니다.",
    );
  const allowedUtm = new Set([
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
  ]);
  for (const [key, value] of Object.entries(input.utm ?? {})) {
    if (!allowedUtm.has(key) || typeof value !== "string" || value.length > 200)
      throw new ApiError(
        "VALIDATION_ERROR",
        "UTM은 표준 utm_* 필드와 200자 이하 값만 사용할 수 있습니다.",
      );
  }
  const scheduledAt = safeDate(input.scheduledAt, "예약 시각");
  const recurrenceEndAt = safeDate(input.recurrenceEndAt, "반복 종료일");
  if (
    (input.publishMode === "scheduled" || input.publishMode === "recurring") &&
    !scheduledAt
  ) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "예약 게시에는 게시 시각이 필요합니다.",
    );
  }
  if (input.publishMode === "recurring") {
    if (input.recurrence?.frequency !== "weekly")
      throw new ApiError(
        "VALIDATION_ERROR",
        "첫 릴리스는 주간 반복만 지원합니다.",
      );
    if (recurrenceEndAt && scheduledAt && recurrenceEndAt <= scheduledAt)
      throw new ApiError(
        "VALIDATION_ERROR",
        "반복 종료일은 첫 게시 시각보다 뒤여야 합니다.",
      );
  }
  return { text, link, scheduledAt, recurrenceEndAt };
}

async function projectProfiles(projectId: string, profileIds: string[]) {
  const profiles = await db
    .select()
    .from(socialProfiles)
    .where(
      and(
        eq(socialProfiles.projectId, projectId),
        inArray(socialProfiles.id, profileIds),
        eq(socialProfiles.enabled, true),
        isNull(socialProfiles.deletedAt),
      ),
    );
  if (profiles.length !== profileIds.length)
    throw new ApiError(
      "VALIDATION_ERROR",
      "선택한 소셜 프로필을 사용할 수 없습니다.",
    );
  return profiles;
}

async function validateRelations(
  auth: AuthContext,
  projectId: string,
  input: SocialPostInput,
) {
  const profiles = await projectProfiles(projectId, input.profileIds);
  const instagram = profiles.some(
    (profile) => profile.platform === "instagram_professional",
  );
  if (instagram && !input.mediaAssetId)
    throw new ApiError(
      "VALIDATION_ERROR",
      "Instagram 게시에는 단일 이미지가 필요합니다.",
    );
  if (input.mediaAssetId) {
    const [asset] = await db
      .select()
      .from(socialMediaAssets)
      .where(
        and(
          eq(socialMediaAssets.id, input.mediaAssetId),
          eq(socialMediaAssets.workspaceId, auth.workspaceId),
          eq(socialMediaAssets.projectId, projectId),
          isNull(socialMediaAssets.deletedAt),
        ),
      )
      .limit(1);
    if (!asset)
      throw new ApiError(
        "VALIDATION_ERROR",
        "선택한 이미지를 사용할 수 없습니다.",
      );
  }
  const tagIds = [...new Set(input.tagIds ?? [])];
  if (tagIds.length > 0) {
    const tags = await db
      .select({ id: socialTags.id })
      .from(socialTags)
      .where(
        and(
          eq(socialTags.projectId, projectId),
          inArray(socialTags.id, tagIds),
          isNull(socialTags.deletedAt),
        ),
      );
    if (tags.length !== tagIds.length)
      throw new ApiError(
        "VALIDATION_ERROR",
        "선택한 태그를 사용할 수 없습니다.",
      );
  }
  return { profiles, tagIds };
}

export async function createSocialPost(
  auth: AuthContext,
  folderId: string,
  input: SocialPostInput,
) {
  await requireOwnedSocialFolder(auth, folderId);
  const project = await ensureSocialProject(auth, folderId);
  const normalized = validateInput(input);
  const relations = await validateRelations(auth, project.id, input);
  const id = newId("spt");
  const idempotencyKey = input.idempotencyKey?.trim() || newId("sik");
  const now = new Date();
  db.transaction((tx) => {
    tx.insert(socialPosts)
      .values({
        id,
        projectId: project.id,
        text: normalized.text,
        linkUrl: normalized.link,
        utm: JSON.stringify(input.utm ?? {}),
        publishMode: input.publishMode,
        scheduledAt: normalized.scheduledAt,
        recurrence: JSON.stringify(input.recurrence ?? {}),
        recurrenceEndAt: normalized.recurrenceEndAt,
        nextOccurrenceAt:
          input.publishMode === "recurring" ? normalized.scheduledAt : null,
        idempotencyKey,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      })
      .run();
    for (const profile of relations.profiles) {
      tx.insert(socialPostTargets)
        .values({
          id: newId("stg"),
          postId: id,
          profileId: profile.id,
          status: "draft",
          createdBy: auth.userId,
          updatedBy: auth.userId,
        })
        .run();
    }
    for (const tagId of relations.tagIds)
      tx.insert(socialPostTags).values({ postId: id, tagId }).run();
    if (input.mediaAssetId)
      tx.update(socialMediaAssets)
        .set({ postId: id, updatedAt: now, updatedBy: auth.userId })
        .where(eq(socialMediaAssets.id, input.mediaAssetId))
        .run();
  });
  return getSocialPost(auth, id);
}

async function requirePost(auth: AuthContext, postId: string) {
  const [row] = await db
    .select({ post: socialPosts, project: socialProjects })
    .from(socialPosts)
    .innerJoin(socialProjects, eq(socialProjects.id, socialPosts.projectId))
    .where(
      and(
        eq(socialPosts.id, postId),
        eq(socialProjects.workspaceId, auth.workspaceId),
        isNull(socialPosts.deletedAt),
        isNull(socialProjects.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new ApiError("NOT_FOUND", "소셜 게시물을 찾을 수 없습니다.");
  return row;
}

async function postView(row: {
  post: typeof socialPosts.$inferSelect;
  project: typeof socialProjects.$inferSelect;
}): Promise<SocialPostView> {
  const [targetRows, assetRows, tagRows] = await Promise.all([
    db
      .select({ target: socialPostTargets, profile: socialProfiles })
      .from(socialPostTargets)
      .innerJoin(
        socialProfiles,
        eq(socialProfiles.id, socialPostTargets.profileId),
      )
      .where(eq(socialPostTargets.postId, row.post.id))
      .orderBy(asc(socialPostTargets.createdAt)),
    db
      .select()
      .from(socialMediaAssets)
      .where(
        and(
          eq(socialMediaAssets.postId, row.post.id),
          isNull(socialMediaAssets.deletedAt),
        ),
      )
      .limit(1),
    db
      .select({
        id: socialTags.id,
        name: socialTags.name,
        color: socialTags.color,
      })
      .from(socialPostTags)
      .innerJoin(socialTags, eq(socialTags.id, socialPostTags.tagId))
      .where(eq(socialPostTags.postId, row.post.id)),
  ]);
  const asset = assetRows[0];
  return {
    id: row.post.id,
    text: row.post.text,
    linkUrl: row.post.linkUrl,
    utm: jsonObject(row.post.utm),
    status: row.post.status,
    publishMode: row.post.publishMode,
    scheduledAt: row.post.scheduledAt?.toISOString() ?? null,
    recurrence: recurrenceObject(row.post.recurrence),
    recurrenceEndAt: row.post.recurrenceEndAt?.toISOString() ?? null,
    media: asset
      ? {
          id: asset.id,
          url: `/api/social/media/${encodeURIComponent(asset.id)}/`,
          width: asset.width,
          height: asset.height,
          altText: asset.altText,
        }
      : null,
    tags: tagRows,
    targets: targetRows.map(({ target, profile }) => ({
      id: target.id,
      profileId: profile.id,
      platform: profile.platform,
      profileName: profile.displayName,
      status: target.status,
      externalUrl: target.externalUrl,
      lastError: target.lastError,
    })),
    createdAt: row.post.createdAt.toISOString(),
    updatedAt: row.post.updatedAt.toISOString(),
    createdBy: row.post.createdBy,
    lastError: row.post.lastError,
  };
}

export async function getSocialPost(auth: AuthContext, postId: string) {
  return postView(await requirePost(auth, postId));
}

export async function listSocialPosts(
  auth: AuthContext,
  folderId: string,
  options?: {
    from?: Date | null;
    to?: Date | null;
    statuses?: SocialPostStatus[];
    limit?: number;
  },
) {
  const project = await ensureSocialProject(auth, folderId);
  const conditions = [
    eq(socialPosts.projectId, project.id),
    isNull(socialPosts.deletedAt),
  ];
  if (options?.statuses?.length)
    conditions.push(inArray(socialPosts.status, options.statuses));
  if (options?.from)
    conditions.push(gte(socialPosts.scheduledAt, options.from));
  if (options?.to) conditions.push(lte(socialPosts.scheduledAt, options.to));
  const rows = await db
    .select({ post: socialPosts, project: socialProjects })
    .from(socialPosts)
    .innerJoin(socialProjects, eq(socialProjects.id, socialPosts.projectId))
    .where(and(...conditions))
    .orderBy(desc(socialPosts.scheduledAt), desc(socialPosts.createdAt))
    .limit(Math.min(200, Math.max(1, options?.limit ?? 100)));
  return Promise.all(rows.map(postView));
}

export async function updateSocialPost(
  auth: AuthContext,
  postId: string,
  input: SocialPostInput,
) {
  const row = await requirePost(auth, postId);
  assertOwnershipOrAdmin(auth, row.post);
  if (!new Set(["draft", "failed"]).has(row.post.status))
    throw new ApiError(
      "VERSION_CONFLICT",
      "초안 또는 실패한 게시물만 수정할 수 있습니다.",
    );
  const normalized = validateInput(input);
  const relations = await validateRelations(auth, row.project.id, input);
  const now = new Date();
  db.transaction((tx) => {
    tx.update(socialPosts)
      .set({
        text: normalized.text,
        linkUrl: normalized.link,
        utm: JSON.stringify(input.utm ?? {}),
        publishMode: input.publishMode,
        scheduledAt: normalized.scheduledAt,
        recurrence: JSON.stringify(input.recurrence ?? {}),
        recurrenceEndAt: normalized.recurrenceEndAt,
        nextOccurrenceAt:
          input.publishMode === "recurring" ? normalized.scheduledAt : null,
        status: "draft",
        lastError: null,
        updatedAt: now,
        updatedBy: auth.userId,
      })
      .where(eq(socialPosts.id, row.post.id))
      .run();
    tx.delete(socialPostTargets)
      .where(eq(socialPostTargets.postId, row.post.id))
      .run();
    for (const profile of relations.profiles)
      tx.insert(socialPostTargets)
        .values({
          id: newId("stg"),
          postId: row.post.id,
          profileId: profile.id,
          status: "draft",
          createdBy: auth.userId,
          updatedBy: auth.userId,
        })
        .run();
    tx.delete(socialPostTags)
      .where(eq(socialPostTags.postId, row.post.id))
      .run();
    for (const tagId of relations.tagIds)
      tx.insert(socialPostTags).values({ postId: row.post.id, tagId }).run();
    tx.update(socialMediaAssets)
      .set({ postId: null, updatedAt: now })
      .where(eq(socialMediaAssets.postId, row.post.id))
      .run();
    if (input.mediaAssetId)
      tx.update(socialMediaAssets)
        .set({ postId: row.post.id, updatedAt: now, updatedBy: auth.userId })
        .where(eq(socialMediaAssets.id, input.mediaAssetId))
        .run();
  });
  return getSocialPost(auth, postId);
}

export async function submitSocialPost(auth: AuthContext, postId: string) {
  const row = await requirePost(auth, postId);
  assertOwnershipOrAdmin(auth, row.post);
  if (!new Set(["draft", "failed", "approved"]).has(row.post.status))
    throw new ApiError(
      "VERSION_CONFLICT",
      "현재 상태에서는 게시물을 제출할 수 없습니다.",
    );
  const status: SocialPostStatus =
    row.project.approvalRequired && !hasRole(auth.role, "admin")
      ? "pending_approval"
      : "queued";
  const dueAt =
    row.post.publishMode === "now" || row.post.publishMode === "draft"
      ? new Date()
      : row.post.scheduledAt;
  if (!dueAt) throw new ApiError("VALIDATION_ERROR", "예약 시각이 필요합니다.");
  const now = new Date();
  db.transaction((tx) => {
    tx.update(socialPosts)
      .set({
        status,
        scheduledAt: dueAt,
        submittedAt: now,
        approvedAt: status === "queued" ? now : null,
        approvedBy: status === "queued" ? auth.userId : null,
        updatedAt: now,
        updatedBy: auth.userId,
      })
      .where(eq(socialPosts.id, postId))
      .run();
    tx.update(socialPostTargets)
      .set({
        status: status === "queued" ? "queued" : "draft",
        nextAttemptAt: status === "queued" ? dueAt : null,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(socialPostTargets.postId, postId))
      .run();
    tx.insert(socialPostApprovals)
      .values({
        id: newId("sap"),
        postId,
        actorUserId: auth.userId,
        action: "submitted",
      })
      .run();
  });
  return getSocialPost(auth, postId);
}

export async function approveSocialPost(
  auth: AuthContext,
  postId: string,
  note?: string | null,
) {
  if (!hasRole(auth.role, "admin"))
    throw new ApiError(
      "FORBIDDEN",
      "게시물 승인은 관리자 이상만 할 수 있습니다.",
    );
  const row = await requirePost(auth, postId);
  if (row.post.status !== "pending_approval")
    throw new ApiError(
      "VERSION_CONFLICT",
      "승인 대기 게시물만 승인할 수 있습니다.",
    );
  const dueAt = row.post.scheduledAt ?? new Date();
  const now = new Date();
  db.transaction((tx) => {
    tx.update(socialPosts)
      .set({
        status: "queued",
        approvedAt: now,
        approvedBy: auth.userId,
        updatedAt: now,
        updatedBy: auth.userId,
      })
      .where(eq(socialPosts.id, postId))
      .run();
    tx.update(socialPostTargets)
      .set({ status: "queued", nextAttemptAt: dueAt, updatedAt: now })
      .where(eq(socialPostTargets.postId, postId))
      .run();
    tx.insert(socialPostApprovals)
      .values({
        id: newId("sap"),
        postId,
        actorUserId: auth.userId,
        action: "approved",
        note: note?.trim() || null,
      })
      .run();
  });
  return getSocialPost(auth, postId);
}

export async function rejectSocialPost(
  auth: AuthContext,
  postId: string,
  note?: string | null,
) {
  if (!hasRole(auth.role, "admin"))
    throw new ApiError(
      "FORBIDDEN",
      "게시물 반려는 관리자 이상만 할 수 있습니다.",
    );
  const row = await requirePost(auth, postId);
  if (row.post.status !== "pending_approval")
    throw new ApiError(
      "VERSION_CONFLICT",
      "승인 대기 게시물만 반려할 수 있습니다.",
    );
  const now = new Date();
  db.transaction((tx) => {
    tx.update(socialPosts)
      .set({
        status: "draft",
        lastError: note?.trim() || "게시 승인이 반려되었습니다.",
        updatedAt: now,
        updatedBy: auth.userId,
      })
      .where(eq(socialPosts.id, postId))
      .run();
    tx.insert(socialPostApprovals)
      .values({
        id: newId("sap"),
        postId,
        actorUserId: auth.userId,
        action: "rejected",
        note: note?.trim() || null,
      })
      .run();
  });
  return getSocialPost(auth, postId);
}

export async function retrySocialPost(auth: AuthContext, postId: string) {
  const row = await requirePost(auth, postId);
  assertOwnershipOrAdmin(auth, row.post);
  if (!new Set(["failed", "partial"]).has(row.post.status))
    throw new ApiError(
      "VERSION_CONFLICT",
      "실패하거나 일부 실패한 게시물만 재시도할 수 있습니다.",
    );
  const now = new Date();
  db.transaction((tx) => {
    tx.update(socialPosts)
      .set({
        status: "queued",
        scheduledAt: now,
        lastError: null,
        updatedAt: now,
        updatedBy: auth.userId,
      })
      .where(eq(socialPosts.id, postId))
      .run();
    tx.update(socialPostTargets)
      .set({
        status: "queued",
        nextAttemptAt: now,
        lastError: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(socialPostTargets.postId, postId),
          eq(socialPostTargets.status, "failed"),
        ),
      )
      .run();
  });
  return getSocialPost(auth, postId);
}

export async function cancelSocialPost(auth: AuthContext, postId: string) {
  const row = await requirePost(auth, postId);
  assertOwnershipOrAdmin(auth, row.post);
  if (new Set(["publishing", "published", "partial"]).has(row.post.status))
    throw new ApiError(
      "VERSION_CONFLICT",
      "게시가 시작된 항목은 취소할 수 없습니다.",
    );
  const now = new Date();
  db.transaction((tx) => {
    tx.update(socialPosts)
      .set({ status: "cancelled", updatedAt: now, updatedBy: auth.userId })
      .where(eq(socialPosts.id, postId))
      .run();
    tx.update(socialPostTargets)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(socialPostTargets.postId, postId))
      .run();
  });
  return getSocialPost(auth, postId);
}

export async function deleteSocialPost(auth: AuthContext, postId: string) {
  const row = await requirePost(auth, postId);
  assertOwnershipOrAdmin(auth, row.post);
  if (new Set(["publishing", "published", "partial"]).has(row.post.status))
    throw new ApiError(
      "VERSION_CONFLICT",
      "발행된 게시물은 기록에서 삭제할 수 없습니다.",
    );
  await db
    .update(socialPosts)
    .set({ deletedAt: new Date(), deletedBy: auth.userId })
    .where(eq(socialPosts.id, postId));
}
