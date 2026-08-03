import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { updateContentProductionSchema } from "@/server/content/contracts";
import { getContentProduction, updateContentProduction } from "@/server/content/media";

type Context = { params: Promise<{ productionId: string }> };

export const GET = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { productionId } = await context.params;
  return jsonOk(await getContentProduction(auth, productionId));
});

export const PATCH = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { productionId } = await context.params;
  const input = await parseBody(request, updateContentProductionSchema);
  return jsonOk(await updateContentProduction(auth, productionId, input));
});
