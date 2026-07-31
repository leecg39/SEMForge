import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { updateKeywordTags } from "@/server/position-tracking/tags";

const updateSchema = z.object({
  keywordIds: z.array(z.string().min(1)).min(1).max(200),
  add: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  remove: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
});

/** 선택 키워드의 태그 일괄 추가/제거 (태그 관리 모달). */
export const POST = route(
  async (request: Request, context: { params: Promise<{ campaignId: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "update");
    const { campaignId } = await context.params;
    const body = await parseBody(request, updateSchema);
    const result = await updateKeywordTags(auth, campaignId, body);
    return jsonOk(result);
  }
);
