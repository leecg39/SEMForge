import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { folders } from "./domain";
import { auditColumns, users, workspaces } from "./platform";

const timestampMs = (name: string) => integer(name, { mode: "timestamp_ms" });

const workspaceId = text("workspace_id")
  .notNull()
  .references(() => workspaces.id, { onDelete: "cascade" });

/** 광고 경쟁 리서치 1회 실행. 키워드별 결과는 advertising_research_items 에 보존한다. */
export const advertisingResearchRuns = sqliteTable(
  "advertising_research_runs",
  {
    id: text("id").primaryKey(),
    workspaceId,
    folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
    domain: text("domain").notNull(),
    countryCode: text("country_code").notNull().default("KR"),
    device: text("device", { enum: ["desktop", "mobile"] }).notNull().default("desktop"),
    keywords: text("keywords").notNull().default("[]"),
    status: text("status", { enum: ["queued", "running", "completed", "failed"] })
      .notNull()
      .default("queued"),
    totalCount: integer("total_count").notNull().default(0),
    processedCount: integer("processed_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    currentKeyword: text("current_keyword"),
    errorMessage: text("error_message"),
    source: text("source").notNull().default("talordata"),
    startedAt: timestampMs("started_at"),
    completedAt: timestampMs("completed_at"),
    ...auditColumns,
  },
  (t) => [
    index("advertising_research_workspace_idx").on(t.workspaceId, t.status, t.updatedAt),
    index("advertising_research_domain_idx").on(t.workspaceId, t.domain, t.createdAt),
  ],
);

/** 리서치 실행 안에서 수집한 키워드별 성공/0건/실패 상태. */
export const advertisingResearchItems = sqliteTable(
  "advertising_research_items",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => advertisingResearchRuns.id, { onDelete: "cascade" }),
    keywordMetricId: text("keyword_metric_id"),
    keyword: text("keyword").notNull(),
    status: text("status", { enum: ["queued", "running", "completed", "failed"] })
      .notNull()
      .default("queued"),
    adCount: integer("ad_count").notNull().default(0),
    shoppingCount: integer("shopping_count").notNull().default(0),
    shoppingAvailability: text("shopping_availability", {
      enum: ["available", "no_results", "unavailable"],
    })
      .notNull()
      .default("unavailable"),
    fromCache: integer("from_cache", { mode: "boolean" }).notNull().default(false),
    errorMessage: text("error_message"),
    capturedAt: timestampMs("captured_at"),
    startedAt: timestampMs("started_at"),
    completedAt: timestampMs("completed_at"),
  },
  (t) => [
    uniqueIndex("advertising_research_items_unique").on(t.runId, t.keyword),
    index("advertising_research_items_status_idx").on(t.runId, t.status),
  ],
);

/** Google/Meta로 내보내기 전 SEMForge 안에서 검토하는 캠페인 초안. */
export const advertisingCampaigns = sqliteTable(
  "advertising_campaigns",
  {
    id: text("id").primaryKey(),
    workspaceId,
    folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
    requestId: text("request_id"),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    platform: text("platform", { enum: ["google", "meta"] }).notNull().default("google"),
    goal: text("goal", { enum: ["sales", "leads", "traffic", "awareness"] })
      .notNull()
      .default("sales"),
    countryCode: text("country_code").notNull().default("KR"),
    languageCode: text("language_code").notNull().default("ko"),
    dailyBudgetCents: integer("daily_budget_cents").notNull().default(0),
    currencyCode: text("currency_code").notNull().default("KRW"),
    status: text("status", { enum: ["draft", "ready", "exported"] })
      .notNull()
      .default("draft"),
    exportedAt: timestampMs("exported_at"),
    ...auditColumns,
  },
  (t) => [
    index("advertising_campaigns_workspace_idx").on(t.workspaceId, t.deletedAt, t.updatedAt),
    index("advertising_campaigns_folder_idx").on(t.folderId, t.deletedAt),
    uniqueIndex("advertising_campaigns_request_unique")
      .on(t.workspaceId, t.requestId)
      .where(sql`request_id IS NOT NULL`),
  ],
);

