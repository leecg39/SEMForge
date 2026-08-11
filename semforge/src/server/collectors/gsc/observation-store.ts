// @TASK P3-C2-T1 - PostgreSQL-backed GSC observation port
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/collectors/gsc/observation-store.integration.test.ts
import type {
  GscObservation,
  GscObservationStore,
} from "@/server/collectors/gsc/collector";
import {
  type GscSqlSource,
  withGscWorkspaceTransaction,
} from "@/server/collectors/gsc/database";

const OBSERVATION_BATCH_SIZE = 250;
const OBSERVATION_COLUMN_COUNT = 12;

function chunks<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function observationValues(observation: GscObservation): readonly unknown[] {
  return [
    observation.workspaceId,
    observation.siteId,
    observation.bindingId,
    observation.providerCallId,
    observation.collectedAt,
    observation.dataDate,
    observation.dimensionHash,
    JSON.stringify(observation.dimensions),
    observation.clicks,
    observation.impressions,
    observation.ctr,
    observation.position,
  ];
}

function valuesClause(rowCount: number): string {
  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const offset = rowIndex * OBSERVATION_COLUMN_COUNT;
    const placeholders = Array.from(
      { length: OBSERVATION_COLUMN_COUNT },
      (_, columnIndex) => `$${offset + columnIndex + 1}`,
    );
    placeholders[7] = `${placeholders[7]}::jsonb`;
    return `(${placeholders.join(", ")})`;
  }).join(", ");
}

export function createPostgresGscObservationStore(
  db: GscSqlSource,
): GscObservationStore {
  return {
    async upsertMany(observations: readonly GscObservation[]): Promise<void> {
      if (observations.length === 0) return;
      const workspaceId = observations[0]!.workspaceId;
      if (observations.some((observation) => observation.workspaceId !== workspaceId)) {
        throw new Error("GSC_OBSERVATION_WORKSPACE_MISMATCH");
      }
      await withGscWorkspaceTransaction(
        db,
        workspaceId,
        async (client) => {
          for (const batch of chunks(observations, OBSERVATION_BATCH_SIZE)) {
            await client.query(
            `insert into gsc_observations
             (workspace_id, site_id, binding_id, provider_call_id, collected_at,
              data_date, dimension_hash, dimensions, clicks, impressions, ctr, position)
           values ${valuesClause(batch.length)}
           on conflict (workspace_id, binding_id, data_date, dimension_hash)
           do update set
             site_id = excluded.site_id,
             provider_call_id = excluded.provider_call_id,
             collected_at = excluded.collected_at,
             dimensions = excluded.dimensions,
             clicks = excluded.clicks,
             impressions = excluded.impressions,
             ctr = excluded.ctr,
             position = excluded.position`,
              batch.flatMap(observationValues),
            );
          }
        },
      );
    },
  };
}
