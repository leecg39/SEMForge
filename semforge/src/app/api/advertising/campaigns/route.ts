import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import {
  createAdvertisingCampaign,
  listAdvertisingCampaigns,
} from "@/server/advertising/campaigns";
import { campaignCreateSchema } from "@/server/advertising/validation";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  return jsonOk(await listAdvertisingCampaigns(auth));
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const input = await parseBody(request, campaignCreateSchema);
  const result = await createAdvertisingCampaign(auth, input);
  return jsonOk(result.campaign, {
    status: result.reused ? 200 : 201,
    meta: { reused: result.reused },
  });
});
