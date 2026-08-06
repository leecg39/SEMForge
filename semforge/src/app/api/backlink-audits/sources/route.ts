import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { listBacklinkAuditSources } from "@/server/backlink-audit/service";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  return jsonOk(await listBacklinkAuditSources(auth));
});
