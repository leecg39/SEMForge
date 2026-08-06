import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { backlinkReportCaches } from "./analytics";
import { users, workspaces } from "./platform";

const timestampMs = (name: string) => integer(name, { mode: "timestamp_ms" });

/**
 * 백링크 분석에서 확보한 실제 인바운드 링크를 검토·조치하기 위한 감사 프로젝트.
 * 원본 보고서 캐시가 정리되어도 감사 결과는 유지되도록 sourceReportId는 set null이다.
 */
export const backlinkAuditProjects = sqliteTable(
  "backlink_audit_projects",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceReportId: text("source_report_id").references(() => backlinkReportCaches.id, {
      onDelete: "set null",
    }),
    sourceProvider: text("source_provider", {
      enum: ["bing-webmaster", "bing-csv", "common-crawl"],
    }).notNull(),
    name: text("name").notNull(),
    siteUrl: text("site_url").notNull(),
    status: text("status", {
      enum: ["ready", "queued", "running", "failed"],
    })
      .notNull()
      .default("ready"),
    lastCollectedAt: timestampMs("last_collected_at"),
    lastErrorMessage: text("last_error_message"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestampMs("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: timestampMs("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    deletedAt: timestampMs("deleted_at"),
  },
  (t) => [
    uniqueIndex("backlink_audit_project_scope_unique").on(
      t.workspaceId,
      t.siteUrl,
      t.sourceProvider,
    ),
    index("backlink_audit_project_workspace_idx").on(t.workspaceId, t.updatedAt),
  ],
);

/** 실행은 큐에 먼저 기록하고 응답 이후 처리한다. heartbeat로 유실된 실행을 판별한다. */
export const backlinkAuditRuns = sqliteTable(
  "backlink_audit_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => backlinkAuditProjects.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["queued", "running", "completed", "failed"],
    })
      .notNull()
      .default("queued"),
    requestedLinks: integer("requested_links").notNull(),
    discoveredLinks: integer("discovered_links").notNull().default(0),
    processedLinks: integer("processed_links").notNull().default(0),
    activeLinks: integer("active_links").notNull().default(0),
    missingLinks: integer("missing_links").notNull().default(0),
    unavailableLinks: integer("unavailable_links").notNull().default(0),
    riskyLinks: integer("risky_links").notNull().default(0),
    inventoryPartial: integer("inventory_partial", { mode: "boolean" })
      .notNull()
      .default(false),
    warningMessage: text("warning_message"),
    errorMessage: text("error_message"),
    startedAt: timestampMs("started_at"),
    heartbeatAt: timestampMs("heartbeat_at"),
    finishedAt: timestampMs("finished_at"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestampMs("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: timestampMs("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("backlink_audit_run_project_idx").on(t.projectId, t.createdAt),
    index("backlink_audit_run_status_idx").on(t.status, t.heartbeatAt),
  ],
);

/** 공급자 행 하나와 실제 페이지 확인 결과를 함께 보존한다. */
export const backlinkAuditLinks = sqliteTable(
  "backlink_audit_links",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => backlinkAuditProjects.id, { onDelete: "cascade" }),
    lastRunId: text("last_run_id").references(() => backlinkAuditRuns.id, {
      onDelete: "set null",
    }),
    fingerprint: text("fingerprint").notNull(),
    sourceUrl: text("source_url").notNull(),
    finalSourceUrl: text("final_source_url"),
    targetUrl: text("target_url").notNull(),
    sourceDomain: text("source_domain").notNull(),
    providerAnchor: text("provider_anchor"),
    observedAnchor: text("observed_anchor"),
    linkCount: integer("link_count").notNull().default(1),
    sourceStatus: integer("source_status"),
    targetStatus: integer("target_status"),
    auditStatus: text("audit_status", {
      enum: ["unverified", "active", "missing", "unavailable"],
    })
      .notNull()
      .default("unverified"),
    linkType: text("link_type", {
      enum: ["text", "image", "form", "frame", "unknown"],
    })
      .notNull()
      .default("unknown"),
    isFollow: integer("is_follow", { mode: "boolean" }),
    isNofollow: integer("is_nofollow", { mode: "boolean" }),
    isSponsored: integer("is_sponsored", { mode: "boolean" }),
    isUgc: integer("is_ugc", { mode: "boolean" }),
    riskLevel: text("risk_level", {
      enum: ["unscored", "low", "medium", "high"],
    })
      .notNull()
      .default("unscored"),
    riskScore: integer("risk_score").notNull().default(0),
    confidence: text("confidence", { enum: ["low", "medium", "high"] })
      .notNull()
      .default("low"),
    signalsPayload: text("signals_payload").notNull().default("[]"),
    fetchError: text("fetch_error"),
    reviewStatus: text("review_status", {
      enum: ["pending", "safe", "watch", "remove", "disavow", "ignore"],
    })
      .notNull()
      .default("pending"),
    firstSeenAt: timestampMs("first_seen_at").notNull(),
    lastSeenAt: timestampMs("last_seen_at").notNull(),
    lastCheckedAt: timestampMs("last_checked_at"),
    createdAt: timestampMs("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: timestampMs("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("backlink_audit_link_fingerprint_unique").on(t.projectId, t.fingerprint),
    index("backlink_audit_link_project_risk_idx").on(t.projectId, t.riskLevel),
    index("backlink_audit_link_project_review_idx").on(t.projectId, t.reviewStatus),
    index("backlink_audit_link_domain_idx").on(t.projectId, t.sourceDomain),
    index("backlink_audit_link_target_idx").on(t.projectId, t.targetUrl),
  ],
);

