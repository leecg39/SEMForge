import { and, eq, isNull, ne } from "drizzle-orm";
import { parse } from "node-html-parser";
import { db } from "@/db/client";
import { siteAuditCampaigns, siteAuditIssues, siteAuditPages } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId } from "@/lib/ids";
import { assertSameWorkspace } from "@/lib/rbac";
import type { AuthContext } from "@/lib/session";
import {
  persistCrawlLinkEdges,
  type LinkGraphPersistStats,
} from "@/server/siteaudit/linkgraph";

/**
 * Site Audit 실제 크롤러.
 *
 * 시작 URL에서 같은 범위(crawlScope)의 링크를 BFS 로 따라가며 최대 pageLimit
 * 페이지까지 가져온 뒤, 페이지별로 Semrush 시드 이슈에 대응하는 검사를 수행한다.
 *   - HTTP 4xx/5xx          → error
 *   - <title> 없음/중복     → error
 *   - meta description 없음/중복 → warning
 *   - img alt 속성 누락     → warning
 *   - 내부 링크가 1개뿐     → notice
 *
 * 데모 목적상 robots.txt 는 차단하지 않고 pageLimit 안에서만 크롤한다.
 * 실 서비스라면 robots.txt 의 Disallow 와 crawl-delay 를 존중해야 한다.
 */

export const SITE_AUDIT_USER_AGENT =
  "Mozilla/5.0 (compatible; CloneSiteAuditBot/1.0; +http://localhost:3000/siteaudit)";

const FETCH_TIMEOUT_MS = 10_000;
const CONCURRENCY = 4;
export const MAX_PAGE_LIMIT = 500;
/** 방문 큐가 페이지 제한의 배수 이상 부풀지 않게 막는다. */
const VISITED_FACTOR = 4;
const ISSUE_DETAIL_CAP = 100;
/**
 * 수 MB 짜리 HTML 도 파싱 비용이 페이지당 수 초가 되므로, 본문은 앞부분만 읽는다.
 *
 * 단순 절단이 안전하다고 볼 수 없다: <head> 자체가 이 상한보다 큰 사이트가 실재한다
 * (uinus.co.kr 은 인라인 스크립트로 head 가 1.19MB). 그런 페이지를 800KB 에서 자르면
 * <body> 를 통째로 못 읽어 이미지/링크가 0 이 되고, <title>·meta description 까지
 * 놓쳐 "제목 태그가 없는 페이지" 같은 오탐이 만들어진다.
 * 그래서 </head> 를 확인할 때까지는 상한을 넘겨 읽고, HARD 상한에서만 강제로 끊는다.
 */
const MAX_HTML_BYTES = 800_000;
/** </head> 를 못 찾는 비정상 문서에서도 무한정 읽지 않도록 두는 절대 상한. */
const MAX_HTML_HARD_BYTES = 3_000_000;
/** </head> 직후에서 끊으면 <body> 가 통째로 비어 이미지/링크가 0 이 되므로 본문 몫을 남긴다. */
const MIN_BODY_BYTES = 400_000;
const HEAD_CLOSE_BYTES = new TextEncoder().encode("</head>");

type Severity = "error" | "warning" | "notice";

const SEVERITY_WEIGHT: Record<Severity, number> = {
  error: 5,
  warning: 2,
  notice: 1,
};

/** 흔한 이단 공용 접미사(co.kr 등). PSL 없이 eTLD+1 을 근사한다. */
const SECOND_LEVEL_SUFFIXES = new Set([
  "co.kr", "or.kr", "go.kr", "ac.kr", "ne.kr", "re.kr", "pe.kr",
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk",
  "co.jp", "ne.jp", "or.jp", "ac.jp", "go.jp",
  "com.au", "net.au", "org.au", "edu.au",
  "com.cn", "net.cn", "org.cn", "com.tw", "com.hk", "com.sg",
  "co.in", "com.br", "com.mx", "co.nz", "co.za", "com.tr",
  "com.ar", "com.co", "com.pe", "com.vn", "co.id", "com.ph", "com.my",
]);

