import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { collectKeywordSerp } from "@/server/talordata/collect";

/**
 * 단일 키워드 실시간 SERP 수집.
 * domain 을 함께 주면 결과에서 해당 도메인의 순위를 바로 계산해 준다.
 */
const bodySchema = z.object({
  keyword: z.string().trim().min(1, "키워드를 입력하세요.").max(200),
  domain: z.string().trim().max(253).optional(),
  countryCode: z.string().trim().length(2).optional().default("KR"),
  device: z.enum(["desktop", "mobile"]).optional().default("desktop"),
  engine: z.enum(["google", "bing"]).optional().default("google"),
  num: z.coerce.number().int().min(1).max(100).optional().default(10),
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const body = await parseBody(request, bodySchema);

  const collection = await collectKeywordSerp({
    keyword: body.keyword,
    countryCode: body.countryCode.toUpperCase(),
    device: body.device,
    engine: body.engine,
    num: body.num,
  });

  const normalizedTarget = body.domain?.trim().toLowerCase();
  const rank = normalizedTarget
    ? collection.results.find(
        (item) =>
          item.domain === normalizedTarget || item.domain.endsWith(`.${normalizedTarget}`)
      ) ?? null
    : null;

  return jsonOk(
    {
      keyword: body.keyword,
      keywordMetricId: collection.keywordMetricId,
      capturedAt: collection.capturedAt.toISOString(),
      features: collection.features,
      rank: rank ? { position: rank.position, url: rank.link } : null,
      results: collection.results,
    },
    {
      meta: {
        source: "talordata",
        billed: "successful-request",
      },
    }
  );
});
