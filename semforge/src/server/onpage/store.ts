import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { onpageAnalyses } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { AuthContext } from "@/lib/session";
import type {
  OnPageAnalysisReport,
  OnPageIdea,
  OnPageIdeaCode,
} from "@/server/onpage/analyze";

/**
 * On-Page 분석 결과 영속화 + 도메인 단위 집계.
 *
 * /api/onpage/analyze 성공 시 (workspace, domain, url, keyword, country, device)
 * 스코프당 최신 1건을 upsert 하고, SEO 대시보드 온페이지 위젯이
 * getOnpageDomainSummary 로 도메인 전체를 집계해 표시한다.
 */

export const ONPAGE_ANALYSIS_SOURCE = "onpage-analyzer";

/** 위젯 도넛의 아이디어 카테고리. 라벨 번역은 UI 가 담당한다 (서버는 키만). */
export type OnpageIdeaCategory =
  | "title"
  | "meta"
  | "structure"
  | "content"
  | "ux"
  | "status";

const CATEGORY_BY_CODE: Record<OnPageIdeaCode, OnpageIdeaCategory> = {
  title_missing: "title",
  title_no_keyword: "title",
  title_length: "title",
  meta_missing: "meta",
  meta_no_keyword: "meta",
  meta_length: "meta",
  h1_missing: "structure",
  h1_multiple: "structure",
  h1_no_keyword: "structure",
  content_thin: "content",
  keyword_absent_body: "content",
  images_alt_missing: "ux",
  fetch_failed: "status",
  not_ranked: "status",
};

export const ONPAGE_IDEA_CATEGORIES: readonly OnpageIdeaCategory[] = [
  "title",
  "meta",
  "structure",
  "content",
  "ux",
  "status",
];

export async function persistOnpageAnalysis(
  auth: AuthContext,
  report: OnPageAnalysisReport
): Promise<void> {
  const counts = { error: 0, warning: 0, idea: 0 };
  for (const idea of report.ideas) counts[idea.severity] += 1;
  const capturedAt = new Date();

  await db
    .insert(onpageAnalyses)
    .values({
      id: newId("onp"),
      workspaceId: auth.workspaceId,
      domain: report.domain,
      url: report.url,
      keyword: report.keyword,
      countryCode: report.countryCode.toUpperCase(),
      device: report.device,
      ideas: JSON.stringify(report.ideas),
      errorCount: counts.error,
      warningCount: counts.warning,
      ideaCount: counts.idea,
      serpPosition: report.yourRank?.position ?? null,
      source: ONPAGE_ANALYSIS_SOURCE,
      capturedAt,
    })
    .onConflictDoUpdate({
      target: [
        onpageAnalyses.workspaceId,
        onpageAnalyses.domain,
        onpageAnalyses.url,
        onpageAnalyses.keyword,
        onpageAnalyses.countryCode,
        onpageAnalyses.device,
      ],
      set: {
        ideas: sql`excluded.ideas`,
        errorCount: sql`excluded.error_count`,
        warningCount: sql`excluded.warning_count`,
        ideaCount: sql`excluded.idea_count`,
        serpPosition: sql`excluded.serp_position`,
        capturedAt: sql`excluded.captured_at`,
      },
    });
}

export interface OnpageDomainSummary {
  /** 분석된 (url, keyword) 조합 수 */
  analyses: number;
  /** 분석된 고유 페이지 수 */
  analyzedPages: number;
  totalIdeas: number;
  /** 카테고리별 아이디어 수 (0건 카테고리 제외) */
  categories: { category: OnpageIdeaCategory; count: number }[];
  /** 아이디어가 많은 상위 페이지 */
  topPages: { url: string; ideas: number; keywords: number }[];
  lastAnalyzedAt: string | null;
}

function parseIdeas(json: string): OnPageIdea[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? (value as OnPageIdea[]) : [];
  } catch {
    return [];
  }
}

/** 도메인의 온페이지 분석 집계. 분석 이력이 없으면 null (위젯이 설정 CTA 표시). */
export async function getOnpageDomainSummary(
  workspaceId: string,
  domain: string
): Promise<OnpageDomainSummary | null> {
  const rows = await db
    .select({
      url: onpageAnalyses.url,
      ideas: onpageAnalyses.ideas,
      capturedAt: onpageAnalyses.capturedAt,
    })
    .from(onpageAnalyses)
    .where(and(eq(onpageAnalyses.workspaceId, workspaceId), eq(onpageAnalyses.domain, domain)));
  if (rows.length === 0) return null;

  const categoryCounts = new Map<OnpageIdeaCategory, number>();
  const pageMap = new Map<string, { ideas: number; keywords: number }>();
  let totalIdeas = 0;
  let lastAnalyzedAt: Date | null = null;

  for (const row of rows) {
    const ideas = parseIdeas(row.ideas);
    totalIdeas += ideas.length;
    for (const idea of ideas) {
      const category = CATEGORY_BY_CODE[idea.code] ?? "status";
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
    const page = pageMap.get(row.url) ?? { ideas: 0, keywords: 0 };
    page.ideas += ideas.length;
    page.keywords += 1;
    pageMap.set(row.url, page);
    const captured = new Date(row.capturedAt);
    if (!lastAnalyzedAt || captured > lastAnalyzedAt) lastAnalyzedAt = captured;
  }

  return {
    analyses: rows.length,
    analyzedPages: pageMap.size,
    totalIdeas,
    categories: ONPAGE_IDEA_CATEGORIES.filter((category) => categoryCounts.has(category)).map(
      (category) => ({ category, count: categoryCounts.get(category)! })
    ),
    topPages: [...pageMap.entries()]
      .map(([url, entry]) => ({ url, ideas: entry.ideas, keywords: entry.keywords }))
      .toSorted((a, b) => b.ideas - a.ideas || a.url.localeCompare(b.url))
      .slice(0, 4),
    lastAnalyzedAt: lastAnalyzedAt ? lastAnalyzedAt.toISOString() : null,
  };
}
