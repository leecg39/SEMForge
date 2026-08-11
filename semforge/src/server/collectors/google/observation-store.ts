// @TASK P3-C1-T1 - Idempotent PostgreSQL Google observation persistence
// @SPEC docs/planning/06-tasks.md#p3-c1-t1--google-rank와-aio-수집
// @TEST src/server/collectors/google/observation-store.integration.test.ts
import type {
  GoogleAioObservation,
  GoogleObservationBatch,
  GoogleObservationRepository,
  GoogleRankObservation,
} from "@/server/collectors/google/collector";

export interface GoogleObservationSqlClient {
  query<T = unknown>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface GoogleObservationSqlConnection extends GoogleObservationSqlClient {
  release(): void;
}

export type GoogleObservationSqlSource = GoogleObservationSqlClient & {
  connect?: () => Promise<GoogleObservationSqlConnection>;
};

export class GoogleObservationStoreError extends Error {
  constructor(
    readonly code: "BOUNDARY_VIOLATION" | "INVALID_OBSERVATION",
    message: string,
  ) {
    super(message);
    this.name = "GoogleObservationStoreError";
  }
}

function invalidObservation(message: string): never {
  throw new GoogleObservationStoreError("INVALID_OBSERVATION", message);
}

function boundaryViolation(): never {
  throw new GoogleObservationStoreError(
    "BOUNDARY_VIOLATION",
    "workspace/site/query/provider boundary violation",
  );
}

function validateRank(observation: GoogleRankObservation): void {
  if (observation.position === null) {
    if (
      !observation.outsideTop100 ||
      observation.resultUrl !== null ||
      observation.resultTitle !== null
    ) {
      invalidObservation(">100 rank contract mismatch");
    }
    return;
  }
  if (
    observation.outsideTop100 ||
    !Number.isInteger(observation.position) ||
    observation.position < 1 ||
    observation.position > 100 ||
    !observation.resultUrl
  ) {
    invalidObservation("top100 rank contract mismatch");
  }
}

function validateAio(observation: GoogleAioObservation): void {
  const positions = new Set<number>();
  for (const citation of observation.citations) {
    let url: URL;
    try {
      url = new URL(citation.url);
    } catch {
      return invalidObservation("citation URL");
    }
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !Number.isInteger(citation.position) ||
      citation.position < 1 ||
      positions.has(citation.position)
    ) {
      invalidObservation("citation contract mismatch");
    }
    positions.add(citation.position);
  }
}

async function assertBatchBoundary(
  db: GoogleObservationSqlClient,
  batch: GoogleObservationBatch,
): Promise<void> {
  const expectedOperation =
    batch.aioObservations.length > 0 ? "google_serp_aio" : "google_serp_rank";
  const boundary = await db.query<{ site_found: boolean; provider_found: boolean }>(
    `select
       exists(select 1 from sites where workspace_id = $1 and id = $2) as site_found,
       exists(
         select 1
           from provider_calls
          where workspace_id = $1
            and id = $3
            and provider = 'talordata'
            and operation = $4
            and status = 'succeeded'
       ) as provider_found`,
    [batch.workspaceId, batch.siteId, batch.providerCallId, expectedOperation],
  );
  if (!boundary.rows[0]?.site_found || !boundary.rows[0]?.provider_found) {
    boundaryViolation();
  }
}

