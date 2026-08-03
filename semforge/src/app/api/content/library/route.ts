import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { listContentLibraryItems } from "@/server/content/media-lists";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  return jsonOk(await listContentLibraryItems(auth, request));
});
