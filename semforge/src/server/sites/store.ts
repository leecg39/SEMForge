// @TASK P2-S1-T1 - PostgreSQL site and tracking store
// @SPEC docs/planning/06-tasks.md#p2-s1-t1--사이트와-추적-항목-api
// @TEST src/server/sites/store.integration.test.ts
import { createHash } from "node:crypto";

import {
  assertPublicSiteDomain,
  normalizeSiteDomain,
  type DomainAddressResolver,
  SiteDomainError,
} from "@/server/sites/domain";

export const GOOGLE_COLLECTION_SETTINGS = {
  engine: "google",
  country: "KR",
  language: "ko",
  device: "desktop",
  depth: 100,
} as const;

export type TrackedQueryType = "rank" | "aio";

export interface SqlQueryable {
  query<T = unknown>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface StoreRequestContext {
  requestId: string;
  idempotencyKey: string;
}

export interface SiteRecord {
  id: string;
  workspaceId: string;
  name: string;
  domain: string;
  timezone: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TrackedQueryRecord {
  id: string;
  workspaceId: string;
  siteId: string;
  type: TrackedQueryType;
  query: string;
  normalizedQuery: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  collection: typeof GOOGLE_COLLECTION_SETTINGS;
}

export interface SiteGscBindingRecord {
  id: string;
  workspaceId: string;
  siteId: string;
  connectionId: string;
  propertyUri: string;
  createdAt: string;
}

export interface SiteDetailRecord {
  site: SiteRecord;
  /** 활성 한도 usage는 active=true 항목만 계산하며, UI 재활성화를 위해 비활성 항목도 반환한다. */
  tracking: {
    rank: TrackedQueryRecord[];
    aio: TrackedQueryRecord[];
  };
  /** 연결 해제된 GSC connection의 잔존 binding은 현재 연결로 노출하지 않는다. */
  gscBinding: SiteGscBindingRecord | null;
}

export class SitesStoreError extends Error {
  constructor(
    readonly code:
      | "INVALID_DOMAIN"
      | "SITE_LIMIT"
      | "DUPLICATE_SITE_DOMAIN"
      | "DUPLICATE_TRACKED_QUERY"
      | "TRACKING_LIMIT"
      | "NOT_FOUND"
      | "IDEMPOTENCY_KEY_REQUIRED"
      | "INVALID_CURSOR",
    message: string = code,
  ) {
    super(message);
    this.name = "SitesStoreError";
  }
}

function requireIdempotencyKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new SitesStoreError("IDEMPOTENCY_KEY_REQUIRED");
  if (trimmed.length > 200) throw new SitesStoreError("IDEMPOTENCY_KEY_REQUIRED");
  return trimmed;
}

async function inTransaction<T>(
  db: SqlQueryable,
  workspaceId: string,
  operation: () => Promise<T>,
): Promise<T> {
  await db.query("begin");
  try {
    await db.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
    const result = await operation();
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

function toSite(row: SiteRow): SiteRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    domain: row.domain,
    timezone: row.timezone,
    active: row.active,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function toTrackedQuery(row: TrackedQueryRow): TrackedQueryRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    siteId: row.site_id,
    type: row.type,
    query: row.query,
    normalizedQuery: row.normalized_query,
    active: row.active,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    collection: GOOGLE_COLLECTION_SETTINGS,
  };
}

type SiteRow = {
  id: string;
  workspace_id: string;
  name: string;
  domain: string;
  timezone: string;
  active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

type TrackedQueryRow = {
  id: string;
  workspace_id: string;
  site_id: string;
  type: TrackedQueryType;
  query: string;
  normalized_query: string;
  active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

type SiteGscBindingRow = {
  id: string;
  workspace_id: string;
  site_id: string;
  connection_id: string;
  property_uri: string;
  created_at: Date | string;
};

type OutboxPayloadRow = {
  payload: { siteId?: string; trackingId?: string } | string;
};

function parseOutboxPayload(row: OutboxPayloadRow | undefined): {
  siteId?: string;
  trackingId?: string;
} | null {
  if (!row) return null;
  if (typeof row.payload === "string") {
    try {
      return JSON.parse(row.payload) as { siteId?: string; trackingId?: string };
    } catch {
      return null;
    }
  }
  return row.payload;
}

async function getSiteById(
  db: SqlQueryable,
  workspaceId: string,
  siteId: string,
): Promise<SiteRecord | null> {
  const result = await db.query<SiteRow>(
    "select id::text, workspace_id::text, name, domain, timezone, active, created_at, updated_at from sites where workspace_id = $1 and id = $2",
    [workspaceId, siteId],
  );
  return result.rows[0] ? toSite(result.rows[0]) : null;
}

async function getTrackedQueryById(
  db: SqlQueryable,
  workspaceId: string,
  trackingId: string,
): Promise<TrackedQueryRecord | null> {
  const result = await db.query<TrackedQueryRow>(
    "select id::text, workspace_id::text, site_id::text, type, query, normalized_query, active, created_at, updated_at from tracked_queries where workspace_id = $1 and id = $2",
    [workspaceId, trackingId],
  );
  return result.rows[0] ? toTrackedQuery(result.rows[0]) : null;
}

function mapDatabaseError(error: unknown, fallback: SitesStoreError): never {
  const message =
    error instanceof Error ? `${error.message} ${(error as { code?: string }).code ?? ""}` : "";
  if (/site limit exceeded/i.test(message)) {
    throw new SitesStoreError("SITE_LIMIT");
  }
  if (/tracked query limit exceeded/i.test(message)) {
    throw new SitesStoreError("TRACKING_LIMIT");
  }
  if (/sites_workspace_domain_lower_uq/i.test(message)) {
    throw new SitesStoreError("DUPLICATE_SITE_DOMAIN");
  }
  if (/tracked_queries_site_type_query_uq/i.test(message)) {
    throw new SitesStoreError("DUPLICATE_TRACKED_QUERY");
  }
  throw fallback;
}

export function normalizeTrackedQuery(input: string): string {
  const normalized = input.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
  if (!normalized || normalized.length > 200) {
    throw new SitesStoreError("DUPLICATE_TRACKED_QUERY", "TRACKING_QUERY_INVALID");
  }
  return normalized;
}

export async function createSite(
  db: SqlQueryable,
  input: {
    workspaceId: string;
    actorUserId: string | null;
    name: string;
    domain: string;
  },
  context: StoreRequestContext & { resolveDomainAddresses?: DomainAddressResolver },
): Promise<SiteRecord> {
  const idempotencyKey = requireIdempotencyKey(context.idempotencyKey);
  let domain: string;
  try {
    domain = normalizeSiteDomain(input.domain);
    await assertPublicSiteDomain(domain, context.resolveDomainAddresses);
  } catch (error) {
    if (error instanceof SiteDomainError) {
      throw new SitesStoreError("INVALID_DOMAIN", "INVALID_DOMAIN");
    }
    throw error;
  }

  const name = input.name.trim();
  if (!name || name.length > 120) {
    throw new SitesStoreError("NOT_FOUND", "SITE_NAME_INVALID");
  }

  return inTransaction(db, input.workspaceId, async () => {
    const replayPayload = parseOutboxPayload(
      (
        await db.query<OutboxPayloadRow>(
          "select payload from outbox where workspace_id = $1 and topic = 'site.created' and idempotency_key = $2",
          [input.workspaceId, `site:create:${idempotencyKey}`],
        )
      ).rows[0],
    );
    if (replayPayload?.siteId) {
      const replay = await getSiteById(db, input.workspaceId, replayPayload.siteId);
      if (replay) return replay;
    }

    await db.query("select id from workspaces where id = $1 for update", [input.workspaceId]);
    const duplicate = await db.query<{ id: string }>(
      "select id::text from sites where workspace_id = $1 and lower(domain) = lower($2) limit 1",
      [input.workspaceId, domain],
    );
    if (duplicate.rows[0]) throw new SitesStoreError("DUPLICATE_SITE_DOMAIN");

    try {
      const inserted = await db.query<SiteRow>(
        "insert into sites (workspace_id, name, domain) values ($1, $2, $3) returning id::text, workspace_id::text, name, domain, timezone, active, created_at, updated_at",
        [input.workspaceId, name, domain],
      );
      const site = toSite(inserted.rows[0]!);
      await db.query(
        "insert into outbox (workspace_id, topic, payload, idempotency_key) values ($1, 'site.created', $2::jsonb, $3)",
        [
          input.workspaceId,
          JSON.stringify({ siteId: site.id, actorUserId: input.actorUserId, requestId: context.requestId }),
          `site:create:${idempotencyKey}`,
        ],
      );
      return site;
    } catch (error) {
      mapDatabaseError(error, new SitesStoreError("NOT_FOUND"));
    }
  });
}

export async function listSites(
  db: SqlQueryable,
  input: { workspaceId: string; limit?: number; cursor?: string | null },
): Promise<{ items: SiteRecord[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  return inTransaction(db, input.workspaceId, async () => {
    const result = await db.query<SiteRow>(
      `select id::text, workspace_id::text, name, domain, timezone, active, created_at, updated_at
         from sites
        where workspace_id = $1
          and ($2::timestamptz is null or (created_at, id) > ($2::timestamptz, $3::uuid))
        order by created_at asc, id asc
        limit $4`,
      [input.workspaceId, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1],
    );
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);
    return {
      items: rows.map(toSite),
      nextCursor:
        result.rows.length > limit && last
          ? encodeCursor({ createdAt: new Date(last.created_at).toISOString(), id: last.id })
          : null,
    };
  });
}

// @TASK P4-B1 - UI site-detail API contract
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
export async function getSiteDetail(
  db: SqlQueryable,
  input: { workspaceId: string; siteId: string },
): Promise<SiteDetailRecord | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(input.siteId)) {
    return null;
  }
  return inTransaction(db, input.workspaceId, async () => {
    const site = await getSiteById(db, input.workspaceId, input.siteId);
    if (!site) return null;

    const trackedQueries = (
      await db.query<TrackedQueryRow>(
        `select id::text, workspace_id::text, site_id::text, type, query, normalized_query,
                active, created_at, updated_at
           from tracked_queries
          where workspace_id = $1 and site_id = $2
          order by type asc, created_at asc, id asc`,
        [input.workspaceId, input.siteId],
      )
    ).rows.map(toTrackedQuery);
    const binding = (
      await db.query<SiteGscBindingRow>(
        `select binding.id::text, binding.workspace_id::text, binding.site_id::text,
                binding.connection_id::text, binding.property_uri, binding.created_at
           from gsc_property_bindings binding
           join gsc_connections connection
             on connection.workspace_id = binding.workspace_id
            and connection.id = binding.connection_id
            and connection.disconnected_at is null
          where binding.workspace_id = $1 and binding.site_id = $2
          limit 1`,
        [input.workspaceId, input.siteId],
      )
    ).rows[0];

    return {
      site,
      tracking: {
        rank: trackedQueries.filter((item) => item.type === "rank"),
        aio: trackedQueries.filter((item) => item.type === "aio"),
      },
      gscBinding: binding
        ? {
            id: binding.id,
            workspaceId: binding.workspace_id,
            siteId: binding.site_id,
            connectionId: binding.connection_id,
            propertyUri: binding.property_uri,
            createdAt: new Date(binding.created_at).toISOString(),
          }
        : null,
    };
  });
}

function encodeCursor(value: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (
      typeof parsed.createdAt === "string" &&
      !Number.isNaN(Date.parse(parsed.createdAt)) &&
      typeof parsed.id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.id)
    ) {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
  } catch {
    // handled below
  }
  throw new SitesStoreError("INVALID_CURSOR");
}

