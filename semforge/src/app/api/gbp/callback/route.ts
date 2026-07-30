import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { gbpConnections } from "@/db/schema";
import { jsonError, route } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { listGbpAccounts } from "@/server/gbp/client";
import { saveGbpConnection } from "@/server/gbp/connections";
import { exchangeGbpCode, getGbpOAuthConfig } from "@/server/gbp/oauth";

/** Google Business Profile OAuth 콜백. 토큰 저장 후 첫 계정을 기본 계정으로 연결한다. */
export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return Response.redirect(
      new URL(`/listings-management/?gbp=denied`, url.origin).toString(),
      302
    );
  }
  if (!code) {
    return jsonError(new ApiError("VALIDATION_ERROR", "인증 코드가 없습니다."));
  }
  const config = getGbpOAuthConfig();
  if (!config) {
    return jsonError(
      new ApiError("INTERNAL", "Google OAuth 설정이 없습니다. .env.local 을 확인해 주세요.")
    );
  }

  const tokens = await exchangeGbpCode(code, config);
  if (!tokens.refreshToken) {
    // prompt=consent 로 요청했으므로 정상이면 refresh_token 이 있다.
    return jsonError(
      new ApiError("INTERNAL", "Google이 갱신 토큰을 반환하지 않았습니다. 연결을 다시 시도해 주세요.")
    );
  }

  const connection = await saveGbpConnection(
    auth,
    { ...tokens, refreshToken: tokens.refreshToken },
    {}
  );

  // 첫 GBP 계정을 기본 계정으로 저장한다. 계정이 없으면 null 그대로 둔다.
  try {
    const accounts = await listGbpAccounts(connection.accessToken);
    const first = accounts[0];
    if (first) {
      await db
        .update(gbpConnections)
        .set({ accountName: first.name, updatedAt: new Date() })
        .where(
          and(
            eq(gbpConnections.id, connection.id),
            eq(gbpConnections.workspaceId, auth.workspaceId),
            isNull(gbpConnections.deletedAt)
          )
        );
    }
  } catch {
    // 계정 조회 실패는 연결 자체를 무효화하지 않는다. UI에서 다시 시도 가능.
  }

  return Response.redirect(new URL("/listings-management/?gbp=connected", url.origin).toString(), 302);
});
