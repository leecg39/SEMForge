import { jsonOk, route } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { getAiVisibilityOverview } from "@/server/ai-visibility/overview";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const domain = new URL(request.url).searchParams.get("domain");
  if (!domain) {
    throw new ApiError("VALIDATION_ERROR", "domain 파라미터가 필요합니다.", {
      fields: { domain: "예: example.com" },
    });
  }
  const overview = await getAiVisibilityOverview(auth, domain);
  return jsonOk(overview);
});
