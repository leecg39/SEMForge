import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { campaignPatchSchema } from "@/server/advertising/validation";
import {
  deleteAdvertisingCampaign,
  getAdvertisingCampaign,
  updateAdvertisingCampaign,
} from "@/server/advertising/campaigns";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  const { id } = await context.params;
  return jsonOk(await getAdvertisingCampaign(auth, id));
});

export const PATCH = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  const { id } = await context.params;
  const input = await parseBody(request, campaignPatchSchema);
  return jsonOk(await updateAdvertisingCampaign(auth, id, input));
});

export const DELETE = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  const { id } = await context.params;
  await deleteAdvertisingCampaign(auth, id);
  return new Response(null, { status: 204 });
});
