// @TASK P4-R1-T1 - Tenant-authenticated short-lived report PDF URL
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import { ApiError, apiSuccess, withApiV1 } from "@/lib/api-v1";
import {
  resolveApiSession,
  type ApiSessionResolver,
} from "@/server/auth/api-session";
import { ReportDeliveryStoreError, type ReportDeliveryStore } from "@/server/reports/delivery/store";
import { snapshotSha256 } from "@/server/reports/rendering/html";
import type { PrivateObjectStorage } from "@/server/storage/s3";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ReportPdfDownloadDependencies {
  readonly resolveSession?: ApiSessionResolver;
  readonly store: Pick<ReportDeliveryStore, "loadReportSnapshot" | "findPdfAsset">;
  readonly storage: Pick<PrivateObjectStorage, "createSignedGetUrl">;
}

type ReportParamsContext = { params: Promise<{ reportId: string }> };

export function createReportPdfDownloadRouteHandler(
  dependencies: ReportPdfDownloadDependencies,
) {
  const resolveSession = dependencies.resolveSession ?? resolveApiSession;
  return withApiV1(async (request, context: ReportParamsContext) => {
    const session = await resolveSession(request);
    const { reportId } = await context.params;
    if (!UUID.test(reportId)) throw new ApiError("NOT_FOUND");
    try {
      const snapshot = await dependencies.store.loadReportSnapshot({
        workspaceId: session.workspaceId,
        reportId,
      });
      const hash = snapshotSha256(snapshot);
      const storageKey = `reports/${session.workspaceId}/${reportId}/${hash}.pdf`;
      const asset = await dependencies.store.findPdfAsset({
        workspaceId: session.workspaceId,
        reportId,
        storageKey,
      });
      if (!asset) throw new ApiError("NOT_FOUND");
      const signed = await dependencies.storage.createSignedGetUrl(asset.storageKey, {
        expiresInSeconds: 60,
      });
      return apiSuccess({
        url: signed.url,
        expiresAt: signed.expiresAt.toISOString(),
        snapshotSha256: hash,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof ReportDeliveryStoreError && error.code === "NOT_FOUND") {
        throw new ApiError("NOT_FOUND");
      }
      throw error;
    }
  });
}
