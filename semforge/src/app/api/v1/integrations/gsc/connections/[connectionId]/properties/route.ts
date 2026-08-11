// @TASK P2-G1-T1 - /api/v1/integrations/gsc/connections/[connectionId]/properties route
// @SPEC user-approved-plan#허용-API
import { createRuntimeGscHandlers } from "@/server/gsc/runtime";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ connectionId: string }> };

export function GET(request: Request, context: RouteContext): Promise<Response> {
  return createRuntimeGscHandlers().properties.GET(request, context);
}
