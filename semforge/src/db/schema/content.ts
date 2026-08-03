import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { contentArticles, folders } from "./domain";
import { auditColumns, workspaces } from "./platform";

const timestampMs = (name: string) => integer(name, { mode: "timestamp_ms" });

const workspaceScope = {
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
};

/** 콘텐츠 생성 대화와 실행을 묶는 영속 작업판. */
export const contentBoards = sqliteTable(
  "content_boards",
  {
    id: text("id").primaryKey(),
    ...workspaceScope,
    folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    intent: text("intent", { enum: ["create", "optimize", "repurpose", "brief"] })
      .notNull()
      .default("create"),
    status: text("status", { enum: ["active", "completed", "failed", "archived"] })
      .notNull()
      .default("active"),
    ...auditColumns,
  },
  (t) => [
    index("content_boards_workspace_status_idx").on(
      t.workspaceId,
      t.status,
      t.updatedAt,
      t.deletedAt,
    ),
    index("content_boards_folder_idx").on(t.folderId, t.deletedAt),
  ],
);

/** 사용자 대화, 확정 요구사항, 진행 상태와 결과물을 순서대로 보관한다. */
export const contentMessages = sqliteTable(
  "content_messages",
  {
    id: text("id").primaryKey(),
    ...workspaceScope,
    boardId: text("board_id")
      .notNull()
      .references(() => contentBoards.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    kind: text("kind", {
      enum: ["text", "requirements", "progress", "artifact", "error"],
    }).notNull(),
    body: text("body").notNull().default(""),
    payloadJson: text("payload_json"),
    ...auditColumns,
  },
  (t) => [index("content_messages_board_idx").on(t.boardId, t.createdAt, t.deletedAt)],
);

/** 한 번의 공급자 실행을 단계별로 재개할 수 있게 보관한다. */
export const contentRuns = sqliteTable(
  "content_runs",
  {
    id: text("id").primaryKey(),
    ...workspaceScope,
    boardId: text("board_id")
      .notNull()
      .references(() => contentBoards.id, { onDelete: "cascade" }),
    articleId: text("article_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    intent: text("intent", { enum: ["create", "optimize", "repurpose", "brief"] })
      .notNull()
      .default("create"),
    status: text("status", {
      enum: ["queued", "running", "completed", "failed", "cancelled"],
    }).notNull().default("queued"),
    stage: text("stage", {
      enum: ["validate", "research", "generate", "analyze", "persist"],
    }).notNull().default("validate"),
    inputJson: text("input_json").notNull(),
    provenanceJson: text("provenance_json"),
    outputJson: text("output_json"),
    errorJson: text("error_json"),
    startedAt: timestampMs("started_at"),
    completedAt: timestampMs("completed_at"),
    cancelledAt: timestampMs("cancelled_at"),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestampMs("lease_expires_at"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("content_runs_board_idempotency_unique").on(t.boardId, t.idempotencyKey),
    index("content_runs_workspace_status_idx").on(t.workspaceId, t.status, t.updatedAt),
    index("content_runs_board_idx").on(t.boardId, t.createdAt),
    index("content_runs_article_idx").on(t.articleId),
    index("content_runs_stale_lease_idx").on(t.status, t.leaseExpiresAt),
  ],
);

/** 워크스페이스에서 모든 기사 비주얼에 재사용하는 단일 브랜드 키트. */
export const contentBrandKits = sqliteTable(
  "content_brand_kits",
  {
    id: text("id").primaryKey(),
    ...workspaceScope,
    brandName: text("brand_name").notNull(),
    primaryColor: text("primary_color").notNull().default("#ff5a1f"),
    secondaryColor: text("secondary_color").notNull().default("#18181b"),
    logoStorageKey: text("logo_storage_key"),
    logoMimeType: text("logo_mime_type", { enum: ["image/png"] }),
    logoWidth: integer("logo_width"),
    logoHeight: integer("logo_height"),
    ...auditColumns,
  },
  (t) => [uniqueIndex("content_brand_kits_workspace_unique").on(t.workspaceId)],
);

/** 기사 한 버전을 바탕으로 만든 원본과 썸네일·OG 파생 자산을 묶는 영속 실행. */
export const contentVisuals = sqliteTable(
  "content_visuals",
  {
    id: text("id").primaryKey(),
    ...workspaceScope,
    articleId: text("article_id")
      .notNull()
      .references(() => contentArticles.id, { onDelete: "cascade" }),
    sourceVisualId: text("source_visual_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    articleVersion: integer("article_version").notNull(),
    stylePreset: text("style_preset", {
      enum: ["editorial_photo", "illustration", "minimal_3d", "abstract_graphic"],
    }).notNull(),
    displayTitle: text("display_title").notNull(),
    showTitle: integer("show_title", { mode: "boolean" }).notNull().default(true),
    showLogo: integer("show_logo", { mode: "boolean" }).notNull().default(true),
    visualDirection: text("visual_direction"),
    focalX: integer("focal_x").notNull().default(50),
    focalY: integer("focal_y").notNull().default(50),
    status: text("status", {
      enum: ["queued", "running", "ready", "failed", "cancelled"],
    }).notNull().default("queued"),
    stage: text("stage", { enum: ["validate", "generate", "render"] })
      .notNull()
      .default("validate"),
    promptVersion: text("prompt_version").notNull().default("semforge-visual-v1"),
    inputJson: text("input_json").notNull(),
    specificationJson: text("specification_json"),
    provenanceJson: text("provenance_json"),
    errorJson: text("error_json"),
    startedAt: timestampMs("started_at"),
    completedAt: timestampMs("completed_at"),
    cancelledAt: timestampMs("cancelled_at"),
    activeAt: timestampMs("active_at"),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestampMs("lease_expires_at"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("content_visuals_article_idempotency_unique").on(
      t.articleId,
      t.idempotencyKey,
    ),
    uniqueIndex("content_visuals_article_active_unique")
      .on(t.articleId)
      .where(sql`${t.activeAt} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    uniqueIndex("content_visuals_article_running_unique")
      .on(t.articleId)
      .where(sql`${t.status} IN ('queued', 'running') AND ${t.deletedAt} IS NULL`),
    index("content_visuals_workspace_status_idx").on(t.workspaceId, t.status, t.updatedAt),
    index("content_visuals_article_idx").on(t.articleId, t.createdAt),
    index("content_visuals_stale_lease_idx").on(t.status, t.leaseExpiresAt),
  ],
);

/** 이미지 본문은 파일 저장소에 두고 DB에는 안전한 메타데이터만 보관한다. */
export const contentAssets = sqliteTable(
  "content_assets",
  {
    id: text("id").primaryKey(),
    ...workspaceScope,
    articleId: text("article_id")
      .notNull()
      .references(() => contentArticles.id, { onDelete: "cascade" }),
    visualId: text("visual_id")
      .notNull()
      .references(() => contentVisuals.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["source", "thumbnail", "open_graph"] }).notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type", { enum: ["image/webp", "image/jpeg", "image/png", "image/svg+xml"] })
      .notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    altText: text("alt_text"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("content_assets_visual_kind_unique").on(t.visualId, t.kind),
    uniqueIndex("content_assets_storage_key_unique").on(t.storageKey),
    index("content_assets_article_idx").on(t.articleId, t.createdAt),
  ],
);

/** 글과 독립적으로 만들거나 저장된 기사에 연결할 수 있는 이미지·영상 제작 작업판. */
export const contentProductions = sqliteTable(
  "content_productions",
  {
    id: text("id").primaryKey(),
    ...workspaceScope,
    folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
    articleId: text("article_id").references(() => contentArticles.id, { onDelete: "set null" }),
    articleVersion: integer("article_version"),
    sourceProductionId: text("source_production_id"),
    sourceAssetId: text("source_asset_id"),
    sourceAssetSha256: text("source_asset_sha256"),
    kind: text("kind", { enum: ["image", "video"] }).notNull(),
    title: text("title").notNull(),
    prompt: text("prompt").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status", {
      enum: [
        "draft",
        "planning",
        "awaiting_storyboard_approval",
        "generating_keyframes",
        "awaiting_keyframe_approval",
        "generating",
        "assembling",
        "ready",
        "failed",
        "cancelled",
        "archived",
      ],
    }).notNull().default("draft"),
    stage: text("stage", {
      enum: [
        "validate",
        "plan",
        "generate",
        "render",
        "keyframes",
        "submit_scenes",
        "poll_scenes",
        "assemble",
        "persist",
      ],
    }).notNull().default("validate"),
    settingsJson: text("settings_json").notNull(),
    inputJson: text("input_json").notNull(),
    resultJson: text("result_json"),
    provenanceJson: text("provenance_json"),
    errorJson: text("error_json"),
    startedAt: timestampMs("started_at"),
    completedAt: timestampMs("completed_at"),
    cancelledAt: timestampMs("cancelled_at"),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestampMs("lease_expires_at"),
    nextProcessAt: timestampMs("next_process_at"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("content_productions_workspace_idempotency_unique").on(t.workspaceId, t.idempotencyKey),
    index("content_productions_workspace_kind_status_idx").on(t.workspaceId, t.kind, t.status, t.updatedAt),
    index("content_productions_folder_idx").on(t.folderId, t.deletedAt),
    index("content_productions_article_idx").on(t.articleId, t.updatedAt),
    index("content_productions_source_idx").on(t.sourceProductionId, t.sourceAssetId),
    index("content_productions_due_idx").on(t.status, t.nextProcessAt, t.leaseExpiresAt),
  ],
);

/** 영상 제작 전 사용자가 검토·승인하는 버전형 콘티. */
export const contentVideoStoryboards = sqliteTable(
  "content_video_storyboards",
  {
    id: text("id").primaryKey(),
    ...workspaceScope,
    productionId: text("production_id")
      .notNull()
      .references(() => contentProductions.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull().default(1),
    status: text("status", { enum: ["draft", "approved", "superseded"] }).notNull().default("draft"),
    totalDuration: integer("total_duration").notNull(),
    aspectRatio: text("aspect_ratio", { enum: ["16:9", "9:16", "1:1"] }).notNull(),
    stylePreset: text("style_preset", {
      enum: ["editorial_photo", "illustration", "minimal_3d", "abstract_graphic"],
    }).notNull(),
    summary: text("summary").notNull(),
    visualBibleJson: text("visual_bible_json").notNull(),
    provenanceJson: text("provenance_json"),
    approvedAt: timestampMs("approved_at"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("content_video_storyboards_production_revision_unique").on(t.productionId, t.revision),
    index("content_video_storyboards_production_idx").on(t.productionId, t.createdAt),
  ],
);

/** 승인된 콘티 한 버전으로 만드는 장편 영상 실행. */
export const contentVideoRuns = sqliteTable(
  "content_video_runs",
  {
    id: text("id").primaryKey(),
    ...workspaceScope,
    productionId: text("production_id")
      .notNull()
      .references(() => contentProductions.id, { onDelete: "cascade" }),
    storyboardId: text("storyboard_id")
      .notNull()
      .references(() => contentVideoStoryboards.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status", {
      enum: ["queued", "running", "completed", "failed", "cancelled"],
    }).notNull().default("queued"),
    stage: text("stage", {
      enum: ["submit_scenes", "poll_scenes", "assemble", "persist"],
    }).notNull().default("submit_scenes"),
    provenanceJson: text("provenance_json"),
    errorJson: text("error_json"),
    startedAt: timestampMs("started_at"),
    completedAt: timestampMs("completed_at"),
    cancelledAt: timestampMs("cancelled_at"),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestampMs("lease_expires_at"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("content_video_runs_production_idempotency_unique").on(t.productionId, t.idempotencyKey),
    index("content_video_runs_production_idx").on(t.productionId, t.createdAt),
    index("content_video_runs_status_idx").on(t.status, t.updatedAt),
  ],
);

/** 콘티의 편집 가능한 개별 장면과 xAI 비동기 영상 작업 상태. */
export const contentVideoScenes = sqliteTable(
  "content_video_scenes",
  {
    id: text("id").primaryKey(),
    ...workspaceScope,
    productionId: text("production_id")
      .notNull()
      .references(() => contentProductions.id, { onDelete: "cascade" }),
    storyboardId: text("storyboard_id")
      .notNull()
      .references(() => contentVideoStoryboards.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => contentVideoRuns.id, { onDelete: "set null" }),
    ordinal: integer("ordinal").notNull(),
    title: text("title").notNull(),
    duration: integer("duration").notNull(),
    prompt: text("prompt").notNull(),
    audioPrompt: text("audio_prompt").notNull(),
    transition: text("transition", { enum: ["cut", "crossfade"] }).notNull().default("crossfade"),
    status: text("status", {
      enum: ["draft", "queued", "submitting", "processing", "ready", "failed", "unknown", "cancelled"],
    }).notNull().default("draft"),
    provider: text("provider"),
    model: text("model"),
    providerTaskId: text("provider_task_id"),
    providerRequestId: text("provider_request_id"),
    seed: integer("seed"),
    provenanceJson: text("provenance_json"),
    errorJson: text("error_json"),
    submittedAt: timestampMs("submitted_at"),
    completedAt: timestampMs("completed_at"),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestampMs("lease_expires_at"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("content_video_scenes_storyboard_ordinal_unique").on(t.storyboardId, t.ordinal),
    index("content_video_scenes_production_status_idx").on(t.productionId, t.status, t.ordinal),
    index("content_video_scenes_task_idx").on(t.providerTaskId),
  ],
);

/** 독립 이미지·키프레임·장면 MP4·최종 MP4의 파일 메타데이터. */
export const contentProductionAssets = sqliteTable(
  "content_production_assets",
  {
    id: text("id").primaryKey(),
    ...workspaceScope,
    productionId: text("production_id")
      .notNull()
      .references(() => contentProductions.id, { onDelete: "cascade" }),
    sceneId: text("scene_id").references(() => contentVideoScenes.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => contentVideoRuns.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["image_source", "image_result", "thumbnail", "open_graph", "keyframe", "scene_video", "final_video", "poster"],
    }).notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type", {
      enum: ["image/webp", "image/jpeg", "image/png", "image/svg+xml", "video/mp4"],
    }).notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    durationMs: integer("duration_ms"),
    fps: integer("fps"),
    hasAudio: integer("has_audio", { mode: "boolean" }),
    altText: text("alt_text"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("content_production_assets_storage_key_unique").on(t.storageKey),
    index("content_production_assets_production_idx").on(t.productionId, t.kind, t.createdAt),
    index("content_production_assets_scene_idx").on(t.sceneId, t.kind),
  ],
);

/** 글→이미지→영상 연계 제작의 목표와 현재 승인 단계를 보관하는 상위 작업 단위. */
export const contentPackages = sqliteTable(
  "content_packages",
  {
    id: text("id").primaryKey(),
    ...workspaceScope,
    folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
    idempotencyKey: text("idempotency_key").notNull(),
    title: text("title").notNull(),
    brief: text("brief").notNull(),
    startMode: text("start_mode", { enum: ["new_article", "existing_article"] }).notNull(),
    targetStage: text("target_stage", { enum: ["article", "image", "video"] }).notNull(),
    currentStep: text("current_step", {
      enum: ["article", "article_review", "image", "image_review", "video", "complete"],
    }).notNull(),
    status: text("status", {
      enum: ["active", "awaiting_approval", "completed", "failed", "cancelled", "archived"],
    }).notNull().default("active"),
    settingsJson: text("settings_json").notNull(),
    errorJson: text("error_json"),
    completedAt: timestampMs("completed_at"),
    cancelledAt: timestampMs("cancelled_at"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("content_packages_workspace_idempotency_unique").on(t.workspaceId, t.idempotencyKey),
    index("content_packages_workspace_status_idx").on(t.workspaceId, t.status, t.updatedAt),
    index("content_packages_folder_idx").on(t.folderId, t.deletedAt),
  ],
);

/** 패키지 산출물의 revision과 기존 board/article/production 연결을 보존한다. */
export const contentPackageItems = sqliteTable(
  "content_package_items",
  {
    id: text("id").primaryKey(),
    ...workspaceScope,
    packageId: text("package_id")
      .notNull()
      .references(() => contentPackages.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["article", "image", "video"] }).notNull(),
    revision: integer("revision").notNull().default(1),
    boardId: text("board_id").references(() => contentBoards.id, { onDelete: "set null" }),
    articleId: text("article_id").references(() => contentArticles.id, { onDelete: "set null" }),
    productionId: text("production_id").references(() => contentProductions.id, { onDelete: "set null" }),
    parentItemId: text("parent_item_id"),
    sourceVersion: integer("source_version"),
    status: text("status", { enum: ["active", "superseded", "failed"] }).notNull().default("active"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("content_package_items_revision_unique").on(t.packageId, t.kind, t.revision),
    uniqueIndex("content_package_items_active_unique")
      .on(t.packageId, t.kind)
      .where(sql`${t.status} = 'active' AND ${t.deletedAt} IS NULL`),
    index("content_package_items_package_idx").on(t.packageId, t.kind, t.createdAt),
    index("content_package_items_board_idx").on(t.boardId),
    index("content_package_items_article_idx").on(t.articleId),
    index("content_package_items_production_idx").on(t.productionId),
  ],
);

export type ContentBoard = typeof contentBoards.$inferSelect;
export type ContentMessage = typeof contentMessages.$inferSelect;
export type ContentRun = typeof contentRuns.$inferSelect;
export type ContentBrandKit = typeof contentBrandKits.$inferSelect;
export type ContentVisual = typeof contentVisuals.$inferSelect;
export type ContentAsset = typeof contentAssets.$inferSelect;
export type ContentProduction = typeof contentProductions.$inferSelect;
export type ContentVideoStoryboard = typeof contentVideoStoryboards.$inferSelect;
export type ContentVideoRun = typeof contentVideoRuns.$inferSelect;
export type ContentVideoScene = typeof contentVideoScenes.$inferSelect;
export type ContentProductionAsset = typeof contentProductionAssets.$inferSelect;
export type ContentPackage = typeof contentPackages.$inferSelect;
export type ContentPackageItem = typeof contentPackageItems.$inferSelect;
