import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { listVisibilityHistory } from "@/server/talordata/collect";

/** 캠페인의 가시성 추이 (수집 실행별, 오름차순). */
export const GET = route(
  async (request: Request, context: { params: Promise<{ campaignId: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "read");
    const { campaignId } = await context.params;
    const history = await listVisibilityHistory(auth, campaignId);
    return jsonOk(history);
  }
);
