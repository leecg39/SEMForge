import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import {
  getCampaignSchedule,
  setCampaignSchedule,
} from "@/server/position-tracking/schedule";

/** 캠페인의 주기 수집 스케줄 조회. */
export const GET = route(
  async (request: Request, context: { params: Promise<{ campaignId: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "read");
    const { campaignId } = await context.params;
    const state = await getCampaignSchedule(auth, campaignId);
    return jsonOk(state);
  }
);

const updateSchema = z.object({
  schedule: z.enum(["off", "daily", "weekly"]),
});

/** 주기 수집 스케줄 설정. 설정 즉시 다음 실행 시각을 다시 계산한다. */
export const POST = route(
  async (request: Request, context: { params: Promise<{ campaignId: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "update");
    const { campaignId } = await context.params;
    const body = await parseBody(request, updateSchema);
    const state = await setCampaignSchedule(auth, campaignId, body.schedule);
    return jsonOk(state);
  }
);
