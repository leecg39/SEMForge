import {
  applyHtmlToPage,
  inScope,
  normalizeUrl,
  type CrawledPage,
  type CrawlContext,
  type CrawlInput,
  type CrawlOutcome,
} from "@/server/siteaudit/crawl";

/**
 * Firecrawl 수집 엔진.
 *
 * /v1/map 으로 대상 사이트의 URL 목록을 수집하고, 각 URL 을 /v1/scrape
 * (formats: ["rawHtml"])로 가져온 뒤 crawl.ts 의 검사 로직(applyHtmlToPage)을
 * 그대로 통과시킨다. 상태 코드는 Firecrawl 응답 metadata 의 statusCode 를 쓴다.
 *
 * 사용량(크레딧) 제한이 있는 무료 플랜을 고려해 스크레이프 동시 실행은 3으로
 * 낮추고, 429 응답에는 짧은 백오프 재시도를 둔다.
 */

const API_BASE = "https://api.firecrawl.dev/v1";
const MAP_TIMEOUT_MS = 30_000;
const SCRAPE_TIMEOUT_MS = 45_000;
const SCRAPE_CONCURRENCY = 3;
const RATE_LIMIT_RETRIES = 2;

interface FirecrawlMapResponse {
  success?: boolean;
  links?: unknown;
  error?: string;
}

interface FirecrawlScrapeResponse {
  success?: boolean;
  data?: {
    rawHtml?: string;
    html?: string;
    metadata?: {
      statusCode?: number;
      pageStatusCode?: number;
      sourceURL?: string;
      url?: string;
      error?: string;
    };
  };
  error?: string;
}

async function firecrawlFetch<T extends { error?: string }>(
  path: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as T | null;
      if (response.status === 429 && attempt < RATE_LIMIT_RETRIES) {
        // 레이트 리밋: 2s, 4s 백오프 후 같은 요청을 재시도한다.
        await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
        continue;
      }
      if (!response.ok) {
        throw new Error(
          `Firecrawl ${path} HTTP ${response.status}${payload?.error ? `: ${payload.error}` : ""}`
        );
      }
      if (!payload) throw new Error(`Firecrawl ${path} 응답을 해석할 수 없습니다`);
      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= RATE_LIMIT_RETRIES) throw lastError;
      // AbortError(시간 초과)는 재시도하지 않는다.
      if (lastError.name === "AbortError") throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error(`Firecrawl ${path} 요청 실패`);
}

/** /v1/map: 사이트의 URL 목록을 최대 limit 개 수집한다. */
async function mapSiteUrls(
  startUrl: string,
  limit: number,
  includeSubdomains: boolean,
  apiKey: string
): Promise<string[]> {
  const payload = await firecrawlFetch<FirecrawlMapResponse>(
    "/map",
    apiKey,
    { url: startUrl, limit, includeSubdomains },
    MAP_TIMEOUT_MS
  );
  if (payload.success === false) {
    throw new Error(`Firecrawl /map 실패${payload.error ? `: ${payload.error}` : ""}`);
  }
  if (!Array.isArray(payload.links)) return [];
  return payload.links.filter((link): link is string => typeof link === "string");
}

/** /v1/scrape: 단일 페이지를 가져와 CrawledPage 형태로 변환한다. */
async function scrapePage(url: string, apiKey: string, ctx: CrawlContext): Promise<CrawledPage> {
  const page: CrawledPage = {
    url,
    status: 0,
    isHtml: false,
    title: null,
    metaDescription: null,
    imagesMissingAlt: 0,
    internalLinks: [],
  };
  try {
    const payload = await firecrawlFetch<FirecrawlScrapeResponse>(
      "/scrape",
      apiKey,
      { url, formats: ["rawHtml"], onlyMainContent: false },
      SCRAPE_TIMEOUT_MS
    );
    if (payload.success === false || !payload.data) {
      throw new Error(payload.error ?? "Firecrawl scrape 실패");
    }
    const metadata = payload.data.metadata ?? {};
    page.status = metadata.statusCode ?? metadata.pageStatusCode ?? 200;
    // Firecrawl 이 따라간 최종 URL 로 표시/중복 판정을 통일한다.
    const finalUrl = metadata.sourceURL ?? metadata.url;
    if (finalUrl) {
      const normalized = normalizeUrl(finalUrl, url);
      if (normalized) page.url = normalized;
    }
    const html = payload.data.rawHtml ?? payload.data.html;
    if (html && page.status > 0 && page.status < 400) {
      applyHtmlToPage(page, html, ctx);
    }
    return page;
  } catch (error) {
    page.isHtml = false;
    page.fetchError =
      error instanceof Error && error.name === "AbortError"
        ? "시간 초과(45초)"
        : error instanceof Error
          ? error.message
          : String(error);
    return page;
  }
}

/**
 * Firecrawl 기반 크롤 실행기를 만든다.
 * run route 에서 FIRECRAWL_API_KEY 가 있을 때 runSiteAuditCampaign 에 주입한다.
 */
export function createFirecrawlCrawler(apiKey: string) {
  return async (input: CrawlInput): Promise<CrawlOutcome> => {
    const ctx: CrawlContext = { scope: input.scope, start: new URL(input.startUrl) };
    const mapped = await mapSiteUrls(
      input.startUrl,
      input.pageLimit,
      input.scope === "domain",
      apiKey
    );

    // 시작 URL 을 항상 포함하고, 범위 밖/중복 URL 을 걸러 pageLimit 까지만 scrape 한다.
    const seen = new Set<string>();
    const targets: string[] = [];
    const seed = normalizeUrl(input.startUrl, input.startUrl) ?? input.startUrl;
    seen.add(seed);
    targets.push(seed);
    for (const link of mapped) {
      if (targets.length >= input.pageLimit) break;
      const normalized = normalizeUrl(link, input.startUrl);
      if (!normalized || seen.has(normalized) || !inScope(normalized, ctx)) continue;
      seen.add(normalized);
      targets.push(normalized);
    }

    const pages: CrawledPage[] = [];
    const seenFinal = new Set<string>();
    let cursor = 0;
    await Promise.all(
      Array.from({ length: SCRAPE_CONCURRENCY }, async () => {
        for (;;) {
          const url = targets[cursor++];
          if (!url) return;
          const page = await scrapePage(url, apiKey, ctx);
          if (seenFinal.has(page.url)) continue;
          seenFinal.add(page.url);
          pages.push(page);
        }
      })
    );

    return {
      pages,
      engine: "firecrawl",
      firecrawl: {
        mappedUrls: mapped.length,
        scrapeFailures: pages.filter((page) => page.status === 0).length,
      },
    };
  };
}
