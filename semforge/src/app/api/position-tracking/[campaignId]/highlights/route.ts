import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { getKeywordHighlights } from "@/server/position-tracking/highlights";

/** 상위/효율/비효율 키워드 하이라이트 (CTR 곡선 계산식 가시성 포함). */
export const GET = route(
  async (request: Request, context: { params: Promise<{ campaignId: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "read");
    const { campaignId } = await context.params;
    const highlights = await getKeywordHighlights(auth, campaignId);
    return jsonOk(highlights);
  }
);
