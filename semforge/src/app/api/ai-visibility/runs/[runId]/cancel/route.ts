import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { cancelAiVisibilityRun } from "@/server/ai-visibility/runs";

export const POST = route(async (
  request: Request,
  context: { params: Promise<{ runId: string }> },
) => {
  const auth = await requireAuth(request);
  assertCan(auth, "update");
  const { runId } = await context.params;
  return jsonOk(await cancelAiVisibilityRun(auth, runId));
});
