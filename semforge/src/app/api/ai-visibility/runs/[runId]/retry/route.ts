import { after } from "next/server";
import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { drainAiVisibilityRun, retryFailedAiVisibilityItems } from "@/server/ai-visibility/runs";

export const POST = route(async (
  request: Request,
  context: { params: Promise<{ runId: string }> },
) => {
  const auth = await requireAuth(request);
  assertCan(auth, "update");
  const { runId } = await context.params;
  const report = await retryFailedAiVisibilityItems(auth, runId);
  after(() => drainAiVisibilityRun(auth, runId));
  return jsonOk(report, { status: 202 });
});
