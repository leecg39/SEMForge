// @TASK NAVER-KI-API-06 - 인증 NAVER 블로그 공급량 보강 API
// @SPEC user-approved-plan#3-d-authenticated-features
// @TEST src/app/api/analytics/naver-keywords/blog-enrichment/contract.test.ts
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import {
  blogEnrichmentBodySchema,
  blogEnrichmentHttpStatus,
} from "@/app/api/analytics/naver-keywords/blog-enrichment/contract";
import { naverKeywordService } from "@/server/naver-keywords/runtime";
import { assertNaverKeywordFeature } from "@/server/naver-keywords/route-utils";

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  assertNaverKeywordFeature();
  const body = await parseBody(request, blogEnrichmentBodySchema);
  const report = await naverKeywordService.blogEnrichment(body.keywords);
  return jsonOk(report, { status: blogEnrichmentHttpStatus(report.results) });
});
