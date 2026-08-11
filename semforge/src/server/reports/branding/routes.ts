// @TASK P4-B1 - Report branding GET/PATCH API handlers
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/server/reports/branding/routes.integration.test.ts
import { z } from "zod";

import { getPool } from "@/db/client";
import { ApiError, apiSuccess, parseJsonBody, withApiV1 } from "@/lib/api-v1";
import {
  resolveApiSession,
  type ApiSessionResolver,
} from "@/server/auth/api-session";
import { ReportBrandingValidationError } from "@/server/reports/branding/domain";
import {
  getReportBranding,
  ReportBrandingStoreError,
  type BrandingSqlSource,
  updateReportBranding,
} from "@/server/reports/branding/store";
import type { DomainAddressResolver } from "@/server/sites/domain";

const patchBrandingBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    logoUrl: z.string().trim().min(1).max(2_048).nullable(),
    accentColor: z.string().trim().regex(/^#[0-9a-f]{6}$/iu),
  })
  .strict();

export interface ReportBrandingRouteDependencies {
  readonly db?: BrandingSqlSource;
  readonly resolveSession?: ApiSessionResolver;
  readonly resolveLogoAddresses?: DomainAddressResolver;
}

function routeDatabase(dependencies: ReportBrandingRouteDependencies): BrandingSqlSource {
  return dependencies.db ?? (getPool("web") as unknown as BrandingSqlSource);
}

function mapBrandingError(error: unknown): never {
  if (error instanceof ReportBrandingValidationError) {
    throw new ApiError("VALIDATION_ERROR", undefined, {
      fields: { [error.field]: error.message },
    });
  }
  if (error instanceof ReportBrandingStoreError) throw new ApiError("NOT_FOUND");
  throw error;
}

export function createReportBrandingRouteHandlers(
  dependencies: ReportBrandingRouteDependencies = {},
) {
  const resolveSession = dependencies.resolveSession ?? resolveApiSession;
  const branding = {
    GET: withApiV1(async (request) => {
      const session = await resolveSession(request);
      try {
        return apiSuccess(
          await getReportBranding(routeDatabase(dependencies), session.workspaceId),
        );
      } catch (error) {
        mapBrandingError(error);
      }
    }),
    PATCH: withApiV1(async (request) => {
      const session = await resolveSession(request);
      if (session.role !== "owner" && session.role !== "admin") {
        throw new ApiError("FORBIDDEN");
      }
      const body = await parseJsonBody(request, patchBrandingBody);
      try {
        return apiSuccess(
          await updateReportBranding(
            routeDatabase(dependencies),
            { workspaceId: session.workspaceId, branding: body },
            dependencies.resolveLogoAddresses,
          ),
        );
      } catch (error) {
        mapBrandingError(error);
      }
    }),
  };
  return { branding };
}
