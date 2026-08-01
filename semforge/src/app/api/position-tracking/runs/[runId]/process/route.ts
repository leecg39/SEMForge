import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { processNextPositionTrackingItem } from "@/server/position-tracking/runs";

export const POST = route(async (request: Request, context: RouteContext<"/api/position-tracking/runs/[runId]/process">) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const { runId } = await context.params;
  return jsonOk(await processNextPositionTrackingItem(auth, runId));
});
