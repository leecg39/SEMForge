import { ApiError } from "@/lib/api";

export type SiteAuditCrawlerUserAgent = "semforge" | "googlebot" | "bingbot";

export interface SiteAuditCrawlRules {
  allowPaths: string[];
  disallowPaths: string[];
  ignoreQueryParameters: string[];
}

const USER_AGENTS: Record<SiteAuditCrawlerUserAgent, string> = {
  semforge:
    "Mozilla/5.0 (compatible; SEMForgeSiteAuditBot/1.0; +http://localhost:3000/siteaudit)",
  googlebot:
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  bingbot:
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
};

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function normalizePathRule(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  try {
    const parsed = new URL(path, "https://rules.local");
    const normalized = parsed.pathname.replace(/\/{2,}/g, "/");
    return normalized.length > 1 && normalized.endsWith("/")
      ? normalized.replace(/\/+$/, "")
      : normalized;
  } catch {
    return null;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function parseCrawlRules(input: {
  allowPaths?: string | null;
  disallowPaths?: string | null;
  ignoreQueryParameters?: string | null;
}): SiteAuditCrawlRules {
  const paths = (value: string | null | undefined) =>
    unique(
      parseStringArray(value)
        .map(normalizePathRule)
        .filter((item): item is string => item !== null)
    );
  return {
    allowPaths: paths(input.allowPaths),
    disallowPaths: paths(input.disallowPaths),
    ignoreQueryParameters: unique(
      parseStringArray(input.ignoreQueryParameters)
        .map((item) => item.trim())
        .filter((item) => /^[A-Za-z0-9_.~-]+$/.test(item))
    ),
  };
}

function pathMatches(pathname: string, rule: string): boolean {
  if (rule === "/") return true;
  return pathname === rule || pathname.startsWith(`${rule}/`);
}

export function isPathAllowed(pathname: string, rules?: SiteAuditCrawlRules): boolean {
  if (!rules) return true;
  const normalized = pathname || "/";
  if (rules.disallowPaths.some((rule) => pathMatches(normalized, rule))) return false;
  if (rules.allowPaths.length === 0) return true;
  return rules.allowPaths.some((rule) => pathMatches(normalized, rule));
}

export function applyQueryRules(url: URL, rules?: SiteAuditCrawlRules): void {
  if (!rules || rules.ignoreQueryParameters.length === 0) return;
  for (const key of rules.ignoreQueryParameters) url.searchParams.delete(key);
  url.searchParams.sort();
}

export function resolveCrawlerUserAgent(value: string): string {
  if (value in USER_AGENTS) return USER_AGENTS[value as SiteAuditCrawlerUserAgent];
  throw new ApiError("VALIDATION_ERROR", "지원하지 않는 크롤러 사용자 에이전트입니다.");
}

export function supportsFirecrawlUserAgent(value: string): boolean {
  return value === "semforge";
}

export function firstAllowedPath(rules: SiteAuditCrawlRules): string {
  return rules.allowPaths.find((path) => path !== "/") ?? "/";
}