async function upsertRank(
  db: GoogleObservationSqlClient,
  batch: GoogleObservationBatch,
  observation: GoogleRankObservation,
): Promise<void> {
  validateRank(observation);
  const result = await db.query<{ id: string }>(
    `insert into rank_observations
       (workspace_id, site_id, tracked_query_id, query_type, provider_call_id,
        observed_at, position, result_url, result_title)
     select $1, $2, tracked.id, 'rank', $4, $5, $6, $7, $8
       from tracked_queries tracked
      where tracked.workspace_id = $1
        and tracked.site_id = $2
        and tracked.id = $3
        and tracked.type = 'rank'
     on conflict (workspace_id, tracked_query_id, observed_at) do update
       set provider_call_id = excluded.provider_call_id,
           position = excluded.position,
           result_url = excluded.result_url,
           result_title = excluded.result_title
     where rank_observations.site_id = excluded.site_id
       and rank_observations.query_type = 'rank'
     returning id::text`,
    [
      batch.workspaceId,
      batch.siteId,
      observation.trackedQueryId,
      batch.providerCallId,
      new Date(batch.observedAt),
      observation.position,
      observation.resultUrl,
      observation.resultTitle,
    ],
  );
  if (!result.rows[0]) boundaryViolation();
}

async function upsertAio(
  db: GoogleObservationSqlClient,
  batch: GoogleObservationBatch,
  observation: GoogleAioObservation,
): Promise<void> {
  validateAio(observation);
  const result = await db.query<{ id: string }>(
    `insert into aio_observations
       (workspace_id, site_id, tracked_query_id, query_type, provider_call_id,
        observed_at, presence, answer_text)
     select $1, $2, tracked.id, 'aio', $4, $5, $6, $7
       from tracked_queries tracked
      where tracked.workspace_id = $1
        and tracked.site_id = $2
        and tracked.id = $3
        and tracked.type = 'aio'
     on conflict (workspace_id, tracked_query_id, observed_at) do update
       set provider_call_id = excluded.provider_call_id,
           presence = excluded.presence,
           answer_text = excluded.answer_text
     where aio_observations.site_id = excluded.site_id
       and aio_observations.query_type = 'aio'
     returning id::text`,
    [
      batch.workspaceId,
      batch.siteId,
      observation.trackedQueryId,
      batch.providerCallId,
      new Date(batch.observedAt),
      observation.presence,
      observation.answerText,
    ],
  );
  const observationId = result.rows[0]?.id;
  if (!observationId) boundaryViolation();

  await db.query(
    "delete from aio_citations where workspace_id = $1 and observation_id = $2",
    [batch.workspaceId, observationId],
  );
  for (const citation of [...observation.citations].sort(
    (left, right) => left.position - right.position,
  )) {
    await db.query(
      `insert into aio_citations
         (workspace_id, observation_id, url, title, position)
       values ($1, $2, $3, $4, $5)`,
      [batch.workspaceId, observationId, citation.url, citation.title, citation.position],
    );
  }
}

function validateBatch(batch: GoogleObservationBatch): void {
  const observedAt = new Date(batch.observedAt);
  const collectedAt = new Date(batch.collectedAt);
  if (Number.isNaN(observedAt.getTime()) || Number.isNaN(collectedAt.getTime())) {
    invalidObservation("observation timestamp");
  }
  const ids = new Set<string>();
  for (const observation of [...batch.rankObservations, ...batch.aioObservations]) {
    if (ids.has(observation.trackedQueryId)) invalidObservation("duplicate tracked query");
    ids.add(observation.trackedQueryId);
  }
}

/**
 * 하나의 provider call 결과를 transaction으로 저장한다.
 * unique(workspace, tracked_query, observed_at)를 재사용하여 replay가 행을 늘리지 않는다.
 */
export function createPostgresGoogleObservationRepository(
  source: GoogleObservationSqlSource,
): GoogleObservationRepository {
  return {
    async upsert(batch) {
      validateBatch(batch);
      const connection = source.connect ? await source.connect() : null;
      const db = connection ?? source;
      try {
        await db.query("begin");
        try {
          await db.query("select set_config('app.workspace_id', $1, true)", [batch.workspaceId]);
          await assertBatchBoundary(db, batch);
          for (const observation of batch.rankObservations) {
            await upsertRank(db, batch, observation);
          }
          for (const observation of batch.aioObservations) {
            await upsertAio(db, batch, observation);
          }
          await db.query("commit");
        } catch (error) {
          await db.query("rollback");
          throw error;
        }
      } finally {
        connection?.release();
      }
    },
  };
}
