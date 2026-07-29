import { parse } from "node-html-parser";
import { ApiError } from "@/lib/api";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { scrapePagesHtml, type ScrapedPage } from "@/server/firecrawl/scrape";
import type { SerpEngine } from "@/server/talordata/client";
import { collectKeywordSerp } from "@/server/talordata/collect";

/**
 * On-Page SEO Checker — 두 API 를 결합한 분석기.
 *
 *   1) TalorData SERP  : 타깃 키워드의 실시간 상위 결과 (24h TTL 캐시 적용)
 *   2) Firecrawl scrape: 내 페이지 + 상위 경쟁 페이지의 실제 HTML
 *      (FIRECRAWL_API_KEY 없으면 자체 fetch 폴백 — server/firecrawl/scrape.ts)
 *
 * 상위 경쟁 페이지의 온페이지 요소(제목·메타·H1·본문 분량·키워드 사용)를
 * 벤치마크 삼아 내 페이지와 비교하고, 개선 아이디어를 코드로 반환한다.
 * 아이디어 문구는 UI 에서 로케일별로 번역한다 (서버는 code + data 만 제공).
 */

const MAX_COMPETITORS = 5;
const DEFAULT_COMPETITORS = 4;
const MAX_HTML_CHARS = 800_000;

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const META_MIN = 70;
const META_MAX = 160;
/** 경쟁 중앙값 대비 이 비율보다 짧으면 thin content 로 본다. */
const THIN_CONTENT_RATIO = 0.7;

export type OnPageIdeaCode =
  | "fetch_failed"
  | "title_missing"
  | "title_no_keyword"
  | "title_length"
  | "meta_missing"
  | "meta_no_keyword"
  | "meta_length"
  | "h1_missing"
  | "h1_multiple"
  | "h1_no_keyword"
  | "content_thin"
  | "keyword_absent_body"
  | "images_alt_missing"
  | "not_ranked";

export type OnPageIdeaSeverity = "error" | "warning" | "idea";

export interface OnPageIdea {
  code: OnPageIdeaCode;
  severity: OnPageIdeaSeverity;
  /** 문구 조립에 필요한 수치 (길이, 벤치마크 등) */
  data?: Record<string, number | string | null>;
}

export interface OnPageElements {
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  h1: string | null;
  h1Count: number;
  wordCount: number;
  imagesTotal: number;
  imagesMissingAlt: number;
  keywordInTitle: boolean;
  keywordInMeta: boolean;
  keywordInH1: boolean;
  /** 본문 텍스트에서 키워드가 나타난 횟수 */
  keywordOccurrences: number;
}

export interface OnPageCompetitor extends OnPageElements {
  position: number;
  url: string;
  domain: string;
  serpTitle: string;
  fetched: boolean;
  scrapeEngine: "firecrawl" | "direct" | null;
  fetchError?: string;
}

export interface OnPageBenchmarks {
  /** 수집에 성공한 경쟁 페이지 수 */
  sampled: number;
  titleLength: number;
  metaDescriptionLength: number;
  wordCount: number;
  keywordOccurrences: number;
}

