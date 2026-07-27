import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { auditColumns, users, workspaces } from "./platform";

/**
 * 도메인 스키마.
 *
 * 증거 등급은 docs/research/APP_REBUILD_SPEC.md 4절과 대응한다.
 * - folders / sites / tags / folder_shares / auth_events / api_keys / notification_settings
 *   → 원본 UI에서 관찰된 필드를 근거로 함 (O 또는 I1)
 * - site_audit_* / position_tracking_* / keyword_* / media_* / reports / content_articles
 *   → 진입점만 관찰되었고 내부 구조는 제안(P)
 *
 * 소프트 삭제 규약: deleted_at IS NULL 인 행만 활성. 유일 제약도 활성 행에만 적용한다.
 */

const timestampMs = (name: string) => integer(name, { mode: "timestamp_ms" });

const scoped = {
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
};

/* ------------------------------------------------------------------ */
/* 폴더 / 웹사이트 (O)                                                 */
/* ------------------------------------------------------------------ */

export const folders = sqliteTable(
  "folders",
  {
    id: text("id").primaryKey(),
    ...scoped,
    /** 원본 라벨 "비즈니스명" (O) */
    name: text("name").notNull(),
    /** 원본 라벨 "웹사이트". 1회 설정 후 수정 불가 (O, 규칙 R1) */
    domain: text("domain").notNull(),
    /** 원본 "보고서가 생성되면 공유하기" / "저장 후 공유하기" 체크박스 (O) */
    shareOnReportCreate: integer("share_on_report_create", { mode: "boolean" })
      .notNull()
      .default(false),
    /** 원본 kebab 메뉴의 "핀 고정" (O) */
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("folders_workspace_domain_unique")
      .on(t.workspaceId, t.domain)
      .where(sql`deleted_at IS NULL`),
    index("folders_workspace_idx").on(t.workspaceId, t.deletedAt),
    index("folders_created_by_idx").on(t.createdBy),
  ]
);

export const sites = sqliteTable(
  "sites",
  {
    id: text("id").primaryKey(),
    ...scoped,
    folderId: text("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    /** placeholder "도메인 또는 서브도메인 입력" (O) */
    domain: text("domain").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("sites_folder_domain_unique")
      .on(t.folderId, t.domain)
      .where(sql`deleted_at IS NULL`),
    index("sites_folder_idx").on(t.folderId, t.deletedAt),
  ]
);

/* ------------------------------------------------------------------ */
/* 태그 / 공유 (I1 — UI 존재는 관찰, 내부 구조는 제안)                  */
/* ------------------------------------------------------------------ */

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    ...scoped,
    name: text("name").notNull(),
    color: text("color").notNull().default("#235FE2"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("tags_workspace_name_unique")
      .on(t.workspaceId, t.name)
      .where(sql`deleted_at IS NULL`),
  ]
);

