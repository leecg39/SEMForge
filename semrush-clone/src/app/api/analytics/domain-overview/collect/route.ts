import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { collectDomainSeedKeywords } from "@/server/talordata/collect";

/**
 * 도메인 개요 실시간 수집.
 * 원천 스토어에 데이터가 없는 도메인도 브랜드/지정 키워드의 실제 SERP 를 수집해
 * 도메인 개요 리포트가 만들어질 수 있게 한다. keywords 를 비우면 도메인 토큰에서 후보를 만든다.
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

  const report = await collectDomainSeedKeywords({
    domain: body.domain,
    keywords: body.keywords,
    countryCode: body.countryCode.toUpperCase(),
    device: body.device,
  });

  return jsonOk(report, {
    meta: {
      source: "talordata",
      billed: "successful-request",
      note: "수집된 SERP 는 serp_snapshots 원천 스토어에 보존되며 도메인 개요 계산에 사용됩니다.",
    },
  });
});
