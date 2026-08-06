// @TASK NAVER-KI-API-06 - NAVER 블로그 공급량 보강 API 계약
// @SPEC user-approved-plan#3-d-authenticated-features
// @TEST src/app/api/analytics/naver-keywords/blog-enrichment/contract.test.ts
import { z } from "zod";
import type { NaverSectionStatus } from "@/server/naver-keywords/contracts";

export const blogEnrichmentBodySchema = z.object({
  keywords: z.array(z.string()).min(1).max(20),
}).strict();

export function blogEnrichmentHttpStatus(
  results: readonly { blog: { status: NaverSectionStatus } }[],
): 200 | 503 {
  return results.some((result) => result.blog.status === "live") ? 200 : 503;
}
