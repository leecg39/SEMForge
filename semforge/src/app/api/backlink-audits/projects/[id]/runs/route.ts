import { after } from "next/server";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { auditRunCreateSchema } from "@/server/backlink-audit/contracts";
import { enqueueBacklinkAuditRun, executeBacklinkAuditRun } from "@/server/backlink-audit/service";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const { id } = await context.params;
  const input = await parseBody(request, auditRunCreateSchema);
  const run = await enqueueBacklinkAuditRun(auth, id, input.maxLinks);
  after(async () => {
    const result = await executeBacklinkAuditRun(auth, run.id);
    if (result.status === "failed") console.error(`[backlink-audit] background run ${run.id} failed: ${result.message}`);
  });
  return jsonOk(run, { status: 202, meta: { execution: "background", poll: `/api/backlink-audits/runs/${run.id}/` } });
});
