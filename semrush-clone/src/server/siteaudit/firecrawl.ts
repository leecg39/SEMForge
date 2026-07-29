import {
  firecrawlMapUrls,
  firecrawlScrapeHtml,
} from "@/server/firecrawl/client";
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
 * Firecrawl 수집 엔진 (Site Audit 전용 어댑터).
 *
 * 공용 클라이언트(server/firecrawl/client.ts)의 /v1/map 으로 대상 사이트의
 * URL 목록을 수집하고, 각 URL 을 /v1/scrape (formats: ["rawHtml"])로 가져온 뒤
 * crawl.ts 의 검사 로직(applyHtmlToPage)을 그대로 통과시킨다.
 * 상태 코드는 Firecrawl 응답 metadata 의 statusCode 를 쓴다.
 */

const SCRAPE_CONCURRENCY = 3;

/** /v1/scrape 결과를 CrawledPage 형태로 변환한다. */
async function scrapePage(url: string, apiKey: string, ctx: CrawlContext): Promise<CrawledPage> {
  const page: CrawledPage = {
    url,
    status: 0,
    isHtml: false,
    title: null,
    metaDescription: null,
    imagesMissingAlt: 0,
    internalLinks: [],
    externalLinks: [],
  };
  try {
    const scraped = await firecrawlScrapeHtml(url, apiKey);
    page.status = scraped.status;
    // Firecrawl 이 따라간 최종 URL 로 표시/중복 판정을 통일한다.
    if (scraped.finalUrl) {
      const normalized = normalizeUrl(scraped.finalUrl, url);
      if (normalized) page.url = normalized;
    }
    if (scraped.html && page.status > 0 && page.status < 400) {
      applyHtmlToPage(page, scraped.html, ctx);
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
    const mapped = await firecrawlMapUrls(
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
