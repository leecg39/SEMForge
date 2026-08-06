import { ApiError, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { consumeBingOauthState, saveBingConnection } from "@/server/backlinks/connection";
import { exchangeBingCode, getBingOauthConfig } from "@/server/backlinks/oauth";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const url = new URL(request.url);
  const rawState = url.searchParams.get("state") ?? "";
  const { returnTo } = await consumeBingOauthState({ rawState, workspaceId: auth.workspaceId });
  const redirect = new URL(returnTo, url.origin);
  if (url.searchParams.get("error")) { redirect.searchParams.set("bing", "denied"); return Response.redirect(redirect, 302); }
  const code = url.searchParams.get("code");
  const config = getBingOauthConfig();
  if (!code) throw new ApiError("VALIDATION_ERROR", "Bing 인증 코드가 없습니다.");
  if (!config) throw new ApiError("INTERNAL", "Bing OAuth 환경 변수가 설정되지 않았습니다.");
  const tokens = await exchangeBingCode(code, config);
  await saveBingConnection({ workspaceId: auth.workspaceId, accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? null, expiryMs: tokens.expiryMs ?? null });
  redirect.searchParams.set("bing", "connected");
  return Response.redirect(redirect, 302);
});
