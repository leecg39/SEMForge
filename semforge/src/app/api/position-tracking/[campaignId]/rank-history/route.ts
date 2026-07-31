import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { getRankDistributionHistory } from "@/server/position-tracking/overview";

/** 순위 분포 일별 이력 (스택 막대 차트용). ?days=1~90 (기본 14), ?domain= 관점 전환. */
export const GET = route(
  async (request: Request, context: { params: Promise<{ campaignId: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "read");
    const { campaignId } = await context.params;
    const url = new URL(request.url);
    const daysParam = url.searchParams.get("days");
    const days = daysParam ? Number.parseInt(daysParam, 10) : 14;
    const viewDomain = url.searchParams.get("domain") ?? undefined;
    const history = await getRankDistributionHistory(
      auth,
      campaignId,
      Number.isFinite(days) ? days : 14,
      viewDomain
    );
    return jsonOk(history);
  }
);
