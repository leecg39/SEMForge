import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { getGbpConnection } from "@/server/gbp/connections";
import { getGbpOAuthConfig } from "@/server/gbp/oauth";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const connection = await getGbpConnection(auth);
  return jsonOk({
    connected: connection !== null,
    configured: getGbpOAuthConfig() !== null,
    email: connection?.email ?? null,
    accountName: connection?.accountName ?? null,
  });
});
