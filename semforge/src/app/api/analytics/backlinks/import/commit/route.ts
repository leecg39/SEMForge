import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { backlinkImportCommitSchema } from "@/server/backlinks/contracts";
import { commitBacklinkCsv } from "@/server/backlinks/service";

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const input = await parseBody(request, backlinkImportCommitSchema);
  return jsonOk(await commitBacklinkCsv(auth, input), { meta: { source: "bing-csv" } });
});
