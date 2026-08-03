import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { auditColumns, workspaces } from "./platform";
import { folders } from "./domain";

/**
 * AI 가시성 원천 스토어.
 *
 * Google AI 개요(AIO) 출현 여부와 자사 도메인의 AIO 인용 여부를
 * TalorData 실측 SERP에서만 가져온다. 추정치/모델 값은 저장하지 않는다.
 * - aioPresent: SERP에 AIO가 있었는가 (features의 ai_overview 감지)
 * - cited: AIO 인용 소스에 자사 도메인이 있었는가.
 *   제공사가 AIO 본문을 주지 않으면 null(판정 불가)로 둔다.
 */

const timestampMs = (name: string) => integer(name, { mode: "timestamp_ms" });

export const AI_VISIBILITY_PROVIDERS = [
  "google_aio",
  "chatgpt_web",
  "gemini_grounded",
] as const;
export type AiVisibilityProvider = (typeof AI_VISIBILITY_PROVIDERS)[number];

export const AI_VISIBILITY_STATUSES = [
  "visible",
  "not_visible",
  "unknown",
] as const;
export type AiVisibilityStatus = (typeof AI_VISIBILITY_STATUSES)[number];

/** AI 가시성 추적 쿼리. 도메인당 관찰할 검색어/프롬프트. */
export const aiVisibilityQueries = sqliteTable(
  "ai_visibility_queries",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** 인용 여부를 판정할 대상 도메인 (정규화된 루트 도메인). */
    domain: text("domain").notNull(),
    query: text("query").notNull(),
    normalizedQuery: text("normalized_query").notNull(),
    countryCode: text("country_code").notNull().default("KR"),
    device: text("device", { enum: ["desktop", "mobile"] })
      .notNull()
      .default("desktop"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("ai_visibility_queries_unique")
      .on(t.workspaceId, t.domain, t.normalizedQuery, t.countryCode, t.device)
      .where(sql`deleted_at IS NULL`),
    index("ai_visibility_queries_domain_idx").on(
      t.workspaceId,
      t.domain,
      t.deletedAt,
    ),
  ],
);

/** 쿼리별 AIO 관측 스냅샷. 동일 시점 관측을 append-only로 보존한다. */
export const aiVisibilitySnapshots = sqliteTable(
  "ai_visibility_snapshots",
  {
    id: text("id").primaryKey(),
    queryId: text("query_id")
      .notNull()
      .references(() => aiVisibilityQueries.id, { onDelete: "cascade" }),
    aioPresent: integer("aio_present", { mode: "boolean" })
      .notNull()
      .default(false),
    /** AIO 인용 소스 판정. 제공사 미제공 시 null(판정 불가). */
    cited: integer("cited", { mode: "boolean" }),
    citedUrl: text("cited_url"),
    /** AIO 인용 소스로 확인된 전체 도메인 JSON 배열. */
    citedDomains: text("cited_domains").notNull().default("[]"),
    /** 같은 SERP의 오가닉 순위 (인용 판정과 별개 힌트). */
    organicPosition: integer("organic_position"),
    /** 감지된 SERP 피처 이름 JSON 배열. */
    features: text("features").notNull().default("[]"),
    source: text("source").notNull().default("talordata"),
    capturedAt: timestampMs("captured_at").notNull(),
  },
  (t) => [
    index("ai_visibility_snapshots_query_idx").on(t.queryId, t.capturedAt),
  ],
);

/** 폴더(프로젝트)당 하나의 멀티플랫폼 AI 가시성 설정. */
export const aiVisibilityProjects = sqliteTable(
  "ai_visibility_projects",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    folderId: text("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    brandName: text("brand_name").notNull(),
    /** 사용자가 확인한 브랜드 별칭 JSON 배열(최대 5개). */
    brandAliases: text("brand_aliases").notNull().default("[]"),
    /** 활성 공급자 JSON 배열. 공급자별 API 키가 없으면 런타임에서 비활성 처리한다. */
    providers: text("providers")
      .notNull()
      .default('["google_aio","chatgpt_web","gemini_grounded"]'),
    schedule: text("schedule", { enum: ["off", "weekly"] })
      .notNull()
      .default("weekly"),
    nextRunAt: timestampMs("next_run_at"),
    lastRunAt: timestampMs("last_run_at"),
    status: text("status", { enum: ["active", "paused"] })
      .notNull()
      .default("active"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("ai_visibility_projects_folder_unique")
      .on(t.folderId)
      .where(sql`deleted_at IS NULL`),
    index("ai_visibility_projects_workspace_idx").on(
      t.workspaceId,
      t.deletedAt,
    ),
    index("ai_visibility_projects_due_idx").on(t.schedule, t.nextRunAt),
  ],
);

/** 프로젝트가 관찰하는 지역. 프로젝트당 활성 위치는 서비스 계층에서 최대 2개로 제한한다. */
export const aiVisibilityScopes = sqliteTable(
  "ai_visibility_scopes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => aiVisibilityProjects.id, { onDelete: "cascade" }),
    countryCode: text("country_code").notNull(),
    locationKey: text("location_key").notNull(),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("ai_visibility_scopes_unique")
      .on(t.projectId, t.locationKey)
      .where(sql`deleted_at IS NULL`),
    index("ai_visibility_scopes_project_idx").on(t.projectId, t.deletedAt),
  ],
);

