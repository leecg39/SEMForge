import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { workspaces } from "./platform";

/**
 * 데이터 인텔리전스 원천 스토어.
 *
 * docs/data-architecture.md의 구조를 작은 로컬 데이터셋으로 재현한다.
 * 이 테이블에는 계산된 Authority Score, KD, Organic Traffic을 저장하지 않는다.
 * 파생 지표는 원천 행을 읽어 src/lib/analytics/metrics.ts의 순수 함수로 계산한다.
 */

const timestampMs = (name: string) => integer(name, { mode: "timestamp_ms" });

/** 지역·기기별 키워드 메타. 검색량은 월별 관측/모델 값을 대표한다. */
export const keywordMetrics = sqliteTable(
  "keyword_metrics",
  {
    id: text("id").primaryKey(),
    keyword: text("keyword").notNull(),
    normalizedKeyword: text("normalized_keyword").notNull(),
    countryCode: text("country_code").notNull(),
    device: text("device", { enum: ["desktop", "mobile"] }).notNull(),
    periodStart: timestampMs("period_start").notNull(),
    volume: integer("volume").notNull(),
    cpcCents: integer("cpc_cents").notNull().default(0),
    currencyCode: text("currency_code").notNull().default("USD"),
    intent: text("intent", {
      enum: ["informational", "navigational", "commercial", "transactional"],
    }).notNull(),
    /** 데이터 출처. 삽입 시 명시 필수 (talordata-serp 등). demo 기본값은 제거됨 */
    source: text("source").notNull(),
    updatedAt: timestampMs("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("keyword_metrics_scope_unique").on(
      t.normalizedKeyword,
      t.countryCode,
      t.device,
      t.periodStart,
    ),
    index("keyword_metrics_scope_idx").on(
      t.normalizedKeyword,
      t.countryCode,
      t.device,
      t.periodStart,
    ),
  ],
);

/** 원천 1: 키워드별 SERP 스냅샷. 동일 시점의 순위 행을 그대로 보존한다. */
export const serpSnapshots = sqliteTable(
  "serp_snapshots",
  {
    id: text("id").primaryKey(),
    keywordMetricId: text("keyword_metric_id")
      .notNull()
      .references(() => keywordMetrics.id, { onDelete: "cascade" }),
    searchEngine: text("search_engine", { enum: ["google", "bing"] })
      .notNull()
      .default("google"),
    domain: text("domain").notNull(),
    url: text("url").notNull(),
    position: integer("position").notNull(),
    isAd: integer("is_ad", { mode: "boolean" }).notNull().default(false),
    resultType: text("result_type", {
      enum: ["organic", "search_ad", "shopping_ad"],
    })
      .notNull()
      .default("organic"),
    adPlacement: text("ad_placement", {
      enum: ["top", "bottom", "shopping", "unknown"],
    })
      .notNull()
      .default("unknown"),
    /** 수집 당시 결과 제목/스니펫. TTL 캐시 재사용 시 UI 표시용 (라이브 수집분만 채워진다). */
    title: text("title"),
    description: text("description"),
    /** featured_snippet, local_pack 같은 피처 이름의 JSON 배열. */
    serpFeatures: text("serp_features").notNull().default("[]"),
    /** 가격·판매자·이미지 등 공급자별 광고 부가정보(JSON 객체). */
    resultMetadata: text("result_metadata").notNull().default("{}"),
    /** 데이터 출처. 삽입 시 명시 필수 (talordata 등). demo 기본값은 제거됨 */
    source: text("source").notNull(),
    capturedAt: timestampMs("captured_at").notNull(),
  },
  (t) => [
    uniqueIndex("serp_snapshot_position_unique").on(
      t.keywordMetricId,
      t.searchEngine,
      t.capturedAt,
      t.position,
      t.isAd,
      t.resultType,
      t.adPlacement,
    ),
    index("serp_snapshot_domain_idx").on(t.domain, t.capturedAt),
    index("serp_snapshot_paid_domain_idx").on(t.isAd, t.domain, t.capturedAt),
    index("serp_snapshot_keyword_idx").on(t.keywordMetricId, t.capturedAt),
  ],
);

/** 원천 2: 익명 클릭스트림 이벤트. 세션·사용자 키는 데모용 해시 값이다. */
export const clickstreamEvents = sqliteTable(
  "clickstream_events",
  {
    id: text("id").primaryKey(),
    anonymousUserHash: text("anonymous_user_hash").notNull(),
    sessionHash: text("session_hash").notNull(),
    domain: text("domain").notNull(),
    path: text("path").notNull().default("/"),
    countryCode: text("country_code").notNull(),
    device: text("device", { enum: ["desktop", "mobile"] }).notNull(),
    channel: text("channel", {
      enum: ["direct", "organic", "paid", "referral", "social", "email"],
    }).notNull(),
    /** 이 표본 세션 한 건이 대표하는 모집단 세션 수. */
    populationWeight: integer("population_weight").notNull().default(1),
    /** 데이터 출처. 삽입 시 명시 필수. demo 기본값은 제거됨 */
    source: text("source").notNull(),
    occurredAt: timestampMs("occurred_at").notNull(),
  },
  (t) => [
    index("clickstream_domain_scope_idx").on(
      t.domain,
      t.countryCode,
      t.device,
      t.occurredAt,
    ),
    index("clickstream_session_idx").on(t.sessionHash),
  ],
);

