// @TASK P4-B1 - GET/PATCH /api/v1/reports/branding
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
import { createRuntimeReportBrandingRouteHandlers } from "@/server/reports/branding/routes";

const handlers = createRuntimeReportBrandingRouteHandlers();

export function GET(request: Request): Promise<Response> {
  return handlers.branding.GET(request, undefined);
}

export function PATCH(request: Request): Promise<Response> {
  return handlers.branding.PATCH(request, undefined);
}