export interface OnPageAnalysisReport {
  url: string;
  finalUrl: string;
  domain: string;
  keyword: string;
  countryCode: string;
  device: "desktop" | "mobile";
  engine: SerpEngine;
  serpCapturedAt: string;
  serpFromCache: boolean;
  serpFeatures: string[];
  /** SERP 상위 결과에서 확인된 내 도메인 순위 */
  yourRank: { position: number; url: string } | null;
  page: OnPageElements & {
    status: number;
    scrapeEngine: "firecrawl" | "direct";
    fetchError?: string;
  };
  competitors: OnPageCompetitor[];
  benchmarks: OnPageBenchmarks | null;
  ideas: OnPageIdea[];
  passedChecks: number;
  totalChecks: number;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForMatch(value: string): string {
  return collapseWhitespace(value).toLowerCase();
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  for (;;) {
    index = haystack.indexOf(needle, index);
    if (index === -1) return count;
    count += 1;
    index += needle.length;
  }
}

function median(values: number[]): number {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

/** HTML 에서 온페이지 요소를 추출한다 (crawl.ts 와 같은 파서/용량 정책). */
export function parseOnPageElements(html: string, keyword: string): OnPageElements {
  const capped = html.length > MAX_HTML_CHARS ? html.slice(0, MAX_HTML_CHARS) : html;
  const doc = parse(capped, { lowerCaseTagName: true, comment: false });
  const target = normalizeForMatch(keyword);

  const titleElement = doc.querySelector("title");
  const title = titleElement ? collapseWhitespace(titleElement.text) || null : null;

  let metaDescription: string | null = null;
  for (const meta of doc.querySelectorAll("meta")) {
    if (meta.getAttribute("name")?.toLowerCase() !== "description") continue;
    const content = meta.getAttribute("content");
    if (content) metaDescription = collapseWhitespace(content) || null;
    break;
  }

  const h1Elements = doc.querySelectorAll("h1");
  const h1 = h1Elements.length > 0 ? collapseWhitespace(h1Elements[0].text) || null : null;

  let imagesTotal = 0;
  let imagesMissingAlt = 0;
  for (const img of doc.querySelectorAll("img")) {
    imagesTotal += 1;
    if (img.getAttribute("alt") === undefined) imagesMissingAlt += 1;
  }

  // 본문 텍스트: 스크립트/스타일 텍스트가 분량에 섞이지 않게 제거 후 추출한다.
  for (const element of doc.querySelectorAll("script,style,noscript,template")) {
    element.remove();
  }
  const bodyText = normalizeForMatch(doc.querySelector("body")?.text ?? doc.text);
  const wordCount = bodyText ? bodyText.split(" ").length : 0;

  return {
    title,
    titleLength: title?.length ?? 0,
    metaDescription,
    metaDescriptionLength: metaDescription?.length ?? 0,
    h1,
    h1Count: h1Elements.length,
    wordCount,
    imagesTotal,
    imagesMissingAlt,
    keywordInTitle: title ? normalizeForMatch(title).includes(target) : false,
    keywordInMeta: metaDescription
      ? normalizeForMatch(metaDescription).includes(target)
      : false,
    keywordInH1: h1 ? normalizeForMatch(h1).includes(target) : false,
    keywordOccurrences: countOccurrences(bodyText, target),
  };
}

const EMPTY_ELEMENTS: OnPageElements = {
  title: null,
  titleLength: 0,
  metaDescription: null,
  metaDescriptionLength: 0,
  h1: null,
  h1Count: 0,
  wordCount: 0,
  imagesTotal: 0,
  imagesMissingAlt: 0,
  keywordInTitle: false,
  keywordInMeta: false,
  keywordInH1: false,
  keywordOccurrences: 0,
};

function elementsFromScrape(scrape: ScrapedPage, keyword: string): OnPageElements {
  if (!scrape.html || scrape.status === 0 || scrape.status >= 400) return EMPTY_ELEMENTS;
  return parseOnPageElements(scrape.html, keyword);
}

/** 내 페이지 요소와 경쟁 벤치마크로 개선 아이디어 목록을 만든다. */
export function buildOnPageIdeas(input: {
  page: OnPageElements;
  pageStatus: number;
  benchmarks: OnPageBenchmarks | null;
  yourRank: number | null;
  serpResultCount: number;
}): { ideas: OnPageIdea[]; passedChecks: number; totalChecks: number } {
  const ideas: OnPageIdea[] = [];
  const { page, benchmarks } = input;

  if (input.pageStatus === 0 || input.pageStatus >= 400) {
    // 페이지 자체를 못 읽으면 나머지 검사는 의미가 없다.
    return {
      ideas: [{ code: "fetch_failed", severity: "error", data: { status: input.pageStatus } }],
      passedChecks: 0,
      totalChecks: 1,
    };
  }

  let totalChecks = 0;
  const check = (failed: boolean, idea: OnPageIdea) => {
    totalChecks += 1;
    if (failed) ideas.push(idea);
  };

  check(!page.title, { code: "title_missing", severity: "error" });
  if (page.title) {
    check(!page.keywordInTitle, { code: "title_no_keyword", severity: "warning" });
    check(page.titleLength < TITLE_MIN || page.titleLength > TITLE_MAX, {
      code: "title_length",
      severity: "idea",
      data: { length: page.titleLength, min: TITLE_MIN, max: TITLE_MAX },
    });
  }

  check(!page.metaDescription, { code: "meta_missing", severity: "warning" });
  if (page.metaDescription) {
    check(!page.keywordInMeta, { code: "meta_no_keyword", severity: "idea" });
    check(page.metaDescriptionLength < META_MIN || page.metaDescriptionLength > META_MAX, {
      code: "meta_length",
      severity: "idea",
      data: { length: page.metaDescriptionLength, min: META_MIN, max: META_MAX },
    });
  }

  check(page.h1Count === 0, { code: "h1_missing", severity: "warning" });
  if (page.h1Count > 0) {
    check(page.h1Count > 1, {
      code: "h1_multiple",
      severity: "idea",
      data: { count: page.h1Count },
    });
    check(!page.keywordInH1, { code: "h1_no_keyword", severity: "idea" });
  }

  check(page.keywordOccurrences === 0, { code: "keyword_absent_body", severity: "warning" });

  if (benchmarks && benchmarks.sampled > 0 && benchmarks.wordCount > 0) {
    check(page.wordCount < benchmarks.wordCount * THIN_CONTENT_RATIO, {
      code: "content_thin",
      severity: "warning",
      data: { wordCount: page.wordCount, benchmark: benchmarks.wordCount },
    });
  }

  check(page.imagesMissingAlt > 0, {
    code: "images_alt_missing",
    severity: "idea",
    data: { count: page.imagesMissingAlt, total: page.imagesTotal },
  });

  check(input.yourRank === null, {
    code: "not_ranked",
    severity: "idea",
    data: { results: input.serpResultCount },
  });

  return { ideas, passedChecks: totalChecks - ideas.length, totalChecks };
}

export async function analyzeOnPage(input: {
  url: string;
  keyword: string;
  countryCode: string;
  device: "desktop" | "mobile";
  engine?: SerpEngine;
  competitorCount?: number;
  forceRefresh?: boolean;
}): Promise<OnPageAnalysisReport> {
  let pageUrl: URL;
  try {
    pageUrl = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input.url) ? input.url : `https://${input.url}`);
    if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new ApiError("VALIDATION_ERROR", "유효한 페이지 URL 을 입력해 주세요.", {
      fields: { url: "예: https://example.com/page" },
    });
  }
  const yourDomain = normalizeDomain(pageUrl.hostname);
  const competitorCount = Math.max(
    1,
    Math.min(MAX_COMPETITORS, input.competitorCount ?? DEFAULT_COMPETITORS)
  );
  const engine = input.engine ?? "google";
  const countryCode = input.countryCode.toUpperCase();

