import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { auditProjectCreateSchema } from "@/server/backlink-audit/contracts";
import { createBacklinkAuditProject, listBacklinkAuditProjects } from "@/server/backlink-audit/service";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  return jsonOk(await listBacklinkAuditProjects(auth));
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const input = await parseBody(request, auditProjectCreateSchema);
  return jsonOk(await createBacklinkAuditProject(auth, input), { status: 201 });
});
