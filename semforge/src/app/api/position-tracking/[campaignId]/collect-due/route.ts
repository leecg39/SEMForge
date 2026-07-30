import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { positionTrackingCampaigns } from "@/db/schema";
import { ApiError, jsonOk, route } from "@/lib/api";
import { hasValidCronSecret } from "@/lib/cron-auth";
import { assertCan } from "@/lib/rbac";
import { requireAuth, type AuthContext } from "@/lib/session";
import {
  collectCampaignIfDue,
  registerPositionTrackingDueJob,
} from "@/server/position-tracking/schedule";

/**
 * 스케줄 기반 수집 실행기.
 *
 * - 실행 시각(next_run_at)이 지난 캠페인만 수집한다. 수동 수집은
 *   /api/serp/collect-campaign 을 사용한다.
 * - 로그인 세션(editor 이상) 또는 CRON_SECRET 헤더로 호출할 수 있다.
 *   CRON_SECRET 이 없거나 헤더가 틀리면 세션 인증으로 넘어간다 (열리지 않는다).
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ campaignId: string }> }) => {
    const { campaignId } = await context.params;

    let auth: AuthContext;
    if (hasValidCronSecret(request)) {
      // 크론 호출은 세션이 없으므로 캠페인의 워크스페이스로 시스템 컨텍스트를 만든다.
      auth = await buildCronAuthForCampaign(campaignId);
    } else {
      auth = await requireAuth(request);
      assertCan(auth, "update");
    }

    // 스케줄러 모듈(src/server/providers/scheduler.ts, 다른 워커 소유)이
    // 나중에라도 생기면 자동 등록되도록 기회적으로 시도한다. 실패해도 무시한다.
    void registerPositionTrackingDueJob().catch(() => {});

    const result = await collectCampaignIfDue(auth, campaignId);
    return jsonOk(result, { status: result.skipped ? 200 : 201 });
  }
);

async function buildCronAuthForCampaign(campaignId: string): Promise<AuthContext> {
  const [campaign] = await db
    .select({
      workspaceId: positionTrackingCampaigns.workspaceId,
      createdBy: positionTrackingCampaigns.createdBy,
    })
    .from(positionTrackingCampaigns)
    .where(
      and(
        eq(positionTrackingCampaigns.id, campaignId),
        isNull(positionTrackingCampaigns.deletedAt)
      )
    )
    .limit(1);
  if (!campaign) {
    throw new ApiError("NOT_FOUND", "포지션 추적 캠페인을 찾을 수 없습니다.");
  }
  return {
    userId: campaign.createdBy ?? "system-cron",
    email: "cron@localhost",
    name: "주기 수집 스케줄러",
    workspaceId: campaign.workspaceId,
    workspaceName: "",
    workspacePlan: "pro",
    role: "editor",
    sessionId: "cron",
    ip: null,
    userAgent: null,
  };
}
