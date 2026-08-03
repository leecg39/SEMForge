import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, users, workspaces } from "@/db/schema";
import type { AuthContext } from "@/lib/session";
import { listDueContentProductionIds, processContentProduction } from "@/server/content/media";
import { registerDueJob } from "@/server/providers/scheduler";

async function eligibleCronMember(workspaceId: string, userId?: string) {
  const conditions = [
    eq(memberships.workspaceId, workspaceId),
    inArray(memberships.role, ["owner", "admin", "editor"]),
  ];
  if (userId) conditions.push(eq(memberships.userId, userId));
  const rows = await db.select({
    userId: users.id,
    email: users.email,
    name: users.name,
    workspaceName: workspaces.name,
    workspacePlan: workspaces.plan,
    role: memberships.role,
  }).from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(and(...conditions))
    .orderBy(desc(memberships.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function resolveContentMediaCronAuth(
  workspaceId: string,
  preferredUserId: string | null,
): Promise<AuthContext | null> {
  const member = preferredUserId
    ? await eligibleCronMember(workspaceId, preferredUserId)
      ?? await eligibleCronMember(workspaceId)
    : await eligibleCronMember(workspaceId);
  if (!member) return null;
  return {
    userId: member.userId,
    email: member.email,
    name: member.name,
    workspaceId,
    workspaceName: member.workspaceName,
    workspacePlan: member.workspacePlan,
    role: member.role,
    sessionId: "cron:content_media_due",
    ip: null,
    userAgent: "SEMForge content media due runner",
  };
}

let registered = false;

export function registerContentMediaDueJob(): void {
  if (registered) return;
  registered = true;
  registerDueJob("content_media_due", async ({ now, limit }) => {
    const rows = await listDueContentProductionIds(now, limit);
    const errors: string[] = [];
    let processed = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const auth = await resolveContentMediaCronAuth(row.workspaceId, row.createdBy);
        if (!auth) throw new Error("미디어 작업을 재개할 편집자 계정을 찾지 못했습니다.");
        await processContentProduction(auth, row.id);
        processed += 1;
      } catch (error) {
        failed += 1;
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    return { scanned: rows.length, processed, failed, errors };
  });
}
