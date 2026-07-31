import { firecrawlScrapeHtml } from "@/server/firecrawl/client";

/**
 * 범용 단일 페이지 스크레이퍼.
 *
 * FIRECRAWL_API_KEY 가 있으면 Firecrawl /v2/scrape 를 우선 사용하고,
 * 키가 없거나 Firecrawl 이 실패하면 자체 fetch 로 폴백한다 — Site Audit 의
 * 엔진 선택 규칙과 동일한 정책을 단일 페이지 단위로 제공한다.
 * On-Page SEO Checker 처럼 "SERP 상위 페이지 몇 개 + 내 페이지"만 필요한
 * 기능은 이 헬퍼를 쓰고, 사이트 전체 크롤은 siteaudit/crawl.ts 를 쓴다.
 */

export const PAGE_FETCH_USER_AGENT =
  "Mozilla/5.0 (compatible; CloneSeoBot/1.0; +http://localhost:3000/on-page-seo-checker)";

const DIRECT_FETCH_TIMEOUT_MS = 15_000;
/** 파싱 비용을 제한하기 위해 본문은 앞부분만 읽는다 (crawl.ts 와 같은 정책). */
const MAX_HTML_BYTES = 800_000;
/**
 * On-Page 분석은 사용자가 입력한 URL 을 서버가 직접 가져오므로 SSRF 가드가 필요하다.
 * 사설/루프백/메타데이터 주소를 차단해 오픈 프록시 악용을 막는다.
 */
const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./,
  /^10\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
  /^::1$/,
  /^f[cd][0-9a-f]{2}:/i, // IPv6 ULA fc00::/7
  /^fe80:/i,            // link-local
];

function isPrivateHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  if (PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  return false;
}

function assertFetchableUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("올바른 URL 이 아닙니다.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("http/https URL 만 가져올 수 있습니다.");
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new Error("내부 네트워크 주소는 가져올 수 없습니다.");
  }
}

export interface ScrapedPage {
  requestedUrl: string;
  /** 리다이렉트를 따라간 최종 URL */
  finalUrl: string;
  status: number;
  html: string | null;
  engine: "firecrawl" | "direct";
  error?: string;
}

/** 응답 본문을 MAX_HTML_BYTES 까지만 읽는다. 초과분은 스트림을 취소한다. */
async function readCappedText(response: Response): Promise<string> {
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
      }
      if (received >= MAX_HTML_BYTES) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

/** 자체 fetch 폴백. HTML 이 아닌 콘텐츠는 html: null 로 반환한다. */
async function directFetchHtml(url: string): Promise<ScrapedPage> {
  try {
    assertFetchableUrl(url);
  } catch (error) {
    return {
      requestedUrl: url,
      finalUrl: url,
      status: 0,
      html: null,
      engine: "direct",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIRECT_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": PAGE_FETCH_USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ko,en;q=0.8",
      },
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(contentType)) {
      await response.body?.cancel().catch(() => undefined);
      return {
        requestedUrl: url,
        finalUrl: response.url || url,
        status: response.status,
        html: null,
        engine: "direct",
        error: "HTML 문서가 아닙니다.",
      };
    }
    // 리다이렉트를 따라간 최종 주소가 내부망이면 폐기한다 (리다이렉트 기반 SSRF 우회 방지).
    if (response.url) {
      try {
        assertFetchableUrl(response.url);
      } catch {
        return {
          requestedUrl: url,
          finalUrl: response.url,
          status: response.status,
          html: null,
          engine: "direct",
          error: "리다이렉트 대상이 내부 네트워크 주소입니다.",
        };
      }
    }
    const html = await readCappedText(response);
    return {
      requestedUrl: url,
      finalUrl: response.url || url,
      status: response.status,
      html,
      engine: "direct",
    };
  } catch (error) {
    return {
      requestedUrl: url,
      finalUrl: url,
      status: 0,
      html: null,
      engine: "direct",
      error:
        error instanceof Error && error.name === "AbortError"
          ? `시간 초과(${DIRECT_FETCH_TIMEOUT_MS / 1000}초)`
          : error instanceof Error
            ? error.message
            : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 단일 페이지 HTML 스크레이프.
 * apiKey 를 생략하면 환경변수 FIRECRAWL_API_KEY 를 사용하고,
 * 둘 다 없으면 처음부터 자체 fetch 로 동작한다.
 */
export async function scrapePageHtml(
  url: string,
  options?: { apiKey?: string }
): Promise<ScrapedPage> {
  const apiKey = options?.apiKey ?? process.env.FIRECRAWL_API_KEY?.trim();
  if (apiKey) {
    try {
      const scraped = await firecrawlScrapeHtml(url, apiKey);
      if (scraped.html && scraped.status > 0 && scraped.status < 400) {
        return {
          requestedUrl: url,
          finalUrl: scraped.finalUrl ?? url,
          status: scraped.status,
          html: scraped.html,
          engine: "firecrawl",
        };
      }
      // 4xx/5xx 나 빈 본문은 그대로 보고한다 (직접 fetch 로 재시도해도 같다).
      return {
        requestedUrl: url,
        finalUrl: scraped.finalUrl ?? url,
        status: scraped.status,
        html: scraped.html,
        engine: "firecrawl",
        error: scraped.status >= 400 ? `HTTP ${scraped.status}` : undefined,
      };
    } catch {
      // Firecrawl 자체 실패(네트워크/크레딧/타임아웃)는 자체 fetch 로 폴백한다.
      return directFetchHtml(url);
    }
  }
  return directFetchHtml(url);
}

/** 여러 URL 을 제한된 동시성으로 스크레이프한다 (기본 3 — Firecrawl 무료 플랜 배려). */
export async function scrapePagesHtml(
  urls: readonly string[],
  options?: { apiKey?: string; concurrency?: number }
): Promise<ScrapedPage[]> {
  const concurrency = Math.max(1, options?.concurrency ?? 3);
  const results: ScrapedPage[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
      for (;;) {
        const index = cursor++;
        const url = urls[index];
        if (!url) return;
        results[index] = await scrapePageHtml(url, options);
      }
    })
  );
  return results;
}
