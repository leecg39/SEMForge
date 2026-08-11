// @TASK P3-R1-T1 - Weekly report read API handlers
// @SPEC docs/planning/06-tasks.md#p3-r1-t1--주간-불변-리포트-스냅샷
// @TEST src/server/reports/reports.integration.test.ts
import { getPool } from "@/db/client";
import { ApiError, apiSuccess, withApiV1 } from "@/lib/api-v1";
import {
  resolveApiSession,
  type ApiSessionResolver,
} from "@/server/auth/api-session";
import {
  getReport,
  listReports,
  ReportsStoreError,
  type ReportSqlSource,
} from "@/server/reports/store";

export interface ReportsRouteDependencies {
  readonly db?: ReportSqlSource;
  readonly resolveSession?: ApiSessionResolver;
}

type ReportParamsContext = { params: Promise<{ reportId: string }> };

function routeDatabase(dependencies: ReportsRouteDependencies): ReportSqlSource {
  return dependencies.db ?? (getPool("web") as unknown as ReportSqlSource);
}

function mapStoreError(error: unknown): never {
  if (!(error instanceof ReportsStoreError)) throw error;
  if (error.code === "INVALID_CURSOR") throw new ApiError("BAD_REQUEST");
  throw new ApiError("NOT_FOUND");
}

export function createReportsRouteHandlers(dependencies: ReportsRouteDependencies = {}) {
  const resolveSession = dependencies.resolveSession ?? resolveApiSession;

  const reports = {
    GET: withApiV1(async (request) => {
      const session = await resolveSession(request);
      const url = new URL(request.url);
      const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
      try {
        const page = await listReports(routeDatabase(dependencies), {
          workspaceId: session.workspaceId,
          limit: Number.isFinite(rawLimit) ? rawLimit : 20,
          cursor: url.searchParams.get("cursor"),
        });
        return apiSuccess(page);
      } catch (error) {
        mapStoreError(error);
      }
    }),
  };

  const reportById = {
    GET: withApiV1(async (request, context: ReportParamsContext) => {
      const session = await resolveSession(request);
      const { reportId } = await context.params;
      const report = await getReport(routeDatabase(dependencies), session.workspaceId, reportId);
      if (!report) throw new ApiError("NOT_FOUND");
      return apiSuccess(report);
    }),
  };

  return { reports, reportById };
}

