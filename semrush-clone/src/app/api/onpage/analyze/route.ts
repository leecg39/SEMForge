import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { analyzeOnPage } from "@/server/onpage/analyze";

/**
 * On-Page SEO Checker 분석 실행.
 * TalorData SERP(24h 캐시) + Firecrawl/자체 fetch 페이지 스크레이프를 결합해
 * 내 페이지와 상위 경쟁 페이지의 온페이지 요소를 비교한다.
 */
const bodySchema = z.object({
  url: z.string().trim().min(1, "페이지 URL 을 입력하세요.").max(2048),
  keyword: z.string().trim().min(1, "타깃 키워드를 입력하세요.").max(200),
  countryCode: z.string().trim().length(2).optional().default("KR"),
  device: z.enum(["desktop", "mobile"]).optional().default("desktop"),
  engine: z.enum(["google", "bing"]).optional().default("google"),
  competitorCount: z.coerce.number().int().min(1).max(5).optional().default(4),
  /** true 면 SERP 24시간 TTL 캐시를 무시하고 재수집한다. */
  forceRefresh: z.boolean().optional().default(false),
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const body = await parseBody(request, bodySchema);

  const report = await analyzeOnPage({
    url: body.url,
    keyword: body.keyword,
    countryCode: body.countryCode,
    device: body.device,
    engine: body.engine,
    competitorCount: body.competitorCount,
    forceRefresh: body.forceRefresh,
  });

  return jsonOk(report, {
    meta: {
      serp: report.serpFromCache ? "talordata-cache" : "talordata",
      scrape: report.page.scrapeEngine,
    },
  });
});
