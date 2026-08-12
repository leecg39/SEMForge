// @TASK P5-READ-API - NAVER and Google AIO read model API handlers
// @SPEC docs/planning/06-tasks.md#api-v1
// @TEST src/server/insights/routes.integration.test.ts
import { z } from "zod";

import { getPool } from "@/db/client";
import { ApiError, apiSuccess, withApiV1 } from "@/lib/api-v1";
import {
  resolveApiSession,
  type ApiSessionResolver,
} from "@/server/auth/api-session";
import {
  createRuntimeBillingAccessAuthorizer,
  type BillingAccessAuthorizer,
} from "@/server/billing/access";

export interface InsightSqlQueryable {
  query<T = unknown>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
}

interface ReleasableSqlQueryable extends InsightSqlQueryable {
  release?: () => void | Promise<void>;
}

export interface InsightRouteDependencies {
  readonly db?: InsightSqlQueryable;
  readonly resolveSession?: ApiSessionResolver;
  readonly authorizeBilling?: BillingAccessAuthorizer;
}

const querySchema = z.object({
  siteId: z.string().uuid(),
  observedFrom: z.string().datetime({ offset: true }).optional(),
  observedTo: z.string().datetime({ offset: true }).optional(),
});

const allowedQueryKeys = new Set(["siteId", "observedFrom", "observedTo"]);

type NaverSource = {
  readonly source: string;
  readonly status: string;
  readonly providerCallId: string | null;
  readonly collectedAt: string | null;
  readonly errorCode: string | null;
  readonly providerSource: string | null;
};

type NaverObservation = {
  readonly id: string;
  readonly observedAt: string;
  readonly collectedAt: string;
  readonly monthlySearchVolume: {
    readonly pc: number | null;
    readonly mobile: number | null;
    readonly total: number | null;
  };
  readonly trend: readonly unknown[];
  readonly demographics: Readonly<Record<string, unknown>>;
  readonly blogResultCount: number | null;
  readonly sources: readonly NaverSource[];
};

type NaverItem = {
  readonly tracking: {
    readonly id: string;
    readonly query: string;
    readonly active: boolean;
  };
  readonly observation: NaverObservation | null;
};

type NaverReadModel = {
  readonly siteId: string;
  readonly observedFrom: string | null;
  readonly observedTo: string | null;
  readonly items: readonly NaverItem[];
};

type AioCitation = {
  readonly url: string;
  readonly title: string | null;
  readonly position: number;
};

type AioItem = {
  readonly tracking: {
    readonly id: string;
    readonly query: string;
    readonly active: boolean;
  };
  readonly observation: {
    readonly id: string;
    readonly observedAt: string;
    readonly presence: "present" | "absent" | "unknown";
    readonly answerText: string | null;
    readonly citations: readonly AioCitation[];
    readonly provenance: {
      readonly source: "talordata";
      readonly engine: "google";
      readonly country: "kr";
      readonly language: "ko";
      readonly device: "desktop";
      readonly window: 100;
      readonly providerCallId: string | null;
      readonly collectedAt: string | null;
    };
  } | null;
};

type AioReadModel = {
  readonly siteId: string;
  readonly observedFrom: string | null;
  readonly observedTo: string | null;
  readonly items: readonly AioItem[];
};

type ReadQuery = {
  readonly siteId: string;
  readonly observedFrom: Date | null;
  readonly observedTo: Date | null;
};

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid timestamp from database");
  return date.toISOString();
}

function optionalRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") {
    const numberValue = Number(value);
    return Number.isSafeInteger(numberValue) ? numberValue : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseMetadata(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value === "string") {
    try {
      return optionalRecord(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  return optionalRecord(value);
}

async function withRouteDb<T>(
  deps: InsightRouteDependencies,
  operation: (db: InsightSqlQueryable) => Promise<T>,
): Promise<T> {
  if (deps.db) return operation(deps.db);
  const client = (await getPool("web").connect()) as ReleasableSqlQueryable;
  try {
    return await operation(client);
  } finally {
    await client.release?.();
  }
}

function parseReadQuery(request: Request): ReadQuery {
  const url = new URL(request.url);
  for (const key of url.searchParams.keys()) {
    if (!allowedQueryKeys.has(key)) {
      throw new ApiError("BAD_REQUEST", "지원하지 않는 조회 파라미터입니다.");
    }
  }
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    throw new ApiError("BAD_REQUEST", "siteId와 관측 범위를 확인해 주세요.");
  }
  const observedFrom = parsed.data.observedFrom ? new Date(parsed.data.observedFrom) : null;
  const observedTo = parsed.data.observedTo ? new Date(parsed.data.observedTo) : null;
  if (observedFrom && observedTo && observedFrom > observedTo) {
    throw new ApiError("BAD_REQUEST", "관측 시작 시각은 종료 시각보다 늦을 수 없습니다.");
  }
  return {
    siteId: parsed.data.siteId,
    observedFrom,
    observedTo,
  };
}

async function assertSiteInWorkspace(
  db: InsightSqlQueryable,
  workspaceId: string,
  siteId: string,
): Promise<void> {
  const result = await db.query<{ exists: boolean }>(
    `select exists(
       select 1 from sites where workspace_id = $1 and id = $2
     ) as exists`,
    [workspaceId, siteId],
  );
  if (!result.rows[0]?.exists) throw new ApiError("NOT_FOUND");
}

type NaverRow = {
  tracking_id: string;
  query: string;
  active: boolean;
  observation_id: string | null;
  observed_at: Date | string | null;
  collected_at: Date | string | null;
  monthly_pc_search_volume: number | string | null;
  monthly_mobile_search_volume: number | string | null;
  blog_result_count: number | string | bigint | null;
  trend: unknown;
  demographics: unknown;
};

type NaverSourceRow = {
  observation_id: string;
  source: string;
  status: string;
  provider_call_id: string | null;
  collected_at: Date | string | null;
  error_code: string | null;
  metadata: unknown;
};

async function readNaver(
  db: InsightSqlQueryable,
  workspaceId: string,
  query: ReadQuery,
): Promise<NaverReadModel> {
  await assertSiteInWorkspace(db, workspaceId, query.siteId);
  const rows = (
    await db.query<NaverRow>(
      `select
         tracked.id::text as tracking_id,
         tracked.query,
         tracked.active,
         observation.id::text as observation_id,
         observation.observed_at,
         observation.collected_at,
         observation.monthly_pc_search_volume,
         observation.monthly_mobile_search_volume,
         observation.blog_result_count,
         observation.trend,
         observation.demographics
       from tracked_queries tracked
       left join lateral (
         select *
           from naver_observations candidate
          where candidate.workspace_id = tracked.workspace_id
            and candidate.site_id = tracked.site_id
            and candidate.tracked_query_id = tracked.id
            and ($3::timestamptz is null or candidate.observed_at >= $3::timestamptz)
            and ($4::timestamptz is null or candidate.observed_at <= $4::timestamptz)
          order by candidate.observed_at desc, candidate.created_at desc
          limit 1
       ) observation on true
      where tracked.workspace_id = $1
        and tracked.site_id = $2
        and tracked.type = 'rank'
        and tracked.active
      order by tracked.created_at, tracked.id`,
      [workspaceId, query.siteId, query.observedFrom, query.observedTo],
    )
  ).rows;

  const observationIds = rows
    .map((row) => row.observation_id)
    .filter((value): value is string => value !== null);
  const sources = observationIds.length
    ? (
        await db.query<NaverSourceRow>(
          `select
             observation_id::text,
             source,
             status,
             provider_call_id::text,
             collected_at,
             error_code,
             metadata
           from naver_observation_sources
          where workspace_id = $1
            and observation_id = any($2::uuid[])
          order by observation_id, source`,
          [workspaceId, observationIds],
        )
      ).rows
    : [];
  const sourcesByObservation = new Map<string, NaverSource[]>();
  for (const source of sources) {
    const metadata = parseMetadata(source.metadata);
    const item: NaverSource = {
      source: source.source,
      status: source.status,
      providerCallId: source.provider_call_id,
      collectedAt: iso(source.collected_at),
      errorCode: source.error_code,
      providerSource:
        typeof metadata.providerSource === "string" ? metadata.providerSource : null,
    };
    const current = sourcesByObservation.get(source.observation_id) ?? [];
    current.push(item);
    sourcesByObservation.set(source.observation_id, current);
  }

  return {
    siteId: query.siteId,
    observedFrom: query.observedFrom?.toISOString() ?? null,
    observedTo: query.observedTo?.toISOString() ?? null,
    items: rows.map((row) => {
      const pc = optionalNumber(row.monthly_pc_search_volume);
      const mobile = optionalNumber(row.monthly_mobile_search_volume);
      const observation =
        row.observation_id && row.observed_at && row.collected_at
          ? {
              id: row.observation_id,
              observedAt: iso(row.observed_at)!,
              collectedAt: iso(row.collected_at)!,
              monthlySearchVolume: {
                pc,
                mobile,
                total: pc === null && mobile === null ? null : (pc ?? 0) + (mobile ?? 0),
              },
              trend: optionalArray(row.trend),
              demographics: optionalRecord(row.demographics),
              blogResultCount: optionalNumber(row.blog_result_count),
              sources: sourcesByObservation.get(row.observation_id) ?? [],
            }
          : null;
      return {
        tracking: {
          id: row.tracking_id,
          query: row.query,
          active: row.active,
        },
        observation,
      };
    }),
  };
}

type AioRow = {
  tracking_id: string;
  query: string;
  active: boolean;
  observation_id: string | null;
  observed_at: Date | string | null;
  presence: "present" | "absent" | "unknown" | null;
  answer_text: string | null;
  provider_call_id: string | null;
  completed_at: Date | string | null;
};

type AioCitationRow = {
  observation_id: string;
  url: string;
  title: string | null;
  position: number;
};

async function readAio(
  db: InsightSqlQueryable,
  workspaceId: string,
  query: ReadQuery,
): Promise<AioReadModel> {
  await assertSiteInWorkspace(db, workspaceId, query.siteId);
  const rows = (
    await db.query<AioRow>(
      `select
         tracked.id::text as tracking_id,
         tracked.query,
         tracked.active,
         observation.id::text as observation_id,
         observation.observed_at,
         observation.presence,
         observation.answer_text,
         observation.provider_call_id::text,
         provider_call.completed_at
       from tracked_queries tracked
       left join lateral (
         select *
           from aio_observations candidate
          where candidate.workspace_id = tracked.workspace_id
            and candidate.site_id = tracked.site_id
            and candidate.tracked_query_id = tracked.id
            and ($3::timestamptz is null or candidate.observed_at >= $3::timestamptz)
            and ($4::timestamptz is null or candidate.observed_at <= $4::timestamptz)
          order by candidate.observed_at desc, candidate.created_at desc
          limit 1
       ) observation on true
       left join provider_calls provider_call
         on provider_call.workspace_id = tracked.workspace_id
        and provider_call.id = observation.provider_call_id
        and provider_call.provider = 'talordata'
        and provider_call.operation = 'google_serp_aio'
      where tracked.workspace_id = $1
        and tracked.site_id = $2
        and tracked.type = 'aio'
        and tracked.active
      order by tracked.created_at, tracked.id`,
      [workspaceId, query.siteId, query.observedFrom, query.observedTo],
    )
  ).rows;
  const observationIds = rows
    .map((row) => row.observation_id)
    .filter((value): value is string => value !== null);
  const citations = observationIds.length
    ? (
        await db.query<AioCitationRow>(
          `select observation_id::text, url, title, position
             from aio_citations
            where workspace_id = $1
              and observation_id = any($2::uuid[])
            order by observation_id, position`,
          [workspaceId, observationIds],
        )
      ).rows
    : [];
  const citationsByObservation = new Map<string, AioCitation[]>();
  for (const citation of citations) {
    const current = citationsByObservation.get(citation.observation_id) ?? [];
    current.push({
      url: citation.url,
      title: citation.title,
      position: citation.position,
    });
    citationsByObservation.set(citation.observation_id, current);
  }

  return {
    siteId: query.siteId,
    observedFrom: query.observedFrom?.toISOString() ?? null,
    observedTo: query.observedTo?.toISOString() ?? null,
    items: rows.map((row) => ({
      tracking: {
        id: row.tracking_id,
        query: row.query,
        active: row.active,
      },
      observation:
        row.observation_id && row.observed_at && row.presence
          ? {
              id: row.observation_id,
              observedAt: iso(row.observed_at)!,
              presence: row.presence,
              answerText: row.answer_text,
              citations: citationsByObservation.get(row.observation_id) ?? [],
              provenance: {
                source: "talordata",
                engine: "google",
                country: "kr",
                language: "ko",
                device: "desktop",
                window: 100,
                providerCallId: row.provider_call_id,
                collectedAt: iso(row.completed_at),
              },
            }
          : null,
    })),
  };
}

export function createInsightRouteHandlers(deps: InsightRouteDependencies = {}) {
  const resolveSessionForRoute = deps.resolveSession ?? resolveApiSession;
  const authorizeBilling =
    deps.authorizeBilling ?? createRuntimeBillingAccessAuthorizer();

  async function requireReadAccess(workspaceId: string): Promise<void> {
    const decision = await authorizeBilling({
      workspaceId,
      capability: "workspace:read",
    });
    if (!decision.allowed) throw new ApiError("FORBIDDEN");
  }

  return {
    naver: {
      GET: withApiV1(async (request) => {
        const session = await resolveSessionForRoute(request);
        const query = parseReadQuery(request);
        return apiSuccess(
          await withRouteDb(deps, async (db) => {
            await assertSiteInWorkspace(db, session.workspaceId, query.siteId);
            await requireReadAccess(session.workspaceId);
            return readNaver(db, session.workspaceId, query);
          }),
        );
      }),
    },
    aio: {
      GET: withApiV1(async (request) => {
        const session = await resolveSessionForRoute(request);
        const query = parseReadQuery(request);
        return apiSuccess(
          await withRouteDb(deps, async (db) => {
            await assertSiteInWorkspace(db, session.workspaceId, query.siteId);
            await requireReadAccess(session.workspaceId);
            return readAio(db, session.workspaceId, query);
          }),
        );
      }),
    },
  };
}
