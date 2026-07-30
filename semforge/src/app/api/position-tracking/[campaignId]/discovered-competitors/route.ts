import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { getDiscoveredCompetitors } from "@/server/position-tracking/insights";

/** 경쟁자 발견 탭: 수집된 SERP 에서 자사 외 도메인의 등장 빈도/평균 순위. */
export const GET = route(
  async (request: Request, context: { params: Promise<{ campaignId: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "read");
    const { campaignId } = await context.params;
    const discovered = await getDiscoveredCompetitors(auth, campaignId);
    return jsonOk(discovered);
  }
);
