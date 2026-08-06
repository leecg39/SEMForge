import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { auditReviewInputSchema } from "@/server/backlink-audit/contracts";
import { updateBacklinkAuditReviews } from "@/server/backlink-audit/service";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  assertCan(auth, "update");
  const { id } = await context.params;
  const input = await parseBody(request, auditReviewInputSchema);
  return jsonOk(await updateBacklinkAuditReviews(auth, id, input));
});
