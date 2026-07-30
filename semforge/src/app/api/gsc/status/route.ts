import {
  providerLive,
  providerUnavailable,
  type ProviderResult,
} from "@/server/providers/types";
import { getGscOAuthConfig } from "@/server/gsc/oauth";
import { getGscConnection, isGscStorageMissing } from "@/server/gsc/client";

/**
 * Search Console 연결 상태 조회.
 * env 미설정 → unavailable, 연결 없음 → live + connected:false.
 */
const SOURCE = "google-search-console";

export const dynamic = "force-dynamic";

export interface GscStatusData {
  connected: boolean;
  siteUrl?: string;
  email?: string;
}

export async function GET(): Promise<Response> {
  const config = getGscOAuthConfig();
  if (!config) {
    const body: ProviderResult<GscStatusData> = providerUnavailable(
      SOURCE,
      "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET 이 설정되지 않았습니다. .env.local 에 OAuth 클라이언트 정보를 추가하세요."
    );
    return Response.json(body);
  }

  let connection: ReturnType<typeof getGscConnection>;
  try {
    connection = getGscConnection();
  } catch (error) {
    if (isGscStorageMissing(error)) {
      const body: ProviderResult<GscStatusData> = providerUnavailable(
        SOURCE,
        "gsc_connections 마이그레이션이 아직 적용되지 않았습니다. db:migrate 적용 후 해소됩니다."
      );
      return Response.json(body);
    }
    throw error;
  }
  const data: GscStatusData = {
    connected: connection !== null,
    ...(connection?.siteUrl ? { siteUrl: connection.siteUrl } : {}),
    ...(connection?.userEmail ? { email: connection.userEmail } : {}),
  };
  return Response.json(providerLive(SOURCE, data));
}
