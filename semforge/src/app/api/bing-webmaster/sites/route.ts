import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { activeBingProvider } from "@/server/backlinks/service";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const active = await activeBingProvider(auth.workspaceId);
  return jsonOk({ sites: await active.provider.listSites(), selectedSiteUrl: active.selectedSiteUrl },
    { meta: { source: "bing-webmaster" } });
});
