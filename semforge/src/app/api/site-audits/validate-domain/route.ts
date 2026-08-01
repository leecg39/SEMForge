import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { validatePublicDomain } from "@/server/siteaudit/domain";

const bodySchema = z.object({ domain: z.string().min(1).max(300) });

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const { domain } = await parseBody(request, bodySchema);
  return jsonOk(await validatePublicDomain(auth, domain));
});
