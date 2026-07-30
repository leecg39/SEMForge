import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { addTrackedKeyword, listTrackedKeywords } from "@/server/talordata/collect";

/** 캠페인의 추적 키워드 목록 (순위 추적 화면). */
export const GET = route(
  async (request: Request, context: { params: Promise<{ campaignId: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "read");
    const { campaignId } = await context.params;
    const keywords = await listTrackedKeywords(auth, campaignId);
    return jsonOk(keywords);
  }
);

const createSchema = z.object({
  keyword: z.string().trim().min(1, "키워드를 입력하세요.").max(200),
  volume: z.coerce.number().int().min(0).max(100_000_000).optional(),
  difficulty: z.coerce.number().int().min(0).max(100).optional(),
});

/** 추적 키워드 추가. */
export const POST = route(
  async (request: Request, context: { params: Promise<{ campaignId: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "create");
    const { campaignId } = await context.params;
    const body = await parseBody(request, createSchema);
    const row = await addTrackedKeyword(auth, campaignId, body);
    return jsonOk(row, { status: 201 });
  }
);
