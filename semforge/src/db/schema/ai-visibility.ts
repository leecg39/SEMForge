import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { auditColumns, workspaces } from "./platform";

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

export type AiVisibilityQuery = typeof aiVisibilityQueries.$inferSelect;
export type AiVisibilitySnapshot = typeof aiVisibilitySnapshots.$inferSelect;
