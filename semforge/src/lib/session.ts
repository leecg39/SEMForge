import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, sessions, users, workspaces } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId, newToken } from "@/lib/ids";
import type { MemberRole } from "@/db/schema";

export const SESSION_COOKIE = "sc_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  workspacePlan: "free" | "pro" | "guru" | "business";
  role: MemberRole;
  sessionId: string;
  ip: string | null;
  userAgent: string | null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function requestMeta(request?: Request) {
  if (!request) return { ip: null, userAgent: null };
  const forwarded = request.headers.get("x-forwarded-for");
  return {
    ip: forwarded ? forwarded.split(",")[0].trim() : null,
    userAgent: request.headers.get("user-agent"),
  };
}

/** 로그인 성공 시 세션 레코드를 만들고 httpOnly 쿠키를 심는다. */
export async function createSession(
  userId: string,
  activeWorkspaceId: string | null,
  request?: Request
): Promise<void> {
  const token = newToken();
  const meta = requestMeta(request);
  await db.insert(sessions).values({
    id: newId("ses"),
    tokenHash: hashToken(token),
    userId,
    activeWorkspaceId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

/**
 * 현재 세션을 해석한다. 인증되지 않았으면 null.
 * 워크스페이스가 지정되지 않은 세션은 소속 중 첫 번째를 활성으로 사용한다.
 */
export async function getAuth(request?: Request): Promise<AuthContext | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      activeWorkspaceId: sessions.activeWorkspaceId,
      userId: users.id,
      email: users.email,
      name: users.name,
      userDeletedAt: users.deletedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.userDeletedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  const membershipRows = await db
    .select({
      workspaceId: memberships.workspaceId,
      role: memberships.role,
      workspaceName: workspaces.name,
      workspacePlan: workspaces.plan,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(
      and(
        eq(memberships.userId, row.userId),
        isNull(memberships.deletedAt),
        isNull(workspaces.deletedAt)
      )
    );

  if (membershipRows.length === 0) return null;

  const active =
    membershipRows.find((m) => m.workspaceId === row.activeWorkspaceId) ??
    membershipRows[0];

  const meta = requestMeta(request);

  return {
    userId: row.userId,
    email: row.email,
    name: row.name,
    workspaceId: active.workspaceId,
    workspaceName: active.workspaceName,
    workspacePlan: active.workspacePlan,
    role: active.role,
    sessionId: row.sessionId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  };
}

export async function requireAuth(request?: Request): Promise<AuthContext> {
  const auth = await getAuth(request);
  if (!auth) {
    throw new ApiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }
  return auth;
}

export async function listWorkspacesForUser(userId: string) {
  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      plan: workspaces.plan,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(and(eq(memberships.userId, userId), isNull(memberships.deletedAt)));
}

export async function setActiveWorkspace(sessionId: string, workspaceId: string) {
  await db
    .update(sessions)
    .set({ activeWorkspaceId: workspaceId })
    .where(eq(sessions.id, sessionId));
}
