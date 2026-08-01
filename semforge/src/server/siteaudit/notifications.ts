import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { siteAuditNotifications } from "@/db/schema";
import { newId } from "@/lib/ids";
import { sendSiteAuditEmail } from "@/server/siteaudit/email";

export async function deliverSiteAuditNotifications(input: {
  workspaceId: string;
  campaignId: string;
  campaignName: string;
  runId: string;
  userId: string;
  email: string;
  notifyInApp: boolean;
  notifyEmail: boolean;
  outcome: "completed" | "failed";
  summary: string;
}): Promise<void> {
  const success = input.outcome === "completed";
  const title = success
    ? `${input.campaignName} 사이트 진단이 완료되었습니다`
    : `${input.campaignName} 사이트 진단에 실패했습니다`;
  const message = input.summary;
  const now = new Date();

  if (input.notifyInApp) {
    await db
      .insert(siteAuditNotifications)
      .values({
        id: newId("san"),
        workspaceId: input.workspaceId,
        campaignId: input.campaignId,
        runId: input.runId,
        userId: input.userId,
        channel: "in_app",
        status: "delivered",
        title,
        message,
        deliveredAt: now,
        createdAt: now,
      })
      .onConflictDoNothing();
  }

  if (!input.notifyEmail) return;

  const [existing] = await db
    .select({ id: siteAuditNotifications.id })
    .from(siteAuditNotifications)
    .where(
      and(
        eq(siteAuditNotifications.runId, input.runId),
        eq(siteAuditNotifications.userId, input.userId),
        eq(siteAuditNotifications.channel, "email")
      )
    )
    .limit(1);
  if (existing) return;

  const result = await sendSiteAuditEmail({
    to: input.email,
    subject: `[SEMForge] ${title}`,
    text: `${message}\n\nSEMForge 사이트 진단: /siteaudit/?campaign=${input.campaignId}`,
    idempotencyKey: `site-audit-${input.runId}-${input.userId}`,
  });
  await db
    .insert(siteAuditNotifications)
    .values({
      id: newId("san"),
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      runId: input.runId,
      userId: input.userId,
      channel: "email",
      status: result.status,
      title,
      message,
      providerMessage:
        result.status === "delivered" ? result.providerId : result.reason,
      deliveredAt: result.status === "delivered" ? now : null,
      createdAt: now,
    })
    .onConflictDoNothing();
}
