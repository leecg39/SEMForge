import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { getMapRankOverview } from "@/server/maprank/overview";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const overview = await getMapRankOverview(auth);
  return jsonOk(overview);
});
