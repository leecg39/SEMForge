import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { runSiteAuditCampaign } from "@/server/siteaudit/crawl";
import { ensureSiteAuditDueJob } from "@/server/siteaudit/due";
import { createFirecrawlCrawler } from "@/server/siteaudit/firecrawl";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 캠페인을 running 으로 표시하고 실제 크롤을 실행해 결과를 저장한 뒤 요약을 반환한다.
 * FIRECRAWL_API_KEY 가 있으면 Firecrawl 을 수집 엔진으로 우선 사용하고
 * (실패 시 자체 BFS 크롤러로 폴백), 없으면 자체 크롤러만 사용한다.
 */
export const POST = route(async (request: Request, context: Ctx) => {
  ensureSiteAuditDueJob();
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const { id } = await context.params;
  const firecrawlKey = process.env.FIRECRAWL_API_KEY?.trim();
  const report = await runSiteAuditCampaign(auth, id, {
    crawler: firecrawlKey ? createFirecrawlCrawler(firecrawlKey) : undefined,
  });
  return jsonOk(report, {
    meta: {
      crawler: report.crawlEngine === "firecrawl" ? "firecrawl/v1" : "CloneSiteAuditBot/1.0",
      engine: report.crawlEngine,
      maxPageLimit: 500,
    },
  });
});
