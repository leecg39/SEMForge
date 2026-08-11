// @TASK P4-R1-T1 - Worker handlers for PDF rendering and email delivery
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import { z } from "zod";

import {
  defineJobHandler,
  jobDead,
  jobRetryable,
  jobSucceeded,
  type JobHandler,
} from "@/server/jobs/contracts";
import {
  ReportDeliveryError,
  type ReportDeliveryService,
} from "@/server/reports/delivery/service";
import { ReportDeliveryStoreError } from "@/server/reports/delivery/store";

export const REPORT_PDF_RENDER_JOB = "report.pdf.render";
export const REPORT_EMAIL_DELIVERY_JOB = "report.email.deliver";

const PdfPayload = z.object({ reportId: z.uuid() }).strict();
const EmailPayload = z.object({
  reportId: z.uuid(),
  recipient: z.string().trim().toLowerCase().max(320).pipe(z.email()),
}).strict();

export type ReportPdfRenderPayload = z.infer<typeof PdfPayload> & Record<string, unknown>;
export type ReportEmailDeliveryPayload = z.infer<typeof EmailPayload> & Record<string, unknown>;

function deliveryFailure(error: unknown, prefix: "PDF" | "EMAIL") {
  if (error instanceof ReportDeliveryError) {
    if (error.code === "INVALID_INPUT") return jobDead(`REPORT_${prefix}_INVALID_INPUT`);
    if (error.code === "EMAIL_IDEMPOTENCY_EXPIRED") {
      return jobDead("REPORT_EMAIL_IDEMPOTENCY_EXPIRED");
    }
  }
  if (error instanceof ReportDeliveryStoreError && error.code === "NOT_FOUND") {
    return jobDead("REPORT_NOT_FOUND");
  }
  return jobRetryable(`REPORT_${prefix}_RETRYABLE`);
}

export function createReportPdfRenderJobHandler(
  service: ReportDeliveryService,
): JobHandler<ReportPdfRenderPayload> {
  return defineJobHandler<ReportPdfRenderPayload>(async (job, context) => {
    if (job.workspaceId !== context.workspaceId) return jobDead("REPORT_PDF_WORKSPACE_MISMATCH");
    if (job.type !== REPORT_PDF_RENDER_JOB) return jobDead("REPORT_PDF_INVALID_TYPE");
    const payload = PdfPayload.safeParse(job.payload);
    if (!payload.success) return jobDead("REPORT_PDF_INVALID_PAYLOAD");
    if (context.signal.aborted) return jobRetryable("REPORT_PDF_ABORTED");
    try {
      const result = await service.renderPdf({
        workspaceId: job.workspaceId,
        reportId: payload.data.reportId,
      });
      await context.audit("report.pdf.completed", {
        reportId: payload.data.reportId,
        assetId: result.asset.id,
        snapshotSha256: result.snapshotSha256,
      });
      return jobSucceeded({
        reportId: payload.data.reportId,
        assetId: result.asset.id,
        snapshotSha256: result.snapshotSha256,
      });
    } catch (error) {
      return deliveryFailure(error, "PDF");
    }
  });
}

export function createReportEmailDeliveryJobHandler(
  service: ReportDeliveryService,
): JobHandler<ReportEmailDeliveryPayload> {
  return defineJobHandler<ReportEmailDeliveryPayload>(async (job, context) => {
    if (job.workspaceId !== context.workspaceId) return jobDead("REPORT_EMAIL_WORKSPACE_MISMATCH");
    if (job.type !== REPORT_EMAIL_DELIVERY_JOB) return jobDead("REPORT_EMAIL_INVALID_TYPE");
    const payload = EmailPayload.safeParse(job.payload);
    if (!payload.success) return jobDead("REPORT_EMAIL_INVALID_PAYLOAD");
    if (context.signal.aborted) return jobRetryable("REPORT_EMAIL_ABORTED");
    try {
      const result = await service.deliverEmail({
        workspaceId: job.workspaceId,
        reportId: payload.data.reportId,
        recipient: payload.data.recipient,
      });
      await context.audit("report.email.completed", {
        reportId: payload.data.reportId,
        deliveryId: result.deliveryId,
        deliveryStatus: result.status,
        snapshotSha256: result.snapshotSha256,
      });
      return jobSucceeded({
        reportId: payload.data.reportId,
        deliveryId: result.deliveryId,
        deliveryStatus: result.status,
        snapshotSha256: result.snapshotSha256,
      });
    } catch (error) {
      return deliveryFailure(error, "EMAIL");
    }
  });
}
