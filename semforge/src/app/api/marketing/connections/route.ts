import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requiredParam } from "@/server/marketing/http";
import { marketingIntelligence } from "@/server/marketing/runtime";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const data = await marketingIntelligence().getConnectionSummary(auth, requiredParam(request, "fid"));
  return jsonOk(data);
});
