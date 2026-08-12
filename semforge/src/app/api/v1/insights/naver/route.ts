// @TASK P5-READ-API - /api/v1/insights/naver read route
// @SPEC docs/planning/06-tasks.md#api-v1
import { createInsightRouteHandlers } from "@/server/insights/routes";

const handlers = createInsightRouteHandlers();

export function GET(request: Request): Promise<Response> {
  return handlers.naver.GET(request, undefined);
}
