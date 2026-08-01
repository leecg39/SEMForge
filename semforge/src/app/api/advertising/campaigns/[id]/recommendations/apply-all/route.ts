import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { applyAllAdvertisingRecommendations } from "@/server/advertising/campaigns";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  const { id } = await context.params;
  return jsonOk(await applyAllAdvertisingRecommendations(auth, id));
});
