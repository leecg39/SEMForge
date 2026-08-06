import { ApiError } from "@/lib/api";
import type { BingSite, BacklinkInboundLinkRow, BacklinkTargetPageRow } from "@/server/backlinks/contracts";
import { normalizeBacklinkPageUrl, normalizeBacklinkSiteUrl } from "@/server/backlinks/target";

const API_BASE = "https://www.bing.com/webmaster/api.svc/json";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const MAX_LINK_COUNT_PAGES = 100;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(object) : [];
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export interface BingPageResult<T> {
  rows: T[];
  totalPages: number;
  requestId: string | null;
}

export class BingWebmasterProvider {
  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly sleep: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {}

  private async request(method: string, params?: Record<string, string | number>): Promise<{ payload: unknown; requestId: string | null }> {
    const url = new URL(`${API_BASE}/${method}`);
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, String(value));
    let lastStatus = 0;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await this.fetchImpl(url, {
          headers: { Accept: "application/json", Authorization: `Bearer ${this.accessToken}` },
          signal: controller.signal,
          cache: "no-store",
        });
        lastStatus = response.status;
        const requestId = response.headers.get("x-ms-request-id") ?? response.headers.get("request-id");
        let payload: unknown;
        try { payload = await response.json(); } catch { payload = null; }
        if (response.ok) return { payload: object(payload).d ?? payload, requestId };
        if (response.status === 401 || response.status === 403) {
          throw new ApiError("UNAUTHENTICATED", "Bing Webmaster 연결이 만료되었거나 사이트 접근 권한이 없습니다.", {
            details: { provider: "bing-webmaster", providerReason: "authentication" },
          });
        }
        if (response.status !== 429 && response.status < 500) {
          throw new ApiError("INTERNAL", "Bing Webmaster 요청을 처리하지 못했습니다.", {
            details: { provider: "bing-webmaster", providerReason: `http_${response.status}` },
          });
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (attempt === MAX_ATTEMPTS) {
          throw new ApiError("INTERNAL", controller.signal.aborted
            ? "Bing Webmaster 응답이 시간 초과되었습니다."
            : "Bing Webmaster에 연결하지 못했습니다.", {
              details: { provider: "bing-webmaster", providerReason: controller.signal.aborted ? "timeout" : "network" },
            });
        }
      } finally {
        clearTimeout(timeout);
      }
      if (attempt < MAX_ATTEMPTS) await this.sleep(Math.min(2000, 250 * 2 ** (attempt - 1)));
    }
    throw new ApiError(lastStatus === 429 ? "RATE_LIMITED" : "INTERNAL", "Bing Webmaster 요청에 실패했습니다.");
  }

  async listSites(): Promise<BingSite[]> {
    const { payload } = await this.request("GetUserSites");
    const root = object(payload);
    const sites = Array.isArray(payload) ? array(payload) : array(root.Sites ?? root.sites ?? root.Site ?? root.site);
    const result = new Map<string, BingSite>();
    for (const site of sites) {
      const rawUrl = string(site.Url ?? site.url ?? site.SiteUrl ?? site.siteUrl);
      if (!rawUrl) continue;
      try {
        const siteUrl = normalizeBacklinkSiteUrl(rawUrl);
        const verifiedValue = site.IsVerified ?? site.isVerified ?? site.Verified ?? site.verified;
        const verified = verifiedValue === undefined || verifiedValue === null || verifiedValue === true || verifiedValue === 1 || verifiedValue === "true";
        if (verified) result.set(siteUrl, { siteUrl, verified: true });
      } catch {
        // 공급자 응답의 비웹 URL은 사이트 선택 목록에서 제외한다.
      }
    }
    return [...result.values()].sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
  }

  async getLinkCounts(siteUrl: string, page: number): Promise<BingPageResult<BacklinkTargetPageRow>> {
    const { payload, requestId } = await this.request("GetLinkCounts", { siteUrl, page });
    const root = object(payload);
    const rows = array(root.Links ?? root.links).flatMap((item) => {
      const url = string(item.Url ?? item.url);
      const count = number(item.Count ?? item.count);
      if (!url || count === null || count < 0) return [];
      try { return [{ kind: "target_pages", url: normalizeBacklinkPageUrl(url), linkCount: Math.trunc(count) } satisfies BacklinkTargetPageRow]; }
      catch { return []; }
    });
    return { rows, totalPages: Math.max(0, Math.trunc(number(root.TotalPages ?? root.totalPages) ?? 0)), requestId };
  }

  async getAllLinkCounts(siteUrl: string): Promise<{ rows: BacklinkTargetPageRow[]; requestIds: string[]; partial: boolean }> {
    const first = await this.getLinkCounts(siteUrl, 0);
    const pageCount = Math.min(first.totalPages, MAX_LINK_COUNT_PAGES);
    const results = [first];
    for (let page = 1; page < pageCount; page += 1) {
      await this.sleep(110);
      results.push(await this.getLinkCounts(siteUrl, page));
    }
    const deduped = new Map<string, BacklinkTargetPageRow>();
    for (const result of results) {
      for (const row of result.rows) {
        const current = deduped.get(row.url);
        if (!current || row.linkCount > current.linkCount) deduped.set(row.url, row);
      }
    }
    return {
      rows: [...deduped.values()],
      requestIds: results.map((result) => result.requestId).filter((value): value is string => Boolean(value)),
      partial: first.totalPages > MAX_LINK_COUNT_PAGES,
    };
  }

  async getUrlLinks(siteUrl: string, targetPage: string, page: number): Promise<BingPageResult<BacklinkInboundLinkRow>> {
    const { payload, requestId } = await this.request("GetUrlLinks", { siteUrl, link: targetPage, page: Math.max(0, page) });
    const root = object(payload);
    const rows = array(root.Details ?? root.details).flatMap((item) => {
      const source = string(item.Url ?? item.url);
      if (!source) return [];
      try {
        const sourceUrl = normalizeBacklinkPageUrl(source);
        return [{
          kind: "inbound_links",
          sourceUrl,
          targetUrl: normalizeBacklinkPageUrl(targetPage),
          sourceDomain: new URL(sourceUrl).hostname,
          anchor: string(item.AnchorText ?? item.anchorText),
          linkCount: 1,
        } satisfies BacklinkInboundLinkRow];
      } catch { return []; }
    });
    return { rows, totalPages: Math.max(0, Math.trunc(number(root.TotalPages ?? root.totalPages) ?? 0)), requestId };
  }
}
