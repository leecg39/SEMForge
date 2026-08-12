// @TASK P2-S1-T1 - /api/v1/tracking/[trackingId] route
// @SPEC docs/planning/06-tasks.md#p2-s1-t1--사이트와-추적-항목-api
import { createRuntimeSitesRouteHandlers } from "@/server/sites/routes";

const handlers = createRuntimeSitesRouteHandlers();

type TrackingRouteContext = { params: Promise<{ trackingId: string }> };

export function PATCH(request: Request, context: TrackingRouteContext): Promise<Response> {
  return handlers.trackingById.PATCH(request, context);
}
