import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { siteAuditCampaigns } from "@/db/schema";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan, assertSameWorkspace } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { ensureSiteAuditDueJob } from "@/server/siteaudit/due";
import { setCampaignSchedule } from "@/server/siteaudit/schedule";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  schedule: z.enum(["off", "daily", "weekly"]),
});

/**
 * 캠페인의 반복 크롤 스케줄을 저장하고 next_run_at 을 갱신한다.
 * 저장된 스케줄은 /api/cron/run-due 에 등록된 site_audit 잡이 실제로 실행한다.
 */
export const POST = route(async (request: Request, context: Ctx) => {
  ensureSiteAuditDueJob();
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const { id } = await context.params;
  const { schedule } = await parseBody(request, bodySchema);

  const [campaign] = await db
    .select({ id: siteAuditCampaigns.id, workspaceId: siteAuditCampaigns.workspaceId })
    .from(siteAuditCampaigns)
    .where(and(eq(siteAuditCampaigns.id, id), isNull(siteAuditCampaigns.deletedAt)))
    .limit(1);
  assertSameWorkspace(auth, campaign, "사이트 진단 캠페인");

  const saved = await setCampaignSchedule(campaign.id, schedule);
  return jsonOk(saved, { meta: { runner: "/api/cron/run-due", job: "site_audit" } });
});
