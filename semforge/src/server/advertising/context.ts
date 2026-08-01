import { parse } from "node-html-parser";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { scrapePageHtml } from "@/server/firecrawl/scrape";

export interface AdvertisingBrandContext {
  domain: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  headings: string[];
  excerpt: string;
  source: "firecrawl" | "direct" | "unavailable";
  error: string | null;
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export async function getAdvertisingBrandContext(domainInput: string): Promise<AdvertisingBrandContext> {
  const domain = normalizeDomain(domainInput);
  const requestedUrl = `https://${domain}`;
  const scraped = await scrapePageHtml(requestedUrl);
  if (!scraped.html) {
    return {
      domain,
      finalUrl: scraped.finalUrl || requestedUrl,
      title: null,
      description: null,
      headings: [],
      excerpt: "",
      source: "unavailable",
      error: scraped.error ?? (scraped.status ? `HTTP ${scraped.status}` : "페이지를 가져오지 못했습니다."),
    };
  }
  const root = parse(scraped.html, { lowerCaseTagName: true, comment: false });
  for (const element of root.querySelectorAll("script,style,noscript,template")) element.remove();
  const title = compact(root.querySelector("title")?.text ?? "") || null;
  const description =
    root
      .querySelectorAll("meta")
      .find((meta) => meta.getAttribute("name")?.toLowerCase() === "description")
      ?.getAttribute("content")
      ?.trim() || null;
  const headings = root
    .querySelectorAll("h1,h2")
    .map((heading) => compact(heading.text))
    .filter(Boolean)
    .slice(0, 12);
  return {
    domain,
    finalUrl: scraped.finalUrl || requestedUrl,
    title,
    description,
    headings,
    excerpt: compact(root.querySelector("body")?.text ?? root.text).slice(0, 4_000),
    source: scraped.engine,
    error: null,
  };
}

