// @TASK P4-R1-T1 - Tenant-authenticated report PDF URL route
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import { createRuntimeReportPdfDownloadRouteHandler } from "@/server/reports/delivery/runtime";

export const runtime = "nodejs";

type ReportParamsContext = { params: Promise<{ reportId: string }> };

export async function GET(request: Request, context: ReportParamsContext) {
  return createRuntimeReportPdfDownloadRouteHandler()(request, context);
}
