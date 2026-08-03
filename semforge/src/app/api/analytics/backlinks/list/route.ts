import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { backlinkListRequestSchema } from "@/server/backlinks/contracts";
import { queryBacklinkList } from "@/server/backlinks/service";

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const input = await parseBody(request, backlinkListRequestSchema);
  return jsonOk(await queryBacklinkList(auth, input), {
    meta: { source: "semrush-v4", billed: "cache-miss-only" },
  });
});

