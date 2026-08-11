// @TASK P3-C1-T1 - TalorData Google SERP provider adapter
// @SPEC docs/planning/06-tasks.md#p3-c1-t1--google-rank와-aio-수집
// @TEST src/server/providers/talordata/provider.test.ts
import { ApiError } from "@/lib/api";
import {
  fetchSerp,
  isRecord,
  RetryableTalordataError,
  type AiOverviewInfo,
  type SerpOrganicItem,
  type TalordataClientOptions,
} from "@/server/talordata/client";

export const TALORDATA_GOOGLE_COLLECTION = {
  engine: "google",
  country: "kr",
  language: "ko",
  device: "desktop",
  window: 100,
} as const;

export type TalordataFailureDisposition = "retryable" | "terminal";
export type TalordataFailureReason =
  | "aborted"
  | "authentication"
  | "configuration"
  | "invalid_request"
  | "invalid_response"
  | "network"
  | "provider"
  | "rate_limit"
  | "timeout"
  | "unexpected";

export class TalordataProviderFailure extends Error {
  constructor(
    readonly disposition: TalordataFailureDisposition,
    readonly reason: TalordataFailureReason,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "TalordataProviderFailure";
  }
}

export interface TalordataGoogleSearchInput {
  query: string;
  includeAiOverview: boolean;
  signal?: AbortSignal;
}

export interface TalordataGoogleSearchResult {
  query: string;
  organic: readonly SerpOrganicItem[];
  organicCoverage: {
    readonly requested: number;
    readonly validatedThrough: number;
    readonly complete: boolean;
  };
  aiOverview: AiOverviewInfo;
  providerRequestId: string | null;
  collectedAt: string;
  provenance: {
    source: "talordata";
    engine: "google";
    country: "kr";
    language: "ko";
    device: "desktop";
    window: 100;
  };
}

export interface TalordataGoogleProvider {
  search(input: TalordataGoogleSearchInput): Promise<TalordataGoogleSearchResult>;
}

function detailReason(details: unknown): string | null {
  if (!isRecord(details)) return null;
  return typeof details.reason === "string" ? details.reason : null;
}

function detailFailureKind(details: unknown): string | null {
  if (!isRecord(details)) return null;
  return typeof details.kind === "string" ? details.kind : null;
}

function classifyFailure(error: unknown): TalordataProviderFailure {
  if (error instanceof TalordataProviderFailure) return error;
  if (error instanceof RetryableTalordataError) {
    const reason: TalordataFailureReason =
      error.kind === "aborted"
        ? "aborted"
        : error.kind === "timeout"
        ? "timeout"
        : error.kind === "network"
          ? "network"
          : error.kind === "invalid-response"
            ? "invalid_response"
            : "provider";
    return new TalordataProviderFailure("retryable", reason, error.message, error.details);
  }
  if (error instanceof ApiError) {
    if (error.code === "RATE_LIMITED") {
      return new TalordataProviderFailure("retryable", "rate_limit", error.message, error.details);
    }
    const reasonText = detailReason(error.details) ?? "";
    const detailKind = detailFailureKind(error.details);
    if (detailKind === "aborted") {
      return new TalordataProviderFailure("retryable", "aborted", error.message, error.details);
    }
    if (detailKind === "network") {
      return new TalordataProviderFailure("retryable", "network", error.message, error.details);
    }
    if (detailKind === "invalid-response") {
      return new TalordataProviderFailure(
        "retryable",
        "invalid_response",
        error.message,
        error.details,
      );
    }
    if (/중단|abort/i.test(`${error.message} ${reasonText}`)) {
      return new TalordataProviderFailure("retryable", "aborted", error.message, error.details);
    }
    if (/timeout|timed\s*out/i.test(`${error.message} ${reasonText}`)) {
      return new TalordataProviderFailure("retryable", "timeout", error.message, error.details);
    }
    if (isRecord(error.details) && typeof error.details.attempts === "number") {
      return new TalordataProviderFailure("retryable", "provider", error.message, error.details);
    }
    if (/TALORDATA_API_TOKEN.*설정/i.test(error.message)) {
      return new TalordataProviderFailure("terminal", "configuration", error.message);
    }
    if (/토큰이 유효하지 않|authentication|api key/i.test(error.message)) {
      return new TalordataProviderFailure("terminal", "authentication", error.message);
    }
    return new TalordataProviderFailure("terminal", "invalid_request", error.message, error.details);
  }
  return new TalordataProviderFailure(
    "terminal",
    "unexpected",
    error instanceof Error ? error.message : "알 수 없는 TalorData 오류",
  );
}

/**
 * TalorData 순수 HTTP client에 SEMForge 베타의 불변 Google 수집 차원을 고정한다.
 * retry 횟수와 timeout은 client에 위임하고 worker가 판정할 수 있는 오류로 변환한다.
 */
export function createTalordataGoogleProvider(
  options: TalordataClientOptions = {},
): TalordataGoogleProvider {
  const clientOptions: TalordataClientOptions = {
    ...options,
    // An empty explicit value disables the lower-level development fallback.
    token: options.token ?? "",
  };
  return {
    async search(input) {
      try {
        const result = await fetchSerp(
          {
            q: input.query,
            engine: TALORDATA_GOOGLE_COLLECTION.engine,
            num: TALORDATA_GOOGLE_COLLECTION.window,
            gl: TALORDATA_GOOGLE_COLLECTION.country,
            hl: TALORDATA_GOOGLE_COLLECTION.language,
            device: TALORDATA_GOOGLE_COLLECTION.device,
            aiOverview: input.includeAiOverview,
          },
          { ...clientOptions, signal: input.signal ?? clientOptions.signal },
        );
        return {
          query: result.query,
          organic: result.organic,
          organicCoverage: result.organicCoverage,
          aiOverview: result.aiOverview,
          providerRequestId: result.provider.id,
          collectedAt: result.capturedAt.toISOString(),
          provenance: {
            source: "talordata",
            ...TALORDATA_GOOGLE_COLLECTION,
          },
        };
      } catch (error) {
        throw classifyFailure(error);
      }
    },
  };
}
