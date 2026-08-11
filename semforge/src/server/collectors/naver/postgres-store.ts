// @TASK P3-C2-T1 - PostgreSQL-backed NAVER observation port
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/collectors/naver/postgres-store.test.ts
import type {
  NaverObservationRecord,
  NaverObservationSource,
  NaverObservationStore,
  NaverSourceResult,
} from "@/server/collectors/naver/collector";

export interface NaverSqlQueryable {
  query<T = unknown>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface NaverSqlPoolClient extends NaverSqlQueryable {
  release(): void | Promise<void>;
}

export interface NaverSqlPool extends NaverSqlQueryable {
  connect(): Promise<NaverSqlPoolClient>;
}

function hasConnect(db: NaverSqlQueryable): db is NaverSqlPool {
  return typeof (db as Partial<NaverSqlPool>).connect === "function";
}

async function withDedicatedClient<T>(
  db: NaverSqlQueryable,
  operation: (client: NaverSqlQueryable) => Promise<T>,
): Promise<T> {
  if (!hasConnect(db)) return operation(db);
  const client = await db.connect();
  try {
    return await operation(client);
  } finally {
    await client.release();
  }
}

async function inWorkspaceTransaction<T>(
  db: NaverSqlQueryable,
  workspaceId: string,
  operation: (client: NaverSqlQueryable) => Promise<T>,
): Promise<T> {
  return withDedicatedClient(db, async (client) => {
    await client.query("begin");
    try {
      await client.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
      const result = await operation(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    }
  });
}

function exactCount(
  count: { readonly relation: string; readonly value?: number } | null | undefined,
): number | null {
  return count?.relation === "exact" && Number.isSafeInteger(count.value)
    ? count.value ?? null
    : null;
}

function successfulValue<T>(result: NaverSourceResult<T>): T | null {
  return result.status === "succeeded" ? result.value : null;
}

function demographicsJson(record: NaverObservationRecord): string | null {
  const demographics: Record<string, unknown> = {};
  const gender = successfulValue(record.sources.datalab_gender);
  const age = successfulValue(record.sources.datalab_age);
  if (gender) demographics.gender = gender.segments;
  if (age) demographics.age = age.segments;
  return Object.keys(demographics).length > 0 ? JSON.stringify(demographics) : null;
}

function sourceMetadata(
  source: NaverObservationSource,
  result: NaverObservationRecord["sources"][NaverObservationSource],
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  if (result.provenance) metadata.providerSource = result.provenance.source;
  if (source === "search_ads_monthly_volume" && result.status === "succeeded") {
    const value = recordMonthlyValue(
      result as NaverObservationRecord["sources"]["search_ads_monthly_volume"],
    );
    if (value) {
      metadata.pc = value.pc;
      metadata.mobile = value.mobile;
    }
  }
  return metadata;
}

function recordMonthlyValue(
  result: NaverObservationRecord["sources"]["search_ads_monthly_volume"],
) {
  return result.status === "succeeded" ? result.value : null;
}

async function upsertSource(
  client: NaverSqlQueryable,
  workspaceId: string,
  observationId: string,
  fallbackCollectedAt: string,
  source: NaverObservationSource,
  result: NaverObservationRecord["sources"][NaverObservationSource],
): Promise<void> {
  await client.query(
    `insert into naver_observation_sources
       (workspace_id, observation_id, source, status, provider_call_id,
        collected_at, error_code, metadata)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     on conflict (workspace_id, observation_id, source)
     do update set
       status = case
         when naver_observation_sources.status = 'succeeded'
           then naver_observation_sources.status
         else excluded.status
       end,
       provider_call_id = case
         when naver_observation_sources.status = 'succeeded'
           then naver_observation_sources.provider_call_id
         else coalesce(excluded.provider_call_id, naver_observation_sources.provider_call_id)
       end,
       collected_at = case
         when naver_observation_sources.status = 'succeeded'
           then naver_observation_sources.collected_at
         else coalesce(excluded.collected_at, naver_observation_sources.collected_at)
       end,
       error_code = case
         when naver_observation_sources.status = 'succeeded' or excluded.status = 'succeeded'
           then null
         else excluded.error_code
       end,
       metadata = case
         when naver_observation_sources.status = 'succeeded'
           then naver_observation_sources.metadata
         else excluded.metadata
       end`,
    [
      workspaceId,
      observationId,
      source,
      result.status,
      result.providerCallId,
      result.provenance?.collectedAt ?? fallbackCollectedAt,
      result.errorCode,
      JSON.stringify(sourceMetadata(source, result)),
    ],
  );
}

export function createPostgresNaverObservationStore(
  db: NaverSqlQueryable,
): NaverObservationStore {
  return {
    async upsert(record: NaverObservationRecord): Promise<void> {
      await inWorkspaceTransaction(db, record.workspaceId, async (client) => {
        const monthly = successfulValue(record.sources.search_ads_monthly_volume);
        const trend = successfulValue(record.sources.datalab_trend);
        const blog = successfulValue(record.sources.search_api_blog_total);
        const inserted = await client.query<{ id: string }>(
          `insert into naver_observations
             (workspace_id, site_id, tracked_query_id, query_type, observed_at, collected_at,
              monthly_pc_search_volume, monthly_mobile_search_volume, blog_result_count,
              trend, demographics)
           values ($1, $2, $3, 'rank', $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
           on conflict (workspace_id, tracked_query_id, observed_at)
           do update set
             collected_at = least(naver_observations.collected_at, excluded.collected_at),
             monthly_pc_search_volume = coalesce(
               naver_observations.monthly_pc_search_volume,
               excluded.monthly_pc_search_volume
             ),
             monthly_mobile_search_volume = coalesce(
               naver_observations.monthly_mobile_search_volume,
               excluded.monthly_mobile_search_volume
             ),
             blog_result_count = coalesce(
               naver_observations.blog_result_count,
               excluded.blog_result_count
             ),
             trend = coalesce(naver_observations.trend, excluded.trend),
             demographics = case
               when naver_observations.demographics is null then excluded.demographics
               when excluded.demographics is null then naver_observations.demographics
               else excluded.demographics || naver_observations.demographics
             end
           returning id::text as id`,
          [
            record.workspaceId,
            record.siteId,
            record.trackedQueryId,
            record.observedAt,
            record.collectedAt,
            exactCount(monthly?.pc),
            exactCount(monthly?.mobile),
            blog?.total ?? null,
            trend ? JSON.stringify(trend.points) : null,
            demographicsJson(record),
          ],
        );
        const observationId = inserted.rows[0]?.id;
        if (!observationId) throw new Error("NAVER_OBSERVATION_UPSERT_FAILED");
        const sources = Object.keys(record.sources) as NaverObservationSource[];
        for (const source of sources) {
          await upsertSource(
            client,
            record.workspaceId,
            observationId,
            record.collectedAt,
            source,
            record.sources[source],
          );
        }
      });
    },
  };
}
