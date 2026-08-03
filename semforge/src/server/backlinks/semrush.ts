import { z } from "zod";
import { ApiError } from "@/lib/api";
import {
  BACKLINK_PROVIDER,
  type BacklinkAnchorRow,
  type BacklinkDataset,
  type BacklinkHistoryPoint,
  type BacklinkLinkRow,
  type BacklinkOverview,
  type BacklinkPageRow,
  type BacklinkRefDomainRow,
  type BacklinkRow,
  type BacklinkScope,
  type BacklinkScoreBucket,
  type ProviderResult,
} from "@/server/backlinks/contracts";

const BASE_URL = "https://api.semrush.com/apis/v4/backlinks/v1";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_ATTEMPTS = 3;
const MAX_CONCURRENT_REQUESTS = 8;

interface SemrushSemaphoreState {
  active: number;
  queue: Array<() => void>;
}

const globalForSemrush = globalThis as unknown as { __semforgeSemrushSemaphore?: SemrushSemaphoreState };
const semaphore =
  globalForSemrush.__semforgeSemrushSemaphore ??
  (globalForSemrush.__semforgeSemrushSemaphore = { active: 0, queue: [] });

async function acquireSemrushSlot(): Promise<() => void> {
  if (semaphore.active >= MAX_CONCURRENT_REQUESTS) {
    await new Promise<void>((resolve) => semaphore.queue.push(resolve));
  }
  semaphore.active += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    semaphore.active -= 1;
    semaphore.queue.shift()?.();
  };
}

const envelopeSchema = z
  .object({
    meta: z
      .object({
        success: z.boolean(),
        status_code: z.number(),
        request_id: z.string().optional(),
        effective_url: z.string().optional(),
        total: z.union([z.number(), z.string()]).optional(),
      })
      .loose(),
    data: z.unknown().optional(),
    error: z
      .object({
        code: z.union([z.number(), z.string()]).optional(),
        message: z.string().optional(),
        retryable: z.boolean().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

type Envelope = z.infer<typeof envelopeSchema>;

class RetryableSemrushError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RetryableSemrushError";
  }
}

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
}

function rows(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function nullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  return booleanValue(value);
}

function totalFrom(envelope: Envelope, fallback: number): number {
  return numberOrNull(envelope.meta.total) ?? fallback;
}

function providerError(envelope: Envelope, status: number): ApiError {
  const message = envelope.error?.message?.trim() ?? "Semrush 요청을 처리하지 못했습니다.";
  const details = {
    provider: BACKLINK_PROVIDER,
    providerReason: status === 429 ? "rate_limit" : status === 401 ? "authentication" : status === 403 ? "access_or_units" : "provider",
    requestId: envelope.meta.request_id ?? null,
  };
  if (status === 400) return new ApiError("VALIDATION_ERROR", "Semrush 분석 조건을 확인해 주세요.", { details });
  if (status === 404) return new ApiError("NOT_FOUND", "Semrush에서 이 대상의 백링크 데이터를 찾지 못했습니다.", { details });
  if (status === 429) return new ApiError("RATE_LIMITED", "Semrush 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", { details });
  if (status === 403) return new ApiError("PLAN_LIMIT", "Semrush API 권한 또는 API 유닛을 확인해 주세요.", { details });
  if (status === 401) return new ApiError("INTERNAL", "Semrush API 인증 설정을 확인해 주세요.", { details });
  return new ApiError("INTERNAL", message, { details });
}

const SCOPE_VALUE: Record<BacklinkScope, string> = {
  root_domain: "ROOT_DOMAIN",
  subdomain: "SUBDOMAIN",
  page: "PAGE",
};

const DATASET_PATH: Record<BacklinkDataset, string> = {
  links: "links",
  ref_domains: "ref-domains",
  anchors: "anchors",
  pages: "pages",
};

const DATASET_FIELDS: Record<BacklinkDataset, string[]> = {
  links: [
    "source_url", "target_url", "source_domain", "source_title", "anchor", "domain_score",
    "page_score", "first_seen_at", "last_seen_at", "is_nofollow", "is_sponsored", "is_ugc",
    "is_image", "is_form", "is_frame", "is_new", "is_lost",
  ],
  ref_domains: [
    "domain", "backlinks_count", "domain_score", "ip_address", "country", "first_seen_at",
    "last_seen_at", "is_follow", "is_new", "is_lost",
  ],
  anchors: ["anchor", "backlinks_count", "domains_count", "first_seen_at", "last_seen_at"],
  pages: [
    "source_url", "source_title", "response_code", "backlinks_count", "domains_count",
    "first_seen_at", "last_seen_at",
  ],
};

function normalizedRow(dataset: BacklinkDataset, value: RecordValue): BacklinkRow {
  if (dataset === "links") {
    return {
      kind: "links",
      sourceUrl: stringOrNull(value.source_url) ?? "",
      targetUrl: stringOrNull(value.target_url) ?? "",
      sourceDomain: stringOrNull(value.source_domain) ?? "",
      sourceTitle: stringOrNull(value.source_title),
      anchor: stringOrNull(value.anchor),
      domainScore: numberOrNull(value.domain_score),
      pageScore: numberOrNull(value.page_score),
      firstSeenAt: stringOrNull(value.first_seen_at),
      lastSeenAt: stringOrNull(value.last_seen_at),
      nofollow: booleanValue(value.is_nofollow),
      sponsored: booleanValue(value.is_sponsored),
      ugc: booleanValue(value.is_ugc),
      image: booleanValue(value.is_image),
      form: booleanValue(value.is_form),
      frame: booleanValue(value.is_frame),
      isNew: booleanValue(value.is_new),
      isLost: booleanValue(value.is_lost),
    } satisfies BacklinkLinkRow;
  }
  if (dataset === "ref_domains") {
    return {
      kind: "ref_domains",
      domain: stringOrNull(value.domain) ?? "",
      backlinks: numberOrNull(value.backlinks_count),
      domainScore: numberOrNull(value.domain_score),
      ipAddress: stringOrNull(value.ip_address),
      country: stringOrNull(value.country),
      firstSeenAt: stringOrNull(value.first_seen_at),
      lastSeenAt: stringOrNull(value.last_seen_at),
      follow: nullableBoolean(value.is_follow),
      isNew: booleanValue(value.is_new),
      isLost: booleanValue(value.is_lost),
    } satisfies BacklinkRefDomainRow;
  }
  if (dataset === "anchors") {
    return {
      kind: "anchors",
      anchor: stringOrNull(value.anchor) ?? "",
      backlinks: numberOrNull(value.backlinks_count),
      referringDomains: numberOrNull(value.domains_count),
      firstSeenAt: stringOrNull(value.first_seen_at),
      lastSeenAt: stringOrNull(value.last_seen_at),
    } satisfies BacklinkAnchorRow;
  }
  return {
    kind: "pages",
    url: stringOrNull(value.source_url) ?? "",
    title: stringOrNull(value.source_title),
    responseCode: numberOrNull(value.response_code),
    backlinks: numberOrNull(value.backlinks_count),
    referringDomains: numberOrNull(value.domains_count),
    firstSeenAt: stringOrNull(value.first_seen_at),
    lastSeenAt: stringOrNull(value.last_seen_at),
  } satisfies BacklinkPageRow;
}

export interface SemrushClientOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
  maxAttempts?: number;
}

