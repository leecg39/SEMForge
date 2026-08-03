import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { cancelContentRun } from "@/server/content/runs";

type Context = { params: Promise<{ runId: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { runId } = await context.params;
  return jsonOk(await cancelContentRun(auth, runId));
});
