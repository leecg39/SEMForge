// @TASK P3-R1-T1 - GET /api/v1/reports
// @SPEC docs/planning/06-tasks.md#p3-r1-t1--주간-불변-리포트-스냅샷
import { createReportsRouteHandlers } from "@/server/reports/routes";

const handlers = createReportsRouteHandlers();

export function GET(request: Request): Promise<Response> {
  return handlers.reports.GET(request, undefined);
}

