import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { appNotifications } from "@/db/schema";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const rows = await db
    .select()
    .from(appNotifications)
    .where(and(eq(appNotifications.workspaceId, auth.workspaceId), eq(appNotifications.userId, auth.userId)))
    .orderBy(desc(appNotifications.createdAt))
    .limit(30);
  return jsonOk({
    unread: rows.filter((row) => !row.readAt).length,
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      href: row.href,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  });
});

const patchSchema = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  all: z.boolean().optional().default(false),
}).refine((value) => Boolean(value.id) || value.all, { message: "읽음 처리할 알림을 선택해 주세요." });

export const PATCH = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const input = await parseBody(request, patchSchema);
  const condition = input.all
    ? and(eq(appNotifications.workspaceId, auth.workspaceId), eq(appNotifications.userId, auth.userId))
    : and(
        eq(appNotifications.id, input.id!),
        eq(appNotifications.workspaceId, auth.workspaceId),
        eq(appNotifications.userId, auth.userId)
      );
  await db.update(appNotifications).set({ readAt: new Date() }).where(condition);
  return jsonOk({ ok: true });
});
