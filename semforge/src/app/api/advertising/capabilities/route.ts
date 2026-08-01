import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { getAdvertisingCapabilities } from "@/server/advertising/ai";

export const GET = route(async (request: Request) => {
  await requireAuth(request);
  return jsonOk(await getAdvertisingCapabilities());
});
