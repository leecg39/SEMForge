import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { getPositionTrackingRun } from "@/server/position-tracking/runs";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request, context: RouteContext<"/api/position-tracking/runs/[runId]">) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const { runId } = await context.params;
  return jsonOk(await getPositionTrackingRun(auth, runId));
});