/** eTLD+1 근사. uinus.co.kr → uinus.co.kr, sub.example.com → example.com */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  if (SECOND_LEVEL_SUFFIXES.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join(".");
  }
  return lastTwo;
}

const SKIPPABLE_EXTENSIONS =
  /\.(pdf|jpe?g|png|gif|svg|webp|avif|ico|css|js|mjs|map|xml|json|zip|gz|tar|rar|7z|mp[34]|mov|avi|wmv|webm|woff2?|ttf|eot|otf|docx?|xlsx?|pptx?|csv)$/i;

function isSkippablePath(pathname: string): boolean {
  return SKIPPABLE_EXTENSIONS.test(pathname);
}

/** 링크를 절대 URL로 정규화한다. 크롤 불가 형식이면 null. */
export function normalizeUrl(href: string, base: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  if (/^(javascript|mailto|tel|data|ftp|sms):/i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    if (isSkippablePath(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export interface CrawlContext {
  scope: "domain" | "subdomain" | "path";
  start: URL;
}

export function inScope(url: string, ctx: CrawlContext): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  const startHost = ctx.start.hostname.toLowerCase();
  if (ctx.scope === "domain") {
    const root = registrableDomain(startHost);
    return host === root || host.endsWith(`.${root}`);
  }
  if (ctx.scope === "subdomain") return host === startHost;
  if (host !== startHost) return false;
  const basePath = ctx.start.pathname.endsWith("/")
    ? ctx.start.pathname
    : `${ctx.start.pathname}/`;
  return parsed.pathname === ctx.start.pathname || parsed.pathname.startsWith(basePath);
}

export interface CrawledPage {
  url: string;
  status: number;
  isHtml: boolean;
  title: string | null;
  metaDescription: string | null;
  imagesTotal: number;
  imagesMissingAlt: number;
  /** <script type="application/ld+json"> 존재 여부 (간이 판별) */
  hasJsonLd: boolean;
  /** 수신한 응답 본문 바이트 (컷오프 포함) */
  bytes: number;
  /** fetch 시작~본문 수신 완료까지의 시간(ms) */
  responseMs: number;
  /** website BFS 깊이. sitemap/Firecrawl 수집은 경로 깊이 근사값 */
  depth: number;
  /** 범위 내 고유 내부 링크(자기 자신 제외) */
  internalLinks: string[];
  /** 다른 등록 도메인으로 나가는 외부 링크 — 링크 그래프(link_graph_edges) 적재용 */
  externalLinks: ExternalLink[];
  fetchError?: string;
}

/** 크롤 방문 전 초기값. fetchPage/scrapePage 가 같은 기본형을 공유한다. */
export function emptyCrawledPage(url: string): CrawledPage {
  return {
    url,
    status: 0,
    isHtml: false,
    title: null,
    metaDescription: null,
    imagesTotal: 0,
    imagesMissingAlt: 0,
    hasJsonLd: false,
    bytes: 0,
    responseMs: 0,
    depth: 0,
    internalLinks: [],
    externalLinks: [],
  };
}

/** BFS 를 타지 못하는 수집 경로(사이트맵/Firecrawl)의 depth 근사: 경로 세그먼트 수. */
export function approximatePathDepth(url: string): number {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).length;
  } catch {
    return 0;
  }
}

export interface ExternalLink {
  url: string;
  /** rel 에 nofollow/sponsored/ugc 가 없으면 follow 로 본다. */
  isFollow: boolean;
}

/** 링크 팜 페이지가 엣지 수를 폭증시키지 않도록 페이지당 외부 링크를 제한한다. */
const MAX_EXTERNAL_LINKS_PER_PAGE = 100;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * 파싱 상한. <head> 가 기본 상한보다 크면 </head> 까지는 포함시켜
 * <title>/meta description 을 놓치지 않게 한다 (readCappedText 와 같은 규칙).
 */
function headAwareParseLimit(html: string): number {
  const scanned = html.slice(0, MAX_HTML_HARD_BYTES).toLowerCase();
  const headEnd = scanned.indexOf("</head>");
  if (headEnd < 0 || headEnd < MAX_HTML_BYTES) return MAX_HTML_BYTES;
  return Math.min(headEnd + "</head>".length + MIN_BODY_BYTES, MAX_HTML_HARD_BYTES);
}

/** 바이트 배열에서 패턴 위치를 찾는다. 없으면 -1. */
function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * 응답 본문을 MAX_HTML_BYTES 까지 읽되, 그 지점까지 </head> 를 못 봤으면
 * </head> 가 나올 때까지(최대 MAX_HTML_HARD_BYTES) 더 읽는다. 초과분은 스트림을 취소한다.
 */
async function readCappedText(response: Response): Promise<{ text: string; bytes: number }> {
  if (!response.body) {
    const text = await response.text();
    return { text, bytes: new TextEncoder().encode(text).byteLength };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let headClosed = false;
  let headClosedAt = 0;
  // 청크 경계에 걸쳐 있는 </head> 도 놓치지 않도록 직전 꼬리를 이어 붙여 검사한다.
  let tail = new Uint8Array(0);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        if (!headClosed) {
          const probe = new Uint8Array(tail.length + value.length);
          probe.set(tail, 0);
          probe.set(value, tail.length);
          headClosed = indexOfBytes(probe, HEAD_CLOSE_BYTES) >= 0;
          if (headClosed) headClosedAt = received;
          tail = probe.subarray(Math.max(0, probe.length - (HEAD_CLOSE_BYTES.length - 1)));
        }
      }
      const enough = Math.max(MAX_HTML_BYTES, headClosedAt + MIN_BODY_BYTES);
      if ((received >= enough && headClosed) || received >= MAX_HTML_HARD_BYTES) {
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
  return {
    text: new TextDecoder("utf-8", { fatal: false }).decode(merged),
    bytes: received,
  };
}

/**
 * HTML 문자열을 파싱해 CrawledPage 의 검사 필드를 채운다.
 * 자체 크롤러(fetchPage)와 Firecrawl 스크레이프 경로가 동일한 검사 로직을 공유한다.
 * 파싱 성공 후에만 내용 검사 대상(isHtml)으로 표시해, 본문 읽기/파싱 실패가
 * missing title 같은 오탐을 만들지 않도록 한다.
 */
export function applyHtmlToPage(page: CrawledPage, html: string, ctx: CrawlContext): void {
  const capped = html.length > MAX_HTML_BYTES ? html.slice(0, headAwareParseLimit(html)) : html;
  const doc = parse(capped, { lowerCaseTagName: true, comment: false });
  page.isHtml = true;

  const titleElement = doc.querySelector("title");
  const title = titleElement ? collapseWhitespace(titleElement.text) : "";
  page.title = title || null;

  for (const meta of doc.querySelectorAll("meta")) {
    if (meta.getAttribute("name")?.toLowerCase() !== "description") continue;
    const content = meta.getAttribute("content");
    if (content) page.metaDescription = collapseWhitespace(content) || null;
    break;
  }

  const images = doc.querySelectorAll("img");
  let missingAlt = 0;
  for (const img of images) {
    if (img.getAttribute("alt") === undefined) missingAlt += 1;
  }
  page.imagesTotal = images.length;
  page.imagesMissingAlt = missingAlt;

  page.hasJsonLd = doc.querySelector('script[type="application/ld+json"]') !== null;

  const links = new Set<string>();
  const external = new Map<string, boolean>();
  const startRoot = registrableDomain(ctx.start.hostname.toLowerCase());
  for (const anchor of doc.querySelectorAll("a")) {
    const href = anchor.getAttribute("href");
    if (!href) continue;
    const normalized = normalizeUrl(href, page.url);
    if (!normalized || normalized === page.url) continue;
    if (inScope(normalized, ctx)) {
      links.add(normalized);
      continue;
    }
    // 외부 링크: 같은 등록 도메인(서브도메인/경로 범위 밖)은 백링크 엣지로 치지 않는다.
    let host = "";
    try {
      host = new URL(normalized).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (!host || registrableDomain(host) === startRoot) continue;
    if (!external.has(normalized) && external.size >= MAX_EXTERNAL_LINKS_PER_PAGE) continue;
    const rel = anchor.getAttribute("rel")?.toLowerCase() ?? "";
    const isFollow = !/\b(?:nofollow|sponsored|ugc)\b/.test(rel);
    // 같은 URL 이 follow/nofollow 로 중복 등장하면 follow 를 우선한다.
    external.set(normalized, (external.get(normalized) ?? false) || isFollow);
  }
  page.internalLinks = [...links];
  page.externalLinks = [...external.entries()].map(([url, isFollow]) => ({ url, isFollow }));
}

async function fetchPage(url: string, ctx: CrawlContext): Promise<CrawledPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const page = emptyCrawledPage(url);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": SITE_AUDIT_USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ko,en;q=0.8",
      },
    });
    page.status = response.status;
    // 리다이렉트를 따라간 최종 URL 로 표시/중복 판정을 통일한다 (apex↔www 중복 방지).
    if (response.url) {
      const finalUrl = normalizeUrl(response.url, url);
      if (finalUrl) page.url = finalUrl;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(contentType)) {
      await response.body?.cancel().catch(() => undefined);
      page.responseMs = Date.now() - startedAt;
      return page;
    }
    const { text, bytes } = await readCappedText(response);
    page.bytes = bytes;
    page.responseMs = Date.now() - startedAt;
    applyHtmlToPage(page, text, ctx);
    return page;
  } catch (error) {
    page.isHtml = false;
    page.fetchError =
      error instanceof Error && error.name === "AbortError"
        ? "시간 초과(10초)"
        : error instanceof Error
          ? error.message
          : String(error);
    return page;
  } finally {
    clearTimeout(timer);
  }
}

