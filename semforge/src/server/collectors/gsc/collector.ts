// @TASK P3-C2-T1 - Weekly Search Console collection orchestration
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/collectors/gsc/collector.test.ts
import { createHash } from "node:crypto";

import {
  GscSearchAnalyticsError,
  type GscSearchAnalyticsClient,
  type GscSearchAnalyticsRow,
  type GscSearchDimension,
} from "@/server/collectors/gsc/client";
import {
  calculateMatureGscWindows,
  type GscMatureWindows,
} from "@/server/collectors/gsc/date-windows";
import {
  GscCollectorAccessError,
  type GscCollectionTarget,
} from "@/server/collectors/gsc/target";
import type { GscTokenBroker } from "@/server/collectors/gsc/token-broker";

export type GscCollectionOperation = "aggregate" | "top_queries" | "top_pages";

export interface GscProviderCallIds {
  readonly aggregate: string;
  readonly topQueries: string;
  readonly topPages: string;
}

export interface GscObservation {
  readonly observationKey: string;
  readonly workspaceId: string;
  readonly siteId: string;
  readonly bindingId: string;
  readonly providerCallId: string;
  readonly collectedAt: string;
  readonly dataDate: string;
  readonly dimensionHash: string;
  readonly dimensions: Readonly<Record<string, string>>;
  readonly clicks: number;
  readonly impressions: number;
  readonly ctr: number;
  readonly position: number;
}

export interface GscObservationStore {
  upsertMany(observations: readonly GscObservation[]): Promise<void>;
}

export interface GscProviderCallProvenance {
  readonly provider: "google-search-console";
  readonly operation: GscCollectionOperation;
  readonly providerCallId: string;
  readonly collectedAt: string;
  readonly status: "succeeded" | "retryable" | "failed";
  readonly errorCode?: string;
}

export interface GscWeeklyCollectionInput {
  readonly workspaceId: string;
  readonly siteId: string;
  readonly bindingId: string;
  readonly executedAt: Date;
  readonly providerCallIds: GscProviderCallIds;
  /** replay된 provider operation을 외부 API에서 다시 실행하지 않도록 제한한다. */
  readonly operations?: readonly GscCollectionOperation[];
}

export interface GscWeeklyCollectionResult {
  readonly status: "succeeded" | "partial" | "failed";
  readonly windows: GscMatureWindows;
  readonly observations: readonly GscObservation[];
  readonly providerCalls: readonly GscProviderCallProvenance[];
}

export interface GscWeeklyCollector {
  collect(input: GscWeeklyCollectionInput): Promise<GscWeeklyCollectionResult>;
}

export interface GscWeeklyCollectorOptions {
  readonly targetLoader: (input: {
    workspaceId: string;
    siteId: string;
    bindingId: string;
  }) => Promise<GscCollectionTarget>;
  readonly tokenBroker: GscTokenBroker;
  readonly searchAnalyticsClient: GscSearchAnalyticsClient;
  readonly observationStore: GscObservationStore;
  readonly now?: () => Date;
}

type OperationSpec = {
  operation: GscCollectionOperation;
  providerCallId: string;
  dimensions: readonly [GscSearchDimension];
  startDate: string;
  endDate: string;
  rowLimit: number;
  dataDate: (row: GscSearchAnalyticsRow) => string;
};

type OperationOutcome =
  | { spec: OperationSpec; status: "succeeded"; rows: GscSearchAnalyticsRow[] }
  | {
      spec: OperationSpec;
      status: "retryable" | "failed";
      errorCode: string;
    };

function canonicalDimensions(dimensions: Readonly<Record<string, string>>): string {
  const entries = Object.entries(dimensions).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  );
  return JSON.stringify(entries);
}

export function gscDimensionHash(
  dimensions: Readonly<Record<string, string>>,
): string {
  return createHash("sha256").update(canonicalDimensions(dimensions)).digest("hex");
}

function observationKey(input: {
  workspaceId: string;
  bindingId: string;
  dataDate: string;
  dimensionHash: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify([
      "gsc",
      input.workspaceId,
      input.bindingId,
      input.dataDate,
      input.dimensionHash,
    ]))
    .digest("hex");
}

function safeFailure(error: unknown): {
  status: "retryable" | "failed";
  errorCode: string;
} {
  if (error instanceof GscSearchAnalyticsError) {
    if (error.code === "UNAUTHORIZED" || error.code === "INVALID_REQUEST") {
      return { status: "failed", errorCode: error.code };
    }
    return { status: "retryable", errorCode: error.code };
  }
  return { status: "retryable", errorCode: "UPSTREAM" };
}