export const advertisingAdGroups = sqliteTable(
  "advertising_ad_groups",
  {
    id: text("id").primaryKey(),
    workspaceId,
    campaignId: text("campaign_id")
      .notNull()
      .references(() => advertisingCampaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    finalUrl: text("final_url").notNull(),
    ...auditColumns,
  },
  (t) => [index("advertising_ad_groups_campaign_idx").on(t.campaignId, t.deletedAt)],
);

export const advertisingKeywords = sqliteTable(
  "advertising_keywords",
  {
    id: text("id").primaryKey(),
    workspaceId,
    campaignId: text("campaign_id")
      .notNull()
      .references(() => advertisingCampaigns.id, { onDelete: "cascade" }),
    adGroupId: text("ad_group_id").references(() => advertisingAdGroups.id, {
      onDelete: "set null",
    }),
    keyword: text("keyword").notNull(),
    matchType: text("match_type", { enum: ["broad", "phrase", "exact"] })
      .notNull()
      .default("phrase"),
    negative: integer("negative", { mode: "boolean" }).notNull().default(false),
    source: text("source", { enum: ["manual", "research", "ai"] })
      .notNull()
      .default("manual"),
    volume: integer("volume"),
    cpcCents: integer("cpc_cents"),
    status: text("status", { enum: ["active", "paused"] }).notNull().default("active"),
    ...auditColumns,
  },
  (t) => [
    index("advertising_keywords_campaign_idx").on(t.campaignId, t.deletedAt),
    uniqueIndex("advertising_keywords_active_unique")
      .on(t.campaignId, t.keyword, t.matchType, t.negative)
      .where(sql`deleted_at IS NULL`),
  ],
);

export const advertisingCreatives = sqliteTable(
  "advertising_creatives",
  {
    id: text("id").primaryKey(),
    workspaceId,
    campaignId: text("campaign_id")
      .notNull()
      .references(() => advertisingCampaigns.id, { onDelete: "cascade" }),
    adGroupId: text("ad_group_id").references(() => advertisingAdGroups.id, {
      onDelete: "set null",
    }),
    format: text("format", { enum: ["google_rsa", "meta_primary"] })
      .notNull()
      .default("google_rsa"),
    headlines: text("headlines").notNull().default("[]"),
    descriptions: text("descriptions").notNull().default("[]"),
    primaryText: text("primary_text"),
    path1: text("path1"),
    path2: text("path2"),
    callToAction: text("call_to_action"),
    finalUrl: text("final_url").notNull(),
    source: text("source", { enum: ["manual", "ai"] }).notNull().default("manual"),
    status: text("status", { enum: ["draft", "approved"] }).notNull().default("draft"),
    provenance: text("provenance").notNull().default("{}"),
    ...auditColumns,
  },
  (t) => [index("advertising_creatives_campaign_idx").on(t.campaignId, t.deletedAt)],
);

export const advertisingRecommendations = sqliteTable(
  "advertising_recommendations",
  {
    id: text("id").primaryKey(),
    workspaceId,
    campaignId: text("campaign_id")
      .notNull()
      .references(() => advertisingCampaigns.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: [
        "add_keyword",
        "remove_keyword",
        "restructure_ad_group",
        "rewrite_copy",
        "landing_page",
        "budget",
      ],
    }).notNull(),
    status: text("status", { enum: ["pending", "applied", "rejected"] })
      .notNull()
      .default("pending"),
    rationale: text("rationale").notNull(),
    beforeValue: text("before_value"),
    afterValue: text("after_value").notNull(),
    source: text("source").notNull().default("openai"),
    resolvedAt: timestampMs("resolved_at"),
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
    ...auditColumns,
  },
  (t) => [
    index("advertising_recommendations_campaign_idx").on(t.campaignId, t.status, t.createdAt),
  ],
);

export type AdvertisingResearchRun = typeof advertisingResearchRuns.$inferSelect;
export type AdvertisingCampaign = typeof advertisingCampaigns.$inferSelect;
export type AdvertisingRecommendation = typeof advertisingRecommendations.$inferSelect;