/** robots.txt 의 Sitemap 지시와 기본 경로에서 사이트맵 URL 후보를 모은다. */
async function discoverSitemapUrls(origin: string): Promise<string[]> {
  const candidates = [`${origin}/sitemap.xml`];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const robots = await fetch(`${origin}/robots.txt`, {
      signal: controller.signal,
      headers: { "user-agent": SITE_AUDIT_USER_AGENT },
    }).finally(() => clearTimeout(timer));
    if (robots.ok) {
      const text = await robots.text();
      for (const line of text.split("\n")) {
        const match = /^sitemap:\s*(\S+)\s*$/i.exec(line.trim());
        if (match?.[1]) candidates.push(match[1]);
      }
    }
  } catch {
    // robots.txt 가 없어도 기본 sitemap.xml 로 진행한다.
  }
  return [...new Set(candidates)];
}

async function fetchSitemapLocs(sitemapUrl: string, depth = 0): Promise<string[]> {
  if (depth > 2) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(sitemapUrl, {
      signal: controller.signal,
      headers: { "user-agent": SITE_AUDIT_USER_AGENT, accept: "application/xml,text/xml,*/*" },
    }).finally(() => clearTimeout(timer));
    if (!response.ok) return [];
    const xml = await response.text();
    const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1]!);
    const isIndex = /<sitemapindex/i.test(xml);
    if (!isIndex) return locs;
    // 사이트맵 인덱스면 하위 사이트맵을 최대 5개까지 따라간다.
    const nested = await Promise.all(
      locs.slice(0, 5).map((child) => fetchSitemapLocs(child, depth + 1))
    );
    return nested.flat();
  } catch {
    return [];
  }
}