/** 사용자가 실제로 추적하기로 승인한 프롬프트. 프로젝트당 활성 행은 최대 20개다. */
export const aiVisibilityPrompts = sqliteTable(
  "ai_visibility_prompts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => aiVisibilityProjects.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    normalizedPrompt: text("normalized_prompt").notNull(),
    topic: text("topic").notNull().default("미분류"),
    source: text("source", {
      enum: ["manual", "csv", "position_tracking", "legacy"],
    })
      .notNull()
      .default("manual"),
    enabled: integer("enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("ai_visibility_prompts_unique")
      .on(t.projectId, t.normalizedPrompt)
      .where(sql`deleted_at IS NULL`),
    index("ai_visibility_prompts_project_idx").on(
      t.projectId,
      t.enabled,
      t.deletedAt,
    ),
  ],
);

/** 브라우저 연결과 독립적으로 복구할 수 있는 수집 실행. */
export const aiVisibilityRuns = sqliteTable(
  "ai_visibility_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => aiVisibilityProjects.id, { onDelete: "cascade" }),
    trigger: text("trigger", {
      enum: ["initial", "manual", "scheduled", "migration"],
    })
      .notNull()
      .default("manual"),
    status: text("status", {
      enum: ["queued", "running", "completed", "partial", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    totalCount: integer("total_count").notNull().default(0),
    processedCount: integer("processed_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    currentPrompt: text("current_prompt"),
    errorMessage: text("error_message"),
    startedAt: timestampMs("started_at"),
    completedAt: timestampMs("completed_at"),
    createdAt: timestampMs("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: timestampMs("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    createdBy: text("created_by"),
  },
  (t) => [
    index("ai_visibility_runs_project_idx").on(t.projectId, t.createdAt),
    index("ai_visibility_runs_workspace_status_idx").on(
      t.workspaceId,
      t.status,
      t.updatedAt,
    ),
  ],
);

/** 실행 시점에 고정된 프롬프트×공급자×지역 작업 행. */
export const aiVisibilityRunItems = sqliteTable(
  "ai_visibility_run_items",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => aiVisibilityRuns.id, { onDelete: "cascade" }),
    promptId: text("prompt_id")
      .notNull()
      .references(() => aiVisibilityPrompts.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: AI_VISIBILITY_PROVIDERS }).notNull(),
    countryCode: text("country_code").notNull(),
    locationKey: text("location_key").notNull(),
    status: text("status", {
      enum: ["queued", "running", "succeeded", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    errorMessage: text("error_message"),
    startedAt: timestampMs("started_at"),
    completedAt: timestampMs("completed_at"),
  },
  (t) => [
    uniqueIndex("ai_visibility_run_items_unique").on(
      t.runId,
      t.promptId,
      t.provider,
      t.locationKey,
    ),
    index("ai_visibility_run_items_status_idx").on(t.runId, t.status),
  ],
);

/** 공급자 중립 append-only 관측값. raw 공급자 페이로드와 비밀값은 저장하지 않는다. */
export const aiVisibilityObservations = sqliteTable(
  "ai_visibility_observations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => aiVisibilityProjects.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => aiVisibilityRuns.id, {
      onDelete: "set null",
    }),
    runItemId: text("run_item_id").references(() => aiVisibilityRunItems.id, {
      onDelete: "set null",
    }),
    promptId: text("prompt_id")
      .notNull()
      .references(() => aiVisibilityPrompts.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: AI_VISIBILITY_PROVIDERS }).notNull(),
    countryCode: text("country_code").notNull(),
    locationKey: text("location_key").notNull(),
    visibilityStatus: text("visibility_status", {
      enum: AI_VISIBILITY_STATUSES,
    }).notNull(),
    /** null은 본문/언급 판정 자체가 제공되지 않은 경우다. */
    brandMentioned: integer("brand_mentioned", { mode: "boolean" }),
    citationsAvailable: integer("citations_available", { mode: "boolean" })
      .notNull()
      .default(false),
    responseText: text("response_text"),
    source: text("source").notNull(),
    fromCache: integer("from_cache", { mode: "boolean" })
      .notNull()
      .default(false),
    capturedAt: timestampMs("captured_at").notNull(),
  },
  (t) => [
    index("ai_visibility_observations_project_idx").on(
      t.projectId,
      t.capturedAt,
    ),
    index("ai_visibility_observations_cell_idx").on(
      t.promptId,
      t.provider,
      t.locationKey,
      t.capturedAt,
    ),
    uniqueIndex("ai_visibility_observations_run_item_unique")
      .on(t.runItemId)
      .where(sql`run_item_id IS NOT NULL`),
  ],
);

