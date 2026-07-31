import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { workspaces } from "./platform";

/**
 * On-Page SEO Checker 분석 결과 스토어.
 *
 * /api/onpage/analyze 가 TalorData SERP + Firecrawl 스크레이프로 계산한
 * 개선 아이디어를 (workspace, domain, url, keyword) 스코프당 최신 1건 upsert 한다.
 * SEO 대시보드의 온페이지 위젯이 도메인 단위로 집계해 표시한다.
 * 추정치가 아닌 실측 분석 결과만 저장한다.
 */

const timestampMs = (name: string) => integer(name, { mode: "timestamp_ms" });

export const onpageAnalyses = sqliteTable(
  "onpage_analyses",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** 분석 페이지의 정규화 루트 도메인. */
    domain: text("domain").notNull(),
    /** 분석 대상 페이지 URL (요청 원본). */
    url: text("url").notNull(),
    keyword: text("keyword").notNull(),
    countryCode: text("country_code").notNull().default("KR"),
    device: text("device", { enum: ["desktop", "mobile"] })
      .notNull()
      .default("desktop"),
    /** 분석 아이디어 JSON — OnPageIdea[] ({ code, severity, data }). */
    ideas: text("ideas").notNull().default("[]"),
    errorCount: integer("error_count").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),
    ideaCount: integer("idea_count").notNull().default(0),
    /** SERP 상위 결과에서 확인된 내 순위 (순위권 밖이면 null). */
    serpPosition: integer("serp_position"),
    source: text("source").notNull().default("onpage-analyzer"),
    capturedAt: timestampMs("captured_at").notNull(),
  },
  (t) => [
    uniqueIndex("onpage_analyses_scope_unique").on(
      t.workspaceId,
      t.domain,
      t.url,
      t.keyword,
      t.countryCode,
      t.device,
    ),
    index("onpage_analyses_domain_idx").on(t.workspaceId, t.domain, t.capturedAt),
  ],
);

export type OnpageAnalysis = typeof onpageAnalyses.$inferSelect;
