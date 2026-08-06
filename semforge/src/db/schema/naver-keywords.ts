// @TASK NAVER-KI-DB-01 - 네이버 키워드 인텔리전스 원천·사용량 스키마
// @SPEC docs/DB_SCHEMA.md#네이버-키워드-인텔리전스-schemanaver-keywordsts
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestampMs = (name: string) => integer(name, { mode: "timestamp_ms" });

/**
 * NAVER Search Ads `/keywordstool` 응답의 append-only 원천 스냅샷.
 * `<10`은 0으로 치환하지 않고 [min, maxExclusive) 범위와 원문 표시값을 보존한다.
 */
export const naverKeywordSnapshots = sqliteTable(
  "naver_keyword_snapshots",
  {
    id: text("id").primaryKey(),
    requestedKeyword: text("requested_keyword").notNull(),
    keyword: text("keyword").notNull(),
    normalizedKeyword: text("normalized_keyword").notNull(),
    pcSearchCountMin: integer("pc_search_count_min").notNull(),
    pcSearchCountMaxExclusive: integer("pc_search_count_max_exclusive"),
    pcSearchCountQualifier: text("pc_search_count_qualifier", {
      enum: ["exact", "lt"],
    }).notNull(),
    pcSearchCountDisplay: text("pc_search_count_display").notNull(),
    mobileSearchCountMin: integer("mobile_search_count_min").notNull(),
    mobileSearchCountMaxExclusive: integer("mobile_search_count_max_exclusive"),
    mobileSearchCountQualifier: text("mobile_search_count_qualifier", {
      enum: ["exact", "lt"],
    }).notNull(),
    mobileSearchCountDisplay: text("mobile_search_count_display").notNull(),
    avgPcClicks: real("avg_pc_clicks"),
    avgMobileClicks: real("avg_mobile_clicks"),
    avgPcCtr: real("avg_pc_ctr"),
    avgMobileCtr: real("avg_mobile_ctr"),
    adDepth: real("ad_depth"),
    competition: text("competition", {
      enum: ["low", "medium", "high"],
    }),
    source: text("source").notNull(),
    capturedAt: timestampMs("captured_at").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
  },
  (t) => [
    index("naver_keyword_snapshots_latest_idx").on(
      t.normalizedKeyword,
      t.source,
      t.capturedAt,
    ),
    index("naver_keyword_snapshots_request_idx").on(
      t.requestedKeyword,
      t.capturedAt,
    ),
    index("naver_keyword_snapshots_expiry_idx").on(t.expiresAt),
    check(
      "naver_keyword_snapshots_pc_range_check",
      sql`${t.pcSearchCountMin} >= 0 AND (${t.pcSearchCountMaxExclusive} IS NULL OR ${t.pcSearchCountMaxExclusive} > ${t.pcSearchCountMin})`,
    ),
    check(
      "naver_keyword_snapshots_mobile_range_check",
      sql`${t.mobileSearchCountMin} >= 0 AND (${t.mobileSearchCountMaxExclusive} IS NULL OR ${t.mobileSearchCountMaxExclusive} > ${t.mobileSearchCountMin})`,
    ),
    check(
      "naver_keyword_snapshots_pc_qualifier_check",
      sql`(${t.pcSearchCountQualifier} = 'exact' AND ${t.pcSearchCountMaxExclusive} IS NULL) OR (${t.pcSearchCountQualifier} = 'lt' AND ${t.pcSearchCountMaxExclusive} IS NOT NULL)`,
    ),
    check(
      "naver_keyword_snapshots_mobile_qualifier_check",
      sql`(${t.mobileSearchCountQualifier} = 'exact' AND ${t.mobileSearchCountMaxExclusive} IS NULL) OR (${t.mobileSearchCountQualifier} = 'lt' AND ${t.mobileSearchCountMaxExclusive} IS NOT NULL)`,
    ),
    check(
      "naver_keyword_snapshots_expiry_check",
      sql`${t.expiresAt} > ${t.capturedAt}`,
    ),
  ],
);

