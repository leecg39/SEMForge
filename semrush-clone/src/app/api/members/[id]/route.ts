import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { memberships, users } from "@/db/schema";
import { ApiError, jsonOk, parseBody, route } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  role: z.enum(["owner", "admin", "editor", "viewer"]),
});

async function loadMembership(workspaceId: string, id: string) {
  const [row] = await db
    .select({
      id: memberships.id,
      userId: memberships.userId,
      role: memberships.role,
      email: users.email,
      workspaceId: memberships.workspaceId,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.id, id), isNull(memberships.deletedAt)))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) {
    throw new ApiError("NOT_FOUND", "멤버를 찾을 수 없습니다.");
  }
  return row;
}

/** 마지막 소유자를 잃지 않도록 소유자 수를 센다. */
async function countOwners(workspaceId: string) {
  const rows = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.role, "owner"),
        isNull(memberships.deletedAt)
      )
    );
  return rows.length;
}

export const PATCH = route(async (request: Request, context: Ctx) => {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  assertCan(auth, "manageMembers");
  const { role } = await parseBody(request, patchSchema);
  const before = await loadMembership(auth.workspaceId, id);

  if (role === "owner" && auth.role !== "owner") {
    throw new ApiError("FORBIDDEN", "소유자 권한은 소유자만 부여할 수 있습니다.");
  }
  if (before.role === "owner" && role !== "owner" && (await countOwners(auth.workspaceId)) <= 1) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "워크스페이스에는 소유자가 최소 1명 있어야 합니다."
    );
  }

  await db
    .update(memberships)
    .set({ role, updatedAt: new Date(), updatedBy: auth.userId })
    .where(eq(memberships.id, id));

  writeAudit(auth, {
    action: "update",
    entityType: "memberships",
    entityId: id,
    entityLabel: before.email,
    before: { role: before.role },
    after: { role },
  });
  return jsonOk({ id, role });
});

export const DELETE = route(async (request: Request, context: Ctx) => {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  assertCan(auth, "manageMembers");
  const before = await loadMembership(auth.workspaceId, id);

  if (before.userId === auth.userId) {
    throw new ApiError("VALIDATION_ERROR", "자신을 제거할 수 없습니다.");
  }
  if (before.role === "owner" && (await countOwners(auth.workspaceId)) <= 1) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "워크스페이스에는 소유자가 최소 1명 있어야 합니다."
    );
  }

  await db
    .update(memberships)
    .set({ deletedAt: new Date(), deletedBy: auth.userId })
    .where(eq(memberships.id, id));

  writeAudit(auth, {
    action: "delete",
    entityType: "memberships",
    entityId: id,
    entityLabel: before.email,
    before,
  });
  return jsonOk({ id, removed: true });
});