export interface CrawlInput {
  startUrl: string;
  scope: CrawlContext["scope"];
  pageLimit: number;
  source: "website" | "sitemap";
}

export interface CrawlOutcome {
  pages: CrawledPage[];
  /** sitemap 소스가 비어 website BFS 로 대체됐을 때 안내 메시지 */
  sourceNote?: string;
  /** 어떤 수집 엔진으로 크롤했는지 */
  engine?: "firecrawl" | "self";
  /** Firecrawl 경유일 때 수집 메타 정보 */
  firecrawl?: { mappedUrls: number; scrapeFailures: number };
}

async function crawlSite(input: CrawlInput): Promise<CrawlOutcome> {
  const ctx: CrawlContext = { scope: input.scope, start: new URL(input.startUrl) };

  if (input.source === "sitemap") {
    const origin = ctx.start.origin;
    const sitemapUrls = await discoverSitemapUrls(origin);
    const collected = new Set<string>();
    for (const sitemapUrl of sitemapUrls) {
      for (const loc of await fetchSitemapLocs(sitemapUrl)) {
        const normalized = normalizeUrl(loc, input.startUrl);
        if (normalized && inScope(normalized, ctx)) collected.add(normalized);
        if (collected.size >= input.pageLimit) break;
      }
      if (collected.size >= input.pageLimit) break;
    }
    if (collected.size > 0) {
      const targets = [...collected].slice(0, input.pageLimit);
      const pages: CrawledPage[] = [];
      const seenFinal = new Set<string>();
      let cursor = 0;
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          for (;;) {
            const url = targets[cursor++];
            if (!url) return;
            const page = await fetchPage(url, ctx);
            if (seenFinal.has(page.url)) continue;
            seenFinal.add(page.url);
            // 사이트맵 수집은 BFS 가 아니므로 경로 깊이로 근사한다.
            page.depth = approximatePathDepth(page.url);
            pages.push(page);
          }
        })
      );
      return { pages };
    }
    // 사이트맵을 찾지 못하면 웹사이트 링크 크롤로 대체한다.
    const fallback = await crawlSite({ ...input, source: "website" });
    return { ...fallback, sourceNote: "사이트맵을 찾지 못해 웹사이트 링크 크롤로 대체했습니다." };
  }

  const visited = new Set<string>();
  /** BFS 큐: 각 항목에 시드로부터의 클릭 깊이를 함께 저장한다. */
  const queue: { url: string; depth: number }[] = [];
  const seed = normalizeUrl(input.startUrl, input.startUrl) ?? input.startUrl;
  visited.add(seed);
  queue.push({ url: seed, depth: 0 });

  const pages: CrawledPage[] = [];
  /** 리다이렉트 후 최종 URL 기준 중복 크롤 방지 */
  const seenFinal = new Set<string>();
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      if (pages.length >= input.pageLimit) return;
      const item = queue[cursor++];
      if (!item) return;
      const page = await fetchPage(item.url, ctx);
      if (seenFinal.has(page.url)) continue;
      seenFinal.add(page.url);
      page.depth = item.depth;
      pages.push(page);
      if (!page.isHtml || page.status >= 400) continue;
      for (const link of page.internalLinks) {
        if (visited.size >= input.pageLimit * VISITED_FACTOR) break;
        if (visited.has(link) || seenFinal.has(link)) continue;
        visited.add(link);
        queue.push({ url: link, depth: item.depth + 1 });
      }
    }
  });
  await Promise.all(workers);
  return { pages: pages.slice(0, input.pageLimit) };
}

