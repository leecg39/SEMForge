import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { updateContentBrandKitSchema } from "@/server/content/contracts";
import { getContentBrandKit, updateContentBrandKit } from "@/server/content/visuals";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  return jsonOk(await getContentBrandKit(auth));
});

export const PATCH = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const input = await parseBody(request, updateContentBrandKitSchema);
  return jsonOk(await updateContentBrandKit(auth, input));
});

