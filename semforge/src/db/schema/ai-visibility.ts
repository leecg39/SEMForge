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

/**
 * 답변을 관측할 수 있는 플랫폼.
 * 자격증명이 없는 플랫폼은 저장 대상이 아니라 UI에서 unavailable 로 표시한다.
 */
export const AI_ANSWER_PLATFORMS = [
  "google_aio",
  "google_ai_mode",
  "grok",
  "chatgpt",
  "gemini",
  "perplexity",
] as const;

/** 질의 의도 분류. 분류 전이면 null 로 두고 추정치를 채우지 않는다. */
export const AI_PROMPT_INTENTS = [
  "comparison",
  "support",
  "discovery",
  "research",
  "purchase",
  "improvement",
  "other",
] as const;

/**
 * AI 답변을 관측할 프롬프트.
 * 키워드가 아니라 자연어 질문이 단위다. 실과금 수집 대상이므로
 * tracked 화이트리스트로만 정기 수집해 비용 상한을 지킨다.
 */
export const aiVisibilityPrompts = sqliteTable(
  "ai_visibility_prompts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** 언급 여부를 판정할 대상 도메인 (정규화된 루트 도메인). */
    domain: text("domain").notNull(),
    prompt: text("prompt").notNull(),
    normalizedPrompt: text("normalized_prompt").notNull(),
    /** 주제 클러스터. 분류 전이면 null. */
    topic: text("topic"),
    /** 질의 의도. 분류 전이면 null. */
    intent: text("intent", { enum: AI_PROMPT_INTENTS }),
    countryCode: text("country_code").notNull().default("KR"),
    locale: text("locale").notNull().default("ko"),
    /** 정기 수집 대상 여부. 기본 false 로 두어 비용이 무단 증가하지 않게 한다. */
    tracked: integer("tracked", { mode: "boolean" }).notNull().default(false),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("ai_visibility_prompts_unique")
      .on(t.workspaceId, t.domain, t.normalizedPrompt, t.countryCode, t.locale)
      .where(sql`deleted_at IS NULL`),
    index("ai_visibility_prompts_domain_idx").on(t.workspaceId, t.domain, t.deletedAt),
    index("ai_visibility_prompts_tracked_idx").on(t.tracked, t.deletedAt),
  ],
);

/**
 * 프롬프트별 플랫폼 답변 관측. append-only 로 보존한다.
 * 판정할 수 없는 값은 0 이나 false 가 아니라 null 로 둔다(가짜 숫자 금지).
 */
export const aiVisibilityAnswers = sqliteTable(
  "ai_visibility_answers",
  {
    id: text("id").primaryKey(),
    promptId: text("prompt_id")
      .notNull()
      .references(() => aiVisibilityPrompts.id, { onDelete: "cascade" }),
    platform: text("platform", { enum: AI_ANSWER_PLATFORMS }).notNull(),
    /** 모델 식별자. 예: grok-4.5. SERP 기반 관측이면 null. */
    model: text("model"),
    /** 답변 본문. 제공사가 본문을 주지 않으면 null(판정 불가). */
    answerText: text("answer_text"),
    /** 답변에 대상 도메인/브랜드가 언급됐는가. 판정 불가면 null. */
    brandMentioned: integer("brand_mentioned", { mode: "boolean" }),
    /** 답변 내 언급 순서(1부터). 판정 불가면 null. */
    brandRank: integer("brand_rank"),
    /** 인용된 URL JSON 배열. */
    citedUrls: text("cited_urls").notNull().default("[]"),
    /** 인용된 도메인 JSON 배열. */
    citedDomains: text("cited_domains").notNull().default("[]"),
    /** 함께 언급된 경쟁 브랜드/도메인 JSON 배열. */
    mentionedBrands: text("mentioned_brands").notNull().default("[]"),
    /** 수집 출처 식별자. 예: talordata, xai. */
    source: text("source").notNull(),
    /** 실과금 호출이었는지. 캐시 히트는 false 로 남겨 비용을 추적한다. */
    billed: integer("billed", { mode: "boolean" }).notNull().default(false),
    capturedAt: timestampMs("captured_at").notNull(),
  },
  (t) => [
    index("ai_visibility_answers_prompt_idx").on(t.promptId, t.capturedAt),
    index("ai_visibility_answers_platform_idx").on(t.platform, t.capturedAt),
  ],
);

export type AiVisibilityQuery = typeof aiVisibilityQueries.$inferSelect;
export type AiVisibilitySnapshot = typeof aiVisibilitySnapshots.$inferSelect;
export type AiVisibilityPrompt = typeof aiVisibilityPrompts.$inferSelect;
export type AiVisibilityAnswer = typeof aiVisibilityAnswers.$inferSelect;
export type AiAnswerPlatform = (typeof AI_ANSWER_PLATFORMS)[number];
export type AiPromptIntent = (typeof AI_PROMPT_INTENTS)[number];