export interface IssueDraft {
  severity: Severity;
  title: string;
  urls: string[];
}

/** 크롤 결과를 Semrush 시드 이슈 제목에 대응하는 검사로 집계한다. */
export function analyzePages(pages: CrawledPage[]): IssueDraft[] {
  const issues = new Map<string, IssueDraft>();
  const add = (severity: Severity, title: string, url: string) => {
    const key = `${severity}:${title}`;
    const draft = issues.get(key) ?? { severity, title, urls: [] };
    draft.urls.push(url);
    issues.set(key, draft);
  };

  const byTitle = new Map<string, number>();
  const byDescription = new Map<string, number>();
  for (const page of pages) {
    if (!page.isHtml || page.status === 0 || page.status >= 400) continue;
    if (page.title) byTitle.set(page.title, (byTitle.get(page.title) ?? 0) + 1);
    if (page.metaDescription) {
      byDescription.set(page.metaDescription, (byDescription.get(page.metaDescription) ?? 0) + 1);
    }
  }

  for (const page of pages) {
    if (page.status >= 400 && page.status < 500) {
      add("error", "4xx 상태 코드를 반환하는 페이지", page.url);
      continue;
    }
    if (page.status >= 500) {
      add("error", "5xx 상태 코드를 반환하는 페이지", page.url);
      continue;
    }
    if (!page.isHtml || page.status === 0) continue;

    if (!page.title) {
      add("error", "제목 태그가 없는 페이지", page.url);
    } else if ((byTitle.get(page.title) ?? 0) > 1) {
      add("error", "제목 태그가 중복된 페이지", page.url);
    }

    if (!page.metaDescription) {
      add("warning", "메타 설명이 없는 페이지", page.url);
    } else if ((byDescription.get(page.metaDescription) ?? 0) > 1) {
      add("warning", "메타 설명이 중복된 페이지", page.url);
    }

    if (page.imagesMissingAlt > 0) {
      add("warning", "이미지에 대체 텍스트 없음", page.url);
    }
    if (page.internalLinks.length === 1) {
      add("notice", "내부 링크가 1개뿐인 페이지", page.url);
    }
  }

  const rank: Record<Severity, number> = { error: 0, warning: 1, notice: 2 };
  return [...issues.values()].sort(
    (a, b) => rank[a.severity] - rank[b.severity] || b.urls.length - a.urls.length
  );
}