/** 원천 3: 자체 크롤러가 발견한 링크 그래프의 엣지. */
export const linkGraphEdges = sqliteTable(
  "link_graph_edges",
  {
    id: text("id").primaryKey(),
    sourceDomain: text("source_domain").notNull(),
    targetDomain: text("target_domain").notNull(),
    sourceUrl: text("source_url").notNull(),
    targetUrl: text("target_url").notNull(),
    /** 동일 네트워크의 비정상 링크 집중도를 계산하기 위한 가명 네트워크 키. */
    sourceNetwork: text("source_network").notNull(),
    isFollow: integer("is_follow", { mode: "boolean" }).notNull().default(true),
    /** 크롤 당시 source domain의 0~100 품질 피처. */
    sourceAuthority: integer("source_authority").notNull(),
    /** 데이터 출처. 삽입 시 명시 필수 (site-audit-crawler 등). demo 기본값은 제거됨 */
    source: text("source").notNull(),
    firstSeenAt: timestampMs("first_seen_at").notNull(),
    lastSeenAt: timestampMs("last_seen_at").notNull(),
  },
  (t) => [
    uniqueIndex("link_graph_edge_unique").on(t.sourceUrl, t.targetUrl),
    index("link_graph_target_idx").on(t.targetDomain, t.lastSeenAt),
    index("link_graph_source_network_idx").on(t.sourceNetwork, t.targetDomain),
  ],
);

/**
 * 외부 백링크 공급자 또는 확인된 CSV에서 읽은 집계 보고서 캐시.
 *
 * 사이트 진단 크롤러의 link_graph_edges 와 의미가 다르므로 별도 저장한다.
 * 외부 응답은 공급자 중립 JSON으로 정규화한 뒤 24시간만 fresh 로 취급하며,
 * status/lease 컬럼으로 동시에 같은 유료 수집이 중복 실행되지 않게 한다.
 */
export const backlinkReportCaches = sqliteTable(
  "backlink_report_caches",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    target: text("target").notNull(),
    effectiveTarget: text("effective_target"),
    scope: text("scope", {
      enum: ["root_domain", "subdomain", "site", "page"],
    }).notNull(),
    provider: text("provider", { enum: ["semrush-v4", "bing-webmaster", "bing-csv", "common-crawl"] })
      .notNull()
      .default("bing-webmaster"),
    status: text("status", { enum: ["ready", "refreshing", "failed"] })
      .notNull()
      .default("refreshing"),
    overviewPayload: text("overview_payload"),
    historyPayload: text("history_payload"),
    scoreProfilePayload: text("score_profile_payload"),
    requestIdsPayload: text("request_ids_payload").notNull().default("[]"),
    fetchedAt: timestampMs("fetched_at"),
    expiresAt: timestampMs("expires_at"),
    refreshLeaseUntil: timestampMs("refresh_lease_until"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    createdAt: timestampMs("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: timestampMs("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("backlink_report_cache_scope_unique").on(
      t.workspaceId,
      t.target,
      t.scope,
      t.provider,
    ),
    index("backlink_report_cache_expiry_idx").on(t.expiresAt),
    index("backlink_report_cache_workspace_idx").on(t.workspaceId, t.updatedAt),
  ],
);

/** 공급자 목록 API의 필터·정렬·페이지 단위 캐시. */
export const backlinkListCaches = sqliteTable(
  "backlink_list_caches",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => backlinkReportCaches.id, { onDelete: "cascade" }),
    dataset: text("dataset", {
      enum: ["links", "ref_domains", "anchors", "pages", "target_pages", "inbound_links"],
    }).notNull(),
    queryHash: text("query_hash").notNull(),
    queryPayload: text("query_payload").notNull(),
    rowsPayload: text("rows_payload").notNull(),
    total: integer("total").notNull(),
    requestId: text("request_id"),
    fetchedAt: timestampMs("fetched_at").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
    createdAt: timestampMs("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("backlink_list_cache_query_unique").on(t.reportId, t.queryHash),
    index("backlink_list_cache_expiry_idx").on(t.expiresAt),
    index("backlink_list_cache_report_idx").on(t.reportId, t.dataset),
  ],
);

