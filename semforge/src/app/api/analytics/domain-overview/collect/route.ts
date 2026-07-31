import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { collectDomainAnalysis } from "@/server/domain-analysis/collect";

/**
 * 도메인 개요 실시간 수집.
 * Firecrawl 페이지 분석 + TalorData SERP + PageSpeed Insights를 실제 API 키로
 * 수집하고, 키를 제외한 결과만 스냅샷으로 보존한다.
 */
const bodySchema = z.object({
  domain: z.string().trim().min(1, "도메인을 입력하세요.").max(253),
  keywords: z.array(z.string().trim().min(1).max(200)).max(5).optional(),
  countryCode: z.string().trim().length(2).optional().default("KR"),
  device: z.enum(["desktop", "mobile"]).optional().default("desktop"),
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const body = await parseBody(request, bodySchema);

  const result = await collectDomainAnalysis({
    domain: body.domain,
    keywords: body.keywords,
    countryCode: body.countryCode.toUpperCase(),
    device: body.device,
  });

  return jsonOk(result, {
    meta: {
      sources: ["firecrawl", "talordata", "pagespeed-insights"],
      secretsExposed: false,
      note: "외부 API 결과와 공급자 상태만 저장하며 API 키는 응답·DB에 포함하지 않습니다.",
    },
  });
});
