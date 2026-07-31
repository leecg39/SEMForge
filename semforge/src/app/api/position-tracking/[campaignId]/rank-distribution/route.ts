import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { getRankDistribution } from "@/server/position-tracking/insights";

/** 순위 분포: 최신 SERP 스냅샷 기준 버킷 집계. ?domain= 으로 경쟁자 관점 전환. */
export const GET = route(
  async (request: Request, context: { params: Promise<{ campaignId: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "read");
    const { campaignId } = await context.params;
    const viewDomain = new URL(request.url).searchParams.get("domain") ?? undefined;
    const distribution = await getRankDistribution(auth, campaignId, viewDomain);
    return jsonOk(distribution);
  }
);
