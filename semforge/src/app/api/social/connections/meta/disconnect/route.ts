import { ApiError, jsonOk, route } from "@/lib/api";
import { hasRole } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { socialFid } from "@/server/social/http";
import { disconnectMeta } from "@/server/social/meta-oauth";
export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  if (!hasRole(auth.role, "admin"))
    throw new ApiError(
      "FORBIDDEN",
      "Meta 연결 해제는 관리자 이상만 할 수 있습니다.",
    );
  await disconnectMeta(auth, socialFid(request));
  return jsonOk({ disconnected: true });
});
