import { ApiError } from "@/lib/api";
import {
  providerError,
  providerLive,
  providerUnavailable,
  type ProviderResult,
} from "@/server/providers/types";
import { getGscOAuthConfig } from "@/server/gsc/oauth";
import {
  getGscConnection,
  isGscStorageMissing,
  listGscSitesForConnection,
  type GscSiteEntry,
} from "@/server/gsc/client";

/**
 * 연결된 계정의 Search Console 속성 목록 조회.
 * 응답은 항상 ProviderResult 봉투다 (/api/gsc/status, /api/gsc/query 와 동일 규약).
 * 대표 속성이 캠페인 도메인과 달라도 같은 계정에 해당 도메인 속성이 있을 수 있어,
 * 클라이언트가 도메인별 매칭 속성을 고를 때 사용한다.
 */
const SOURCE = "google-search-console";

export const dynamic = "force-dynamic";

export interface GscSitesData {
  sites: GscSiteEntry[];
}

export async function GET(): Promise<Response> {
  const config = getGscOAuthConfig();
  if (!config) {
    const body: ProviderResult<GscSitesData> = providerUnavailable(
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
      return Response.json(
        providerUnavailable(
          SOURCE,
          "gsc_connections 마이그레이션이 아직 적용되지 않았습니다. db:migrate 적용 후 해소됩니다."
        )
      );
    }
    throw error;
  }
  if (!connection) {
    return Response.json(
      providerUnavailable(
        SOURCE,
        "Google Search Console 이 연결되지 않았습니다. /api/gsc/auth/start 로 계정을 먼저 연결해 주세요."
      )
    );
  }

  try {
    const sites = await listGscSitesForConnection({ connection });
    return Response.json(providerLive(SOURCE, { sites }));
  } catch (error) {
    if (error instanceof ApiError) {
      // 재연결이 필요한 인증 오류는 unavailable 이 더 정직한 상태다.
      if (error.code === "UNAUTHENTICATED") {
        return Response.json(providerUnavailable(SOURCE, error.message));
      }
      return Response.json(providerError(SOURCE, error.message));
    }
    console.error("[gsc] sites error", error);
    return Response.json(
      providerError(
        SOURCE,
        "Search Console 속성 목록 조회 중 일시적인 오류가 발생했습니다. 다시 시도해 주세요."
      )
    );
  }
}
