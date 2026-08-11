// @TASK P3-C2-T1 - Budgeted, partial-safe NAVER collector
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/collectors/naver/collector.test.ts
import { createHash } from "node:crypto";

import {
  NaverSearchAdsRateLimitError,
  NaverSearchAdsRequestError,
  NaverSearchAdsUnavailableError,
  NaverSearchAdsValidationError,
} from "@/server/naver-search-ads/client";
import type {
  NaverAgeDemographics,
  NaverBlogResultTotal,
  NaverCollectionRange,
  NaverGenderDemographics,
  NaverMonthlySearchVolume,
  NaverProvider,
  NaverRelativeTrend,
} from "@/server/providers/naver/contracts";
import { NaverOpenApiRequestError } from "@/server/providers/naver/production";

export const NAVER_SOURCE_CALL_COSTS = {
  search_ads_monthly_volume: 1,
  datalab_trend: 1,
  datalab_gender: 2,
  datalab_age: 11,
  search_api_blog_total: 1,
} as const;

export type NaverObservationSource = keyof typeof NAVER_SOURCE_CALL_COSTS;
export type NaverSourceStatus = "succeeded" | "unavailable" | "retryable" | "failed";
export type NaverCollectionStatus = "succeeded" | "partial" | "failed";

export interface NaverSourceValueMap {
  readonly search_ads_monthly_volume: NaverMonthlySearchVolume;
  readonly datalab_trend: NaverRelativeTrend;
  readonly datalab_gender: NaverGenderDemographics;
  readonly datalab_age: NaverAgeDemographics;
  readonly search_api_blog_total: NaverBlogResultTotal;
}

export type NaverSourcePlan<S extends NaverObservationSource> =
  | {
      readonly disposition: "execute";
      readonly providerCallId: string;
    }
  | {
      readonly disposition: "replay";
      readonly providerCallId: string;
      readonly value: NaverSourceValueMap[S];
    }
  | {
      readonly disposition: "in_doubt";
      readonly providerCallId: string;
    }
  | {
      readonly disposition: "skip";
      readonly providerCallId: null;
      readonly errorCode: "NAVER_CALL_BUDGET_EXCEEDED";
    };

export type NaverSourcePlans = Partial<
  Record<NaverObservationSource, NaverSourcePlan<NaverObservationSource>>
>;

export interface NaverCollectionInput {
  readonly workspaceId: string;
  readonly siteId: string;
  readonly trackedQueryId: string;
  readonly query: string;
  readonly observedAt: string;
  readonly range: NaverCollectionRange;
  readonly callBudget: { readonly maxCalls: number };
  readonly sourcePlans?: NaverSourcePlans;
}

export interface NaverSourceProvenance {
  readonly source: string;
  readonly collectedAt: string;
}

export interface NaverSourceResult<T> {
  readonly status: NaverSourceStatus;
  readonly value: T | null;
  readonly providerCallId: string | null;
  readonly provenance: NaverSourceProvenance | null;
  readonly errorCode: string | null;
}

export interface NaverObservationSources {
  readonly search_ads_monthly_volume: NaverSourceResult<NaverMonthlySearchVolume>;
  readonly datalab_trend: NaverSourceResult<NaverRelativeTrend>;
  readonly datalab_gender: NaverSourceResult<NaverGenderDemographics>;
  readonly datalab_age: NaverSourceResult<NaverAgeDemographics>;
  readonly search_api_blog_total: NaverSourceResult<NaverBlogResultTotal>;
}

export interface NaverObservationRecord {
  readonly observationKey: string;
  readonly workspaceId: string;
  readonly siteId: string;
  readonly trackedQueryId: string;
  readonly query: string;
  readonly observedAt: string;
  readonly collectedAt: string;
  readonly range: NaverCollectionRange;
  readonly status: NaverCollectionStatus;
  readonly callsUsed: number;
  readonly sources: NaverObservationSources;
}

