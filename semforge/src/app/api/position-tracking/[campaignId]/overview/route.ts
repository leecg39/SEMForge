import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { getCampaignOverview } from "@/server/position-tracking/overview";

/** 현황 KPI 카드(가시성·예상 트래픽·평균 포지션)와 키워드 버킷 요약. */
export const GET = route(
  async (request: Request, context: { params: Promise<{ campaignId: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "read");
    const { campaignId } = await context.params;
    const overview = await getCampaignOverview(auth, campaignId);
    return jsonOk(overview);
  }
);