async function setSiteActive(
  db: SqlQueryable,
  input: { workspaceId: string; siteId: string },
  context: StoreRequestContext,
  active: boolean,
): Promise<SiteRecord> {
  const idempotencyKey = requireIdempotencyKey(context.idempotencyKey);
  const topic = active ? "site.reactivated" : "site.disabled";
  const outboxKey = active
    ? `site:reactivate:${input.siteId}:${idempotencyKey}`
    : `site:disable:${input.siteId}:${idempotencyKey}`;

  return inTransaction(db, input.workspaceId, async () => {
    const replayPayload = parseOutboxPayload(
      (
        await db.query<OutboxPayloadRow>(
          "select payload from outbox where workspace_id = $1 and topic = $2 and idempotency_key = $3",
          [input.workspaceId, topic, outboxKey],
        )
      ).rows[0],
    );
    if (replayPayload?.siteId) {
      const replay = await getSiteById(db, input.workspaceId, replayPayload.siteId);
      if (replay) return replay;
    }

    try {
      const updated = await db.query<SiteRow>(
        "update sites set active = $3, updated_at = now() where workspace_id = $1 and id = $2 returning id::text, workspace_id::text, name, domain, timezone, active, created_at, updated_at",
        [input.workspaceId, input.siteId, active],
      );
      if (!updated.rows[0]) throw new SitesStoreError("NOT_FOUND");
      const site = toSite(updated.rows[0]);
      await db.query(
        "insert into outbox (workspace_id, topic, payload, idempotency_key) values ($1, $2, $3::jsonb, $4)",
        [input.workspaceId, topic, JSON.stringify({ siteId: site.id, requestId: context.requestId }), outboxKey],
      );
      return site;
    } catch (error) {
      if (error instanceof SitesStoreError) throw error;
      mapDatabaseError(error, new SitesStoreError("NOT_FOUND"));
    }
  });
}