/** 관측 응답에서 공급자가 실제로 반환한 인용 URL. */
export const aiVisibilityCitations = sqliteTable(
  "ai_visibility_citations",
  {
    id: text("id").primaryKey(),
    observationId: text("observation_id")
      .notNull()
      .references(() => aiVisibilityObservations.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    url: text("url").notNull(),
    domain: text("domain").notNull(),
    title: text("title"),
    isOwnDomain: integer("is_own_domain", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => [
    uniqueIndex("ai_visibility_citations_unique").on(t.observationId, t.url),
    index("ai_visibility_citations_observation_idx").on(t.observationId),
    index("ai_visibility_citations_domain_idx").on(t.domain, t.isOwnDomain),
  ],
);

/** 브랜드 성과에서 비교할 자사/경쟁 브랜드. 자동 탐지 행도 사용자가 끌 수 있다. */
export const aiVisibilityTrackedBrands = sqliteTable(
  "ai_visibility_tracked_brands",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => aiVisibilityProjects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    aliases: text("aliases").notNull().default("[]"),
    domain: text("domain"),
    kind: text("kind", { enum: ["own", "competitor"] }).notNull(),
    source: text("source", {
      enum: ["project", "manual", "detected", "position_tracking"],
    }).notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("ai_visibility_tracked_brands_unique")
      .on(t.projectId, t.normalizedName)
      .where(sql`deleted_at IS NULL`),
    uniqueIndex("ai_visibility_tracked_brands_own_unique")
      .on(t.projectId, t.kind)
      .where(sql`kind = 'own' AND deleted_at IS NULL`),
    index("ai_visibility_tracked_brands_project_idx")
      .on(t.projectId, t.enabled, t.deletedAt),
  ],
);

/** 실행·플랫폼·위치별 검증된 브랜드 성과 분석 스냅샷. */
export const aiVisibilityBrandReports = sqliteTable(
  "ai_visibility_brand_reports",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => aiVisibilityProjects.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => aiVisibilityRuns.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: AI_VISIBILITY_PROVIDERS }).notNull(),
    countryCode: text("country_code").notNull(),
    locationKey: text("location_key").notNull(),
    inputHash: text("input_hash").notNull(),
    status: text("status", {
      enum: ["pending", "running", "completed", "partial", "failed"],
    }).notNull().default("pending"),
    reportJson: text("report_json"),
    observationCount: integer("observation_count").notNull().default(0),
    analyzedCount: integer("analyzed_count").notNull().default(0),
    errorMessage: text("error_message"),
    analyzerProvider: text("analyzer_provider"),
    analyzerModel: text("analyzer_model"),
    analyzerReasoning: text("analyzer_reasoning"),
    generatedAt: timestampMs("generated_at"),
    createdAt: timestampMs("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: timestampMs("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    createdBy: text("created_by"),
  },
  (t) => [
    uniqueIndex("ai_visibility_brand_reports_cell_unique")
      .on(t.runId, t.provider, t.locationKey),
    index("ai_visibility_brand_reports_project_idx")
      .on(t.projectId, t.generatedAt),
    index("ai_visibility_brand_reports_status_idx")
      .on(t.status, t.updatedAt),
  ],
);

export type AiVisibilityQuery = typeof aiVisibilityQueries.$inferSelect;
export type AiVisibilitySnapshot = typeof aiVisibilitySnapshots.$inferSelect;
export type AiVisibilityProject = typeof aiVisibilityProjects.$inferSelect;
export type AiVisibilityPrompt = typeof aiVisibilityPrompts.$inferSelect;
export type AiVisibilityRun = typeof aiVisibilityRuns.$inferSelect;
export type AiVisibilityObservation = typeof aiVisibilityObservations.$inferSelect;
export type AiVisibilityTrackedBrand = typeof aiVisibilityTrackedBrands.$inferSelect;
export type AiVisibilityBrandReport = typeof aiVisibilityBrandReports.$inferSelect;
