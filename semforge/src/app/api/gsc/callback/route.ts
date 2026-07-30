import { ApiError } from "@/lib/api";
import { getGscOAuthConfig, exchangeGscCode } from "@/server/gsc/oauth";
import { listGscSites, saveGscConnection } from "@/server/gsc/client";

/**
 * Google OAuth 콜백. code 를 토큰으로 교환해 gsc_connections 에 저장하고
 * /seo/ 로 돌려보낸다. 실패는 ?gsc=error&reason= 으로 정직하게 전달한다.
 */
export const dynamic = "force-dynamic";

function redirectToSeo(request: Request, params: Record<string, string>): Response {
  const target = new URL("/seo/", new URL(request.url).origin);
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }
  return Response.redirect(target.toString(), 302);
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const oauthError = searchParams.get("error");
  if (oauthError) {
    return redirectToSeo(request, {
      gsc: "error",
      reason: "Google 동의가 취소되었거나 거부되었습니다.",
    });
  }
  const code = searchParams.get("code");
  if (!code) {
    return redirectToSeo(request, {
      gsc: "error",
      reason: "Google 이 인증 코드를 반환하지 않았습니다.",
    });
  }

  const config = getGscOAuthConfig();
  if (!config) {
    return redirectToSeo(request, {
      gsc: "error",
      reason: "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET 이 설정되지 않았습니다.",
    });
  }

  try {
    const tokens = await exchangeGscCode(code, config);
    // state 에 siteUrl 이 실려 오면 그 속성을 우선 연결하고,
    // 아니면 계정의 첫 번째 속성을 대표로 연결한다. 속성이 없으면 null 로 둔다.
    const state = searchParams.get("state")?.trim();
    let siteUrl: string | null = state && state.length > 0 ? state : null;
    if (!siteUrl) {
      try {
        const sites = await listGscSites(tokens.accessToken);
        siteUrl = sites[0]?.siteUrl ?? null;
      } catch {
        // 속성 목록 조회 실패는 연결 자체를 막지 않는다. 토큰만 저장한다.
        siteUrl = null;
      }
    }
    saveGscConnection({
      siteUrl,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? null,
      expiryMs: tokens.expiryMs ?? null,
    });
    return redirectToSeo(request, { gsc: "connected" });
  } catch (error) {
    const reason =
      error instanceof ApiError
        ? error.message
        : "Google 토큰 교환 중 일시적인 오류가 발생했습니다. 다시 시도해 주세요.";
    if (!(error instanceof ApiError)) {
      console.error("[gsc] callback error", error);
    }
    return redirectToSeo(request, { gsc: "error", reason });
  }
}
