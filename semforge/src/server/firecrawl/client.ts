/**
 * Firecrawl 공용 HTTP 클라이언트.
 *
 * Site Audit(siteaudit/firecrawl.ts)과 On-Page SEO Checker 등 여러 기능이
 * 같은 인증/타임아웃/429 백오프 규칙을 공유하도록 분리했다.
 * 사용량(크레딧) 제한이 있는 무료 플랜을 고려해 429 응답에는 2s/4s 백오프
 * 재시도를 두고, 타임아웃(AbortError)은 재시도하지 않는다.
 */

/** 현재 공식 API 버전. FIRECRAWL_API_BASE_URL 로 셀프호스트/호환 엔드포인트를 지정할 수 있다. */
export const FIRECRAWL_API_BASE =
  process.env.FIRECRAWL_API_BASE_URL?.trim().replace(/\/$/, "") ||
  "https://api.firecrawl.dev/v2";
export const MAP_TIMEOUT_MS = 30_000;
export const SCRAPE_TIMEOUT_MS = 45_000;
const RATE_LIMIT_RETRIES = 2;

export interface FirecrawlClientOptions {
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface FirecrawlMapResponse {
  success?: boolean;
  links?: unknown;
  error?: string;
}

export interface FirecrawlScrapeResponse {
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

export async function firecrawlFetch<T extends { error?: string }>(
  path: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number,
  options: FirecrawlClientOptions = {},
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep =
    options.sleep ??
    ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${FIRECRAWL_API_BASE}${path}`, {
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
        await sleep(2_000 * (attempt + 1));
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

/** /v2/map: 사이트의 URL 목록을 최대 limit 개 수집한다. */
export async function firecrawlMapUrls(
  startUrl: string,
  limit: number,
  includeSubdomains: boolean,
  apiKey: string,
  options: FirecrawlClientOptions = {},
): Promise<string[]> {
  const payload = await firecrawlFetch<FirecrawlMapResponse>(
    "/map",
    apiKey,
    { url: startUrl, limit, includeSubdomains },
    MAP_TIMEOUT_MS,
    options,
  );
  if (payload.success === false) {
    throw new Error(`Firecrawl /map 실패${payload.error ? `: ${payload.error}` : ""}`);
  }
  if (!Array.isArray(payload.links)) return [];
  // v1은 string[], v2는 { url, title, description }[]를 반환한다.
  return payload.links.flatMap((link) => {
    if (typeof link === "string") return [link];
    if (
      typeof link === "object" &&
      link !== null &&
      "url" in link &&
      typeof link.url === "string"
    ) {
      return [link.url];
    }
    return [];
  });
}

export interface FirecrawlScrapedHtml {
  /** Firecrawl 이 따라간 최종 URL (없으면 null) */
  finalUrl: string | null;
  status: number;
  html: string | null;
}

/** /v2/scrape: 단일 페이지의 원본 HTML 을 가져온다. 실패 시 예외를 던진다. */
export async function firecrawlScrapeHtml(
  url: string,
  apiKey: string,
  options: FirecrawlClientOptions = {},
): Promise<FirecrawlScrapedHtml> {
  const payload = await firecrawlFetch<FirecrawlScrapeResponse>(
    "/scrape",
    apiKey,
    { url, formats: ["rawHtml"], onlyMainContent: false },
    SCRAPE_TIMEOUT_MS,
    options,
  );
  if (payload.success === false || !payload.data) {
    throw new Error(payload.error ?? "Firecrawl scrape 실패");
  }
  const metadata = payload.data.metadata ?? {};
  return {
    finalUrl: metadata.sourceURL ?? metadata.url ?? null,
    status: metadata.statusCode ?? metadata.pageStatusCode ?? 200,
    html: payload.data.rawHtml ?? payload.data.html ?? null,
  };
}
