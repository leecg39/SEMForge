import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { collectAiVisibility } from "@/server/ai-visibility/collect";

/**
 * 도메인의 추적 쿼리 전체에 대해 AIO 출현/인용을 실시간 수집한다.
 * SERP 조회는 24시간 TTL 캐시를 공유하므로 forceRefresh 없이는 중복 과금이 없다.
 */
const bodySchema = z.object({
  domain: z.string().trim().min(4).max(253),
  forceRefresh: z.boolean().optional().default(false),
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const body = await parseBody(request, bodySchema);
  const report = await collectAiVisibility(auth, body);
  return jsonOk(report, { meta: { source: "talordata" } });
});
