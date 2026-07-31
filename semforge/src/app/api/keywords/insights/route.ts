import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import {
  SUPPORTED_INSIGHT_KINDS,
  getKeywordInsights,
} from "@/server/talordata/insights";

/**
 * 키워드 인사이트 수집 + 조회 (Google Trends 계열).
 * - kind 별 TTL 캐시(추세 7일)가 있으면 외부 API 호출 없이 재사용한다.
 * - kind 별 부분 실패를 허용한다: 한 kind 의 오류가 응답 전체를 실패시키지 않고
 *   해당 kind 에 { status: "error" } 로 기록된다 (위젯별 독립 오류 상태).
 */
const bodySchema = z.object({
  keyword: z.string().trim().min(1, "키워드를 입력하세요.").max(200),
  countryCode: z.string().trim().length(2).optional().default("KR"),
  kinds: z
    .array(z.enum(SUPPORTED_INSIGHT_KINDS))
    .min(1)
    .optional()
    .default([...SUPPORTED_INSIGHT_KINDS]),
  /** true 면 TTL 캐시를 무시하고 실시간 재수집한다. */
  forceRefresh: z.boolean().optional().default(false),
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const body = await parseBody(request, bodySchema);

  const report = await getKeywordInsights({
    keyword: body.keyword,
    countryCode: body.countryCode,
    kinds: body.kinds,
    forceRefresh: body.forceRefresh,
  });

  const outcomes = Object.values(report.insights);
  const anyLive = outcomes.some(
    (outcome) => outcome.status === "ok" && !outcome.fromCache
  );
  return jsonOk(report, {
    meta: {
      source: anyLive ? "talordata-trends" : "talordata-trends-cache",
      billed: anyLive ? "successful-request" : "cache-hit",
    },
  });
});
