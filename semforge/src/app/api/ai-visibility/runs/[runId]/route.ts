import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { getAiVisibilityRun } from "@/server/ai-visibility/runs";

export const dynamic = "force-dynamic";

export const GET = route(async (
  request: Request,
  context: { params: Promise<{ runId: string }> },
) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const { runId } = await context.params;
  return jsonOk(await getAiVisibilityRun(auth, runId));
});
