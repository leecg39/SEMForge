import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { disconnectGbp } from "@/server/gbp/connections";

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "delete");
  const result = await disconnectGbp(auth);
  return jsonOk(result);
});
