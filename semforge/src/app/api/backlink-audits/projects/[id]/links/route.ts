import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { auditLinksQuerySchema } from "@/server/backlink-audit/contracts";
import { listBacklinkAuditLinks } from "@/server/backlink-audit/service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  const { id } = await context.params;
  const query = auditLinksQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return jsonOk(await listBacklinkAuditLinks(auth, id, query));
});
