import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { invitations, memberships, users } from "@/db/schema";
import { jsonOk, parseBody, route } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { newId, newToken } from "@/lib/ids";
import { assertCan, ROLE_LABELS } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { emailSchema } from "@/lib/validators";

/**
 * 사용자 관리.
 * 원본 `/corporate/account/start` 에는 `사용자 초대` 버튼이 있으나 무료 플랜에서 동작하지 않아
 * 역할 목록과 초대 폼을 관찰할 수 없었다. 따라서 역할 체계는 제안(P)이다.
 */

const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["admin", "editor", "viewer"]).default("viewer"),
});

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "manageMembers");

  const members = await db
    .select({
      id: memberships.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      role: memberships.role,
      lastLoginAt: users.lastLoginAt,
      joinedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.workspaceId, auth.workspaceId),
        isNull(memberships.deletedAt)
      )
    );

  const pending = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.workspaceId, auth.workspaceId),
        eq(invitations.status, "pending"),
        isNull(invitations.deletedAt)
      )
    );

  return jsonOk(
    { members, invitations: pending },
    { meta: { roleLabels: ROLE_LABELS } }
  );
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "manageMembers");
  const { email, role } = await parseBody(request, inviteSchema);

  const token = newToken();
  const [row] = await db
    .insert(invitations)
    .values({
      id: newId("inv"),
      workspaceId: auth.workspaceId,
      email,
      role,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdBy: auth.userId,
      updatedBy: auth.userId,
    })
    .returning();

  writeAudit(auth, {
    action: "create",
    entityType: "invitations",
    entityId: row.id,
    entityLabel: email,
    after: { email, role, status: "pending" },
  });

  // 실제 메일 발송은 범위 밖이므로 초대 링크를 응답으로 돌려준다 (P).
  return jsonOk(
    { ...row, inviteUrl: `/app/invite/${token}/` },
    { status: 201 }
  );
});
