import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { siteAuditCampaigns, siteAuditIssues, siteAuditPages } from "@/db/schema";
import { assertSameWorkspace } from "@/lib/rbac";
import type { AuthContext } from "@/lib/session";

/**
 * Site Audit 개요 대시보드용 집계.
 *
 * site_audit_pages 스냅샷(최근 크롤)과 site_audit_issues 를 합쳐
 * Semrush 개요 탭의 게이지/수치/상위 이슈/테마별 보고서/통계를 한 번에 만든다.
 */

const ISSUE_URL_CAP = 100;

export type ThemeKey =
  | "crawlability"
  | "https"
  | "coreWebVitals"
  | "performance"
  | "internalLinking"
  | "internationalSeo"
  | "markup"
  | "pageResources"
  | "jsRendering";

export interface ThemeScore {
  key: ThemeKey;
  /** 0~100 정수. 측정 불가 테마(CWV/성능/국제 SEO/JS 렌더링)는 null */
  score: number | null;
  /** 점수를 깎는 페이지 수 */
  affectedPages: number;
  /** 영향 페이지 URL 목록 (최대 100개) */
  urls: string[];
  /** false 면 실측 불가 테마 — UI 는 게이지 대신 상태 문구를 표시한다 */
  measurable: boolean;
}

export type IssueCategory = "crawling" | "meta" | "resources" | "links" | "other";

export interface TopIssueGroup {
  category: IssueCategory;
  count: number;
  issues: { severity: "error" | "warning" | "notice"; title: string; count: number }[];
}

export interface SiteAuditOverview {
  campaign: {
    id: string;
    name: string;
    domain: string;
    status: string;
    siteHealth: number | null;
    lastRunAt: string | null;
  };
  crawledPages: number;
  failedFetches: number;
  totals: { errors: number; warnings: number; notices: number };
  topIssues: TopIssueGroup[];
  themes: ThemeScore[];
  statistics: {
    depthDistribution: { depth: number; count: number }[];
    statusDistribution: { bucket: string; count: number }[];
    avgResponseMs: number | null;
    totalBytes: number;
  };
}

type PageRow = typeof siteAuditPages.$inferSelect;

function percent(good: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((good / total) * 100);
}

