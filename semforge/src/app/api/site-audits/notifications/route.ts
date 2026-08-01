import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { siteAuditNotifications } from "@/db/schema";
import { ApiError, jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const rows = await db
    .select()
    .from(siteAuditNotifications)
    .where(
      and(
        eq(siteAuditNotifications.workspaceId, auth.workspaceId),
        eq(siteAuditNotifications.userId, auth.userId),
        eq(siteAuditNotifications.channel, "in_app")
      )
    )
    .orderBy(desc(siteAuditNotifications.createdAt))
    .limit(20);
  const unread = rows.filter((row) => row.readAt === null).length;
  return jsonOk(
    rows.map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      runId: row.runId,
      title: row.title,
      message: row.message,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    { meta: { unread } }
  );
});

const patchSchema = z.object({
  id: z.string().optional(),
  all: z.boolean().optional().default(false),
});

export const PATCH = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const input = await parseBody(request, patchSchema);
  if (!input.all && !input.id) {
    throw new ApiError("VALIDATION_ERROR", "읽음 처리할 알림을 선택하세요.");
  }
  const now = new Date();
  const scope = [
    eq(siteAuditNotifications.workspaceId, auth.workspaceId),
    eq(siteAuditNotifications.userId, auth.userId),
    eq(siteAuditNotifications.channel, "in_app"),
    isNull(siteAuditNotifications.readAt),
  ];
  if (!input.all && input.id) scope.push(eq(siteAuditNotifications.id, input.id));
  const updated = await db
    .update(siteAuditNotifications)
    .set({ readAt: now })
    .where(and(...scope))
    .returning({ id: siteAuditNotifications.id });
  return jsonOk({ updated: updated.length, readAt: now.toISOString() });
});
