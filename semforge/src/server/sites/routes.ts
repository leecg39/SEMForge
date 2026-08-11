// @TASK P2-S1-T1 - Site and tracking API route handlers
// @SPEC docs/planning/06-tasks.md#p2-s1-t1--사이트와-추적-항목-api
// @TEST src/server/sites/routes.integration.test.ts
import { z } from "zod";

import { getPool } from "@/db/client";
import {
  ApiError,
  apiSuccess,
  parseJsonBody,
  withApiV1,
} from "@/lib/api-v1";
import {
  resolveApiSession,
  type ApiSessionResolver,
} from "@/server/auth/api-session";
import {
  createSite,
  createTrackedQuery,
  disableSite,
  disableTrackedQuery,
  listSites,
  reactivateSite,
  reactivateTrackedQuery,
  SitesStoreError,
  type SqlQueryable,
} from "@/server/sites/store";
import type { DomainAddressResolver } from "@/server/sites/domain";

const createSiteBody = z.object({
  name: z.string().trim().min(1).max(120),
  domain: z.string().trim().min(1).max(253),
});

const patchActiveBody = z.object({
  active: z.boolean(),
});

const createTrackingBody = z.object({
  siteId: z.uuid(),
  type: z.enum(["rank", "aio"]),
  query: z.string().trim().min(1).max(200),
});

interface ReleasableSqlQueryable extends SqlQueryable {
  release?: () => void;
}

export interface SitesRouteDependencies {
  db?: SqlQueryable;
  resolveSession?: ApiSessionResolver;
  resolveDomainAddresses?: DomainAddressResolver;
}

type SiteParamsContext = { params: Promise<{ siteId: string }> };
type TrackingParamsContext = { params: Promise<{ trackingId: string }> };

function requireMutationIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value) throw new ApiError("BAD_REQUEST", "Idempotency-Key 헤더가 필요합니다.");
  if (value.length > 200) {
    throw new ApiError("BAD_REQUEST", "Idempotency-Key 헤더가 너무 깁니다.");
  }
  return value;
}

async function withRouteDb<T>(
  deps: SitesRouteDependencies,
  operation: (db: SqlQueryable) => Promise<T>,
): Promise<T> {
  if (deps.db) return operation(deps.db);
  const client = (await getPool("web").connect()) as ReleasableSqlQueryable;
  try {
    return await operation(client);
  } finally {
    client.release?.();
  }
}

function mapStoreError(error: unknown): never {
  if (!(error instanceof SitesStoreError)) throw error;
  switch (error.code) {
    case "INVALID_DOMAIN":
      throw new ApiError("VALIDATION_ERROR", "등록할 수 없는 사이트 도메인입니다.");
    case "SITE_LIMIT":
    case "TRACKING_LIMIT":
      throw new ApiError("PLAN_LIMIT");
    case "DUPLICATE_SITE_DOMAIN":
    case "DUPLICATE_TRACKED_QUERY":
      throw new ApiError("DUPLICATE");
    case "NOT_FOUND":
      throw new ApiError("NOT_FOUND");
    case "IDEMPOTENCY_KEY_REQUIRED":
    case "INVALID_CURSOR":
      throw new ApiError("BAD_REQUEST");
    default:
      throw new ApiError("INTERNAL");
  }
}

export function createSitesRouteHandlers(deps: SitesRouteDependencies = {}) {
  const resolveSessionForRoute = deps.resolveSession ?? resolveApiSession;

  const sites = {
    GET: withApiV1(async (request) => {
      const session = await resolveSessionForRoute(request);
      const url = new URL(request.url);
      const limit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
      const cursor = url.searchParams.get("cursor");
      try {
        const page = await withRouteDb(deps, (db) =>
          listSites(db, {
            workspaceId: session.workspaceId,
            limit: Number.isFinite(limit) ? limit : 20,
            cursor,
          }),
        );
        return apiSuccess(page);
      } catch (error) {
        mapStoreError(error);
      }
    }),
    POST: withApiV1(async (request, _context, apiContext) => {
      const session = await resolveSessionForRoute(request);
      const idempotencyKey = requireMutationIdempotencyKey(request);
      const body = await parseJsonBody(request, createSiteBody);
      try {
        const site = await withRouteDb(deps, (db) =>
          createSite(
            db,
            {
              workspaceId: session.workspaceId,
              actorUserId: session.userId,
              name: body.name,
              domain: body.domain,
            },
            {
              requestId: apiContext.requestId,
              idempotencyKey,
              resolveDomainAddresses: deps.resolveDomainAddresses,
            },
          ),
        );
        return apiSuccess(site, { status: 201 });
      } catch (error) {
        mapStoreError(error);
      }
    }),
  };

  const siteById = {
    PATCH: withApiV1(async (request, context: SiteParamsContext, apiContext) => {
      const session = await resolveSessionForRoute(request);
      const idempotencyKey = requireMutationIdempotencyKey(request);
      const body = await parseJsonBody(request, patchActiveBody);
      const { siteId } = await context.params;
      try {
        const site = await withRouteDb(deps, (db) =>
          body.active
            ? reactivateSite(
                db,
                { workspaceId: session.workspaceId, siteId },
                { requestId: apiContext.requestId, idempotencyKey },
              )
            : disableSite(
                db,
                { workspaceId: session.workspaceId, siteId },
                { requestId: apiContext.requestId, idempotencyKey },
              ),
        );
        return apiSuccess(site);
      } catch (error) {
        mapStoreError(error);
      }
    }),
  };

  const tracking = {
    POST: withApiV1(async (request, _context, apiContext) => {
      const session = await resolveSessionForRoute(request);
      const idempotencyKey = requireMutationIdempotencyKey(request);
      const body = await parseJsonBody(request, createTrackingBody);
      try {
        const trackedQuery = await withRouteDb(deps, (db) =>
          createTrackedQuery(
            db,
            {
              workspaceId: session.workspaceId,
              siteId: body.siteId,
              type: body.type,
              query: body.query,
            },
            { requestId: apiContext.requestId, idempotencyKey },
          ),
        );
        return apiSuccess(trackedQuery, { status: 201 });
      } catch (error) {
        mapStoreError(error);
      }
    }),
  };

  const trackingById = {
    PATCH: withApiV1(async (request, context: TrackingParamsContext, apiContext) => {
      const session = await resolveSessionForRoute(request);
      const idempotencyKey = requireMutationIdempotencyKey(request);
      const body = await parseJsonBody(request, patchActiveBody);
      const { trackingId } = await context.params;
      try {
        const trackedQuery = await withRouteDb(deps, (db) =>
          body.active
            ? reactivateTrackedQuery(
                db,
                { workspaceId: session.workspaceId, trackingId },
                { requestId: apiContext.requestId, idempotencyKey },
              )
            : disableTrackedQuery(
                db,
                { workspaceId: session.workspaceId, trackingId },
                { requestId: apiContext.requestId, idempotencyKey },
              ),
        );
        return apiSuccess(trackedQuery);
      } catch (error) {
        mapStoreError(error);
      }
    }),
  };

  return { sites, siteById, tracking, trackingById };
}
