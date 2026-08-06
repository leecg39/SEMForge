import { ApiError, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { createBingOauthState } from "@/server/backlinks/connection";
import { buildBingAuthorizationUrl, getBingOauthConfig } from "@/server/backlinks/oauth";
import { isEncryptionConfigured } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const config = getBingOauthConfig();
  if (!config) throw new ApiError("INTERNAL", "Bing OAuth 환경 변수가 설정되지 않았습니다.", { details: { providerReason: "configuration" } });
  if (!isEncryptionConfigured()) throw new ApiError("INTERNAL", "Bing OAuth 토큰 암호화를 위해 APP_SECRET을 먼저 설정해 주세요.", { details: { providerReason: "encryption_configuration" } });
  const requested = new URL(request.url).searchParams.get("returnTo") ?? "/analytics/backlinks/overview/";
  const returnTo = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/analytics/backlinks/overview/";
  const state = await createBingOauthState({ workspaceId: auth.workspaceId, returnTo });
  return Response.redirect(buildBingAuthorizationUrl(config, state), 302);
});
