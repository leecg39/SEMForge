import {
  providerUnavailable,
  type ProviderResult,
} from "@/server/providers/types";
import {
  buildGscAuthorizationUrl,
  getGscOAuthConfig,
} from "@/server/gsc/oauth";

/**
 * Google Search Console OAuth 시작점.
 * 브라우저를 구글 동의 화면으로 302 리디렉션한다.
 * OAuth env 가 설정되지 않았으면 리디렉션 대신 정직한 unavailable JSON 을 반환한다.
 *
 * siteUrl 쿼리 파라미터를 주면 state 로 실어 보내, 콜백에서 해당 속성을 우선 연결한다.
 */
const SOURCE = "google-search-console";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const config = getGscOAuthConfig();
  if (!config) {
    const body: ProviderResult<never> = providerUnavailable(
      SOURCE,
      "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET 이 설정되지 않았습니다. .env.local 에 OAuth 클라이언트 정보를 추가하세요."
    );
    return Response.json(body);
  }
  const { searchParams } = new URL(request.url);
  const siteUrl = searchParams.get("siteUrl")?.trim();
  const authorizationUrl = buildGscAuthorizationUrl(
    config,
    siteUrl && siteUrl.length > 0 ? siteUrl : undefined
  );
  return Response.redirect(authorizationUrl, 302);
}
