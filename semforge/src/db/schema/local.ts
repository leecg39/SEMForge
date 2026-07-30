import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { auditColumns, workspaces } from "./platform";

/**
 * 로컬 툴킷 원천 스토어.
 * - gbp_connections: Google Business Profile OAuth 연결 정보 (실데이터 소스)
 * - map_rank_*: TalorData 로컬팩 실측 기반 지도 순위 추적
 */

const timestampMs = (name: string) => integer(name, { mode: "timestamp_ms" });

/** Google Business Profile OAuth 연결. 워크스페이스당 1개. */
export const gbpConnections = sqliteTable(
  "gbp_connections",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** 구글 계정 이메일 (토큰 정보 조회로 확인). */
    email: text("email"),
    /** GBP 계정 리소스 이름 (accounts/{id}). locations 조회에 사용. */
    accountName: text("account_name"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    /** access token 만료 시각(ms). */
    expiry: integer("expiry").notNull(),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("gbp_connections_workspace_unique")
      .on(t.workspaceId)
      .where(sql`deleted_at IS NULL`),
  ],
);

/** 지도 순위 추적 키워드. 사업체명과 검색어 조합으로 로컬팩 노출을 관측한다. */
export const mapRankKeywords = sqliteTable(
  "map_rank_keywords",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** 로컬팩에서 찾을 사업체명 (표시 이름 부분 일치로 판정). */
    businessName: text("business_name").notNull(),
    keyword: text("keyword").notNull(),
    normalizedKeyword: text("normalized_keyword").notNull(),
    /** 관측 지역 설명 (표시용). TalorData gl/hl 매개변수로 근사한다. */
    locationText: text("location_text").notNull().default(""),
    countryCode: text("country_code").notNull().default("KR"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("map_rank_keywords_unique")
      .on(t.workspaceId, t.businessName, t.normalizedKeyword, t.countryCode)
      .where(sql`deleted_at IS NULL`),
    index("map_rank_keywords_workspace_idx").on(t.workspaceId, t.deletedAt),
  ],
);

/** 키워드별 로컬팩 관측 스냅샷 (append-only). */
export const mapRankSnapshots = sqliteTable(
  "map_rank_snapshots",
  {
    id: text("id").primaryKey(),
    keywordId: text("keyword_id")
      .notNull()
      .references(() => mapRankKeywords.id, { onDelete: "cascade" }),
    localPackPresent: integer("local_pack_present", { mode: "boolean" })
      .notNull()
      .default(false),
    /** 로컬팩 내 사업체 순위 (1~3). 팩 안에 없거나 팩 자체가 없으면 null. */
    businessPosition: integer("business_position"),
    /** 관측된 로컬팩 업체 목록 JSON [{position,title,rating,reviewsCount,address}] */
    businesses: text("businesses").notNull().default("[]"),
    source: text("source").notNull().default("talordata"),
    capturedAt: timestampMs("captured_at").notNull(),
  },
  (t) => [index("map_rank_snapshots_keyword_idx").on(t.keywordId, t.capturedAt)],
);

export type GbpConnection = typeof gbpConnections.$inferSelect;
export type MapRankKeyword = typeof mapRankKeywords.$inferSelect;
export type MapRankSnapshot = typeof mapRankSnapshots.$inferSelect;
