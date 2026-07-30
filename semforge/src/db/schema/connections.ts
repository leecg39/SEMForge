import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export type GscConnectionRow = typeof gscConnections.$inferSelect;
