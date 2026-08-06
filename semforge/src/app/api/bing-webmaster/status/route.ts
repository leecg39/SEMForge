import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { getBingConnection } from "@/server/backlinks/connection";
import { getBingOauthConfig } from "@/server/backlinks/oauth";
import { isEncryptionConfigured } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const oauthConfigured = Boolean(getBingOauthConfig());
  const encryptionConfigured = isEncryptionConfigured();
  const configured = oauthConfigured && encryptionConfigured;
  const connection = configured ? await getBingConnection(auth.workspaceId) : null;
  return jsonOk({ configured, connected: Boolean(connection), selectedSiteUrl: connection?.selectedSiteUrl ?? null,
    expiresAt: connection?.expiryMs ? new Date(connection.expiryMs).toISOString() : null,
    reason: configured ? (connection ? null : "Bing Webmaster 계정을 연결해 주세요.")
      : !oauthConfigured ? "Bing OAuth 환경 변수가 설정되지 않았습니다." : "OAuth 토큰 암호화를 위한 APP_SECRET이 설정되지 않았습니다." },
    { meta: { source: "bing-webmaster" } });
});
