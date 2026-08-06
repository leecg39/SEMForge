import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { buildDisavowPreview } from "@/server/backlink-audit/disavow";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  const { id } = await context.params;
  return jsonOk(await buildDisavowPreview(auth, id));
});