/** 날짜별 실제 보고서 집계. 전환 이후 추이와 신규·누락 계산에만 사용한다. */
export const backlinkSnapshots = sqliteTable(
  "backlink_snapshots",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    siteUrl: text("site_url").notNull(),
    scope: text("scope", { enum: ["site", "page"] }).notNull(),
    targetUrl: text("target_url"),
    provider: text("provider", { enum: ["bing-webmaster", "bing-csv", "common-crawl"] }).notNull(),
    snapshotDate: text("snapshot_date").notNull(),
    totalInboundLinks: integer("total_inbound_links"),
    linkedPages: integer("linked_pages"),
    capturedAt: timestampMs("captured_at").notNull(),
  },
  (t) => [
    uniqueIndex("backlink_snapshots_scope_date_unique").on(
      t.workspaceId,
      t.siteUrl,
      t.scope,
      t.targetUrl,
      t.provider,
      t.snapshotDate,
    ),
    index("backlink_snapshots_history_idx").on(t.workspaceId, t.siteUrl, t.capturedAt),
  ],
);

/** CSV 미리보기 원문. 커밋하지 않은 파일은 30분 뒤 정리한다. */
export const backlinkImportStaging = sqliteTable(
  "backlink_import_staging",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    fileSha256: text("file_sha256").notNull(),
    rawPayload: text("raw_payload").notNull(),
    headersPayload: text("headers_payload").notNull(),
    detectedMappingPayload: text("detected_mapping_payload").notNull(),
    rowCount: integer("row_count").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
    createdAt: timestampMs("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("backlink_import_staging_workspace_idx").on(t.workspaceId, t.createdAt),
    index("backlink_import_staging_expiry_idx").on(t.expiresAt),
  ],
);

/** 커밋된 CSV 인바운드 링크. 최대 10만 행을 페이지 단위로 조회한다. */
export const backlinkImportedLinks = sqliteTable(
  "backlink_imported_links",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => backlinkReportCaches.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url").notNull(),
    targetUrl: text("target_url").notNull(),
    sourceDomain: text("source_domain").notNull(),
    anchor: text("anchor"),
    linkCount: integer("link_count").notNull().default(1),
    createdAt: timestampMs("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("backlink_imported_links_row_unique").on(
      t.reportId,
      t.sourceUrl,
      t.targetUrl,
      t.anchor,
    ),
    index("backlink_imported_links_target_idx").on(t.reportId, t.targetUrl),
    index("backlink_imported_links_domain_idx").on(t.reportId, t.sourceDomain),
  ],
);

/**
 * 원천 4: 키워드 스코프의 시점 관측 JSON (Google Trends 시계열, 관련 쿼리 등).
 * serp_snapshots 와 같은 append-only 문법이며, 조회는 항상 스코프 내 최신 1건이다.
 * TTL 판정은 테이블이 아니라 조회 로직이 kind 별로 한다 (trend 계열 7일 등).
 */
export const keywordInsights = sqliteTable(
  "keyword_insights",
  {
    id: text("id").primaryKey(),
    keyword: text("keyword").notNull(),
    normalizedKeyword: text("normalized_keyword").notNull(),
    /** trends geo 스코프. 국가 코드(KR 등)를 명시한다 — 제공사가 geo 미지정 시 US 로 기본 처리하므로 빈 값은 쓰지 않는다. */
    countryCode: text("country_code").notNull(),
    kind: text("kind", {
      enum: [
        "trend_timeseries",
        "related_queries",
        "related_topics",
        "geo_interest",
        "related_searches",
        "people_also_ask",
      ],
    }).notNull(),
    /** kind 별 구조화 JSON. trend_timeseries 는 [{date, timestamp, value}] 형태. */
    payload: text("payload").notNull(),
    /** 데이터 출처. 삽입 시 명시 필수 (talordata-trends 등). */
    source: text("source").notNull(),
    capturedAt: timestampMs("captured_at").notNull(),
  },
  (t) => [
    index("keyword_insights_scope_idx").on(
      t.normalizedKeyword,
      t.countryCode,
      t.kind,
      t.capturedAt,
    ),
  ],
);

export type KeywordMetric = typeof keywordMetrics.$inferSelect;
export type SerpSnapshot = typeof serpSnapshots.$inferSelect;
export type ClickstreamEvent = typeof clickstreamEvents.$inferSelect;
export type LinkGraphEdge = typeof linkGraphEdges.$inferSelect;
export type BacklinkReportCache = typeof backlinkReportCaches.$inferSelect;
export type BacklinkListCache = typeof backlinkListCaches.$inferSelect;
export type BacklinkSnapshot = typeof backlinkSnapshots.$inferSelect;
export type BacklinkImportStage = typeof backlinkImportStaging.$inferSelect;
export type BacklinkImportedLink = typeof backlinkImportedLinks.$inferSelect;
export type KeywordInsight = typeof keywordInsights.$inferSelect;
