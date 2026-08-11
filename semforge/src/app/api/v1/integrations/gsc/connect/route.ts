// @TASK P2-G1-T1 - /api/v1/integrations/gsc/connect route
// @SPEC user-approved-plan#허용-API
import { createRuntimeGscHandlers } from "@/server/gsc/runtime";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return createRuntimeGscHandlers().connect.POST(request, undefined);
}
