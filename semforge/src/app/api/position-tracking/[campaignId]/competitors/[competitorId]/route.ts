import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { removeCompetitor } from "@/server/talordata/collect";

type Ctx = { params: Promise<{ campaignId: string; competitorId: string }> };

/** 경쟁사 도메인 삭제 (소프트 삭제). */
export const DELETE = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  assertCan(auth, "delete");
  const { campaignId, competitorId } = await context.params;
  return jsonOk(await removeCompetitor(auth, campaignId, competitorId));
});
