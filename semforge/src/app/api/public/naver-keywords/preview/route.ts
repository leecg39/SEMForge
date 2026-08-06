// @TASK NAVER-KI-API-05 - 비로그인 NAVER 키워드 미리보기 API
// @SPEC user-approved-plan#3-c-public-free-tool
import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { allSectionsFailed } from "@/server/naver-keywords/contracts";
import {
  PublicPreviewSecurityError,
  resolveAnonymousIdentity,
  resolvePublicRateLimitSecret,
  serializeAnonymousIdentityCookie,
} from "@/server/naver-keywords/public-identity";
import {
  PublicKeywordRateLimiter,
  PublicKeywordRateLimitError,
} from "@/server/naver-keywords/rate-limit";
import { naverKeywordService } from "@/server/naver-keywords/runtime";
import { apiKeyword, assertNaverKeywordFeature } from "@/server/naver-keywords/route-utils";
import { DbPublicKeywordUsageRepository } from "@/server/naver-keywords/store";

const bodySchema = z.object({ keyword: z.string() }).strict();

function requestIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || null;
}

function withIdentityCookie(response: Response, value: string): Response {
  response.headers.append("Set-Cookie", value);
  return response;
}

export const POST = route(async (request: Request) => {
  assertNaverKeywordFeature(true);
  const body = await parseBody(request, bodySchema);
  const keyword = apiKeyword(body.keyword);

  let secret: string;
  try {
    secret = resolvePublicRateLimitSecret();
  } catch (error) {
    if (!(error instanceof PublicPreviewSecurityError)) throw error;
    return Response.json({
      error: { code: "INTERNAL", message: error.message },
    }, { status: 503 });
  }
  const identity = resolveAnonymousIdentity(request.headers.get("cookie"), secret);
  const serializedCookie = serializeAnonymousIdentityCookie(identity);
  const limiter = new PublicKeywordRateLimiter(
    new DbPublicKeywordUsageRepository(),
    { secret },
  );
  let quota;
  try {
    quota = await limiter.consume({
      cookieId: identity.id,
      ip: requestIp(request),
      keyword,
    });
  } catch (error) {
    if (!(error instanceof PublicKeywordRateLimitError)) throw error;
    return withIdentityCookie(Response.json({
      error: {
        code: "RATE_LIMITED",
        message: error.message,
        details: { retryAfter: error.retryAfterSeconds },
      },
    }, {
      status: 429,
      headers: { "Retry-After": String(error.retryAfterSeconds) },
    }), serializedCookie);
  }

  const report = await naverKeywordService.publicPreview(keyword, {
    cacheOnly: quota.duplicate,
  });
  const failed = allSectionsFailed([report.searchAds, report.trend, report.blog]);
  return withIdentityCookie(jsonOk(report, {
    status: failed ? 503 : 200,
    meta: { quota: {
      cookieRemaining: quota.cookieRemaining,
      ipPrefixRemaining: quota.ipPrefixRemaining,
    } },
  }), serializedCookie);
});
