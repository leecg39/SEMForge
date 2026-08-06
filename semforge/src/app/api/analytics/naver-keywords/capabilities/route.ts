// @TASK NAVER-KI-API-01 - 공급자 기능 상태 API
// @SPEC user-approved-plan#3-a-official-data-collection
import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { getNaverKeywordCapabilities } from "@/server/naver-keywords/capabilities";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  return jsonOk(getNaverKeywordCapabilities());
});
