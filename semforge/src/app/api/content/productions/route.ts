import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { createContentProductionSchema } from "@/server/content/contracts";
import { createContentProduction, listContentProductions } from "@/server/content/media";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  return jsonOk(await listContentProductions(auth, request));
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const input = await parseBody(request, createContentProductionSchema);
  return jsonOk(await createContentProduction(auth, input), { status: 201 });
});