export const backlinkAuditDomainRollups = sqliteTable(
  "backlink_audit_domain_rollups",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => backlinkAuditProjects.id, { onDelete: "cascade" }),
    sourceDomain: text("source_domain").notNull(),
    totalLinks: integer("total_links").notNull(),
    activeLinks: integer("active_links").notNull(),
    riskyLinks: integer("risky_links").notNull(),
    unreviewedLinks: integer("unreviewed_links").notNull(),
    topAnchor: text("top_anchor"),
    updatedAt: timestampMs("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("backlink_audit_domain_rollup_unique").on(t.projectId, t.sourceDomain),
    index("backlink_audit_domain_rollup_project_idx").on(t.projectId, t.totalLinks),
  ],
);

/** 수동 판정 변경 이력. 현재 상태는 backlink_audit_links.review_status에 비정규화한다. */
export const backlinkAuditReviews = sqliteTable(
  "backlink_audit_reviews",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => backlinkAuditProjects.id, { onDelete: "cascade" }),
    linkId: text("link_id")
      .notNull()
      .references(() => backlinkAuditLinks.id, { onDelete: "cascade" }),
    decision: text("decision", {
      enum: ["pending", "safe", "watch", "remove", "disavow", "ignore"],
    }).notNull(),
    note: text("note"),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestampMs("reviewed_at").notNull(),
  },
  (t) => [index("backlink_audit_review_link_idx").on(t.linkId, t.reviewedAt)],
);

export const backlinkRemovalRequests = sqliteTable(
  "backlink_removal_requests",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => backlinkAuditProjects.id, { onDelete: "cascade" }),
    linkId: text("link_id")
      .notNull()
      .references(() => backlinkAuditLinks.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "contacted", "removed", "failed"],
    })
      .notNull()
      .default("pending"),
    contact: text("contact"),
    note: text("note"),
    lastContactedAt: timestampMs("last_contacted_at"),
    followUpAt: timestampMs("follow_up_at"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestampMs("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: timestampMs("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("backlink_removal_link_unique").on(t.projectId, t.linkId),
    index("backlink_removal_project_status_idx").on(t.projectId, t.status),
  ],
);

export const backlinkDisavowEntries = sqliteTable(
  "backlink_disavow_entries",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => backlinkAuditProjects.id, { onDelete: "cascade" }),
    linkId: text("link_id").references(() => backlinkAuditLinks.id, {
      onDelete: "set null",
    }),
    kind: text("kind", { enum: ["url", "domain"] }).notNull(),
    value: text("value").notNull(),
    reason: text("reason"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestampMs("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("backlink_disavow_entry_unique").on(t.projectId, t.kind, t.value),
    index("backlink_disavow_project_idx").on(t.projectId, t.createdAt),
  ],
);

export const backlinkDisavowExports = sqliteTable(
  "backlink_disavow_exports",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => backlinkAuditProjects.id, { onDelete: "cascade" }),
    entryCount: integer("entry_count").notNull(),
    contentSha256: text("content_sha256").notNull(),
    exportedBy: text("exported_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestampMs("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("backlink_disavow_export_project_idx").on(t.projectId, t.createdAt)],
);

export type BacklinkAuditProjectRow = typeof backlinkAuditProjects.$inferSelect;
export type BacklinkAuditRunRow = typeof backlinkAuditRuns.$inferSelect;
export type BacklinkAuditLinkRow = typeof backlinkAuditLinks.$inferSelect;
export type BacklinkAuditReviewRow = typeof backlinkAuditReviews.$inferSelect;
export type BacklinkRemovalRequestRow = typeof backlinkRemovalRequests.$inferSelect;
export type BacklinkDisavowEntryRow = typeof backlinkDisavowEntries.$inferSelect;
