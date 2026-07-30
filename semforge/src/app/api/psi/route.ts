import { ApiError } from "@/lib/api";
import {
  providerError,
  providerLive,
  type ProviderResult,
} from "@/server/providers/types";
import { runPageSpeedInsights, type PsiResult } from "@/server/psi/client";

/**
 * PageSpeed Insights 조회 프록시.
 * 응답은 항상 ProviderResult 봉투다. 제공사 호출 실패도 200 + status:"error" 로
 * 내려주어 클라이언트가 body.status 만 보면 되게 한다.
 * url 파라미터 누락/형식 오류만 400 으로 구분한다.
 */
const SOURCE = "pagespeed-insights";

export const dynamic = "force-dynamic";

function toHttpUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url")?.trim();
  const strategy = searchParams.get("strategy") === "desktop" ? "desktop" : "mobile";

  if (!rawUrl) {
    const body: ProviderResult<never> = providerError(SOURCE, "url 파라미터가 필요합니다.");
    return Response.json(body, { status: 400 });
  }
  const url = toHttpUrl(rawUrl);
  if (!url) {
    const body: ProviderResult<never> = providerError(
      SOURCE,
      "url 은 http(s):// 형식의 올바른 주소여야 합니다."
    );
    return Response.json(body, { status: 400 });
  }

  try {
    const result: PsiResult = await runPageSpeedInsights({ url, strategy });
    return Response.json(
      providerLive(SOURCE, { scores: result.scores, cwv: result.cwv })
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json(providerError(SOURCE, error.message));
    }
    console.error("[psi] unhandled error", error);
    return Response.json(
      providerError(SOURCE, "PageSpeed 조회 중 일시적인 오류가 발생했습니다. 다시 시도해 주세요.")
    );
  }
}
