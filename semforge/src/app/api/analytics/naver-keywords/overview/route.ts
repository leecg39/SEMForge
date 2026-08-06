// @TASK NAVER-KI-API-02 - 인증 NAVER 키워드 개요 API
// @SPEC user-approved-plan#3-d-authenticated-features
import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { allSectionsFailed } from "@/server/naver-keywords/contracts";
import { naverKeywordService } from "@/server/naver-keywords/runtime";
import { apiKeyword, assertNaverKeywordFeature } from "@/server/naver-keywords/route-utils";

const bodySchema = z.object({
  keyword: z.string(),
}).strict();

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  assertNaverKeywordFeature();
  const body = await parseBody(request, bodySchema);
  const report = await naverKeywordService.overview(apiKeyword(body.keyword));
  const failed = allSectionsFailed([report.searchAds, report.trend, report.blog]);
  return jsonOk(report, { status: failed ? 503 : 200 });
});
