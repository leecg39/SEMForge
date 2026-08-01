import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { loadCannibalization } from "@/server/position-tracking/page-insights-query";

/** 카니발리제이션 탭: 같은 키워드에서 경쟁하는 자사 URL 조회. */
export const GET = route(
  async (request: Request, context: { params: Promise<{ campaignId: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "read");
    const { campaignId } = await context.params;
    const result = await loadCannibalization(auth, campaignId);
    return jsonOk(result);
  },
);
