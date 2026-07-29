import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { runSiteAuditCampaign } from "@/server/siteaudit/crawl";

type Ctx = { params: Promise<{ id: string }> };

/** 캠페인을 running 으로 표시하고 실제 크롤을 실행해 결과를 저장한 뒤 요약을 반환한다. */
export const POST = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const { id } = await context.params;
  const report = await runSiteAuditCampaign(auth, id);
  return jsonOk(report, {
    meta: { crawler: "CloneSiteAuditBot/1.0", maxPageLimit: 500 },
  });
});
