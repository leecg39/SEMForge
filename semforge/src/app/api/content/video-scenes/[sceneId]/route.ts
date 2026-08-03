import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { updateContentVideoSceneSchema } from "@/server/content/contracts";
import { getContentVideoScene, updateContentVideoScene } from "@/server/content/media";

type Context = { params: Promise<{ sceneId: string }> };

export const GET = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { sceneId } = await context.params;
  return jsonOk(await getContentVideoScene(auth, sceneId));
});

export const PATCH = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { sceneId } = await context.params;
  const input = await parseBody(request, updateContentVideoSceneSchema);
  return jsonOk(await updateContentVideoScene(auth, sceneId, input));
});
