import { ApiError } from "@/lib/api";
import type { BacklinkScope } from "@/server/backlinks/contracts";

const HOST_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i;

function invalid(message = "유효한 HTTP 또는 HTTPS 주소를 입력해 주세요."): never {
  throw new ApiError("VALIDATION_ERROR", message, {
    fields: { siteUrl: "예: https://www.example.com/" },
  });
}

function normalizedWebUrl(raw: string): URL {
  const input = raw.trim();
  if (!input || input.length > 2000 || /[\u0000-\u001f\u007f]/.test(input)) invalid();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    invalid();
  }
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) invalid();
  if (url.port) invalid("포트가 지정된 URL은 지원하지 않습니다.");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const labels = hostname.split(".");
  const ipv4 = labels.length === 4 && labels.every((part) => /^\d{1,3}$/.test(part));
  if (ipv4 || hostname === "localhost" || hostname.length > 253 || labels.length < 2 || labels.some((label) => !HOST_LABEL.test(label))) invalid();
  url.hostname = hostname;
  url.hash = "";
  return url;
}

/** Bing 속성 URL은 origin과 선택적인 경로 prefix를 보존한다. */
export function normalizeBacklinkSiteUrl(raw: string): string {
  const url = normalizedWebUrl(raw);
  url.search = "";
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
}

export function normalizeBacklinkPageUrl(raw: string): string {
  const url = normalizedWebUrl(raw);
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  return url.toString();
}

export function targetBelongsToSite(siteUrl: string, targetUrl: string): boolean {
  const site = new URL(normalizeBacklinkSiteUrl(siteUrl));
  const target = new URL(normalizeBacklinkPageUrl(targetUrl));
  if (site.protocol !== target.protocol || site.hostname !== target.hostname) return false;
  const prefix = site.pathname.endsWith("/") ? site.pathname : `${site.pathname}/`;
  return target.pathname === site.pathname.replace(/\/$/, "") || target.pathname.startsWith(prefix);
}

export function parseBacklinkTarget(input: {
  siteUrl: string;
  targetUrl?: string | null;
  scope: BacklinkScope;
}): { siteUrl: string; targetUrl: string | null; scope: BacklinkScope; cacheTarget: string } {
  const siteUrl = normalizeBacklinkSiteUrl(input.siteUrl);
  if (input.scope === "site") return { siteUrl, targetUrl: null, scope: "site", cacheTarget: siteUrl };
  if (!input.targetUrl) {
    throw new ApiError("VALIDATION_ERROR", "페이지 범위에는 대상 URL이 필요합니다.", {
      fields: { targetUrl: "인증 사이트 안의 정확한 URL을 입력해 주세요." },
    });
  }
  const targetUrl = normalizeBacklinkPageUrl(input.targetUrl);
  if (!targetBelongsToSite(siteUrl, targetUrl)) {
    throw new ApiError("VALIDATION_ERROR", "대상 페이지가 선택한 Bing 인증 사이트에 포함되지 않습니다.", {
      fields: { targetUrl: "선택한 사이트 내부 URL만 분석할 수 있습니다." },
    });
  }
  return { siteUrl, targetUrl, scope: "page", cacheTarget: targetUrl };
}

export function normalizeLegacyBacklinkScope(value: string | null | undefined): BacklinkScope {
  return value === "page" ? "page" : "site";
}
