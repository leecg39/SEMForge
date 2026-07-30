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
  querySearchAnalytics,
  type GscAnalyticsRow,
  type GscDimension,
} from "@/server/gsc/client";

/**
 * Search Console searchanalytics 조회 프록시.
 * 응답은 항상 ProviderResult 봉투다 (/api/psi 와 동일 규약).
 * env 미설정·미연결은 unavailable, 조회 실패는 error 로 정직하게 내려준다.
 */
const SOURCE = "google-search-console";
const VALID_DIMENSIONS: readonly GscDimension[] = ["query", "page", "date", "country", "device"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD 형식 + 실제 달력 날짜인지 확인한다 (2026-13-01 같은 값을 걸러낸다). */
function isValidDateParam(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const dynamic = "force-dynamic";

export interface GscQueryData {
  rows: GscAnalyticsRow[];
}

function badRequest(reason: string): Response {
  const body: ProviderResult<never> = providerError(SOURCE, reason);
  return Response.json(body, { status: 400 });
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);

  const config = getGscOAuthConfig();
  if (!config) {
    return Response.json(
      providerUnavailable(
        SOURCE,
        "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET 이 설정되지 않았습니다. .env.local 에 OAuth 클라이언트 정보를 추가하세요."
      )
    );
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

  // siteUrl 이 생략되면 연결된 대표 속성을 사용한다.
  const siteUrl = searchParams.get("siteUrl")?.trim() || connection.siteUrl;
  if (!siteUrl) {
    return badRequest("siteUrl 파라미터가 필요합니다. (연결된 대표 속성도 없습니다)");
  }
  const startDate = searchParams.get("startDate")?.trim() ?? "";
  const endDate = searchParams.get("endDate")?.trim() ?? "";
  if (!isValidDateParam(startDate) || !isValidDateParam(endDate)) {
    return badRequest("startDate/endDate 는 YYYY-MM-DD 형식의 올바른 날짜여야 합니다.");
  }
  if (startDate > endDate) {
    return badRequest("startDate 가 endDate 보다 늦을 수 없습니다.");
  }

  const dimensionsParam = searchParams.get("dimensions")?.trim();
  const dimensions = (dimensionsParam ? dimensionsParam.split(",") : ["query"]).map(
    (dimension) => dimension.trim()
  );
  const invalid = dimensions.filter(
    (dimension) => !VALID_DIMENSIONS.includes(dimension as GscDimension)
  );
  if (invalid.length > 0) {
    return badRequest(
      `dimensions 에 사용할 수 없는 값이 있습니다: ${invalid.join(", ")} (가능: ${VALID_DIMENSIONS.join(", ")})`
    );
  }

  const rowLimitParam = Number(searchParams.get("rowLimit"));
  const rowLimit =
    Number.isFinite(rowLimitParam) && rowLimitParam > 0 ? Math.floor(rowLimitParam) : 50;

  try {
    const result = await querySearchAnalytics(
      {
        siteUrl,
        startDate,
        endDate,
        dimensions: dimensions as GscDimension[],
        rowLimit,
      },
      { connection }
    );
    return Response.json(providerLive(SOURCE, { rows: result.rows }));
  } catch (error) {
    if (error instanceof ApiError) {
      // 재연결이 필요한 인증 오류는 unavailable 이 더 정직한 상태다.
      if (error.code === "UNAUTHENTICATED") {
        return Response.json(providerUnavailable(SOURCE, error.message));
      }
      return Response.json(providerError(SOURCE, error.message));
    }
    console.error("[gsc] query error", error);
    return Response.json(
      providerError(SOURCE, "Search Console 조회 중 일시적인 오류가 발생했습니다. 다시 시도해 주세요.")
    );
  }
}
