import { jsonError, route } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import {
  buildGbpAuthorizationUrl,
  getGbpOAuthConfig,
} from "@/server/gbp/oauth";
import { hasRole } from "@/lib/rbac";
import { createMetaOAuthState } from "@/server/social/meta-oauth";

/** Google Business Profile OAuth 시작. 구글 동의 화면으로 리다이렉트한다. */
export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const fid = new URL(request.url).searchParams.get("fid")?.trim() || null;
  if (fid && !hasRole(auth.role, "admin"))
    throw new ApiError(
      "FORBIDDEN",
      "소셜 계정 연결은 관리자 이상만 할 수 있습니다.",
    );
  const config = getGbpOAuthConfig();
  if (!config) {
    return jsonError(
      new ApiError(
        "INTERNAL",
        "Google OAuth 설정(GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)이 필요합니다. .env.local 에 추가해 주세요.",
      ),
    );
  }
  return Response.redirect(
    buildGbpAuthorizationUrl(
      config,
      fid ? createMetaOAuthState(auth, fid) : undefined,
    ),
    302,
  );
});
