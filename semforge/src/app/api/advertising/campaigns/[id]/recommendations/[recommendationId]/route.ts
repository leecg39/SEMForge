import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { resolveAdvertisingRecommendation } from "@/server/advertising/campaigns";

type Ctx = { params: Promise<{ id: string; recommendationId: string }> };

const schema = z.object({ action: z.enum(["apply", "reject"]) });

export const PATCH = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  const { id, recommendationId } = await context.params;
  const { action } = await parseBody(request, schema);
  return jsonOk(await resolveAdvertisingRecommendation(auth, id, recommendationId, action));
});

