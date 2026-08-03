import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { folders } from "./domain";
import { auditColumns, users, workspaces } from "./platform";

const timestampMs = (name: string) => integer(name, { mode: "timestamp_ms" });

export const SOCIAL_PROFILE_PLATFORMS = [
  "facebook_page",
  "instagram_professional",
  "google_business_profile",
] as const;

export const SOCIAL_POST_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "queued",
  "publishing",
  "published",
  "partial",
  "failed",
  "cancelled",
] as const;

export const SOCIAL_TARGET_STATUSES = [
  "draft",
  "queued",
  "publishing",
  "published",
  "failed",
  "cancelled",
] as const;

export const SOCIAL_RUN_STATUSES = [
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
  "cancelled",
] as const;

export const socialProjects = sqliteTable(
  "social_projects",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    folderId: text("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    timezone: text("timezone").notNull().default("Asia/Seoul"),
    approvalRequired: integer("approval_required", { mode: "boolean" })
      .notNull()
      .default(false),
    syncEnabled: integer("sync_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    nextSyncAt: timestampMs("next_sync_at"),
    lastSyncAt: timestampMs("last_sync_at"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("social_projects_folder_unique")
      .on(t.folderId)
      .where(sql`${t.deletedAt} IS NULL`),
    index("social_projects_workspace_idx").on(t.workspaceId, t.deletedAt),
    index("social_projects_sync_idx").on(t.syncEnabled, t.nextSyncAt),
  ],
);

/** OAuth 연결은 워크스페이스에 귀속되고, 실제 프로필 선택은 프로젝트별로 분리한다. */
export const socialConnections = sqliteTable(
  "social_connections",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider", {
      enum: ["meta", "google_business_profile"],
    }).notNull(),
    externalAccountId: text("external_account_id"),
    accountName: text("account_name"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    expiresAt: timestampMs("expires_at"),
    scopes: text("scopes").notNull().default("[]"),
    status: text("status", {
      enum: ["active", "reconnect_required", "revoked", "error"],
    })
      .notNull()
      .default("active"),
    lastError: text("last_error"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("social_connections_workspace_provider_unique")
      .on(t.workspaceId, t.provider)
      .where(sql`${t.deletedAt} IS NULL`),
    index("social_connections_workspace_idx").on(
      t.workspaceId,
      t.status,
      t.deletedAt,
    ),
  ],
);

export const socialProfiles = sqliteTable(
  "social_profiles",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => socialProjects.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").references(() => socialConnections.id, {
      onDelete: "set null",
    }),
    platform: text("platform", { enum: SOCIAL_PROFILE_PLATFORMS }).notNull(),
    externalId: text("external_id").notNull(),
    parentExternalId: text("parent_external_id"),
    displayName: text("display_name").notNull(),
    handle: text("handle"),
    avatarUrl: text("avatar_url"),
    accessToken: text("access_token"),
    capabilities: text("capabilities").notNull().default("{}"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    lastSyncedAt: timestampMs("last_synced_at"),
    lastError: text("last_error"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("social_profiles_project_platform_external_unique")
      .on(t.projectId, t.platform, t.externalId)
      .where(sql`${t.deletedAt} IS NULL`),
    index("social_profiles_project_idx").on(
      t.projectId,
      t.enabled,
      t.deletedAt,
    ),
  ],
);