export async function disableSite(
  db: SqlQueryable,
  input: { workspaceId: string; siteId: string },
  context: StoreRequestContext,
): Promise<SiteRecord> {
  return setSiteActive(db, input, context, false);
}

export async function reactivateSite(
  db: SqlQueryable,
  input: { workspaceId: string; siteId: string },
  context: StoreRequestContext,
): Promise<SiteRecord> {
  return setSiteActive(db, input, context, true);
}

export async function createTrackedQuery(
  db: SqlQueryable,
  input: {
    workspaceId: string;
    siteId: string;
    type: TrackedQueryType;
    query: string;
  },
  context: StoreRequestContext,
): Promise<TrackedQueryRecord> {
  const idempotencyKey = requireIdempotencyKey(context.idempotencyKey);
  const normalizedQuery = normalizeTrackedQuery(input.query);
  const query = input.query.trim().replace(/\s+/g, " ");
  if (input.type !== "rank" && input.type !== "aio") {
    throw new SitesStoreError("DUPLICATE_TRACKED_QUERY", "TRACKING_TYPE_INVALID");
  }

  return inTransaction(db, input.workspaceId, async () => {
    const replayPayload = parseOutboxPayload(
      (
        await db.query<OutboxPayloadRow>(
          "select payload from outbox where workspace_id = $1 and topic = 'tracking.created' and idempotency_key = $2",
          [input.workspaceId, `tracking:create:${idempotencyKey}`],
        )
      ).rows[0],
    );
    if (replayPayload?.trackingId) {
      const replay = await getTrackedQueryById(db, input.workspaceId, replayPayload.trackingId);
      if (replay) return replay;
    }

    const site = await db.query<{ id: string }>(
      "select id::text from sites where workspace_id = $1 and id = $2 and active limit 1 for update",
      [input.workspaceId, input.siteId],
    );
    if (!site.rows[0]) throw new SitesStoreError("NOT_FOUND");

    const duplicate = await db.query<{ id: string }>(
      "select id::text from tracked_queries where workspace_id = $1 and site_id = $2 and type = $3 and normalized_query = $4 limit 1",
      [input.workspaceId, input.siteId, input.type, normalizedQuery],
    );
    if (duplicate.rows[0]) throw new SitesStoreError("DUPLICATE_TRACKED_QUERY");

    try {
      const inserted = await db.query<TrackedQueryRow>(
        "insert into tracked_queries (workspace_id, site_id, type, query, normalized_query) values ($1, $2, $3, $4, $5) returning id::text, workspace_id::text, site_id::text, type, query, normalized_query, active, created_at, updated_at",
        [input.workspaceId, input.siteId, input.type, query, normalizedQuery],
      );
      const trackedQuery = toTrackedQuery(inserted.rows[0]!);
      const requestHash = createHash("sha256")
        .update(
          JSON.stringify({
            siteId: input.siteId,
            type: input.type,
            normalizedQuery,
            collection: GOOGLE_COLLECTION_SETTINGS,
          }),
        )
        .digest("hex");
      await db.query(
        "insert into outbox (workspace_id, topic, payload, idempotency_key) values ($1, 'tracking.created', $2::jsonb, $3)",
        [
          input.workspaceId,
          JSON.stringify({
            trackingId: trackedQuery.id,
            siteId: input.siteId,
            type: input.type,
            requestHash,
            collection: GOOGLE_COLLECTION_SETTINGS,
            requestId: context.requestId,
          }),
          `tracking:create:${idempotencyKey}`,
        ],
      );
      return trackedQuery;
    } catch (error) {
      mapDatabaseError(error, new SitesStoreError("NOT_FOUND"));
    }
  });
}

