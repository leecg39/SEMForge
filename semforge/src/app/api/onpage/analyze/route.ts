import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { analyzeOnPage } from "@/server/onpage/analyze";
import { persistOnpageAnalysis } from "@/server/onpage/store";

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

  // SEO 대시보드 온페이지 위젯 집계용으로 스코프당 최신 분석을 보존한다.
  // 저장 실패가 방금 끝난 분석 응답까지 망치지 않도록 격리한다.
  try {
    await persistOnpageAnalysis(auth, report);
  } catch (error) {
    console.error("[onpage] 분석 결과 저장 실패", error);
  }

  return jsonOk(report, {
    meta: {
      serp: report.serpFromCache ? "talordata-cache" : "talordata",
      scrape: report.page.scrapeEngine,
    },
  });
});
