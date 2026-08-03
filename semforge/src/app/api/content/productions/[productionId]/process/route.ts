import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { processContentProduction } from "@/server/content/media";

type Context = { params: Promise<{ productionId: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { productionId } = await context.params;
  return jsonOk(await processContentProduction(auth, productionId), { status: 202 });
});