async function setTrackedQueryActive(
  db: SqlQueryable,
  input: { workspaceId: string; trackingId: string },
  context: StoreRequestContext,
  active: boolean,
): Promise<TrackedQueryRecord> {
  const idempotencyKey = requireIdempotencyKey(context.idempotencyKey);
  const topic = active ? "tracking.reactivated" : "tracking.disabled";
  const outboxKey = active
    ? `tracking:reactivate:${input.trackingId}:${idempotencyKey}`
    : `tracking:disable:${input.trackingId}:${idempotencyKey}`;

  return inTransaction(db, input.workspaceId, async () => {
    const replayPayload = parseOutboxPayload(
      (
        await db.query<OutboxPayloadRow>(
          "select payload from outbox where workspace_id = $1 and topic = $2 and idempotency_key = $3",
          [input.workspaceId, topic, outboxKey],
        )
      ).rows[0],
    );
    if (replayPayload?.trackingId) {
      const replay = await getTrackedQueryById(db, input.workspaceId, replayPayload.trackingId);
      if (replay) return replay;
    }

    try {
      const updated = await db.query<TrackedQueryRow>(
        "update tracked_queries set active = $3, updated_at = now() where workspace_id = $1 and id = $2 returning id::text, workspace_id::text, site_id::text, type, query, normalized_query, active, created_at, updated_at",
        [input.workspaceId, input.trackingId, active],
      );
      if (!updated.rows[0]) throw new SitesStoreError("NOT_FOUND");
      const trackedQuery = toTrackedQuery(updated.rows[0]);
      await db.query(
        "insert into outbox (workspace_id, topic, payload, idempotency_key) values ($1, $2, $3::jsonb, $4)",
        [
          input.workspaceId,
          topic,
          JSON.stringify({ trackingId: trackedQuery.id, siteId: trackedQuery.siteId, requestId: context.requestId }),
          outboxKey,
        ],
      );
      return trackedQuery;
    } catch (error) {
      if (error instanceof SitesStoreError) throw error;
      mapDatabaseError(error, new SitesStoreError("NOT_FOUND"));
    }
  });
}

export async function disableTrackedQuery(
  db: SqlQueryable,
  input: { workspaceId: string; trackingId: string },
  context: StoreRequestContext,
): Promise<TrackedQueryRecord> {
  return setTrackedQueryActive(db, input, context, false);
}

export async function reactivateTrackedQuery(
  db: SqlQueryable,
  input: { workspaceId: string; trackingId: string },
  context: StoreRequestContext,
): Promise<TrackedQueryRecord> {
  return setTrackedQueryActive(db, input, context, true);
}
