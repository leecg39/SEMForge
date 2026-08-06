import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { workspaces } from "./platform";

/**
 * 외부 서비스 OAuth 연결 (Google Search Console).
 *
 * 0006 마이그레이션과 1:1 로 대응한다. 로컬 단일 사용자 도구라
 * 워크스페이스 스코프 없이 최신 연결 1건만 유지하는 모델이다.
 * (GBP 연결은 워크스페이스 스코프가 필요해 local.ts 의 gbp_connections 를 쓴다)
 */

export const gscConnections = sqliteTable(
  "gsc_connections",
  {
    id: text("id").primaryKey(),
    /** webmasters.readonly scope 로는 이메일 조회가 안 될 수 있어 nullable */
    userEmail: text("user_email"),
    /** 대표 Search Console 속성 (sc-domain:… 또는 URL prefix) */
    siteUrl: text("site_url"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    /** 액세스 토큰 만료 시각 (ms epoch). 알 수 없으면 null */
    expiry: integer("expiry"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("gsc_connections_site_url_idx").on(t.siteUrl)],
);

/** Bing Webmaster 읽기 전용 OAuth 연결. 워크스페이스마다 한 계정만 연결한다. */
export const bingWebmasterConnections = sqliteTable(
  "bing_webmaster_connections",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    selectedSiteUrl: text("selected_site_url"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiry: integer("expiry"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("bing_webmaster_connections_workspace_unique").on(t.workspaceId),
    index("bing_webmaster_connections_site_idx").on(t.selectedSiteUrl),
  ],
);

/** OAuth state는 해시만 저장하며 10분 안에 한 번만 사용할 수 있다. */
export const bingWebmasterOauthStates = sqliteTable(
  "bing_webmaster_oauth_states",
  {
    id: text("id").primaryKey(),
    stateHash: text("state_hash").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    returnTo: text("return_to").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("bing_webmaster_oauth_states_hash_unique").on(t.stateHash),
    index("bing_webmaster_oauth_states_expiry_idx").on(t.expiresAt),
  ],
);

export type GscConnectionRow = typeof gscConnections.$inferSelect;
export type BingWebmasterConnectionRow = typeof bingWebmasterConnections.$inferSelect;
export type BingWebmasterOauthStateRow = typeof bingWebmasterOauthStates.$inferSelect;