/**
 * Site Health = (1 - 가중치(error 5, warning 2, notice 1) × 이슈 수 / 검사 페이지 수) × 100.
 *
 * "이슈 수"는 site_audit_issues 에 적재되는 이슈 행(종류) 수로 해석한다.
 * 페이지 건수 합산으로 해석하면 이슈가 있는 페이지가 20%만 돼도 0 점으로 수렴해
 * 소규모 크롤에서 점수가 항상 0 이 되므로, 행 기준이 0~100 범위를 유지한다.
 */
export function computeSiteHealth(issues: IssueDraft[], crawledPages: number): number {
  if (crawledPages <= 0) return 0;
  const weighted = issues.reduce((sum, issue) => sum + SEVERITY_WEIGHT[issue.severity], 0);
  return Math.max(0, Math.min(100, Math.round((1 - weighted / crawledPages) * 100)));
}

export interface SiteAuditRunReport {
  campaignId: string;
  campaignName: string;
  domain: string;
  crawledPages: number;
  failedFetches: number;
  siteHealth: number;
  durationMs: number;
  finishedAt: string;
  sourceNote?: string;
  crawlEngine: "firecrawl" | "self";
  firecrawl?: { mappedUrls: number; scrapeFailures: number };
  /** 크롤에서 추출해 link_graph_edges 에 적재한 외부 링크 엣지 통계 */
  linkGraph?: { edges: number; targetDomains: number };
  totals: { errors: number; warnings: number; notices: number };
  issues: { severity: Severity; title: string; count: number; pages: string[] }[];
}

export type CrawlExecutor = (input: CrawlInput) => Promise<CrawlOutcome>;

export interface RunSiteAuditOptions {
  /** 지정하면 자체 BFS 대신 이 수집 엔진을 먼저 사용하고, 실패 시 자체 크롤러로 폴백한다. */
  crawler?: CrawlExecutor;
}

/** 메타 설명 중복 그룹 키는 길이가 길 수 있어 앞부분만 저장한다. */
const META_DUP_KEY_LEN = 300;

/**
 * 크롤 페이지를 site_audit_pages 행으로 변환한다.
 * 제목/메타 설명 중복 여부는 같은 크롤 안에서의 그룹 카운트로 판정한다.
 */