function is2xx(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

/** 분모: 성공적으로 수집된(2xx) 페이지. 실패/비 HTML 페이지로 점수가 오염되지 않게 한다. */
function okPages(rows: PageRow[]): PageRow[] {
  return rows.filter((row) => is2xx(row.statusCode));
}

function computeThemes(rows: PageRow[]): ThemeScore[] {
  const themes: ThemeScore[] = [];
  const ok = okPages(rows);

  // 크롤링 가능성: 2xx 페이지 비율 (4xx/5xx/수집 실패가 감점 요인)
  const uncrawled = rows.filter((row) => !is2xx(row.statusCode));
  themes.push({
    key: "crawlability",
    score: percent(rows.length - uncrawled.length, rows.length),
    affectedPages: uncrawled.length,
    urls: uncrawled.slice(0, ISSUE_URL_CAP).map((row) => row.url),
    measurable: true,
  });

  // HTTPS 구현: https URL 비율 (http/https 혼재 시 감점)
  const insecure = rows.filter((row) => !row.isHttps);
  themes.push({
    key: "https",
    score: percent(rows.length - insecure.length, rows.length),
    affectedPages: insecure.length,
    urls: insecure.slice(0, ISSUE_URL_CAP).map((row) => row.url),
    measurable: true,
  });

  // Core Web Vitals / 성능 / 국제 SEO / JS 렌더링: 크롤 데이터로 실측 불가
  for (const key of ["coreWebVitals", "performance", "internationalSeo"] as const) {
    themes.push({ key, score: null, affectedPages: 0, urls: [], measurable: false });
  }

  // 내부 링크: 범위 내 내부 링크를 2개 이상 보유한 2xx 페이지 비율
  const thinLinks = ok.filter((row) => row.internalLinks < 2);
  themes.push({
    key: "internalLinking",
    score: percent(ok.length - thinLinks.length, ok.length),
    affectedPages: thinLinks.length,
    urls: thinLinks.slice(0, ISSUE_URL_CAP).map((row) => row.url),
    measurable: true,
  });

  // 마크업: JSON-LD(structured data)를 보유한 2xx 페이지 비율
  const noMarkup = ok.filter((row) => !row.hasJsonLd);
  themes.push({
    key: "markup",
    score: percent(ok.length - noMarkup.length, ok.length),
    affectedPages: noMarkup.length,
    urls: noMarkup.slice(0, ISSUE_URL_CAP).map((row) => row.url),
    measurable: true,
  });

  // 페이지 리소스: alt 누락 이미지가 없는 2xx 페이지 비율
  const badResources = ok.filter((row) => row.imagesMissingAlt > 0);
  themes.push({
    key: "pageResources",
    score: percent(ok.length - badResources.length, ok.length),
    affectedPages: badResources.length,
    urls: badResources.slice(0, ISSUE_URL_CAP).map((row) => row.url),
    measurable: true,
  });

  themes.push({ key: "jsRendering", score: null, affectedPages: 0, urls: [], measurable: false });
  return themes;
}

/** 이슈 제목을 Semrush 카테고리로 분류한다. */
function categorizeIssue(title: string): IssueCategory {
  if (/상태 코드/.test(title)) return "crawling";
  if (/제목 태그|메타 설명/.test(title)) return "meta";
  if (/이미지|대체 텍스트/.test(title)) return "resources";
  if (/내부 링크/.test(title)) return "links";
  return "other";
}

const CATEGORY_ORDER: Record<IssueCategory, number> = {
  crawling: 0,
  meta: 1,
  links: 2,
  resources: 3,
  other: 4,
};

const SEVERITY_RANK = { error: 0, warning: 1, notice: 2 } as const;

export async function getSiteAuditOverview(
  auth: AuthContext,
  campaignId: string
): Promise<SiteAuditOverview> {
  const [campaign] = await db
    .select()
    .from(siteAuditCampaigns)
    .where(
      and(eq(siteAuditCampaigns.id, campaignId), isNull(siteAuditCampaigns.deletedAt))
    )
    .limit(1);
  assertSameWorkspace(auth, campaign, "사이트 진단 캠페인");

  const [pageRows, issueRows] = await Promise.all([
    db.select().from(siteAuditPages).where(eq(siteAuditPages.campaignId, campaign.id)),
    db
      .select({
        severity: siteAuditIssues.severity,
        title: siteAuditIssues.title,
        count: siteAuditIssues.count,
      })
      .from(siteAuditIssues)
      .where(eq(siteAuditIssues.campaignId, campaign.id)),
  ]);

  const totals = { errors: 0, warnings: 0, notices: 0 };
  for (const issue of issueRows) {
    if (issue.severity === "error") totals.errors += issue.count;
    else if (issue.severity === "warning") totals.warnings += issue.count;
    else totals.notices += issue.count;
  }

  const groups = new Map<IssueCategory, TopIssueGroup>();
  for (const issue of issueRows) {
    const category = categorizeIssue(issue.title);
    const group = groups.get(category) ?? { category, count: 0, issues: [] };
    group.count += issue.count;
    group.issues.push(issue);
    groups.set(category, group);
  }
  const topIssues = [...groups.values()]
    .map((group) => ({
      ...group,
      issues: group.issues.sort(
        (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count
      ),
    }))
    .sort(
      (a, b) => b.count - a.count || CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]
    );

  const depthMap = new Map<number, number>();
  const statusMap = new Map<string, number>();
  let responseSum = 0;
  let responseCount = 0;
  let totalBytes = 0;
  for (const row of pageRows) {
    depthMap.set(row.depth, (depthMap.get(row.depth) ?? 0) + 1);
    const bucket =
      row.statusCode === 0
        ? "failed"
        : row.statusCode >= 200 && row.statusCode < 300
          ? "2xx"
          : row.statusCode >= 300 && row.statusCode < 400
            ? "3xx"
            : row.statusCode >= 400 && row.statusCode < 500
              ? "4xx"
              : row.statusCode >= 500
                ? "5xx"
                : "other";
    statusMap.set(bucket, (statusMap.get(bucket) ?? 0) + 1);
    if (row.statusCode > 0) {
      responseSum += row.responseMs;
      responseCount += 1;
    }
    totalBytes += row.bytes;
  }

  const STATUS_ORDER = ["2xx", "3xx", "4xx", "5xx", "failed", "other"];

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      domain: campaign.domain,
      status: campaign.status,
      siteHealth: campaign.siteHealth,
      lastRunAt: campaign.lastRunAt ? campaign.lastRunAt.toISOString() : null,
    },
    crawledPages: pageRows.length,
    failedFetches: pageRows.filter((row) => row.statusCode === 0).length,
    totals,
    topIssues,
    themes: computeThemes(pageRows),
    statistics: {
      depthDistribution: [...depthMap.entries()]
        .map(([depth, count]) => ({ depth, count }))
        .sort((a, b) => a.depth - b.depth),
      statusDistribution: STATUS_ORDER.filter((bucket) => statusMap.has(bucket)).map(
        (bucket) => ({ bucket, count: statusMap.get(bucket)! })
      ),
      avgResponseMs: responseCount > 0 ? Math.round(responseSum / responseCount) : null,
      totalBytes,
    },
  };
}