/**
 * NAVER API HUB의 버전 있는 JSON 응답 스냅샷.
 * 비율·인구통계·블로그 응답·쇼핑 추이는 kind로 분리해 서로 덮어쓰지 않는다.
 */
export const naverKeywordInsights = sqliteTable(
  "naver_keyword_insights",
  {
    id: text("id").primaryKey(),
    keyword: text("keyword").notNull(),
    normalizedKeyword: text("normalized_keyword").notNull(),
    kind: text("kind", {
      enum: ["search_trend", "demographics", "blog_search", "shopping_trend"],
    }).notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    payload: text("payload").notNull(),
    source: text("source").notNull(),
    capturedAt: timestampMs("captured_at").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
  },
  (t) => [
    index("naver_keyword_insights_latest_idx").on(
      t.normalizedKeyword,
      t.kind,
      t.source,
      t.capturedAt,
    ),
    index("naver_keyword_insights_expiry_idx").on(t.expiresAt),
    check(
      "naver_keyword_insights_schema_version_check",
      sql`${t.schemaVersion} > 0`,
    ),
    check("naver_keyword_insights_payload_json_check", sql`json_valid(${t.payload})`),
    check(
      "naver_keyword_insights_expiry_check",
      sql`${t.expiresAt} > ${t.capturedAt}`,
    ),
  ],
);

/**
 * 공개 무료 조회의 rolling-window 사용량.
 * 원본 IP와 원본 키워드는 저장하지 않고 HMAC 해시만 저장한다.
 * 만료된 동일 키워드는 INSERT 대신 같은 행의 window를 갱신한다.
 */
export const publicKeywordUsage = sqliteTable(
  "public_keyword_usage",
  {
    id: text("id").primaryKey(),
    identityType: text("identity_type", {
      enum: ["cookie", "ip_prefix"],
    }).notNull(),
    identityHash: text("identity_hash").notNull(),
    keywordHash: text("keyword_hash").notNull(),
    firstSeenAt: timestampMs("first_seen_at").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
  },
  (t) => [
    uniqueIndex("public_keyword_usage_identity_keyword_unique").on(
      t.identityType,
      t.identityHash,
      t.keywordHash,
    ),
    index("public_keyword_usage_active_identity_idx").on(
      t.identityType,
      t.identityHash,
      t.expiresAt,
    ),
    index("public_keyword_usage_expiry_idx").on(t.expiresAt),
    check(
      "public_keyword_usage_expiry_check",
      sql`${t.expiresAt} > ${t.firstSeenAt}`,
    ),
  ],
);

/** 공급자별 전역 일일 안전 한도의 영속 카운터. */
export const providerCallBudgets = sqliteTable(
  "provider_call_budgets",
  {
    id: text("id").primaryKey(),
    provider: text("provider", {
      enum: ["naver-search-ads", "naver-api-hub"],
    }).notNull(),
    budgetDate: text("budget_date").notNull(),
    callCount: integer("call_count").notNull().default(0),
    callLimit: integer("call_limit").notNull(),
    updatedAt: timestampMs("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("provider_call_budgets_provider_date_unique").on(
      t.provider,
      t.budgetDate,
    ),
    index("provider_call_budgets_date_idx").on(t.budgetDate),
    check(
      "provider_call_budgets_nonnegative_check",
      sql`${t.callCount} >= 0 AND ${t.callLimit} > 0`,
    ),
  ],
);

export type NaverKeywordSnapshot = typeof naverKeywordSnapshots.$inferSelect;
export type NewNaverKeywordSnapshot = typeof naverKeywordSnapshots.$inferInsert;
export type NaverKeywordInsight = typeof naverKeywordInsights.$inferSelect;
export type NewNaverKeywordInsight = typeof naverKeywordInsights.$inferInsert;
export type PublicKeywordUsage = typeof publicKeywordUsage.$inferSelect;
export type ProviderCallBudget = typeof providerCallBudgets.$inferSelect;
