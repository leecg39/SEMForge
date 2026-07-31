import { ApiError, jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { loadPlatformBreakdown } from "@/server/ai-visibility/platform-breakdown-query";

/**
 * 플랫폼별 언급 분포.
 *
 * 미연동 플랫폼과 관측 0건은 서로 다른 상태로 내려간다. 클라이언트가 이를 구분해
 * "연결 필요"와 "관측 없음"을 다르게 보여줄 수 있어야 한다.
 */
export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const domain = new URL(request.url).searchParams.get("domain");
  if (!domain) {
    throw new ApiError("VALIDATION_ERROR", "domain 파라미터가 필요합니다.", {
      fields: { domain: "예: example.com" },
    });
  }
  return jsonOk(await loadPlatformBreakdown(auth, domain));
});
