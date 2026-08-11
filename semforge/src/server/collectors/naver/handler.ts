// @TASK P3-C2-T1 - NAVER worker job handler
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/collectors/naver/handler.test.ts
import { createHash } from "node:crypto";

import {
  defineJobHandler,
  jobDead,
  jobRetryable,
  jobSucceeded,
  type JobHandler,
  type JobHandlerInput,
  type JobHandlerResult,
  type ProviderCallReservation,
} from "@/server/jobs/contracts";
import type { NaverProvider } from "@/server/providers/naver/contracts";
import {
  NAVER_SOURCE_CALL_COSTS,
  collectNaverObservation,
  type NaverCollectionInput,
  type NaverObservationRecord,
  type NaverObservationSource,
  type NaverObservationStore,
  type NaverSourcePlan,
  type NaverSourcePlans,
  type NaverSourceValueMap,
} from "@/server/collectors/naver/collector";

const NAVER_SOURCES = [
  "search_ads_monthly_volume",
  "datalab_trend",
  "datalab_gender",
  "datalab_age",
  "search_api_blog_total",
] as const satisfies readonly NaverObservationSource[];

export type NaverCollectionJobPayload = NaverCollectionInput & Record<string, unknown>;

export interface NaverCollectionJobDependencies {
  readonly provider: NaverProvider;
  readonly store: NaverObservationStore;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isCanonicalIsoTimestamp(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function isPayload(value: unknown): value is NaverCollectionJobPayload {
  if (!isRecord(value) || !isRecord(value.range) || !isRecord(value.callBudget)) return false;
  if (
    typeof value.workspaceId === "string" &&
    typeof value.siteId === "string" &&
    typeof value.trackedQueryId === "string" &&
    typeof value.query === "string" &&
    typeof value.observedAt === "string" &&
    typeof value.range.startDate === "string" &&
    typeof value.range.endDate === "string" &&
    typeof value.range.timeUnit === "string" &&
    ["date", "week", "month"].includes(value.range.timeUnit) &&
    typeof value.callBudget.maxCalls === "number"
  ) {
    return (
      Boolean(value.workspaceId.trim()) &&
      Boolean(value.siteId.trim()) &&
      Boolean(value.trackedQueryId.trim()) &&
      Boolean(value.query.normalize("NFKC").trim()) &&
      isCanonicalIsoTimestamp(value.observedAt) &&
      isCalendarDate(value.range.startDate) &&
      isCalendarDate(value.range.endDate) &&
      value.range.startDate <= value.range.endDate &&
      Number.isSafeInteger(value.callBudget.maxCalls) &&
      value.callBudget.maxCalls >= 0
    );
  }
  return false;
}

function providerName(source: NaverObservationSource): string {
  return source === "search_ads_monthly_volume" ? "naver-search-ads" : "naver-open-api";
}

function requestHash(payload: NaverCollectionJobPayload, source: NaverObservationSource): string {
  return createHash("sha256")
    .update(JSON.stringify({
      version: 1,
      source,
      workspaceId: payload.workspaceId,
      siteId: payload.siteId,
      trackedQueryId: payload.trackedQueryId,
      query: payload.query.normalize("NFKC").trim().replace(/\s+/g, " "),
      observedAt: payload.observedAt,
      range: payload.range,
    }))
    .digest("hex");
}

function hasCommonProviderValue(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.source === "string" &&
    typeof value.collectedAt === "string" &&
    !Number.isNaN(Date.parse(value.collectedAt))
  );
}

function isReplayValue<S extends NaverObservationSource>(
  source: S,
  value: unknown,
): value is NaverSourceValueMap[S] {
  if (!hasCommonProviderValue(value)) return false;
  switch (source) {
    case "search_ads_monthly_volume":
      return value.source === "naver-search-ads-relkwdstat" && "pc" in value && "mobile" in value;
    case "datalab_trend":
      return value.source === "naver-datalab-search" && Array.isArray(value.points);
    case "datalab_gender":
    case "datalab_age":
      return value.source === "naver-datalab-search" && Array.isArray(value.segments);
    case "search_api_blog_total":
      return (
        value.source === "naver-search-blog" &&
        typeof value.total === "number" &&
        Number.isSafeInteger(value.total) &&
        value.total >= 0
      );
  }
}

function retryOrDead(
  job: JobHandlerInput<NaverCollectionJobPayload>,
  retryCode: string,
  exhaustedCode: string,
): JobHandlerResult {
  return job.attempt >= job.maxAttempts ? jobDead(exhaustedCode) : jobRetryable(retryCode);
}

function replayPlan<S extends NaverObservationSource>(
  source: S,
  reservation: ProviderCallReservation,
): NaverSourcePlan<S> | null {
  const value = reservation.responseMetadata?.value;
  if (!isReplayValue(source, value)) return null;
  return {
    disposition: "replay",
    providerCallId: reservation.providerCallId,
    value,
  };
}

function auditedSources(
  record: NaverObservationRecord,
  plans: NaverSourcePlans,
): ReadonlyArray<Readonly<Record<string, unknown>>> {
  return NAVER_SOURCES.map((source) => {
    const result = record.sources[source];
    const disposition = plans[source]?.disposition;
    return {
      source,
      disposition: disposition === "replay"
        ? "replayed"
        : disposition === "skip"
          ? "skipped"
          : "executed",
      providerCallId: result.providerCallId,
      collectedAt: result.provenance?.collectedAt ?? record.collectedAt,
      status: result.status,
      errorCode: result.errorCode,
    };
  });
}

function auditedPlans(
  plans: NaverSourcePlans,
  mode: "reservation_in_doubt" | "outcome_in_doubt",
): ReadonlyArray<Readonly<Record<string, unknown>>> {
  const audited: Array<Readonly<Record<string, unknown>>> = [];
  for (const source of NAVER_SOURCES) {
    const plan = plans[source] as NaverSourcePlan<NaverObservationSource> | undefined;
    if (!plan) continue;
    if (plan.disposition === "replay") {
      audited.push({
        source,
        disposition: "replayed",
        providerCallId: plan.providerCallId,
        collectedAt: plan.value.collectedAt,
        status: "succeeded",
        errorCode: null,
      });
      continue;
    }
    if (plan.disposition === "skip") {
      audited.push({
        source,
        disposition: "skipped",
        providerCallId: null,
        collectedAt: null,
        status: "unavailable",
        errorCode: plan.errorCode,
      });
      continue;
    }
    if (plan.disposition === "in_doubt" || mode === "outcome_in_doubt") {
      audited.push({
        source,
        disposition: "in_doubt",
        providerCallId: plan.providerCallId,
        collectedAt: null,
        status: "in_doubt",
        errorCode: mode === "outcome_in_doubt"
          ? "NAVER_COLLECTION_OUTCOME_IN_DOUBT"
          : "NAVER_PROVIDER_CALL_IN_DOUBT",
      });
      continue;
    }
    audited.push({
      source,
      disposition: "not_executed",
      providerCallId: plan.providerCallId,
      collectedAt: null,
      status: "failed",
      errorCode: "NAVER_RESERVATION_NOT_EXECUTED",
    });
  }
  return audited;
}

export function createNaverCollectionJobHandler(
  dependencies: NaverCollectionJobDependencies,
): JobHandler<NaverCollectionJobPayload> {
  return defineJobHandler<NaverCollectionJobPayload>(async (job, context) => {
    if (job.type !== "collect.naver") return jobDead("NAVER_JOB_TYPE_INVALID");
    if (!isPayload(job.payload)) return jobDead("NAVER_JOB_PAYLOAD_INVALID");
    if (
      context.workspaceId !== job.workspaceId ||
      job.payload.workspaceId !== job.workspaceId
    ) {
      return jobDead("NAVER_WORKSPACE_MISMATCH");
    }
    if (
      context.jobId !== job.id ||
      context.attempt !== job.attempt ||
      context.maxAttempts !== job.maxAttempts
    ) {
      return jobDead("NAVER_JOB_CONTEXT_MISMATCH");
    }
    if (context.signal.aborted) {
      return retryOrDead(job, "NAVER_JOB_ABORTED", "NAVER_JOB_ABORTED_EXHAUSTED");
    }

    await context.audit("naver.collection.started", {
      trackedQueryId: job.payload.trackedQueryId,
      observedAt: job.payload.observedAt,
    });

    const sourcePlans: NaverSourcePlans = {};
    const executeReservations = new Map<NaverObservationSource, ProviderCallReservation>();
    const inDoubtSources: NaverObservationSource[] = [];
    let collectionStarted = false;
    let plannedCalls = 0;
    const periodStart = new Date(`${job.payload.range.startDate}T00:00:00.000Z`);
    const periodEnd = new Date(`${job.payload.range.endDate}T23:59:59.999Z`);

    async function failUnusedReservations(): Promise<void> {
      const pending = [...executeReservations.entries()];
      executeReservations.clear();
      await Promise.allSettled(pending.map(([source, reservation]) =>
        context.providerCalls.fail({
          providerCallId: reservation.providerCallId,
          usageReservationId: reservation.usageReservationId,
          errorCode: "NAVER_RESERVATION_NOT_EXECUTED",
          responseMetadata: { source, status: "not_executed" },
        })
      ));
    }

    try {
      for (const source of NAVER_SOURCES) {
        const cost = NAVER_SOURCE_CALL_COSTS[source];
        if (plannedCalls + cost > job.payload.callBudget.maxCalls) {
          sourcePlans[source] = {
            disposition: "skip",
            providerCallId: null,
            errorCode: "NAVER_CALL_BUDGET_EXCEEDED",
          } as NaverSourcePlan<typeof source>;
          continue;
        }
        plannedCalls += cost;
        const reservation = await context.providerCalls.reserve({
          provider: providerName(source),
          operation: source,
          idempotencyKey: `${job.idempotencyKey}:naver:${source}`,
          requestHash: requestHash(job.payload, source),
          resource: `site/${job.payload.siteId}/tracked-query/${job.payload.trackedQueryId}`,
          units: cost,
          periodStart,
          periodEnd,
          reservationExpiresAt: context.lease.expiresAt,
        });
        if (reservation.disposition === "in_doubt") {
          sourcePlans[source] = {
            disposition: "in_doubt",
            providerCallId: reservation.providerCallId,
          } as NaverSourcePlans[typeof source];
          inDoubtSources.push(source);
          continue;
        }
        if (reservation.disposition === "replay") {
          const plan = replayPlan(source, reservation);
          if (!plan) {
            await failUnusedReservations();
            return jobDead("NAVER_PROVIDER_REPLAY_INVALID");
          }
          sourcePlans[source] = plan as NaverSourcePlans[typeof source];
          continue;
        }
        sourcePlans[source] = {
          disposition: "execute",
          providerCallId: reservation.providerCallId,
        } as NaverSourcePlans[typeof source];
        executeReservations.set(source, reservation);
      }

      if (inDoubtSources.length > 0) {
        await failUnusedReservations();
        await context.audit("naver.collection.in_doubt", {
          sources: auditedPlans(sourcePlans, "reservation_in_doubt"),
        });
        return retryOrDead(
          job,
          "NAVER_PROVIDER_CALL_IN_DOUBT",
          "NAVER_PROVIDER_CALL_IN_DOUBT_EXHAUSTED",
        );
      }

      if (context.signal.aborted) {
        await failUnusedReservations();
        return retryOrDead(job, "NAVER_JOB_ABORTED", "NAVER_JOB_ABORTED_EXHAUSTED");
      }
      collectionStarted = true;
      let record: NaverObservationRecord;
      try {
        record = await collectNaverObservation(
          { ...job.payload, sourcePlans },
          { provider: dependencies.provider, store: dependencies.store, now: context.now },
        );
      } catch {
        await context.audit("naver.collection.outcome_in_doubt", {
          sources: auditedPlans(sourcePlans, "outcome_in_doubt"),
        }).catch(() => undefined);
        return retryOrDead(
          job,
          "NAVER_COLLECTION_OUTCOME_IN_DOUBT",
          "NAVER_COLLECTION_OUTCOME_IN_DOUBT_EXHAUSTED",
        );
      }

      for (const source of NAVER_SOURCES) {
        const reservation = executeReservations.get(source);
        if (!reservation) continue;
        const result = record.sources[source];
        if (result.status === "succeeded" && result.value) {
          await context.providerCalls.succeed({
            providerCallId: reservation.providerCallId,
            usageReservationId: reservation.usageReservationId,
            costUnits: NAVER_SOURCE_CALL_COSTS[source],
            responseMetadata: {
              source,
              value: result.value,
              provenance: result.provenance,
            },
          });
        } else {
          await context.providerCalls.fail({
            providerCallId: reservation.providerCallId,
            usageReservationId: reservation.usageReservationId,
            errorCode: result.errorCode ?? "NAVER_PROVIDER_FAILED",
            responseMetadata: { source, status: result.status },
          });
        }
      }

      await context.audit("naver.collection.completed", {
        observationKey: record.observationKey,
        status: record.status,
        callsUsed: record.callsUsed,
        sources: auditedSources(record, sourcePlans),
      });
      if (Object.values(record.sources).some((source) => source.status === "retryable")) {
        return retryOrDead(
          job,
          "NAVER_COLLECTION_RETRYABLE",
          "NAVER_COLLECTION_RETRY_EXHAUSTED",
        );
      }
      if (record.status === "failed") return jobDead("NAVER_COLLECTION_FAILED");
      return jobSucceeded({
        observationKey: record.observationKey,
        collectionStatus: record.status,
        callsUsed: record.callsUsed,
      });
    } catch {
      if (!collectionStarted) {
        await failUnusedReservations().catch(() => undefined);
      }
      return retryOrDead(
        job,
        "NAVER_HANDLER_RETRYABLE",
        "NAVER_HANDLER_RETRY_EXHAUSTED",
      );
    }
  });
}
