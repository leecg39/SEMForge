import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { approveContentProductionSchema } from "@/server/content/contracts";
import { approveContentProduction } from "@/server/content/media";

type Context = { params: Promise<{ productionId: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { productionId } = await context.params;
  const input = await parseBody(request, approveContentProductionSchema);
  return jsonOk(await approveContentProduction(auth, productionId, input));
});