export const socialPosts = sqliteTable(
  "social_posts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => socialProjects.id, { onDelete: "cascade" }),
    text: text("text").notNull().default(""),
    linkUrl: text("link_url"),
    utm: text("utm").notNull().default("{}"),
    status: text("status", { enum: SOCIAL_POST_STATUSES })
      .notNull()
      .default("draft"),
    publishMode: text("publish_mode", {
      enum: ["draft", "now", "scheduled", "recurring"],
    })
      .notNull()
      .default("draft"),
    scheduledAt: timestampMs("scheduled_at"),
    recurrence: text("recurrence").notNull().default("{}"),
    recurrenceParentId: text("recurrence_parent_id"),
    recurrenceEndAt: timestampMs("recurrence_end_at"),
    nextOccurrenceAt: timestampMs("next_occurrence_at"),
    submittedAt: timestampMs("submitted_at"),
    approvedAt: timestampMs("approved_at"),
    approvedBy: text("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    publishedAt: timestampMs("published_at"),
    idempotencyKey: text("idempotency_key").notNull(),
    lastError: text("last_error"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("social_posts_project_idempotency_unique").on(
      t.projectId,
      t.idempotencyKey,
    ),
    index("social_posts_project_status_idx").on(
      t.projectId,
      t.status,
      t.scheduledAt,
    ),
    index("social_posts_due_idx").on(t.status, t.scheduledAt),
  ],
);

export const socialPostTargets = sqliteTable(
  "social_post_targets",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => socialPosts.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => socialProfiles.id, { onDelete: "cascade" }),
    status: text("status", { enum: SOCIAL_TARGET_STATUSES })
      .notNull()
      .default("draft"),
    externalPostId: text("external_post_id"),
    externalUrl: text("external_url"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestampMs("next_attempt_at"),
    publishedAt: timestampMs("published_at"),
    lastError: text("last_error"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("social_post_targets_post_profile_unique").on(
      t.postId,
      t.profileId,
    ),
    index("social_post_targets_due_idx").on(t.status, t.nextAttemptAt),
  ],
);

export const socialMediaAssets = sqliteTable(
  "social_media_assets",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => socialProjects.id, { onDelete: "cascade" }),
    postId: text("post_id").references(() => socialPosts.id, {
      onDelete: "cascade",
    }),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type", { enum: ["image/jpeg"] })
      .notNull()
      .default("image/jpeg"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    altText: text("alt_text"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("social_media_storage_key_unique").on(t.storageKey),
    index("social_media_project_idx").on(t.projectId, t.createdAt),
    index("social_media_post_idx").on(t.postId),
  ],
);

export const socialTags = sqliteTable(
  "social_tags",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => socialProjects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    description: text("description"),
    color: text("color").notNull().default("#6b6de3"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("social_tags_project_name_unique")
      .on(t.projectId, t.normalizedName)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

export const socialPostTags = sqliteTable(
  "social_post_tags",
  {
    postId: text("post_id")
      .notNull()
      .references(() => socialPosts.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => socialTags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.tagId] })],
);

export const socialPostApprovals = sqliteTable(
  "social_post_approvals",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => socialPosts.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text("action", {
      enum: ["submitted", "approved", "rejected"],
    }).notNull(),
    note: text("note"),
    createdAt: timestampMs("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("social_post_approvals_post_idx").on(t.postId, t.createdAt)],
);

export const socialCompetitors = sqliteTable(
  "social_competitors",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => socialProjects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain"),
    instagramUsername: text("instagram_username"),
    externalId: text("external_id"),
    status: text("status", {
      enum: ["pending", "active", "unavailable", "error"],
    })
      .notNull()
      .default("pending"),
    lastError: text("last_error"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("social_competitors_project_name_unique")
      .on(t.projectId, t.name)
      .where(sql`${t.deletedAt} IS NULL`),
    index("social_competitors_project_idx").on(t.projectId, t.deletedAt),
  ],
);

/** profileId 또는 competitorId 중 하나에 귀속되는 일별 지표 스냅샷. */
export const socialMetricSnapshots = sqliteTable(
  "social_metric_snapshots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => socialProjects.id, { onDelete: "cascade" }),
    profileId: text("profile_id").references(() => socialProfiles.id, {
      onDelete: "cascade",
    }),
    competitorId: text("competitor_id").references(() => socialCompetitors.id, {
      onDelete: "cascade",
    }),
    platform: text("platform", { enum: SOCIAL_PROFILE_PLATFORMS }).notNull(),
    capturedDate: text("captured_date").notNull(),
    followers: integer("followers"),
    reach: integer("reach"),
    impressions: integer("impressions"),
    interactions: integer("interactions"),
    posts: integer("posts"),
    source: text("source").notNull(),
    capturedAt: timestampMs("captured_at").notNull(),
  },
  (t) => [
    uniqueIndex("social_metrics_profile_date_unique").on(
      t.profileId,
      t.capturedDate,
    ),
    uniqueIndex("social_metrics_competitor_date_unique").on(
      t.competitorId,
      t.platform,
      t.capturedDate,
    ),
    index("social_metrics_project_date_idx").on(t.projectId, t.capturedAt),
  ],
);

export const socialContentSnapshots = sqliteTable(
  "social_content_snapshots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => socialProjects.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => socialProfiles.id, { onDelete: "cascade" }),
    externalPostId: text("external_post_id").notNull(),
    externalUrl: text("external_url"),
    caption: text("caption"),
    mediaUrl: text("media_url"),
    publishedAt: timestampMs("published_at").notNull(),
    likes: integer("likes"),
    comments: integer("comments"),
    shares: integer("shares"),
    saves: integer("saves"),
    reach: integer("reach"),
    impressions: integer("impressions"),
    source: text("source").notNull(),
    capturedAt: timestampMs("captured_at").notNull(),
  },
  (t) => [
    uniqueIndex("social_content_profile_external_unique").on(
      t.profileId,
      t.externalPostId,
    ),
    index("social_content_project_published_idx").on(
      t.projectId,
      t.publishedAt,
    ),
  ],
);

export const socialRuns = sqliteTable(
  "social_runs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => socialProjects.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["publish", "sync"] }).notNull(),
    trigger: text("trigger", {
      enum: ["manual", "scheduled", "recovery"],
    }).notNull(),
    status: text("status", { enum: SOCIAL_RUN_STATUSES })
      .notNull()
      .default("queued"),
    totalCount: integer("total_count").notNull().default(0),
    succeededCount: integer("succeeded_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    errorMessage: text("error_message"),
    startedAt: timestampMs("started_at"),
    completedAt: timestampMs("completed_at"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("social_runs_project_kind_active_unique")
      .on(t.projectId, t.kind)
      .where(
        sql`${t.kind} = 'sync' AND ${t.status} IN ('queued', 'running') AND ${t.deletedAt} IS NULL`,
      ),
    index("social_runs_project_idx").on(t.projectId, t.createdAt),
  ],
);

export type SocialProject = typeof socialProjects.$inferSelect;
export type SocialConnection = typeof socialConnections.$inferSelect;
export type SocialProfile = typeof socialProfiles.$inferSelect;
export type SocialPost = typeof socialPosts.$inferSelect;
export type SocialPostTarget = typeof socialPostTargets.$inferSelect;
export type SocialMediaAsset = typeof socialMediaAssets.$inferSelect;
export type SocialRun = typeof socialRuns.$inferSelect;
