import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { getBacklinkAuditRun } from "@/server/backlink-audit/service";

type Ctx = { params: Promise<{ runId: string }> };

export const GET = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  const { runId } = await context.params;
  return jsonOk(await getBacklinkAuditRun(auth, runId));
});
