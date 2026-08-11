// @TASK P2-S1-T1 - /api/v1/tracking route
// @SPEC docs/planning/06-tasks.md#p2-s1-t1--사이트와-추적-항목-api
import { createSitesRouteHandlers } from "@/server/sites/routes";

const handlers = createSitesRouteHandlers();

export function POST(request: Request): Promise<Response> {
  return handlers.tracking.POST(request, undefined);
}
