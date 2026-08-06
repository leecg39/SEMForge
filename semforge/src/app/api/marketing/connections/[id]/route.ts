import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { marketingIntelligence } from "@/server/marketing/runtime";

export const DELETE = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const auth = await requireAuth(request);
  const { id } = await context.params;
  await marketingIntelligence().disconnect(auth, id);
  return jsonOk({ disconnected: true });
});
