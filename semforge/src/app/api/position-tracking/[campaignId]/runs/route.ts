import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { createPositionTrackingRun } from "@/server/position-tracking/runs";

const schema = z.object({
  trigger: z.enum(["manual", "scheduled"]).default("manual"),
});

export const POST = route(async (request: Request, context: RouteContext<"/api/position-tracking/[campaignId]/runs">) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const { campaignId } = await context.params;
  const { trigger } = await parseBody(request, schema);
  const result = await createPositionTrackingRun(auth, campaignId, trigger);
  return jsonOk(result, { status: result.reused ? 200 : 201 });
});
