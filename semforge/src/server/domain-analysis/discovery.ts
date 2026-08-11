import { parse } from "node-html-parser";
import { normalizeDomain } from "@/lib/analytics/metrics";
import type { DomainSiteProfile } from "@/lib/analytics/types";
import { firecrawlMapUrls } from "@/server/firecrawl/client";
import { scrapePagesHtml, type ScrapedPage } from "@/server/firecrawl/scrape";

const MAX_DISCOVERED_URLS = 20;
const MAX_ANALYZED_PAGES = 5;
const MAX_HEADINGS = 12;
const MAX_KEYWORDS = 5;

const STOPWORDS = new Set([
  "about", "and", "are", "blog", "contact", "for", "from", "home", "more", "our",
  "page", "privacy", "read", "service", "services", "the", "this", "with", "your",
  "회사", "소개", "문의", "서비스", "자세히", "보기", "홈", "및", "더보기",
]);

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function phraseTokens(value: string): string[] {
  return cleanText(value)
    .toLocaleLowerCase("en-US")
    .match(/[가-힣]{2,16}|[a-z0-9][a-z0-9+.#-]{1,28}/g) ?? [];
}

function usefulPhrase(value: string): string | null {
  const tokens = phraseTokens(value).filter(
    (token) => !STOPWORDS.has(token) && !/^\d+$/.test(token),
  );
  if (tokens.length === 0) return null;
  return tokens.slice(0, 6).join(" ").slice(0, 100);
}

/**
 * 실제 페이지의 title/meta/headings/URL slug에서 검색 후보를 만든다.
 * 생성형 추측 없이 페이지에 존재한 문자열만 사용하며, 브랜드 토큰을 가장 먼저 둔다.
 */
export function extractDomainKeywordCandidates(
  pages: readonly ScrapedPage[],
  domain: string,
  limit = MAX_KEYWORDS,
): string[] {
  const normalized = normalizeDomain(domain);
  const brand = normalized.split(".")[0]?.replace(/[-_]+/g, " ") ?? "";
  const scores = new Map<string, number>();
  const add = (raw: string, weight: number) => {
    const phrase = usefulPhrase(raw);
    if (!phrase) return;
    scores.set(phrase, (scores.get(phrase) ?? 0) + weight);
  };

  if (brand) add(brand, 100);
  for (const page of pages) {
    if (!page.html) continue;
    const doc = parse(page.html, { lowerCaseTagName: true, comment: false });
    const title = cleanText(doc.querySelector("title")?.text ?? "");
    if (title) {
      for (const segment of title.split(/[|:–—]/)) add(segment, 20);
    }
    for (const meta of doc.querySelectorAll("meta")) {
      const name = meta.getAttribute("name")?.toLowerCase();
      const content = meta.getAttribute("content") ?? "";
      if (name === "keywords") {
        for (const keyword of content.split(",")) add(keyword, 18);
      } else if (name === "description") {
        add(content, 6);
      }
    }
    for (const heading of doc.querySelectorAll("h1, h2")) add(heading.text, 12);
    try {
      const slug = new URL(page.finalUrl).pathname
        .split("/")
        .filter(Boolean)
        .at(-1)
        ?.replace(/[-_]+/g, " ");
      if (slug) add(slug, 8);
    } catch {
      // finalUrl이 비정상인 실패 페이지는 후보에서 제외한다.
    }
  }

  return [...scores.entries()]
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([phrase]) => phrase)
    .slice(0, Math.max(1, limit));
}

export async function discoverDomainSite(
  domain: string,
  apiKey: string,
): Promise<DomainSiteProfile> {
  const normalized = normalizeDomain(domain);
  const requestedUrl = `https://${normalized}/`;
  const mapped = await firecrawlMapUrls(
    requestedUrl,
    MAX_DISCOVERED_URLS,
    true,
    apiKey,
  );
  const targets = [requestedUrl, ...mapped]
    .filter((url, index, list) => list.indexOf(url) === index)
    .slice(0, MAX_ANALYZED_PAGES);
  const pages = await scrapePagesHtml(targets, { apiKey, concurrency: 3 });
  const successful = pages.filter(
    (page) => page.engine === "firecrawl" && page.html && page.status > 0 && page.status < 400,
  );
  if (successful.length === 0) {
    const reason = pages.find((page) => page.error)?.error ?? "수집 가능한 HTML 페이지가 없습니다.";
    throw new Error(`Firecrawl 도메인 수집에 실패했습니다: ${reason}`);
  }

  const headings: string[] = [];
  let title: string | null = null;
  let metaDescription: string | null = null;
  let hasStructuredData = false;
  let imagesTotal = 0;
  let imagesMissingAlt = 0;
  for (const page of successful) {
    const doc = parse(page.html!, { lowerCaseTagName: true, comment: false });
    title ??= cleanText(doc.querySelector("title")?.text ?? "") || null;
    for (const meta of doc.querySelectorAll("meta")) {
      if (meta.getAttribute("name")?.toLowerCase() !== "description") continue;
      metaDescription ??= cleanText(meta.getAttribute("content") ?? "") || null;
    }
    for (const heading of doc.querySelectorAll("h1, h2")) {
      const text = cleanText(heading.text);
      if (text && !headings.includes(text) && headings.length < MAX_HEADINGS) headings.push(text);
    }
    hasStructuredData ||= doc.querySelector('script[type="application/ld+json"]') !== null;
    const images = doc.querySelectorAll("img");
    imagesTotal += images.length;
    imagesMissingAlt += images.filter((image) => image.getAttribute("alt") === undefined).length;
  }

  return {
    requestedUrl,
    finalUrl: successful[0]?.finalUrl ?? requestedUrl,
    title,
    metaDescription,
    pagesDiscovered: Math.max(mapped.length, targets.length),
    pagesAnalyzed: pages.length,
    successfulPages: successful.length,
    headings,
    keywordCandidates: extractDomainKeywordCandidates(successful, normalized),
    hasStructuredData,
    imagesTotal,
    imagesMissingAlt,
  };
}
