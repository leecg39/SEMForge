// @TASK P3-R1-T1 - Weekly report read API handlers
// @SPEC docs/planning/06-tasks.md#p3-r1-t1--주간-불변-리포트-스냅샷
// @TEST src/server/reports/reports.integration.test.ts
import { ApiError, apiSuccess, withApiV1 } from "@/lib/api-v1";
import {
  resolveApiSession,
  type ApiSessionResolver,
} from "@/server/auth/api-session";
import {
  createRuntimeBillingAccessAuthorizer,
  type BillingAccessAuthorizer,
} from "@/server/billing/access";
import {
  createRuntimeWorkspacePrivacyOperationGuard,
  missingWorkspacePrivacyOperationGuard,
  WorkspacePrivacyOperationBlockedError,
  type WorkspacePrivacyOperationGuard,
} from "@/server/privacy/operation";
import {
  getReport,
  listReports,
  ReportsStoreError,
  type ReportSqlSource,
} from "@/server/reports/store";

export interface ReportsRouteDependencies {
  readonly db?: ReportSqlSource;
  readonly resolveSession?: ApiSessionResolver;
  readonly authorizeBilling?: BillingAccessAuthorizer;
  readonly privacyOperation?: WorkspacePrivacyOperationGuard;
}

type ReportParamsContext = { params: Promise<{ reportId: string }> };

function routeDatabase(
  dependencies: ReportsRouteDependencies,
  fencedDatabase: ReportSqlSource,
): ReportSqlSource {
  return dependencies.db ?? fencedDatabase;
}

function mapStoreError(error: unknown): never {
  if (error instanceof WorkspacePrivacyOperationBlockedError) {
    throw new ApiError("CONFLICT");
  }
  if (!(error instanceof ReportsStoreError)) throw error;
  if (error.code === "INVALID_CURSOR") throw new ApiError("BAD_REQUEST");
  throw new ApiError("NOT_FOUND");
}

export function createReportsRouteHandlers(dependencies: ReportsRouteDependencies = {}) {
  const resolveSession = dependencies.resolveSession ?? resolveApiSession;
  const authorizeBilling = dependencies.authorizeBilling ?? createRuntimeBillingAccessAuthorizer();
  const privacyOperation =
    dependencies.privacyOperation ?? missingWorkspacePrivacyOperationGuard;

  const reports = {
    GET: withApiV1(async (request) => {
      const session = await resolveSession(request);
      const url = new URL(request.url);
      const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
      try {
        const page = await privacyOperation.withShared(
          session.workspaceId,
          async (database) => {
            const access = await authorizeBilling({
              workspaceId: session.workspaceId,
              capability: "report:read",
            });
            const hasPastReportScope =
              access.mode === "past_reports_only" && access.reportPeriodEndBefore !== null;
            if (!access.allowed && !hasPastReportScope) {
              throw new ApiError("FORBIDDEN");
            }
            return listReports(
              routeDatabase(dependencies, database as ReportSqlSource),
              {
                workspaceId: session.workspaceId,
                limit: Number.isFinite(rawLimit) ? rawLimit : 20,
                cursor: url.searchParams.get("cursor"),
                periodEndBefore: access.reportPeriodEndBefore,
              },
            );
          },
        );
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
      try {
        const report = await privacyOperation.withShared(
          session.workspaceId,
          async (database) => {
            const tenantReport = await getReport(
              routeDatabase(dependencies, database as ReportSqlSource),
              session.workspaceId,
              reportId,
            );
            if (!tenantReport) throw new ApiError("NOT_FOUND");
            const access = await authorizeBilling({
              workspaceId: session.workspaceId,
              capability: "report:read",
              reportPeriodEnd: new Date(`${tenantReport.period.end}T00:00:00.000Z`),
            });
            if (!access.allowed) throw new ApiError("FORBIDDEN");
            return tenantReport;
          },
        );
        return apiSuccess(report);
      } catch (error) {
        mapStoreError(error);
      }
    }),
  };

  return { reports, reportById };
}

export function createRuntimeReportsRouteHandlers() {
  return createReportsRouteHandlers({
    privacyOperation: createRuntimeWorkspacePrivacyOperationGuard(),
  });
}