export interface NaverObservationStore {
  upsert(record: NaverObservationRecord): Promise<void>;
}

export interface NaverCollectorDependencies {
  readonly provider: NaverProvider;
  readonly store: NaverObservationStore;
  readonly now?: () => Date;
}

export class NaverCollectorValidationError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "NaverCollectorValidationError";
  }
}

function normalizedQuery(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isCanonicalIsoTimestamp(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function validateInput(input: NaverCollectionInput): string {
  for (const value of [input.workspaceId, input.siteId, input.trackedQueryId]) {
    if (!value.trim()) throw new NaverCollectorValidationError("NAVER_IDENTIFIER_REQUIRED");
  }
  const query = normalizedQuery(input.query);
  if (!query) throw new NaverCollectorValidationError("NAVER_QUERY_REQUIRED");
  if (!isCanonicalIsoTimestamp(input.observedAt)) {
    throw new NaverCollectorValidationError("NAVER_OBSERVED_AT_INVALID");
  }
  if (
    !isCalendarDate(input.range.startDate) ||
    !isCalendarDate(input.range.endDate) ||
    input.range.startDate > input.range.endDate
  ) {
    throw new NaverCollectorValidationError("NAVER_RANGE_INVALID");
  }
  if (!Number.isSafeInteger(input.callBudget.maxCalls) || input.callBudget.maxCalls < 0) {
    throw new NaverCollectorValidationError("NAVER_CALL_BUDGET_INVALID");
  }
  return query;
}

export function createNaverObservationKey(
  input: Pick<NaverCollectionInput, "workspaceId" | "trackedQueryId" | "observedAt">,
): string {
  const canonical = JSON.stringify({
    workspaceId: input.workspaceId,
    trackedQueryId: input.trackedQueryId,
    observedAt: new Date(input.observedAt).toISOString(),
  });
  return `naver:v1:${createHash("sha256").update(canonical).digest("hex")}`;
}

function succeeded<T>(value: T, providerCallId: string | null): NaverSourceResult<T> {
  const sourceValue = value as T & { readonly source: string; readonly collectedAt: string };
  return {
    status: "succeeded",
    value,
    providerCallId,
    provenance: { source: sourceValue.source, collectedAt: sourceValue.collectedAt },
    errorCode: null,
  };
}

function unavailable<T>(errorCode: string, providerCallId: string | null): NaverSourceResult<T> {
  return {
    status: "unavailable",
    value: null,
    providerCallId,
    provenance: null,
    errorCode,
  };
}

function failed<T>(
  status: "retryable" | "failed",
  errorCode: string,
  providerCallId: string | null,
): NaverSourceResult<T> {
  return { status, value: null, providerCallId, provenance: null, errorCode };
}

function mapProviderError<T>(error: unknown, providerCallId: string | null): NaverSourceResult<T> {
  if (error instanceof NaverSearchAdsUnavailableError) {
    return unavailable("NAVER_SEARCH_ADS_UNAVAILABLE", providerCallId);
  }
  if (error instanceof NaverSearchAdsRateLimitError) {
    return failed("retryable", "NAVER_RATE_LIMITED", providerCallId);
  }
  if (error instanceof NaverOpenApiRequestError) {
    if (error.kind === "unavailable") {
      return unavailable("NAVER_OPEN_API_UNAVAILABLE", providerCallId);
    }
    if (error.kind === "rate_limited") {
      return failed("retryable", "NAVER_RATE_LIMITED", providerCallId);
    }
    if (
      error.kind === "network" ||
      error.kind === "timeout" ||
      (error.kind === "provider" && (error.statusCode ?? 0) >= 500)
    ) {
      return failed("retryable", "NAVER_PROVIDER_RETRYABLE", providerCallId);
    }
    return failed("failed", "NAVER_PROVIDER_REJECTED", providerCallId);
  }
  if (error instanceof NaverSearchAdsRequestError) {
    if (
      error.kind === "network" ||
      error.kind === "timeout" ||
      (error.kind === "provider" && (error.statusCode ?? 0) >= 500)
    ) {
      return failed("retryable", "NAVER_PROVIDER_RETRYABLE", providerCallId);
    }
    return failed("failed", "NAVER_PROVIDER_REJECTED", providerCallId);
  }
  if (error instanceof NaverSearchAdsValidationError) {
    return failed("failed", "NAVER_PROVIDER_INPUT_INVALID", providerCallId);
  }
  return failed("failed", "NAVER_PROVIDER_FAILED", providerCallId);
}

/** 각 source를 독립적으로 실행해 한 provider 오류가 나머지 수집을 막지 않는다. */
export async function collectNaverObservation(
  input: NaverCollectionInput,
  dependencies: NaverCollectorDependencies,
): Promise<NaverObservationRecord> {
  const query = validateInput(input);
  let callsUsed = 0;

  async function execute<S extends NaverObservationSource>(
    source: S,
    operation: () => Promise<NaverSourceValueMap[S]>,
  ): Promise<NaverSourceResult<NaverSourceValueMap[S]>> {
    const plan = input.sourcePlans?.[source] as NaverSourcePlan<S> | undefined;
    const providerCallId = plan?.providerCallId ?? null;
    if (plan?.disposition === "replay") return succeeded(plan.value, providerCallId);
    if (plan?.disposition === "in_doubt") {
      return failed("retryable", "NAVER_PROVIDER_CALL_IN_DOUBT", providerCallId);
    }
    if (plan?.disposition === "skip") {
      return unavailable(plan.errorCode, null);
    }
    const cost = NAVER_SOURCE_CALL_COSTS[source];
    if (callsUsed + cost > input.callBudget.maxCalls) {
      return unavailable("NAVER_CALL_BUDGET_EXCEEDED", providerCallId);
    }
    callsUsed += cost;
    try {
      return succeeded(await operation(), providerCallId);
    } catch (error) {
      return mapProviderError(error, providerCallId);
    }
  }

  const searchAdsMonthlyVolume = await execute(
    "search_ads_monthly_volume",
    () => dependencies.provider.getMonthlySearchVolume({ query }),
  );
  const datalabTrend = await execute(
    "datalab_trend",
    () => dependencies.provider.getRelativeTrend({ query, range: input.range }),
  );
  const datalabGender = await execute(
    "datalab_gender",
    () => dependencies.provider.getGenderDemographics({ query, range: input.range }),
  );
  const datalabAge = await execute(
    "datalab_age",
    () => dependencies.provider.getAgeDemographics({ query, range: input.range }),
  );
  const searchApiBlogTotal = await execute(
    "search_api_blog_total",
    () => dependencies.provider.getBlogResultTotal({ query }),
  );
  const sources: NaverObservationSources = {
    search_ads_monthly_volume: searchAdsMonthlyVolume,
    datalab_trend: datalabTrend,
    datalab_gender: datalabGender,
    datalab_age: datalabAge,
    search_api_blog_total: searchApiBlogTotal,
  };
  const sourceResults = Object.values(sources);
  const allSucceeded = sourceResults.every((source) => source.status === "succeeded");
  const hasSucceeded = sourceResults.some((source) => source.status === "succeeded");
  const hasBudgetSkip = sourceResults.some(
    (source) => source.errorCode === "NAVER_CALL_BUDGET_EXCEEDED",
  );
  const status: NaverCollectionStatus = allSucceeded
    ? "succeeded"
    : hasSucceeded || hasBudgetSkip
      ? "partial"
      : "failed";
  const record: NaverObservationRecord = {
    observationKey: createNaverObservationKey(input),
    workspaceId: input.workspaceId,
    siteId: input.siteId,
    trackedQueryId: input.trackedQueryId,
    query,
    observedAt: new Date(input.observedAt).toISOString(),
    collectedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    range: input.range,
    status,
    callsUsed,
    sources,
  };
  await dependencies.store.upsert(record);
  return record;
}