export function buildAuditPageRows(pages: CrawledPage[]) {
  const byTitle = new Map<string, number>();
  const byMeta = new Map<string, number>();
  for (const page of pages) {
    if (page.title) byTitle.set(page.title, (byTitle.get(page.title) ?? 0) + 1);
    if (page.metaDescription) {
      byMeta.set(page.metaDescription, (byMeta.get(page.metaDescription) ?? 0) + 1);
    }
  }
  return pages.map((page) => ({
    url: page.url,
    statusCode: page.status,
    title: page.title,
    hasTitle: Boolean(page.title),
    titleDup: page.title !== null && (byTitle.get(page.title) ?? 0) > 1,
    metaDescriptionPresent: Boolean(page.metaDescription),
    metaDupKey:
      page.metaDescription !== null && (byMeta.get(page.metaDescription) ?? 0) > 1
        ? page.metaDescription.slice(0, META_DUP_KEY_LEN)
        : null,
    imagesTotal: page.imagesTotal,
    imagesMissingAlt: page.imagesMissingAlt,
    internalLinks: page.internalLinks.length,
    isHttps: page.url.startsWith("https://"),
    hasJsonLd: page.hasJsonLd,
    bytes: page.bytes,
    responseMs: page.responseMs,
    depth: page.depth,
  }));
}

/** 캠페인의 이전 페이지 스냅샷을 지우고 최근 크롤 결과로 교체한다. */
async function persistAuditPages(campaignId: string, pages: CrawledPage[], now: Date) {
  await db.delete(siteAuditPages).where(eq(siteAuditPages.campaignId, campaignId));
  if (pages.length === 0) return;
  await db.insert(siteAuditPages).values(
    buildAuditPageRows(pages).map((row) => ({
      id: newId("sap"),
      campaignId,
      ...row,
      createdAt: now,
    }))
  );
}

