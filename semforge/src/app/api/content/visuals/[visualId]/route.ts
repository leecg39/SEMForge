import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { updateContentVisualSchema } from "@/server/content/contracts";
import { getContentVisual, updateContentVisual } from "@/server/content/visuals";

type Context = { params: Promise<{ visualId: string }> };

export const GET = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { visualId } = await context.params;
  return jsonOk(await getContentVisual(auth, visualId));
});

export const PATCH = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { visualId } = await context.params;
  const input = await parseBody(request, updateContentVisualSchema);
  return jsonOk(await updateContentVisual(auth, visualId, input), { status: 202 });
});

