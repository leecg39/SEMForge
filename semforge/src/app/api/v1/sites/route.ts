// @TASK P2-S1-T1 - /api/v1/sites route
// @SPEC docs/planning/06-tasks.md#p2-s1-t1--사이트와-추적-항목-api
import { createSitesRouteHandlers } from "@/server/sites/routes";

const handlers = createSitesRouteHandlers();

export function GET(request: Request): Promise<Response> {
  return handlers.sites.GET(request, undefined);
}

export function POST(request: Request): Promise<Response> {
  return handlers.sites.POST(request, undefined);
}
