// @TASK NAVER-KI-API-03 - 인증 NAVER 연관 키워드 탐색 API
// @SPEC user-approved-plan#3-d-authenticated-features
import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { naverKeywordService } from "@/server/naver-keywords/runtime";
import { apiKeywordSeeds, assertNaverKeywordFeature } from "@/server/naver-keywords/route-utils";

const bodySchema = z.object({
  seeds: z.array(z.string()).min(1).max(5),
}).strict();

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  assertNaverKeywordFeature();
  const body = await parseBody(request, bodySchema);
  const report = await naverKeywordService.explore(apiKeywordSeeds(body.seeds));
  return jsonOk(report, { status: report.keywords.status === "live" ? 200 : 503 });
});
