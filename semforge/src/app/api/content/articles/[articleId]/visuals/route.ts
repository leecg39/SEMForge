import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { createContentVisualSchema } from "@/server/content/contracts";
import { createContentVisual, listContentVisuals } from "@/server/content/visuals";

type Context = { params: Promise<{ articleId: string }> };

export const GET = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { articleId } = await context.params;
  return jsonOk(await listContentVisuals(auth, articleId));
});

export const POST = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { articleId } = await context.params;
  const input = await parseBody(request, createContentVisualSchema);
  return jsonOk(await createContentVisual(auth, articleId, input), { status: 202 });
});

