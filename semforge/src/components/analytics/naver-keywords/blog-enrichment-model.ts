// @TASK NAVER-KI-BLOG-UI-01 - 선택 키워드 블로그 보강 클라이언트 모델
// @SPEC user-approved-plan#3-d-authenticated-features
// @TEST src/components/analytics/naver-keywords/blog-enrichment-model.test.ts

export const BLOG_ENRICHMENT_ENDPOINT = "/api/analytics/naver-keywords/blog-enrichment";
export const MAX_BLOG_ENRICHMENT_KEYWORDS = 20;

export type BlogEnrichmentStatus = "live" | "unavailable" | "error";
export type BlogEnrichmentCache = "fresh" | "stale";

export interface BlogEnrichmentResultView {
  keyword: string;
  status: BlogEnrichmentStatus;
  total: number | null;
  source: string;
  cache: BlogEnrichmentCache;
  fetchedAt: string;
  reason: string | null;
}

export interface BlogEnrichmentView {
  generatedAt: string;
  results: BlogEnrichmentResultView[];
}

interface BlogEnrichmentRequest {
  url: typeof BLOG_ENRICHMENT_ENDPOINT;
  init: RequestInit;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStatus(value: unknown): value is BlogEnrichmentStatus {
  return value === "live" || value === "unavailable" || value === "error";
}

function isCache(value: unknown): value is BlogEnrichmentCache {
  return value === "fresh" || value === "stale";
}

function parseResult(value: unknown): BlogEnrichmentResultView | null {
  if (!isRecord(value) || typeof value.keyword !== "string" || !isRecord(value.blog)) return null;
  const blog = value.blog;
  if (
    !isStatus(blog.status)
    || !isCache(blog.cache)
    || typeof blog.source !== "string"
    || typeof blog.fetchedAt !== "string"
  ) {
    return null;
  }

  let total: number | null = null;
  if (blog.status === "live") {
    if (!isRecord(blog.data) || typeof blog.data.total !== "number" || !Number.isFinite(blog.data.total)) {
      return null;
    }
    total = blog.data.total;
  }

  return {
    keyword: value.keyword,
    status: blog.status,
    total,
    source: blog.source,
    cache: blog.cache,
    fetchedAt: blog.fetchedAt,
    reason: typeof blog.reason === "string" && blog.reason.length > 0 ? blog.reason : null,
  };
}

export function selectBlogEnrichmentKeywords(
  selectedKeywords: readonly string[],
): string[] {
  return selectedKeywords.slice(0, MAX_BLOG_ENRICHMENT_KEYWORDS);
}

export function buildBlogEnrichmentRequest(
  selectedKeywords: readonly string[],
): BlogEnrichmentRequest {
  const keywords = selectBlogEnrichmentKeywords(selectedKeywords);
  if (keywords.length === 0) {
    throw new Error("블로그 검색 보강에는 선택 키워드가 1개 이상 필요합니다.");
  }
  return {
    url: BLOG_ENRICHMENT_ENDPOINT,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ keywords }),
    },
  };
}

export function parseBlogEnrichmentEnvelope(payload: unknown): BlogEnrichmentView | null {
  if (!isRecord(payload) || !isRecord(payload.data)) return null;
  const report = payload.data;
  if (typeof report.generatedAt !== "string" || !Array.isArray(report.results)) return null;

  const results: BlogEnrichmentResultView[] = [];
  for (const result of report.results) {
    const parsed = parseResult(result);
    if (!parsed) return null;
    results.push(parsed);
  }
  return { generatedAt: report.generatedAt, results };
}
