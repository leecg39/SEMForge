import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { gbpConnections, type GbpConnection } from "@/db/schema";
import { ApiError } from "@/lib/api";
import {
  decryptSecret,
  encryptSecret,
  isEncrypted,
  isEncryptionConfigured,
} from "@/lib/crypto";
import { newId } from "@/lib/ids";
import type { AuthContext } from "@/lib/session";
import {
  getGbpOAuthConfig,
  refreshGbpAccessToken,
  type GbpTokenSet,
} from "@/server/gbp/oauth";

/** 평문 시절 행을 발견하면 암호화해 다시 저장한다 (lazy 재암호화, 베스트 에포트). */
function reencryptIfPlaintext(row: GbpConnection): void {
  if (!isEncryptionConfigured()) return;
  if (isEncrypted(row.accessToken) && isEncrypted(row.refreshToken)) return;
  try {
    db.update(gbpConnections)
      .set({
        accessToken: isEncrypted(row.accessToken)
          ? row.accessToken
          : encryptSecret(row.accessToken),
        refreshToken: isEncrypted(row.refreshToken)
          ? row.refreshToken
          : encryptSecret(row.refreshToken),
        updatedAt: new Date(),
      })
      .where(eq(gbpConnections.id, row.id))
      .run();
  } catch (error) {
    console.warn("[gbp] 토큰 재암호화 실패 (다음 조회에서 재시도)", error);
  }
}

/**
 * 워크스페이스의 활성 GBP 연결 조회. 없으면 null.
 * 반환 객체의 토큰은 복호화된 평문이다. 복호화 실패(APP_SECRET 변경 등)는
 * null 을 돌려 "미연결"로 다뤄 재연결을 유도한다.
 */
export async function getGbpConnection(auth: AuthContext): Promise<GbpConnection | null> {
  const [row] = await db
    .select()
    .from(gbpConnections)
    .where(and(eq(gbpConnections.workspaceId, auth.workspaceId), isNull(gbpConnections.deletedAt)))
    .limit(1);
  if (!row) return null;
  reencryptIfPlaintext(row);
  const accessToken = decryptSecret(row.accessToken);
  const refreshToken = decryptSecret(row.refreshToken);
  if (accessToken === null || refreshToken === null) return null;
  return { ...row, accessToken, refreshToken };
}

/**
 * OAuth 교환 결과를 저장한다. 기존 연결이 있으면 토큰을 교체한다.
 * 저장은 암호문, 반환 객체의 토큰은 호출부가 바로 쓸 수 있는 평문이다.
 */
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
        accessToken: encryptSecret(tokens.accessToken),
        refreshToken: encryptSecret(tokens.refreshToken),
        expiry,
        email: extra.email ?? existing.email,
        updatedAt: new Date(),
        updatedBy: auth.userId,
      })
      .where(eq(gbpConnections.id, existing.id))
      .returning();
    return { ...updated, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }
  const [row] = await db
    .insert(gbpConnections)
    .values({
      id: newId("gbp"),
      workspaceId: auth.workspaceId,
      email: extra.email ?? null,
      accountName: null,
      accessToken: encryptSecret(tokens.accessToken),
      refreshToken: encryptSecret(tokens.refreshToken),
      expiry,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    })
    .returning();
  return { ...row, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
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
      accessToken: encryptSecret(refreshed.accessToken),
      expiry: refreshed.expiryMs ?? Date.now() + 3600_000,
      updatedAt: new Date(),
    })
    .where(eq(gbpConnections.id, connection.id));
  return refreshed.accessToken;
}
