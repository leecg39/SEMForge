import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { getRankDistribution } from "@/server/position-tracking/insights";

/** 순위 분포 탭: 최신 SERP 스냅샷 기준 자사 순위 버킷 집계. */
export const GET = route(
  async (request: Request, context: { params: Promise<{ campaignId: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "read");
    const { campaignId } = await context.params;
    const distribution = await getRankDistribution(auth, campaignId);
    return jsonOk(distribution);
  }
);
