// @TASK P2-S1-T1 - /api/v1/sites/[siteId] route
// @SPEC docs/planning/06-tasks.md#p2-s1-t1--사이트와-추적-항목-api
import { createRuntimeSitesRouteHandlers } from "@/server/sites/routes";

const handlers = createRuntimeSitesRouteHandlers();

type SiteRouteContext = { params: Promise<{ siteId: string }> };

export function GET(request: Request, context: SiteRouteContext): Promise<Response> {
  return handlers.siteById.GET(request, context);
}

export function PATCH(request: Request, context: SiteRouteContext): Promise<Response> {
  return handlers.siteById.PATCH(request, context);
}
