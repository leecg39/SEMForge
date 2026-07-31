import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { getPagesBreakdown } from "@/server/position-tracking/highlights";

/** 랜딩 페이지(URL) 브레이크다운 — 최신 스냅샷의 자사 순위 URL 집계. */
export const GET = route(
  async (request: Request, context: { params: Promise<{ campaignId: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "read");
    const { campaignId } = await context.params;
    const pages = await getPagesBreakdown(auth, campaignId);
    return jsonOk(pages);
  }
);