function assertTarget(
  target: GscCollectionTarget,
  input: GscWeeklyCollectionInput,
): void {
  if (
    target.workspaceId !== input.workspaceId ||
    target.siteId !== input.siteId ||
    target.bindingId !== input.bindingId
  ) {
    throw new GscCollectorAccessError("FORBIDDEN");
  }
}

export function createGscWeeklyCollector(
  options: GscWeeklyCollectorOptions,
): GscWeeklyCollector {
  const now = options.now ?? (() => new Date());

  return {
    async collect(input) {
      const target = await options.targetLoader({
        workspaceId: input.workspaceId,
        siteId: input.siteId,
        bindingId: input.bindingId,
      });
      assertTarget(target, input);
      const accessToken = await options.tokenBroker.getAccessToken({
        workspaceId: input.workspaceId,
        connectionId: target.connectionId,
      });
      const windows = calculateMatureGscWindows(input.executedAt);
      const collectedAt = now().toISOString();
      const allOperationSpecs: OperationSpec[] = [
        {
          operation: "aggregate",
          providerCallId: input.providerCallIds.aggregate,
          dimensions: ["date"],
          startDate: windows.comparison.startDate,
          endDate: windows.current.endDate,
          rowLimit: 25_000,
          dataDate: (row) => row.dimensions.date!,
        },
        {
          operation: "top_queries",
          providerCallId: input.providerCallIds.topQueries,
          dimensions: ["query"],
          startDate: windows.current.startDate,
          endDate: windows.current.endDate,
          rowLimit: 1_000,
          dataDate: () => windows.current.endDate,
        },
        {
          operation: "top_pages",
          providerCallId: input.providerCallIds.topPages,
          dimensions: ["page"],
          startDate: windows.current.startDate,
          endDate: windows.current.endDate,
          rowLimit: 1_000,
          dataDate: () => windows.current.endDate,
        },
      ];
      const selectedOperations = new Set(input.operations ?? [
        "aggregate",
        "top_queries",
        "top_pages",
      ]);
      const operationSpecs = allOperationSpecs.filter((spec) =>
        selectedOperations.has(spec.operation)
      );

      const outcomes: OperationOutcome[] = await Promise.all(
        operationSpecs.map(async (spec): Promise<OperationOutcome> => {
          try {
            const rows = await options.searchAnalyticsClient.query(
              accessToken,
              target.propertyUri,
              {
                startDate: spec.startDate,
                endDate: spec.endDate,
                dimensions: spec.dimensions,
                rowLimit: spec.rowLimit,
              },
            );
            return { spec, status: "succeeded", rows };
          } catch (error) {
            return { spec, ...safeFailure(error) };
          }
        }),
      );

      const observations: GscObservation[] = [];
      for (const outcome of outcomes) {
        if (outcome.status !== "succeeded") continue;
        for (const row of outcome.rows) {
          const dataDate = outcome.spec.dataDate(row);
          const dimensionHash = gscDimensionHash(row.dimensions);
          const observation: GscObservation = {
            observationKey: observationKey({
              workspaceId: input.workspaceId,
              bindingId: input.bindingId,
              dataDate,
              dimensionHash,
            }),
            workspaceId: input.workspaceId,
            siteId: input.siteId,
            bindingId: input.bindingId,
            providerCallId: outcome.spec.providerCallId,
            collectedAt,
            dataDate,
            dimensionHash,
            dimensions: row.dimensions,
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.ctr,
            position: row.position,
          };
          observations.push(observation);
        }
      }
      if (observations.length > 0) {
        await options.observationStore.upsertMany(observations);
      }

      const providerCalls: GscProviderCallProvenance[] = outcomes.map((outcome) =>
        outcome.status === "succeeded"
          ? {
              provider: "google-search-console",
              operation: outcome.spec.operation,
              providerCallId: outcome.spec.providerCallId,
              collectedAt,
              status: "succeeded",
            }
          : {
              provider: "google-search-console",
              operation: outcome.spec.operation,
              providerCallId: outcome.spec.providerCallId,
              collectedAt,
              status: outcome.status,
              errorCode: outcome.errorCode,
            }
      );
      const succeeded = outcomes.filter((outcome) => outcome.status === "succeeded").length;
      return {
        status: succeeded === outcomes.length ? "succeeded" : succeeded === 0 ? "failed" : "partial",
        windows,
        observations,
        providerCalls,
      };
    },
  };
}