/** 캠페인 크롤을 실행하고 결과를 site_audit_issues / site_audit_campaigns 에 저장한다. */
export async function runSiteAuditCampaign(
  auth: AuthContext,
  campaignId: string,
  options?: RunSiteAuditOptions
): Promise<SiteAuditRunReport> {
  const [campaign] = await db
    .select()
    .from(siteAuditCampaigns)
    .where(
      and(eq(siteAuditCampaigns.id, campaignId), isNull(siteAuditCampaigns.deletedAt))
    )
    .limit(1);
  assertSameWorkspace(auth, campaign, "사이트 진단 캠페인");

  // 동시 실행 방지: running 이 아닌 행만 running 으로 전환된다.
  const claimed = await db
    .update(siteAuditCampaigns)
    .set({ status: "running", updatedAt: new Date() })
    .where(
      and(eq(siteAuditCampaigns.id, campaign.id), ne(siteAuditCampaigns.status, "running"))
    )
    .returning({ id: siteAuditCampaigns.id });
  if (claimed.length === 0) {
    throw new ApiError(
      "VERSION_CONFLICT",
      "이미 크롤링이 실행 중입니다. 완료된 뒤 다시 시도해 주세요."
    );
  }

  const startedAt = Date.now();
  try {
    if (campaign.crawlSource === "url_list") {
      throw new ApiError(
        "VALIDATION_ERROR",
        "URL 목록 소스는 아직 지원하지 않습니다. 크롤링 소스를 웹사이트 또는 사이트맵으로 변경해 주세요."
      );
    }
    const pageLimit = Math.max(1, Math.min(MAX_PAGE_LIMIT, campaign.pageLimit));
    const startUrl = `https://${campaign.domain.replace(/^https?:\/\//, "")}`;
    const crawlInput: CrawlInput = {
      startUrl,
      scope: campaign.crawlScope,
      pageLimit,
      source: campaign.crawlSource,
    };

    // 수집 엔진 선택: 외부 엔진(Firecrawl)이 주입되면 우선 시도하고,
    // 예외/수집 결과 없음이면 자체 BFS 크롤러로 폴백한다.
    let crawl: CrawlOutcome;
    if (options?.crawler) {
      try {
        crawl = await options.crawler(crawlInput);
        if (crawl.pages.filter((page) => page.status > 0).length === 0) {
          throw new Error("수집된 페이지가 없습니다");
        }
      } catch (engineError) {
        const reason = engineError instanceof Error ? engineError.message : String(engineError);
        crawl = await crawlSite(crawlInput);
        crawl.engine = "self";
        crawl.sourceNote = [
          `Firecrawl 크롤에 실패해 자체 크롤러로 대체했습니다 (${reason}).`,
          crawl.sourceNote,
        ]
          .filter(Boolean)
          .join(" ");
      }
    } else {
      crawl = await crawlSite(crawlInput);
      crawl.engine = "self";
    }

    const reachable = crawl.pages.filter((page) => page.status > 0);
    if (reachable.length === 0) {
      throw new ApiError(
        "INTERNAL",
        "대상 사이트에 연결할 수 없습니다. 도메인 주소와 네트워크 상태를 확인해 주세요."
      );
    }

    const issues = analyzePages(crawl.pages);
    const siteHealth = computeSiteHealth(issues, crawl.pages.length);
    const now = new Date();

    // 링크 그래프 적재: 크롤 페이지의 외부 링크를 실측 엣지로 축적한다.
    // 적재 실패가 감사 결과 자체를 무효화하지는 않으므로 오류는 기록만 한다.
    let linkGraph: LinkGraphPersistStats | undefined;
    try {
      linkGraph = await persistCrawlLinkEdges({
        pages: crawl.pages,
        sourceAuthority: siteHealth,
        capturedAt: now,
      });
    } catch (linkError) {
      console.error("[siteaudit] link graph persist failed", linkError);
    }

    // 페이지 단위 스냅샷도 같은 시점 기준으로 교체한다.
    // 적재 실패가 이슈 결과까지 무효화하지 않도록 분리해 둔다.
    try {
      await persistAuditPages(campaign.id, crawl.pages, now);
    } catch (pageError) {
      console.error("[siteaudit] page rows persist failed", pageError);
    }

    await db.delete(siteAuditIssues).where(eq(siteAuditIssues.campaignId, campaign.id));
    if (issues.length > 0) {
      await db.insert(siteAuditIssues).values(
        issues.map((issue) => ({
          id: newId("sai"),
          campaignId: campaign.id,
          severity: issue.severity,
          title: issue.title,
          count: issue.urls.length,
          details: JSON.stringify(issue.urls.slice(0, ISSUE_DETAIL_CAP)),
          status: "open" as const,
          createdAt: now,
          updatedAt: now,
        }))
      );
    }

    await db
      .update(siteAuditCampaigns)
      .set({ status: "completed", siteHealth, lastRunAt: now, updatedAt: now })
      .where(eq(siteAuditCampaigns.id, campaign.id));

    const sum = (severity: Severity) =>
      issues
        .filter((issue) => issue.severity === severity)
        .reduce((total, issue) => total + issue.urls.length, 0);

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      domain: campaign.domain,
      crawledPages: crawl.pages.length,
      failedFetches: crawl.pages.filter((page) => page.status === 0).length,
      siteHealth,
      durationMs: Date.now() - startedAt,
      finishedAt: now.toISOString(),
      sourceNote: crawl.sourceNote,
      crawlEngine: crawl.engine ?? "self",
      firecrawl: crawl.firecrawl,
      linkGraph,
      totals: {
        errors: sum("error"),
        warnings: sum("warning"),
        notices: sum("notice"),
      },
      issues: issues.map((issue) => ({
        severity: issue.severity,
        title: issue.title,
        count: issue.urls.length,
        pages: issue.urls.slice(0, ISSUE_DETAIL_CAP),
      })),
    };
  } catch (error) {
    await db
      .update(siteAuditCampaigns)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(siteAuditCampaigns.id, campaign.id));
    throw error;
  }
}