export class SemrushBacklinkProvider {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;

  constructor(options: SemrushClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.SEMRUSH_API_V4_KEY?.trim() ?? "";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_ATTEMPTS;
  }

  private async request(path: string, params: URLSearchParams): Promise<Envelope> {
    if (!this.apiKey) {
      throw new ApiError("INTERNAL", "Semrush API 키가 설정되지 않았습니다.", {
        details: { provider: BACKLINK_PROVIDER, providerReason: "configuration" },
      });
    }

    const url = `${BASE_URL}/${path}?${params.toString()}`;
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const releaseSlot = await acquireSemrushSlot();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(url, {
          headers: { Authorization: `Apikey ${this.apiKey}`, Accept: "application/json" },
          signal: controller.signal,
        });
        const raw = await response.json().catch(() => null);
        const parsed = envelopeSchema.safeParse(raw);
        if (!parsed.success) {
          throw new RetryableSemrushError("Semrush 응답 형식이 올바르지 않습니다.", response.status);
        }
        const envelope = parsed.data;
        if (!response.ok || !envelope.meta.success) {
          const status = envelope.meta.status_code || response.status;
          if ((envelope.error?.retryable || status === 429 || status >= 500) && attempt < this.maxAttempts) {
            throw new RetryableSemrushError(envelope.error?.message ?? "Semrush 일시 오류", status);
          }
          throw providerError(envelope, status);
        }
        return envelope;
      } catch (error) {
        lastError = error;
        if (error instanceof ApiError) throw error;
        const retryable =
          error instanceof RetryableSemrushError ||
          (error instanceof Error && (error.name === "AbortError" || error instanceof TypeError));
        if (!retryable || attempt >= this.maxAttempts) break;
        await this.sleep(400 * 2 ** (attempt - 1));
      } finally {
        clearTimeout(timeout);
        releaseSlot();
      }
    }
    throw new ApiError("INTERNAL", "Semrush에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", {
      details: {
        provider: BACKLINK_PROVIDER,
        providerReason: lastError instanceof Error && lastError.name === "AbortError" ? "timeout" : "network",
      },
    });
  }

  async overview(target: string, scope: BacklinkScope): Promise<ProviderResult<BacklinkOverview>> {
    const params = new URLSearchParams({
      url: target,
      scope: SCOPE_VALUE[scope],
      fields: [
        "score", "backlinks_count", "domains_count", "urls_count", "new_count", "lost_count",
        "follows_count", "nofollows_count", "sponsored_count", "ugc_count", "texts_count",
        "images_count", "forms_count", "frames_count",
      ].join(","),
      format: "json",
    });
    const envelope = await this.request("overview", params);
    const value = record(envelope.data);
    return {
      data: {
        authorityScore: numberOrNull(value.score),
        backlinks: numberOrNull(value.backlinks_count),
        referringDomains: numberOrNull(value.domains_count),
        referringPages: numberOrNull(value.urls_count),
        newBacklinks: numberOrNull(value.new_count),
        lostBacklinks: numberOrNull(value.lost_count),
        followBacklinks: numberOrNull(value.follows_count),
        nofollowBacklinks: numberOrNull(value.nofollows_count),
        sponsoredBacklinks: numberOrNull(value.sponsored_count),
        ugcBacklinks: numberOrNull(value.ugc_count),
        textBacklinks: numberOrNull(value.texts_count),
        imageBacklinks: numberOrNull(value.images_count),
        formBacklinks: numberOrNull(value.forms_count),
        frameBacklinks: numberOrNull(value.frames_count),
      },
      requestId: envelope.meta.request_id ?? null,
      effectiveTarget: envelope.meta.effective_url ?? null,
    };
  }

  async history(
    target: string,
    scope: BacklinkScope,
    dateFrom: string,
    dateTo: string,
  ): Promise<ProviderResult<BacklinkHistoryPoint[]>> {
    const params = new URLSearchParams({
      url: target,
      scope: SCOPE_VALUE[scope],
      fields: "score,backlinks_count,domains_count,follows_count,month_date",
      limit: "12",
      date_from: dateFrom,
      date_to: dateTo,
      format: "json",
    });
    const envelope = await this.request("summary", params);
    return {
      data: rows(envelope.data)
        .map((value) => ({
          month: stringOrNull(value.month_date) ?? "",
          authorityScore: numberOrNull(value.score),
          backlinks: numberOrNull(value.backlinks_count),
          referringDomains: numberOrNull(value.domains_count),
          followBacklinks: numberOrNull(value.follows_count),
        }))
        .filter((point) => point.month)
        .toSorted((a, b) => a.month.localeCompare(b.month)),
      requestId: envelope.meta.request_id ?? null,
      effectiveTarget: envelope.meta.effective_url ?? null,
    };
  }

  async scoreProfile(target: string, scope: BacklinkScope): Promise<ProviderResult<BacklinkScoreBucket[]>> {
    const params = new URLSearchParams({ url: target, scope: SCOPE_VALUE[scope], format: "json" });
    const envelope = await this.request("score-profile", params);
    return {
      data: rows(envelope.data)
        .map((value) => ({
          score: numberOrNull(value.domain_score),
          referringDomains: numberOrNull(value.domains_count),
        }))
        .filter((value): value is BacklinkScoreBucket => value.score !== null && value.referringDomains !== null),
      requestId: envelope.meta.request_id ?? null,
      effectiveTarget: envelope.meta.effective_url ?? null,
    };
  }

  async list(input: {
    target: string;
    scope: BacklinkScope;
    dataset: BacklinkDataset;
    limit: number;
    offset: number;
    sort: string;
    direction: "asc" | "desc";
    filter: string | null;
  }): Promise<ProviderResult<BacklinkRow[]>> {
    const params = new URLSearchParams({
      url: input.target,
      scope: SCOPE_VALUE[input.scope],
      fields: DATASET_FIELDS[input.dataset].join(","),
      limit: String(input.limit),
      offset: String(input.offset),
      order_by: input.sort,
      direction: input.direction.toUpperCase(),
      format: "json",
    });
    if (input.filter) params.set("filter", input.filter);
    const envelope = await this.request(DATASET_PATH[input.dataset], params);
    const data = rows(envelope.data).map((value) => normalizedRow(input.dataset, value));
    return {
      data,
      requestId: envelope.meta.request_id ?? null,
      effectiveTarget: envelope.meta.effective_url ?? null,
      total: totalFrom(envelope, data.length),
    };
  }
}

export function backlinkExportUnitEstimate(dataset: BacklinkDataset, rowsRequested: number): number {
  return rowsRequested * (dataset === "links" ? 45 : 40);
}
