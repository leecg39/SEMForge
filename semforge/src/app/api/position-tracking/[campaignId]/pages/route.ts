import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { loadPageRankings } from "@/server/position-tracking/page-insights-query";

/** 페이지 탭: 저장된 SERP 스냅샷 기준 URL별 순위 집계. */
export const GET = route(
  async (request: Request, context: { params: Promise<{ campaignId: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "read");
    const { campaignId } = await context.params;
    const result = await loadPageRankings(auth, campaignId);
    return jsonOk(result);
  },
);
