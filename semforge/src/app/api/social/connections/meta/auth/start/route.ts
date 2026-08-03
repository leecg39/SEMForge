import { ApiError, route } from "@/lib/api";
import { hasRole } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { socialFid } from "@/server/social/http";
import { buildMetaAuthorizationUrl } from "@/server/social/meta-oauth";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  if (!hasRole(auth.role, "admin"))
    throw new ApiError(
      "FORBIDDEN",
      "Meta 연결은 관리자 이상만 할 수 있습니다.",
    );
  return Response.redirect(
    buildMetaAuthorizationUrl(auth, socialFid(request)),
    302,
  );
});
