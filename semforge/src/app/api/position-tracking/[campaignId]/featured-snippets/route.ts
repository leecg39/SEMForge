import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { loadFeaturedSnippets } from "@/server/position-tracking/page-insights-query";

/** 추천 스니펫 탭: 자사와 경쟁사의 점유 관측 조회. */
export const GET = route(
  async (request: Request, context: { params: Promise<{ campaignId: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "read");
    const { campaignId } = await context.params;
    const result = await loadFeaturedSnippets(auth, campaignId);
    return jsonOk(result);
  },
);
