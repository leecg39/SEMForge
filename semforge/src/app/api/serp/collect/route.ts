import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { getKeywordOverview } from "@/server/talordata/overview";

/**
 * 단일 키워드 실시간 SERP 수집 + Keyword Overview 리포트.
 * - 24시간 이내의 라이브 스냅샷이 있으면 API 호출 없이 재사용한다 (fromCache).
 * - domain 을 함께 주면 결과에서 해당 도메인의 순위를 바로 계산해 준다.
 */
const bodySchema = z.object({
  keyword: z.string().trim().min(1, "키워드를 입력하세요.").max(200),
  domain: z.string().trim().max(253).optional(),
  countryCode: z.string().trim().length(2).optional().default("KR"),
  device: z.enum(["desktop", "mobile"]).optional().default("desktop"),
  engine: z.enum(["google", "bing"]).optional().default("google"),
  num: z.coerce.number().int().min(1).max(100).optional().default(10),
  /** true 면 24시간 TTL 캐시를 무시하고 실시간 재수집한다. */
  forceRefresh: z.boolean().optional().default(false),
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const body = await parseBody(request, bodySchema);

  const report = await getKeywordOverview({
    keyword: body.keyword,
    countryCode: body.countryCode,
    device: body.device,
    engine: body.engine,
    num: body.num,
    domain: body.domain,
    forceRefresh: body.forceRefresh,
  });

  return jsonOk(report, {
    meta: {
      source: report.fromCache ? "talordata-cache" : "talordata",
      billed: report.fromCache ? "cache-hit" : "successful-request",
    },
  });
});
