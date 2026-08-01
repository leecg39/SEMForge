import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { cancelPositionTrackingRun } from "@/server/position-tracking/runs";

export const POST = route(async (
  request: Request,
  context: RouteContext<"/api/position-tracking/runs/[runId]/cancel">,
) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const { runId } = await context.params;
  return jsonOk(await cancelPositionTrackingRun(auth, runId));
});
