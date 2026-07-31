import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { diagnoseAiVisibilityDomain } from "@/server/ai-visibility/domain-diagnostic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  domain: z
    .string()
    .trim()
    .min(1, "진단할 도메인을 입력해 주세요.")
    .max(2048, "도메인 입력이 너무 깁니다."),
});

/**
 * 실제 도메인의 robots.txt와 llms.txt를 즉시 가져와 AI 검색 접근성을 진단한다.
 * 외부 문서는 저장하지 않으며, 서버 모듈이 내부망·리다이렉트·응답 크기·시간을 제한한다.
 */
export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const body = await parseBody(request, bodySchema);
  const report = await diagnoseAiVisibilityDomain(body.domain);

  return jsonOk(report, {
    meta: { source: "direct", resources: ["robots.txt", "llms.txt"] },
  });
});