export const folderTags = sqliteTable(
  "folder_tags",
  {
    id: text("id").primaryKey(),
    folderId: text("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestampMs("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("folder_tags_unique").on(t.folderId, t.tagId)]
);

/** 소유권 필터 "나에게 공유된 캠페인" 옵션의 근거 (O → I1) */
export const folderShares = sqliteTable(
  "folder_shares",
  {
    id: text("id").primaryKey(),
    folderId: text("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permission: text("permission", { enum: ["view", "edit"] })
      .notNull()
      .default("view"),
    createdAt: timestampMs("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    createdBy: text("created_by"),
  },
  (t) => [uniqueIndex("folder_shares_unique").on(t.folderId, t.userId)]
);

/* ------------------------------------------------------------------ */
/* 계정 부속 (O)                                                       */
/* ------------------------------------------------------------------ */

/** 원본 "활동 로그": 인증·계정 보안 이벤트 전용 (O) */
export const authEvents = sqliteTable(
  "auth_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    email: text("email"),
    /** 원본 관찰값 login, registration + 제안 확장 */
    eventType: text("event_type", {
      enum: [
        "login",
        "login_failed",
        "logout",
        "registration",
        "password_change",
      ],
    }).notNull(),
    ip: text("ip"),
    country: text("country"),
    userAgent: text("user_agent"),
    occurredAt: timestampMs("occurred_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("auth_events_user_idx").on(t.userId, t.occurredAt)]
);

/** 원본 Active/Inactive 탭 구조를 상태 필드로 재현 (O) */
export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    ...scoped,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** 전체 키는 생성 응답에서 1회만 노출하고 DB에는 해시만 보관 */
    keyPrefix: text("key_prefix").notNull(),
    hashedKey: text("hashed_key").notNull(),
    permissions: text("permissions").notNull().default("read"),
    /** 원본 목록의 `Version` 컬럼(API 버전). auditColumns.version(낙관적 잠금)과 구분한다. */
    apiVersion: text("api_version").notNull().default("v4"),
    status: text("status", { enum: ["active", "inactive"] })
      .notNull()
      .default("active"),
    expiresAt: timestampMs("expires_at"),
    ...auditColumns,
  },
  (t) => [index("api_keys_user_status_idx").on(t.userId, t.status)]
);

/** 원본 알림 설정: 저장 버튼 없이 즉시 반영 (O) */
export const notificationSettings = sqliteTable(
  "notification_settings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 원본 항목: 교육 콘텐츠 / 제품 소식 및 업데이트 / 예정된 이벤트 */
    key: text("key", {
      enum: ["educational", "product_news", "upcoming_events"],
    }).notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    updatedAt: timestampMs("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("notification_settings_unique").on(t.userId, t.key)]
);

/** 멤버 초대 (P — 원본은 무료 플랜에서 비활성이라 내부 확인 불가) */
export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    ...scoped,
    email: text("email").notNull(),
    role: text("role", { enum: ["admin", "editor", "viewer"] })
      .notNull()
      .default("viewer"),
    status: text("status", {
      enum: ["pending", "accepted", "expired", "revoked"],
    })
      .notNull()
      .default("pending"),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("invitations_workspace_email_unique")
      .on(t.workspaceId, t.email)
      .where(sql`status = 'pending'`),
  ]
);

/**
 * 영구 삭제 2차 확인 코드.
 * 원본 폴더 삭제가 매 호출마다 새 6자리 코드를 요구하는 UX(O)를 서버 발급 방식으로 재현한다.
 */
export const deleteConfirmations = sqliteTable(
  "delete_confirmations",
  {
    id: text("id").primaryKey(),
    ...scoped,
    userId: text("user_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    code: text("code").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
    consumedAt: timestampMs("consumed_at"),
    createdAt: timestampMs("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("delete_confirmations_lookup").on(t.entityType, t.entityId, t.userId)]
);

/* ------------------------------------------------------------------ */
/* 6개 툴킷 도메인 (P — 진입점만 관찰)                                  */
/* ------------------------------------------------------------------ */

const folderScoped = {
  ...scoped,
  folderId: text("folder_id").references(() => folders.id, {
    onDelete: "cascade",
  }),
};

/** 랜딩 안내문의 "크롤링 범위, 페이지 제한, 크롤링 소스, 프로젝트 이름, 예약" (I1) */
export const siteAuditCampaigns = sqliteTable(
  "site_audit_campaigns",
  {
    id: text("id").primaryKey(),
    ...folderScoped,
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    crawlScope: text("crawl_scope", {
      enum: ["domain", "subdomain", "path"],
    })
      .notNull()
      .default("domain"),
    pageLimit: integer("page_limit").notNull().default(100),
    crawlSource: text("crawl_source", {
      enum: ["website", "sitemap", "url_list"],
    })
      .notNull()
      .default("website"),
    schedule: text("schedule", { enum: ["off", "weekly", "monthly"] })
      .notNull()
      .default("off"),
    status: text("status", {
      enum: ["idle", "queued", "running", "completed", "failed"],
    })
      .notNull()
      .default("idle"),
    siteHealth: integer("site_health"),
    lastRunAt: timestampMs("last_run_at"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("site_audit_workspace_name_unique")
      .on(t.workspaceId, t.name)
      .where(sql`deleted_at IS NULL`),
    index("site_audit_workspace_idx").on(t.workspaceId, t.deletedAt),
  ]
);

export const siteAuditIssues = sqliteTable(
  "site_audit_issues",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => siteAuditCampaigns.id, { onDelete: "cascade" }),
    severity: text("severity", { enum: ["error", "warning", "notice"] }).notNull(),
    title: text("title").notNull(),
    count: integer("count").notNull().default(0),
    status: text("status", { enum: ["open", "ignored", "fixed"] })
      .notNull()
      .default("open"),
    ...auditColumns,
  },
  (t) => [index("site_audit_issues_campaign_idx").on(t.campaignId, t.severity)]
);

/** 랜딩 문구 "위치, 기기 유형 또는 검색 엔진을 추적할 수 있습니다" (O) */
export const positionTrackingCampaigns = sqliteTable(
  "position_tracking_campaigns",
  {
    id: text("id").primaryKey(),
    ...folderScoped,
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    location: text("location").notNull().default("Seoul, South Korea"),
    device: text("device", { enum: ["desktop", "mobile", "tablet"] })
      .notNull()
      .default("desktop"),
    searchEngine: text("search_engine", {
      enum: ["google", "bing", "chatgpt"],
    })
      .notNull()
      .default("google"),
    status: text("status", { enum: ["active", "paused"] })
      .notNull()
      .default("active"),
    visibility: integer("visibility"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("position_tracking_workspace_name_unique")
      .on(t.workspaceId, t.name)
      .where(sql`deleted_at IS NULL`),
    index("position_tracking_workspace_idx").on(t.workspaceId, t.deletedAt),
  ]
);

export const trackedKeywords = sqliteTable(
  "tracked_keywords",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => positionTrackingCampaigns.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    position: integer("position"),
    previousPosition: integer("previous_position"),
    volume: integer("volume"),
    difficulty: integer("difficulty"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("tracked_keywords_unique")
      .on(t.campaignId, t.keyword)
      .where(sql`deleted_at IS NULL`),
  ]
);

/** 3개 생성 모드와 DB 선택은 원본에서 직접 관찰 (O) */
export const keywordLists = sqliteTable(
  "keyword_lists",
  {
    id: text("id").primaryKey(),
    ...folderScoped,
    name: text("name").notNull(),
    mode: text("mode", { enum: ["domain", "seed", "manual"] })
      .notNull()
      .default("manual"),
    database: text("database").notNull().default("US"),
    seed: text("seed"),
    status: text("status", { enum: ["draft", "ready", "generating"] })
      .notNull()
      .default("draft"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("keyword_lists_workspace_name_unique")
      .on(t.workspaceId, t.name)
      .where(sql`deleted_at IS NULL`),
    index("keyword_lists_workspace_idx").on(t.workspaceId, t.deletedAt),
  ]
);

export const keywordListItems = sqliteTable(
  "keyword_list_items",
  {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => keywordLists.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    volume: integer("volume"),
    difficulty: integer("difficulty"),
    intent: text("intent", {
      enum: ["informational", "navigational", "commercial", "transactional"],
    }),
    cluster: text("cluster"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("keyword_list_items_unique")
      .on(t.listId, t.keyword)
      .where(sql`deleted_at IS NULL`),
  ]
);

/** 랜딩 문구 "Segment journalists by beats, audiences, visibility in LLMs" (O) */
export const mediaLists = sqliteTable(
  "media_lists",
  {
    id: text("id").primaryKey(),
    ...folderScoped,
    name: text("name").notNull(),
    description: text("description"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("media_lists_workspace_name_unique")
      .on(t.workspaceId, t.name)
      .where(sql`deleted_at IS NULL`),
    index("media_lists_workspace_idx").on(t.workspaceId, t.deletedAt),
  ]
);

export const mediaContacts = sqliteTable(
  "media_contacts",
  {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => mediaLists.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    outlet: text("outlet").notNull(),
    beat: text("beat"),
    email: text("email"),
    country: text("country"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("media_contacts_unique")
      .on(t.listId, t.email)
      .where(sql`deleted_at IS NULL AND email IS NOT NULL`),
    index("media_contacts_list_idx").on(t.listId, t.deletedAt),
  ]
);

/** 템플릿·테마·자동 일정은 원본 랜딩에서 관찰 (O) */
export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    ...folderScoped,
    name: text("name").notNull(),
    template: text("template", {
      enum: ["blank", "brand_performance", "ga4", "gsc", "monthly_seo"],
    })
      .notNull()
      .default("blank"),
    theme: text("theme", { enum: ["default", "white_label"] })
      .notNull()
      .default("default"),
    status: text("status", { enum: ["draft", "published", "archived"] })
      .notNull()
      .default("draft"),
    widgetCount: integer("widget_count").notNull().default(0),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("reports_workspace_name_unique")
      .on(t.workspaceId, t.name)
      .where(sql`deleted_at IS NULL`),
    index("reports_workspace_idx").on(t.workspaceId, t.deletedAt),
  ]
);

export const reportSchedules = sqliteTable(
  "report_schedules",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    frequency: text("frequency", { enum: ["weekly", "monthly"] })
      .notNull()
      .default("monthly"),
    dayOfMonth: integer("day_of_month").notNull().default(1),
    recipients: text("recipients").notNull().default(""),
    nextRunAt: timestampMs("next_run_at"),
    ...auditColumns,
  },
  (t) => [index("report_schedules_report_idx").on(t.reportId)]
);

/** 생성·최적화·재활용 3모드는 원본 좌측 메뉴에서 관찰 (O) */
export const contentArticles = sqliteTable(
  "content_articles",
  {
    id: text("id").primaryKey(),
    ...folderScoped,
    title: text("title").notNull(),
    mode: text("mode", { enum: ["create", "optimize", "repurpose", "brief"] })
      .notNull()
      .default("create"),
    status: text("status", { enum: ["draft", "in_review", "published"] })
      .notNull()
      .default("draft"),
    keyword: text("keyword"),
    wordCount: integer("word_count").notNull().default(0),
    seoScore: integer("seo_score"),
    body: text("body"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("content_articles_workspace_title_unique")
      .on(t.workspaceId, t.title)
      .where(sql`deleted_at IS NULL`),
    index("content_articles_workspace_idx").on(t.workspaceId, t.deletedAt),
  ]
);

export type Folder = typeof folders.$inferSelect;
export type Site = typeof sites.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type AuthEvent = typeof authEvents.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
