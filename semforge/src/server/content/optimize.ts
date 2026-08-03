import { parse } from "node-html-parser";
import { ApiError } from "@/lib/api";
import type { ContentOptimizeRunInput } from "@/server/content/contracts";
import { firecrawlScrapeHtml } from "@/server/firecrawl/client";

export type OptimizationSourceDocument = {
  title: string;
  metaDescription: string;
  markdown: string;
};

export type OptimizationSourceProvenance = {
  provider: "firecrawl" | "direct_input";
  capturedAt: string;
  requestedUrl: string | null;
  finalUrl: string | null;
  status: number | null;
  characterCount: number;
};

const PRIVATE_HOST = /^(?:localhost|127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/iu;

export function assertPublicContentUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ApiError("VALIDATION_ERROR", "http/https URL만 가져올 수 있습니다.");
  }
  if (PRIVATE_HOST.test(url.hostname.toLowerCase())) {
    throw new ApiError("VALIDATION_ERROR", "내부 네트워크 주소는 가져올 수 없습니다.");
  }
  return url;
}

function markdownForElement(tagName: string, text: string): string {
  const clean = text.replace(/\s+/gu, " ").trim();
  if (!clean) return "";
  if (/^H[1-6]$/u.test(tagName)) return `${"#".repeat(Number(tagName.slice(1)))} ${clean}`;
  if (tagName === "LI") return `- ${clean}`;
  return clean;
}

export function extractOptimizationDocument(html: string, fallbackTitle: string): OptimizationSourceDocument {
  const root = parse(html, { lowerCaseTagName: false, comment: false });
  root.querySelectorAll("script,style,noscript,svg,nav,footer,form").forEach((node) => node.remove());
  const content = root.querySelector("article") ?? root.querySelector("main") ?? root.querySelector("body") ?? root;
  const blocks = content.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li")
    .map((node) => markdownForElement(node.tagName, node.textContent))
    .filter(Boolean);
  const markdown = [...new Set(blocks)].join("\n\n").trim();
  const title = root.querySelector("title")?.textContent.trim()
    || root.querySelector("h1")?.textContent.trim()
    || fallbackTitle;
  const metaDescription = root.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "";
  if (markdown.length < 200) {
    throw new ApiError("VALIDATION_ERROR", "Firecrawl이 최적화할 수 있는 충분한 본문을 반환하지 않았습니다. 직접 입력을 사용해 주세요.");
  }
  return { title: title.slice(0, 150), metaDescription: metaDescription.slice(0, 320), markdown };
}

function directSource(input: Extract<ContentOptimizeRunInput, { sourceType: "direct" }>) {
  const heading = input.sourceText.match(/^#\s+(.+)$/mu)?.[1]?.trim();
  const document = {
    title: (heading || input.title || "직접 입력 원문").slice(0, 150),
    metaDescription: "",
    markdown: input.sourceText,
  };
  return {
    document,
    provenance: {
      provider: "direct_input" as const,
      capturedAt: new Date().toISOString(),
      requestedUrl: null,
      finalUrl: null,
      status: null,
      characterCount: document.markdown.length,
    },
  };
}

export async function collectOptimizationSource(input: ContentOptimizeRunInput) {
  if (input.sourceType === "direct") return directSource(input);
  const url = assertPublicContentUrl(input.sourceUrl);
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) {
    throw new ApiError("VALIDATION_ERROR", "URL 가져오기를 위해 FIRECRAWL_API_KEY가 필요합니다. 직접 입력을 사용할 수 있습니다.");
  }
  const capturedAt = new Date().toISOString();
  let scraped;
  try {
    scraped = await firecrawlScrapeHtml(url.toString(), apiKey);
  } catch {
    throw new ApiError("INTERNAL", "Firecrawl URL 가져오기에 실패했습니다. 직접 입력으로 새 실행을 시작해 주세요.");
  }
  if (scraped.status >= 400 || !scraped.html) {
    throw new ApiError("VALIDATION_ERROR", `Firecrawl URL 가져오기에 실패했습니다. (HTTP ${scraped.status}) 직접 입력을 사용해 주세요.`);
  }
  const document = extractOptimizationDocument(scraped.html, url.hostname);
  return {
    document,
    provenance: {
      provider: "firecrawl" as const,
      capturedAt,
      requestedUrl: url.toString(),
      finalUrl: scraped.finalUrl ?? url.toString(),
      status: scraped.status,
      characterCount: document.markdown.length,
    },
  };
}
