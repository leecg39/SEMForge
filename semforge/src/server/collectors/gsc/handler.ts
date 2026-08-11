// @TASK P3-C2-T1 - Worker-aligned GSC collection job handler
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
// @TEST src/server/collectors/gsc/handler.test.ts
import { createHash } from "node:crypto";

import {
  type GscCollectionOperation,
  type GscProviderCallIds,
  type GscWeeklyCollector,
} from "@/server/collectors/gsc/collector";
import { calculateMatureGscWindows } from "@/server/collectors/gsc/date-windows";
import { GscCollectorAccessError } from "@/server/collectors/gsc/target";
import {
  defineJobHandler,
  jobDead,
  jobRetryable,
  jobSucceeded,
  type JobHandler,
  type JobHandlerResult,
  type ProviderCallCoordinator,
  type ProviderCallReservation,
} from "@/server/jobs/contracts";
import {
  type WorkerConnectionPool,
  type WorkerSqlClient,
  withDedicatedWorkerConnection,
} from "@/server/jobs/connection";

export const GSC_WEEKLY_COLLECTION_JOB = "collect.gsc.weekly";
const PROVIDER = "google-search-console";
const OPERATIONS: readonly GscCollectionOperation[] = [
  "aggregate",
  "top_queries",
  "top_pages",
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type GscCollectionJobPayload = Record<string, unknown> & {
  readonly siteId: string;
  readonly bindingId: string;
  readonly executedAt: string;
};

export interface GscCollectionJobHandlerOptions {
  readonly collector: GscWeeklyCollector;
}

export interface DedicatedGscCollectionJobHandlerOptions {
  readonly pool: WorkerConnectionPool;
  readonly createCollector: (client: WorkerSqlClient) => GscWeeklyCollector;
}

type ParsedPayload = {
  siteId: string;
  bindingId: string;
  executedAt: Date;
};

function parsePayload(payload: Readonly<Record<string, unknown>>): ParsedPayload | null {
  if (
    typeof payload.siteId !== "string" ||
    !UUID_PATTERN.test(payload.siteId) ||
    typeof payload.bindingId !== "string" ||
    !UUID_PATTERN.test(payload.bindingId) ||
    typeof payload.executedAt !== "string"
  ) {
    return null;
  }
  const executedAt = new Date(payload.executedAt);
  if (
    Number.isNaN(executedAt.getTime()) ||
    executedAt.toISOString() !== payload.executedAt
  ) {
    return null;
  }
  return {
    siteId: payload.siteId,
    bindingId: payload.bindingId,
    executedAt,
  };
}

function sha256Request(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function dateStart(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateEnd(value: string): Date {
  return new Date(`${value}T23:59:59.999Z`);
}

function terminalResult(
  error: string,
  attempt: number,
  maxAttempts: number,
  retryable: boolean,
): JobHandlerResult {
  return retryable && attempt < maxAttempts
    ? jobRetryable(error)
    : jobDead(error);
}

function providerCallIds(
  reservations: Readonly<Record<GscCollectionOperation, ProviderCallReservation>>,
): GscProviderCallIds {
  return {
    aggregate: reservations.aggregate.providerCallId,
    topQueries: reservations.top_queries.providerCallId,
    topPages: reservations.top_pages.providerCallId,
  };
}

function collectorFailure(error: unknown): {
  errorCode: string;
  retryable: boolean;
} {
  if (error instanceof GscCollectorAccessError) {
    return {
      errorCode: `GSC_${error.code}`,
      retryable: error.code === "UPSTREAM",
    };
  }
  return { errorCode: "GSC_COLLECTOR_FAILED", retryable: true };
}

function reservationProvenance(
  operations: readonly GscCollectionOperation[],
  reservations: Readonly<Record<GscCollectionOperation, ProviderCallReservation>>,
  status: "succeeded" | "in_doubt",
): ReadonlyArray<Readonly<Record<string, unknown>>> {
  return operations.map((operation) => ({
    provider: PROVIDER,
    operation,
    providerCallId: reservations[operation].providerCallId,
    collectedAt:
      status === "succeeded" &&
      typeof reservations[operation].responseMetadata?.collectedAt === "string"
        ? reservations[operation].responseMetadata.collectedAt
        : null,
    status,
    errorCode: status === "in_doubt" ? "GSC_PROVIDER_CALL_IN_DOUBT" : null,
    replayed: status === "succeeded",
  }));
}

function hasCompleteReplayProvenance(
  provenance: ReadonlyArray<Readonly<Record<string, unknown>>>,
): boolean {
  return provenance.every((entry) => {
    if (typeof entry.collectedAt !== "string") return false;
    const parsed = new Date(entry.collectedAt);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === entry.collectedAt;
  });
}

function executedProviderProvenance(
  operations: readonly GscCollectionOperation[],
  reservations: Readonly<Record<GscCollectionOperation, ProviderCallReservation>>,
  result: Awaited<ReturnType<GscWeeklyCollector["collect"]>>,
): ReadonlyArray<Readonly<Record<string, unknown>>> {
  return operations.map((operation) => {
    const reservation = reservations[operation];
    const provenance = result.providerCalls.find(
      (call) =>
        call.operation === operation &&
        call.providerCallId === reservation.providerCallId,
    );
    return {
      provider: PROVIDER,
      operation,
      providerCallId: reservation.providerCallId,
      collectedAt: provenance?.collectedAt ?? null,
      status: provenance?.status ?? "failed",
      errorCode: provenance?.errorCode ??
        (provenance ? null : "GSC_PROVIDER_RESULT_MISSING"),
      replayed: false,
    };
  });
}

async function failUnusedExecuteReservations(
  reservations: Partial<Record<GscCollectionOperation, ProviderCallReservation>>,
  providerCalls: ProviderCallCoordinator,
  errorCode: string,
): Promise<void> {
  await Promise.allSettled(
    OPERATIONS.flatMap((operation) => {
      const reservation = reservations[operation];
      if (!reservation || reservation.disposition !== "execute") return [];
      return [providerCalls.fail({
        providerCallId: reservation.providerCallId,
        usageReservationId: reservation.usageReservationId,
        errorCode,
      })];
    }),
  );
}

export function createGscCollectionJobHandler(
  options: GscCollectionJobHandlerOptions,
): JobHandler<GscCollectionJobPayload> {
  return defineJobHandler<GscCollectionJobPayload>(async (job, context) => {
    if (job.type !== GSC_WEEKLY_COLLECTION_JOB) return jobDead("GSC_JOB_TYPE_MISMATCH");
    if (
      job.workspaceId !== context.workspaceId ||
      job.id !== context.jobId ||
      job.attempt !== context.attempt ||
      job.maxAttempts !== context.maxAttempts
    ) {
      return jobDead("GSC_WORKSPACE_MISMATCH");
    }
    const payload = parsePayload(job.payload);
    if (!payload) return jobDead("GSC_INVALID_PAYLOAD");
    if (context.signal.aborted) {
      return terminalResult(
        "GSC_ABORTED",
        context.attempt,
        context.maxAttempts,
        true,
      );
    }

    const windows = calculateMatureGscWindows(payload.executedAt);
    try {
      await context.audit("collector.gsc.started", {
        siteId: payload.siteId,
        bindingId: payload.bindingId,
        periodEnd: windows.current.endDate,
      });
    } catch {
      return terminalResult(
        "GSC_AUDIT_FAILED",
        context.attempt,
        context.maxAttempts,
        true,
      );
    }

    const pendingReservations: Partial<
      Record<GscCollectionOperation, ProviderCallReservation>
    > = {};
    try {
      for (const operation of OPERATIONS) {
        const isAggregate = operation === "aggregate";
        pendingReservations[operation] = await context.providerCalls.reserve({
          provider: PROVIDER,
          operation: `search_analytics.${operation}`,
          idempotencyKey: `${job.idempotencyKey}:gsc:${operation}`,
          requestHash: sha256Request({
            workspaceId: job.workspaceId,
            siteId: payload.siteId,
            bindingId: payload.bindingId,
            operation,
            startDate: isAggregate
              ? windows.comparison.startDate
              : windows.current.startDate,
            endDate: windows.current.endDate,
          }),
          resource: "gsc.search_analytics",
          units: 1,
          periodStart: dateStart(
            isAggregate ? windows.comparison.startDate : windows.current.startDate,
          ),
          periodEnd: dateEnd(windows.current.endDate),
          reservationExpiresAt: context.lease.expiresAt,
        });
      }
    } catch {
      await failUnusedExecuteReservations(
        pendingReservations,
        context.providerCalls,
        "GSC_PROVIDER_RESERVATION_FAILED",
      );
      return terminalResult(
        "GSC_PROVIDER_RESERVATION_FAILED",
        context.attempt,
        context.maxAttempts,
        true,
      );
    }
    const reservations = pendingReservations as Record<
      GscCollectionOperation,
      ProviderCallReservation
    >;

    const inDoubt = OPERATIONS.filter(
      (operation) => reservations[operation].disposition === "in_doubt",
    );
    if (inDoubt.length > 0) {
      await failUnusedExecuteReservations(
        reservations,
        context.providerCalls,
        "GSC_PROVIDER_CALL_IN_DOUBT",
      );
      try {
        await context.audit("collector.gsc.in_doubt", {
          providerCalls: reservationProvenance(inDoubt, reservations, "in_doubt"),
        });
      } catch {
        return terminalResult(
          "GSC_AUDIT_FAILED",
          context.attempt,
          context.maxAttempts,
          true,
        );
      }
      return terminalResult(
        "GSC_PROVIDER_CALL_IN_DOUBT",
        context.attempt,
        context.maxAttempts,
        true,
      );
    }

    const executeOperations = OPERATIONS.filter(
      (operation) => reservations[operation].disposition === "execute",
    );
    const replayOperations = OPERATIONS.filter(
      (operation) => reservations[operation].disposition === "replay",
    );
    const replayedProviderCalls = reservationProvenance(
      replayOperations,
      reservations,
      "succeeded",
    );
    if (!hasCompleteReplayProvenance(replayedProviderCalls)) {
      await failUnusedExecuteReservations(
        reservations,
        context.providerCalls,
        "GSC_REPLAY_METADATA_INVALID",
      );
      try {
        await context.audit("collector.gsc.replay_metadata_invalid", {
          providerCalls: replayedProviderCalls,
        });
      } catch {
        return terminalResult(
          "GSC_AUDIT_FAILED",
          context.attempt,
          context.maxAttempts,
          true,
        );
      }
      return terminalResult(
        "GSC_REPLAY_METADATA_INVALID",
        context.attempt,
        context.maxAttempts,
        true,
      );
    }
    if (executeOperations.length === 0) {
      try {
        await context.audit("collector.gsc.finished", {
          status: "succeeded",
          observationCount: 0,
          providerCalls: replayedProviderCalls,
          replayedProviderCalls,
        });
      } catch {
        return terminalResult(
          "GSC_AUDIT_FAILED",
          context.attempt,
          context.maxAttempts,
          true,
        );
      }
      return jobSucceeded({
        status: "succeeded",
        observationCount: 0,
        replayedProviderCalls,
      });
    }

    let result;
    try {
      result = await options.collector.collect({
        workspaceId: job.workspaceId,
        siteId: payload.siteId,
        bindingId: payload.bindingId,
        executedAt: payload.executedAt,
        providerCallIds: providerCallIds(reservations),
        operations: executeOperations,
      });
    } catch (error) {
      if (!(error instanceof GscCollectorAccessError)) {
        try {
          await context.audit("collector.gsc.outcome_in_doubt", {
            providerCalls: reservationProvenance(
              executeOperations,
              reservations,
              "in_doubt",
            ),
          });
        } catch {
          // Ambiguous provider calls must remain started even when audit storage is unavailable.
        }
        return terminalResult(
          "GSC_COLLECTOR_OUTCOME_IN_DOUBT",
          context.attempt,
          context.maxAttempts,
          true,
        );
      }
      const failure = collectorFailure(error);
      await failUnusedExecuteReservations(
        reservations,
        context.providerCalls,
        failure.errorCode,
      );
      return terminalResult(
        failure.errorCode,
        context.attempt,
        context.maxAttempts,
        failure.retryable,
      );
    }

    let handlerError: { errorCode: string; retryable: boolean } | null = null;
    try {
      for (const operation of executeOperations) {
        const provenance = result.providerCalls.find(
          (call) =>
            call.operation === operation &&
            call.providerCallId === reservations[operation].providerCallId,
        );
        const reservation = reservations[operation];
        if (!provenance) {
          await context.providerCalls.fail({
            providerCallId: reservation.providerCallId,
            usageReservationId: reservation.usageReservationId,
            errorCode: "GSC_PROVIDER_RESULT_MISSING",
          });
          handlerError ??= { errorCode: "GSC_PROVIDER_RESULT_MISSING", retryable: true };
        } else if (provenance.status === "succeeded") {
          await context.providerCalls.succeed({
            providerCallId: reservation.providerCallId,
            usageReservationId: reservation.usageReservationId,
            responseMetadata: {
              operation,
              observationCount: result.observations.filter(
                (observation) => observation.providerCallId === reservation.providerCallId,
              ).length,
              collectedAt: provenance.collectedAt,
            },
            costUnits: 1,
          });
        } else {
          const errorCode = provenance.errorCode ?? "GSC_PROVIDER_FAILED";
          await context.providerCalls.fail({
            providerCallId: reservation.providerCallId,
            usageReservationId: reservation.usageReservationId,
            errorCode,
          });
          handlerError ??= {
            errorCode,
            retryable: provenance.status === "retryable",
          };
        }
      }
    } catch {
      return terminalResult(
        "GSC_PROVIDER_COORDINATION_FAILED",
        context.attempt,
        context.maxAttempts,
        true,
      );
    }

    const providerCalls = [
      ...executedProviderProvenance(executeOperations, reservations, result),
      ...replayedProviderCalls,
    ];
    const succeededProviderCalls = providerCalls.filter(
      (call) => call.status === "succeeded",
    ).length;
    const collectionStatus = succeededProviderCalls === providerCalls.length
      ? "succeeded"
      : succeededProviderCalls === 0
        ? "failed"
        : "partial";
    try {
      await context.audit("collector.gsc.finished", {
        status: collectionStatus,
        observationCount: result.observations.length,
        providerCalls,
        replayedProviderCalls,
      });
    } catch {
      return terminalResult(
        "GSC_AUDIT_FAILED",
        context.attempt,
        context.maxAttempts,
        true,
      );
    }
    if (handlerError) {
      return terminalResult(
        handlerError.errorCode,
        context.attempt,
        context.maxAttempts,
        handlerError.retryable,
      );
    }
    return jobSucceeded({
      status: collectionStatus,
      observationCount: result.observations.length,
      providerCalls,
      replayedProviderCalls,
      periodEnd: result.windows.current.endDate,
    });
  });
}

/**
 * Production composition seam: target lookup, token refresh, API collection and
 * observation upsert can all be created from the same pinned worker client.
 */
export function createDedicatedGscCollectionJobHandler(
  options: DedicatedGscCollectionJobHandlerOptions,
): JobHandler<GscCollectionJobPayload> {
  return defineJobHandler<GscCollectionJobPayload>((job, context) =>
    withDedicatedWorkerConnection(options.pool, async (client) => {
      const handler = createGscCollectionJobHandler({
        collector: options.createCollector(client),
      });
      return handler(job, context);
    })
  );
}
