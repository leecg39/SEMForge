import { z } from "zod";
import { ApiError } from "@/lib/api";
import type { BacklinkInboundLinkRow, BacklinkScope } from "@/server/backlinks/contracts";
import {
  normalizeBacklinkPageUrl,
  normalizeBacklinkSiteUrl,
  targetBelongsToSite,
} from "@/server/backlinks/target";

const REQUEST_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;

const gatewayRowSchema = z.object({
  sourceUrl: z.string().trim().min(1).max(4000),
  targetUrl: z.string().trim().min(1).max(4000),
  anchor: z.string().max(2000).nullable().optional(),
  linkCount: z.coerce.number().int().min(1).max(1_000_000).default(1),
});

const gatewayResponseSchema = z.object({
  release: z.string().trim().min(1).max(120),
  rows: z.array(gatewayRowSchema).max(10_000),
  partial: z.boolean().default(true),
  warning: z.string().trim().max(1000).nullable().optional(),
  requestId: z.string().trim().max(200).nullable().optional(),
});

export interface CommonCrawlDiscoveryResult {
  rows: BacklinkInboundLinkRow[];
  release: string;
  partial: boolean;
  warning: string | null;
  requestId: string | null;
}

export interface CommonCrawlProviderOptions {
  endpoint?: string | null;
  token?: string | null;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

function configuredEndpoint(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try { url = new URL(value); }
  catch { throw new ApiError("INTERNAL", "Common Crawl 인덱스 주소가 올바르지 않습니다."); }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && local)) {
    throw new ApiError("INTERNAL", "Common Crawl 인덱스 주소는 HTTPS여야 합니다.");
  }
  return url.toString();
}

/**
 * 공식 Common Crawl Web Graph/WARC를 미리 역색인한 게이트웨이의 클라이언트다.
 * Common Crawl 자체에는 대상 도메인의 인링크를 즉시 반환하는 API가 없으므로,
 * 수십 GB 그래프를 웹 요청마다 스캔하지 않고 배포 환경의 역색인 서비스에 위임한다.
 */
export class CommonCrawlBacklinkProvider {
  private readonly endpoint: string | null;
  private readonly token: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: CommonCrawlProviderOptions = {}) {
    this.endpoint = configuredEndpoint(options.endpoint ?? process.env.COMMON_CRAWL_BACKLINK_ENDPOINT);
    this.token = options.token ?? process.env.COMMON_CRAWL_BACKLINK_TOKEN?.trim() ?? null;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  isConfigured(): boolean {
    return Boolean(this.endpoint);
  }

  async discover(input: {
    siteUrl: string;
    targetUrl: string | null;
    scope: BacklinkScope;
    limit: 100 | 500 | 1000;
  }): Promise<CommonCrawlDiscoveryResult> {
    if (!this.endpoint) {
      throw new ApiError("INTERNAL", "Common Crawl 자동 수집기가 설정되지 않았습니다.", {
        details: { provider: "common-crawl", providerReason: "configuration" },
      });
    }
    const siteUrl = normalizeBacklinkSiteUrl(input.siteUrl);
    const body = JSON.stringify({
      siteUrl,
      targetUrl: input.targetUrl,
      scope: input.scope,
      limit: input.limit,
      recentCrawls: 3,
      verifyWarcLinks: true,
    });
    let lastStatus = 0;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          },
          body,
          signal: controller.signal,
          cache: "no-store",
        });
        lastStatus = response.status;
        if (!response.ok) {
          if (response.status !== 429 && response.status < 500) {
            throw new ApiError("INTERNAL", "Common Crawl 인덱스가 요청을 거부했습니다.", {
              details: { provider: "common-crawl", providerReason: `http_${response.status}` },
            });
          }
        } else {
          const parsed = gatewayResponseSchema.safeParse(await response.json().catch(() => null));
          if (!parsed.success) {
            throw new ApiError("INTERNAL", "Common Crawl 인덱스 응답 형식이 올바르지 않습니다.", {
              details: { provider: "common-crawl", providerReason: "invalid_response" },
            });
          }
          const siteHost = new URL(siteUrl).hostname;
          const deduped = new Map<string, BacklinkInboundLinkRow>();
          for (const row of parsed.data.rows) {
            try {
              const sourceUrl = normalizeBacklinkPageUrl(row.sourceUrl);
              const targetUrl = normalizeBacklinkPageUrl(row.targetUrl);
              if (!targetBelongsToSite(siteUrl, targetUrl)) continue;
              if (input.scope === "page" && input.targetUrl && targetUrl !== normalizeBacklinkPageUrl(input.targetUrl)) continue;
              const sourceDomain = new URL(sourceUrl).hostname;
              if (sourceDomain === siteHost) continue;
              const anchor = row.anchor?.trim().slice(0, 1000) || null;
              const key = `${sourceUrl}\u0000${targetUrl}\u0000${anchor ?? ""}`;
              const current = deduped.get(key);
              if (!current || row.linkCount > current.linkCount) {
                deduped.set(key, { kind: "inbound_links", sourceUrl, targetUrl, sourceDomain, anchor, linkCount: row.linkCount });
              }
              if (deduped.size >= input.limit) break;
            } catch {
              // 공개 웹 인덱스의 비웹·손상 URL은 결과에서 제외한다.
            }
          }
          return {
            rows: [...deduped.values()],
            release: parsed.data.release,
            partial: parsed.data.partial || parsed.data.rows.length > deduped.size || deduped.size >= input.limit,
            warning: parsed.data.warning ?? null,
            requestId: parsed.data.requestId ?? response.headers.get("x-request-id"),
          };
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (attempt === MAX_ATTEMPTS) {
          throw new ApiError("INTERNAL", controller.signal.aborted
            ? "Common Crawl 인덱스 응답이 시간 초과되었습니다."
            : "Common Crawl 인덱스에 연결하지 못했습니다.", {
              details: { provider: "common-crawl", providerReason: controller.signal.aborted ? "timeout" : "network" },
            });
        }
      } finally {
        clearTimeout(timeout);
      }
      if (attempt < MAX_ATTEMPTS) await this.sleep(Math.min(2000, 250 * 2 ** (attempt - 1)));
    }
    throw new ApiError(lastStatus === 429 ? "RATE_LIMITED" : "INTERNAL", "Common Crawl 자동 수집에 실패했습니다.");
  }
}

export function commonCrawlConnectionStatus(): { configured: boolean; reason: string } {
  try {
    const provider = new CommonCrawlBacklinkProvider();
    return provider.isConfigured()
      ? { configured: true, reason: "Common Crawl 공개 웹 인덱스를 사용할 수 있습니다." }
      : { configured: false, reason: "Common Crawl 역색인 서비스가 설정되지 않았습니다." };
  } catch (error) {
    return { configured: false, reason: error instanceof Error ? error.message : "Common Crawl 설정을 확인해 주세요." };
  }
}
