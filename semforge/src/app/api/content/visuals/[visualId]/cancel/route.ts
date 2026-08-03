import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { cancelContentVisual } from "@/server/content/visuals";

type Context = { params: Promise<{ visualId: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { visualId } = await context.params;
  return jsonOk(await cancelContentVisual(auth, visualId));
});

