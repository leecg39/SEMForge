import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { deleteBingConnection } from "@/server/backlinks/connection";

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  await deleteBingConnection(auth.workspaceId);
  return jsonOk({ connected: false }, { meta: { source: "bing-webmaster" } });
});
