import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { regenerateContentVideoScene } from "@/server/content/media";

type Context = { params: Promise<{ sceneId: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { sceneId } = await context.params;
  return jsonOk(await regenerateContentVideoScene(auth, sceneId), { status: 202 });
});
