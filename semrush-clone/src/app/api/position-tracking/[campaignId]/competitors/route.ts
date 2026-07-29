import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { addCompetitor, listCompetitors } from "@/server/talordata/collect";

/** 캠페인의 경쟁사 도메인 목록 (순위 추적 화면). */
export const GET = route(
  async (request: Request, context: { params: Promise<{ campaignId: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "read");
    const { campaignId } = await context.params;
    const competitors = await listCompetitors(auth, campaignId);
    return jsonOk(competitors);
  }
);

const createSchema = z.object({
  domain: z.string().trim().min(1, "도메인을 입력하세요.").max(200),
});

/** 경쟁사 도메인 추가 (캠페인당 최대 5개). */
export const POST = route(
  async (request: Request, context: { params: Promise<{ campaignId: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "create");
    const { campaignId } = await context.params;
    const body = await parseBody(request, createSchema);
    const row = await addCompetitor(auth, campaignId, body);
    return jsonOk(row, { status: 201 });
  }
);
