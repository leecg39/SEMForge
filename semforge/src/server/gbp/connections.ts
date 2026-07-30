import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { gbpConnections, type GbpConnection } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId } from "@/lib/ids";
import type { AuthContext } from "@/lib/session";
import {
  getGbpOAuthConfig,
  refreshGbpAccessToken,
  type GbpTokenSet,
} from "@/server/gbp/oauth";

/** 워크스페이스의 활성 GBP 연결 조회. 없으면 null. */
export async function getGbpConnection(auth: AuthContext): Promise<GbpConnection | null> {
  const [row] = await db
    .select()
    .from(gbpConnections)
    .where(and(eq(gbpConnections.workspaceId, auth.workspaceId), isNull(gbpConnections.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** OAuth 교환 결과를 저장한다. 기존 연결이 있으면 토큰을 교체한다. */
export async function saveGbpConnection(
  auth: AuthContext,
  tokens: GbpTokenSet & { refreshToken: string },
  extra: { email?: string | undefined }
): Promise<GbpConnection> {
  const existing = await getGbpConnection(auth);
  const expiry = tokens.expiryMs ?? Date.now() + 3600_000;
  if (existing) {
    const [updated] = await db
      .update(gbpConnections)
      .set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiry,
        email: extra.email ?? existing.email,
        updatedAt: new Date(),
        updatedBy: auth.userId,
      })
      .where(eq(gbpConnections.id, existing.id))
      .returning();
    return updated;
  }
  const [row] = await db
    .insert(gbpConnections)
    .values({
      id: newId("gbp"),
      workspaceId: auth.workspaceId,
      email: extra.email ?? null,
      accountName: null,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiry,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    })
    .returning();
  return row;
}

/** 연결 해제 (소프트 삭제). */
export async function disconnectGbp(auth: AuthContext): Promise<{ disconnected: boolean }> {
  const existing = await getGbpConnection(auth);
  if (!existing) return { disconnected: false };
  await db
    .update(gbpConnections)
    .set({ deletedAt: new Date(), deletedBy: auth.userId })
    .where(eq(gbpConnections.id, existing.id));
  return { disconnected: true };
}

/**
 * 유효한 액세스 토큰을 반환한다. 만료가 임박/경과하면 refresh 후 DB를 갱신한다.
 * 연결이 없으면 null.
 */
export async function getValidGbpAccessToken(auth: AuthContext): Promise<string | null> {
  const connection = await getGbpConnection(auth);
  if (!connection) return null;

  // 60초 여유를 두고 만료 판정한다.
  if (connection.expiry - Date.now() > 60_000) {
    return connection.accessToken;
  }

  const config = getGbpOAuthConfig();
  if (!config) {
    throw new ApiError(
      "INTERNAL",
      "Google OAuth 설정(GOOGLE_CLIENT_ID/SECRET)이 없어 토큰을 갱신할 수 없습니다."
    );
  }
  const refreshed = await refreshGbpAccessToken(connection.refreshToken, config);
  await db
    .update(gbpConnections)
    .set({
      accessToken: refreshed.accessToken,
      expiry: refreshed.expiryMs ?? Date.now() + 3600_000,
      updatedAt: new Date(),
    })
    .where(eq(gbpConnections.id, connection.id));
  return refreshed.accessToken;
}
