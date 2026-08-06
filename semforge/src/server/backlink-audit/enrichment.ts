import { parse } from "node-html-parser";
import type { AuditLinkType, AuditStatus } from "@/server/backlink-audit/contracts";
import { normalizeBacklinkPageUrl } from "@/server/backlinks/target";

export interface AuditScrapeResult {
  finalUrl: string | null;
  status: number;
  html: string | null;
  error?: string | null;
}

export type AuditScraper = (url: string) => Promise<AuditScrapeResult>;

export interface LinkEvidence {
  auditStatus: AuditStatus;
  finalSourceUrl: string | null;
  sourceStatus: number | null;
  observedAnchor: string | null;
  linkType: AuditLinkType;
  isFollow: boolean | null;
  isNofollow: boolean | null;
  isSponsored: boolean | null;
  isUgc: boolean | null;
  fetchError: string | null;
}

function comparableUrl(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    url.hash = "";
    const normalized = normalizeBacklinkPageUrl(url.toString());
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  } catch {
    return null;
  }
}

function relTokens(value: string | undefined): Set<string> {
  return new Set((value ?? "").toLowerCase().split(/\s+/u).filter(Boolean));
}

function anchorText(node: ReturnType<typeof parse>["firstChild"]): string | null {
  if (!node || !("textContent" in node)) return null;
  const text = String(node.textContent).replace(/\s+/gu, " ").trim();
  return text ? text.slice(0, 1000) : null;
}

/** 실제 HTML에서 정확한 대상 URL을 가리키는 링크 요소를 찾는다. */
export function inspectBacklinkHtml(input: {
  html: string;
  sourceUrl: string;
  targetUrl: string;
}): Omit<LinkEvidence, "auditStatus" | "sourceStatus" | "finalSourceUrl" | "fetchError"> | null {
  const target = comparableUrl(input.targetUrl, input.targetUrl);
  if (!target) return null;
  const root = parse(input.html, { lowerCaseTagName: true, comment: false });

  for (const node of root.querySelectorAll("a[href],area[href]")) {
    const href = node.getAttribute("href");
    if (!href || comparableUrl(href, input.sourceUrl) !== target) continue;
    const rel = relTokens(node.getAttribute("rel"));
    const nofollow = rel.has("nofollow");
    return {
      observedAnchor: anchorText(node),
      linkType: node.tagName.toLowerCase() === "area" || node.querySelector("img") ? "image" : "text",
      isFollow: !nofollow,
      isNofollow: nofollow,
      isSponsored: rel.has("sponsored"),
      isUgc: rel.has("ugc"),
    };
  }

  for (const node of root.querySelectorAll("form[action]")) {
    const action = node.getAttribute("action");
    if (!action || comparableUrl(action, input.sourceUrl) !== target) continue;
    return {
      observedAnchor: null,
      linkType: "form",
      isFollow: true,
      isNofollow: false,
      isSponsored: false,
      isUgc: false,
    };
  }

  for (const node of root.querySelectorAll("iframe[src],frame[src]")) {
    const src = node.getAttribute("src");
    if (!src || comparableUrl(src, input.sourceUrl) !== target) continue;
    return {
      observedAnchor: null,
      linkType: "frame",
      isFollow: true,
      isNofollow: false,
      isSponsored: false,
      isUgc: false,
    };
  }
  return null;
}

export async function collectLinkEvidence(input: {
  sourceUrl: string;
  targetUrl: string;
  scraper: AuditScraper | null;
}): Promise<LinkEvidence> {
  if (!input.scraper) {
    return {
      auditStatus: "unavailable",
      finalSourceUrl: null,
      sourceStatus: null,
      observedAnchor: null,
      linkType: "unknown",
      isFollow: null,
      isNofollow: null,
      isSponsored: null,
      isUgc: null,
      fetchError: "FIRECRAWL_API_KEY가 없어 링크를 재확인하지 못했습니다.",
    };
  }
  try {
    const scraped = await input.scraper(input.sourceUrl);
    const sourceStatus = Number.isFinite(scraped.status) ? scraped.status : null;
    if (!scraped.html || !sourceStatus || sourceStatus >= 400) {
      return {
        auditStatus: "unavailable",
        finalSourceUrl: scraped.finalUrl,
        sourceStatus,
        observedAnchor: null,
        linkType: "unknown",
        isFollow: null,
        isNofollow: null,
        isSponsored: null,
        isUgc: null,
        fetchError: scraped.error ?? (sourceStatus ? `출처 페이지 HTTP ${sourceStatus}` : "출처 페이지를 가져오지 못했습니다."),
      };
    }
    const finalSourceUrl = scraped.finalUrl ?? input.sourceUrl;
    const match = inspectBacklinkHtml({
      html: scraped.html,
      sourceUrl: finalSourceUrl,
      targetUrl: input.targetUrl,
    });
    if (!match) {
      return {
        auditStatus: "missing",
        finalSourceUrl,
        sourceStatus,
        observedAnchor: null,
        linkType: "unknown",
        isFollow: null,
        isNofollow: null,
        isSponsored: null,
        isUgc: null,
        fetchError: null,
      };
    }
    return {
      ...match,
      auditStatus: "active",
      finalSourceUrl,
      sourceStatus,
      fetchError: null,
    };
  } catch (error) {
    return {
      auditStatus: "unavailable",
      finalSourceUrl: null,
      sourceStatus: null,
      observedAnchor: null,
      linkType: "unknown",
      isFollow: null,
      isNofollow: null,
      isSponsored: null,
      isUgc: null,
      fetchError: error instanceof Error ? error.message.slice(0, 500) : "출처 페이지 확인에 실패했습니다.",
    };
  }
}