  /* 1) SERP — TTL 캐시 덕에 같은 키워드 반복 분석은 크레딧을 쓰지 않는다. */
  const serp = await collectKeywordSerp({
    keyword: input.keyword,
    countryCode,
    device: input.device,
    engine,
    forceRefresh: input.forceRefresh,
  });

  const rankHit =
    serp.results.find(
      (item) => item.domain === yourDomain || item.domain.endsWith(`.${yourDomain}`)
    ) ?? null;

  /* 2) 경쟁 페이지 선정: 내 도메인 제외, 도메인당 1개(첫 등장)만. */
  const competitorTargets: typeof serp.results = [];
  const seenDomains = new Set<string>();
  for (const item of serp.results) {
    if (competitorTargets.length >= competitorCount) break;
    const domain = item.domain || normalizeDomain(item.link);
    if (!domain || domain === yourDomain || domain.endsWith(`.${yourDomain}`)) continue;
    if (seenDomains.has(domain)) continue;
    seenDomains.add(domain);
    competitorTargets.push(item);
  }

  /* 3) Firecrawl(또는 자체 fetch)로 내 페이지 + 경쟁 페이지를 스크레이프. */
  const scrapes = await scrapePagesHtml([
    pageUrl.toString(),
    ...competitorTargets.map((item) => item.link),
  ]);
  const [pageScrape, ...competitorScrapes] = scrapes;

  const pageElements = elementsFromScrape(pageScrape, input.keyword);
  const competitors: OnPageCompetitor[] = competitorTargets.map((item, index) => {
    const scrape = competitorScrapes[index];
    const fetched = Boolean(scrape.html && scrape.status > 0 && scrape.status < 400);
    return {
      position: item.position,
      url: item.link,
      domain: item.domain || normalizeDomain(item.link),
      serpTitle: item.title,
      fetched,
      scrapeEngine: scrape.status > 0 ? scrape.engine : null,
      fetchError: scrape.error,
      ...(fetched ? elementsFromScrape(scrape, input.keyword) : EMPTY_ELEMENTS),
    };
  });

  /* 4) 경쟁 벤치마크(중앙값) — 수집 성공한 페이지만 사용. */
  const sampled = competitors.filter((competitor) => competitor.fetched);
  const benchmarks: OnPageBenchmarks | null =
    sampled.length > 0
      ? {
          sampled: sampled.length,
          titleLength: median(sampled.map((row) => row.titleLength)),
          metaDescriptionLength: median(sampled.map((row) => row.metaDescriptionLength)),
          wordCount: median(sampled.map((row) => row.wordCount)),
          keywordOccurrences: median(sampled.map((row) => row.keywordOccurrences)),
        }
      : null;

  const { ideas, passedChecks, totalChecks } = buildOnPageIdeas({
    page: pageElements,
    pageStatus: pageScrape.status,
    benchmarks,
    yourRank: rankHit?.position ?? null,
    serpResultCount: serp.results.length,
  });

  return {
    url: pageUrl.toString(),
    finalUrl: pageScrape.finalUrl,
    domain: yourDomain,
    keyword: input.keyword,
    countryCode,
    device: input.device,
    engine,
    serpCapturedAt: serp.capturedAt.toISOString(),
    serpFromCache: serp.fromCache,
    serpFeatures: serp.features,
    yourRank: rankHit ? { position: rankHit.position, url: rankHit.link } : null,
    page: {
      ...pageElements,
      status: pageScrape.status,
      scrapeEngine: pageScrape.engine,
      fetchError: pageScrape.error,
    },
    competitors,
    benchmarks,
    ideas,
    passedChecks,
    totalChecks,
  };
}
