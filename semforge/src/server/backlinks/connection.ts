import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import {
  bingWebmasterConnections,
  bingWebmasterOauthStates,
  type BingWebmasterConnectionRow,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { newId } from "@/lib/ids";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface BingConnection {
  id: string;
  workspaceId: string;
  selectedSiteUrl: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiryMs: number | null;
}

function fromRow(row: BingWebmasterConnectionRow): BingConnection | null {
  const accessToken = decryptSecret(row.accessToken);
  const refreshToken = row.refreshToken ? decryptSecret(row.refreshToken) : null;
  if (!accessToken || (row.refreshToken && !refreshToken)) return null;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    selectedSiteUrl: row.selectedSiteUrl,
    accessToken,
    refreshToken,
    expiryMs: row.expiry,
  };
}

export async function getBingConnection(workspaceId: string): Promise<BingConnection | null> {
  const [row] = await db
    .select()
    .from(bingWebmasterConnections)
    .where(eq(bingWebmasterConnections.workspaceId, workspaceId))
    .limit(1);
  return row ? fromRow(row) : null;
}

export async function saveBingConnection(input: {
  workspaceId: string;
  selectedSiteUrl?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  expiryMs?: number | null;
}): Promise<BingConnection> {
  if (!isEncryptionConfigured()) {
    throw new ApiError("INTERNAL", "Bing OAuth 토큰 암호화를 위해 APP_SECRET을 먼저 설정해 주세요.", {
      details: { providerReason: "encryption_configuration" },
    });
  }
  const now = Date.now();
  await db
    .insert(bingWebmasterConnections)
    .values({
      id: newId("bwc"),
      workspaceId: input.workspaceId,
      selectedSiteUrl: input.selectedSiteUrl ?? null,
      accessToken: encryptSecret(input.accessToken),
      refreshToken: input.refreshToken ? encryptSecret(input.refreshToken) : null,
      expiry: input.expiryMs ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: bingWebmasterConnections.workspaceId,
      set: {
        selectedSiteUrl: input.selectedSiteUrl ?? null,
        accessToken: encryptSecret(input.accessToken),
        refreshToken: input.refreshToken ? encryptSecret(input.refreshToken) : null,
        expiry: input.expiryMs ?? null,
        updatedAt: now,
      },
    });
  const saved = await getBingConnection(input.workspaceId);
  if (!saved) throw new ApiError("INTERNAL", "Bing Webmaster 연결 정보를 저장하지 못했습니다.");
  return saved;
}

export async function updateBingConnectionTokens(input: {
  id: string;
  accessToken: string;
  refreshToken?: string | null;
  expiryMs?: number | null;
}): Promise<void> {
  await db
    .update(bingWebmasterConnections)
    .set({
      accessToken: encryptSecret(input.accessToken),
      ...(input.refreshToken ? { refreshToken: encryptSecret(input.refreshToken) } : {}),
      expiry: input.expiryMs ?? null,
      updatedAt: Date.now(),
    })
    .where(eq(bingWebmasterConnections.id, input.id));
}

export async function selectBingSite(workspaceId: string, siteUrl: string): Promise<void> {
  await db
    .update(bingWebmasterConnections)
    .set({ selectedSiteUrl: siteUrl, updatedAt: Date.now() })
    .where(eq(bingWebmasterConnections.workspaceId, workspaceId));
}

export async function deleteBingConnection(workspaceId: string): Promise<void> {
  await db.delete(bingWebmasterConnections).where(eq(bingWebmasterConnections.workspaceId, workspaceId));
  await db.delete(bingWebmasterOauthStates).where(eq(bingWebmasterOauthStates.workspaceId, workspaceId));
}

function stateHash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function createBingOauthState(input: {
  workspaceId: string;
  returnTo: string;
  now?: Date;
}): Promise<string> {
  const now = input.now ?? new Date();
  const raw = randomBytes(32).toString("base64url");
  await db.insert(bingWebmasterOauthStates).values({
    id: newId("bos"),
    stateHash: stateHash(raw),
    workspaceId: input.workspaceId,
    returnTo: input.returnTo,
    expiresAt: new Date(now.getTime() + OAUTH_STATE_TTL_MS),
    createdAt: now,
  });
  await db.delete(bingWebmasterOauthStates).where(lt(bingWebmasterOauthStates.expiresAt, now));
  return raw;
}

export async function consumeBingOauthState(input: {
  rawState: string;
  workspaceId: string;
  now?: Date;
}): Promise<{ returnTo: string }> {
  const now = input.now ?? new Date();
  const [row] = await db
    .select()
    .from(bingWebmasterOauthStates)
    .where(eq(bingWebmasterOauthStates.stateHash, stateHash(input.rawState)))
    .limit(1);
  if (!row || row.workspaceId !== input.workspaceId || row.usedAt || row.expiresAt <= now) {
    throw new ApiError("UNAUTHENTICATED", "Bing 연결 요청이 만료되었거나 이미 사용되었습니다.");
  }
  const [used] = await db
    .update(bingWebmasterOauthStates)
    .set({ usedAt: now })
    .where(and(eq(bingWebmasterOauthStates.id, row.id), isNull(bingWebmasterOauthStates.usedAt)))
    .returning();
  if (!used) throw new ApiError("UNAUTHENTICATED", "Bing 연결 요청이 이미 사용되었습니다.");
  return { returnTo: row.returnTo };
}
