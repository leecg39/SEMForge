import { jsonError, route } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { buildGbpAuthorizationUrl, getGbpOAuthConfig } from "@/server/gbp/oauth";

/** Google Business Profile OAuth 시작. 구글 동의 화면으로 리다이렉트한다. */
export const GET = route(async (request: Request) => {
  await requireAuth(request);
  const config = getGbpOAuthConfig();
  if (!config) {
    return jsonError(
      new ApiError(
        "INTERNAL",
        "Google OAuth 설정(GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)이 필요합니다. .env.local 에 추가해 주세요."
      )
    );
  }
  return Response.redirect(buildGbpAuthorizationUrl(config), 302);
});
