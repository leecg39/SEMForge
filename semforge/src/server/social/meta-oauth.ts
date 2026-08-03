import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { socialConnections, socialProfiles } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { newId } from "@/lib/ids";
import type { AuthContext } from "@/lib/session";
import {
  ensureSocialProject,
  getSocialCapabilities,
  upsertSocialProfile,
} from "./projects";

const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "read_insights",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
] as const;

interface MetaOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  version: string;
}

function config(): MetaOAuthConfig {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const redirectUri = process.env.META_REDIRECT_URI?.trim();
  const version = process.env.META_GRAPH_API_VERSION?.trim();
  if (!appId || !appSecret || !redirectUri || !version) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Meta 앱 환경 설정이 완료되지 않았습니다.",
    );
  }
  return { appId, appSecret, redirectUri, version };
}

function appSecret(): string {
  const value = process.env.APP_SECRET?.trim();
  if (!value) throw new ApiError("INTERNAL", "APP_SECRET이 필요합니다.");
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", appSecret()).update(payload).digest("base64url");
}

export function createMetaOAuthState(
  auth: AuthContext,
  folderId: string,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      userId: auth.userId,
      workspaceId: auth.workspaceId,
      folderId,
      nonce: randomBytes(12).toString("hex"),
      exp: Math.floor(Date.now() / 1000) + 10 * 60,
    }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyMetaOAuthState(
  auth: AuthContext,
  state: string,
): { folderId: string } {
  const [payload, received] = state.split(".");
  if (!payload || !received)
    throw new ApiError(
      "VALIDATION_ERROR",
      "Meta OAuth state가 올바르지 않습니다.",
    );
  const expected = sign(payload);
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right))
    throw new ApiError(
      "VALIDATION_ERROR",
      "Meta OAuth state 검증에 실패했습니다.",
    );
  let parsed: {
    userId?: string;
    workspaceId?: string;
    folderId?: string;
    exp?: number;
  };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Meta OAuth state가 올바르지 않습니다.",
    );
  }
  if (
    parsed.userId !== auth.userId ||
    parsed.workspaceId !== auth.workspaceId ||
    !parsed.folderId ||
    (parsed.exp ?? 0) < Math.floor(Date.now() / 1000)
  ) {
    throw new ApiError(
      "FORBIDDEN",
      "Meta OAuth 요청이 만료되었거나 현재 세션과 일치하지 않습니다.",
    );
  }
  return { folderId: parsed.folderId };
}

export function buildMetaAuthorizationUrl(
  auth: AuthContext,
  folderId: string,
): string {
  const meta = config();
  const url = new URL(`https://www.facebook.com/${meta.version}/dialog/oauth`);
  url.searchParams.set("client_id", meta.appId);
  url.searchParams.set("redirect_uri", meta.redirectUri);
  url.searchParams.set("state", createMetaOAuthState(auth, folderId));
  url.searchParams.set("scope", META_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  return url.toString();
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function textArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

async function metaJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const payload = record(await response.json().catch(() => ({})));
  if (!response.ok || payload.error) {
    const error = record(payload.error);
    throw new ApiError(
      "VALIDATION_ERROR",
      `Meta 인증에 실패했습니다: ${text(error.message) ?? `HTTP ${response.status}`}`,
    );
  }
  return payload;
}

async function exchangeCode(code: string) {
  const meta = config();
  const url = new URL(
    `https://graph.facebook.com/${meta.version}/oauth/access_token`,
  );
  url.searchParams.set("client_id", meta.appId);
  url.searchParams.set("client_secret", meta.appSecret);
  url.searchParams.set("redirect_uri", meta.redirectUri);
  url.searchParams.set("code", code);
  const short = await metaJson(url.toString());
  const shortToken = text(short.access_token);
  if (!shortToken)
    throw new ApiError(
      "VALIDATION_ERROR",
      "Meta가 액세스 토큰을 반환하지 않았습니다.",
    );
  const longUrl = new URL(
    `https://graph.facebook.com/${meta.version}/oauth/access_token`,
  );
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", meta.appId);
  longUrl.searchParams.set("client_secret", meta.appSecret);
  longUrl.searchParams.set("fb_exchange_token", shortToken);
  const long = await metaJson(longUrl.toString());
  return {
    accessToken: text(long.access_token) ?? shortToken,
    expiresAt:
      typeof long.expires_in === "number"
        ? new Date(Date.now() + long.expires_in * 1000)
        : null,
  };
}

export async function completeMetaConnection(
  auth: AuthContext,
  folderId: string,
  code: string,
) {
  const project = await ensureSocialProject(auth, folderId);
  const meta = config();
  const tokens = await exchangeCode(code);
  const me = await metaJson(
    `https://graph.facebook.com/${meta.version}/me?fields=id,name&access_token=${encodeURIComponent(tokens.accessToken)}`,
  );
  const pages = await metaJson(
    `https://graph.facebook.com/${meta.version}/me/accounts?fields=id,name,access_token,tasks,picture,instagram_business_account{id,username,profile_picture_url}&limit=100&access_token=${encodeURIComponent(tokens.accessToken)}`,
  );
  const [existing] = await db
    .select()
    .from(socialConnections)
    .where(
      and(
        eq(socialConnections.workspaceId, auth.workspaceId),
        eq(socialConnections.provider, "meta"),
        isNull(socialConnections.deletedAt),
      ),
    )
    .limit(1);
  const values = {
    externalAccountId: text(me.id),
    accountName: text(me.name),
    accessToken: encryptSecret(tokens.accessToken),
    expiresAt: tokens.expiresAt,
    scopes: JSON.stringify(META_SCOPES),
    status: "active" as const,
    lastError: null,
    updatedAt: new Date(),
    updatedBy: auth.userId,
  };
  const connection = existing
    ? (
        await db
          .update(socialConnections)
          .set(values)
          .where(eq(socialConnections.id, existing.id))
          .returning()
      )[0]
    : (
        await db
          .insert(socialConnections)
          .values({
            id: newId("soc"),
            workspaceId: auth.workspaceId,
            provider: "meta",
            ...values,
            createdBy: auth.userId,
          })
          .returning()
      )[0];

  let imported = 0;
  for (const raw of Array.isArray(pages.data) ? pages.data : []) {
    const page = record(raw);
    const pageId = text(page.id);
    const pageToken = text(page.access_token);
    const pageName = text(page.name);
    if (!pageId || !pageToken || !pageName) continue;
    const picture = record(record(page.picture).data);
    const tasks = new Set(textArray(page.tasks));
    const pageCanPublish = tasks.has("CREATE_CONTENT") || tasks.has("MANAGE");
    const pageCapabilities = getSocialCapabilities().facebook_page;
    await upsertSocialProfile(auth, folderId, {
      platform: "facebook_page",
      externalId: pageId,
      displayName: pageName,
      avatarUrl: text(picture.url),
      connectionId: connection.id,
      encryptedAccessToken: encryptSecret(pageToken),
      capabilities: {
        ...pageCapabilities,
        publishText: pageCapabilities.publishText && pageCanPublish,
        publishImage: pageCapabilities.publishImage && pageCanPublish,
        reason: pageCanPublish
          ? pageCapabilities.reason
          : "이 Page에 콘텐츠 생성 권한이 없습니다.",
      },
    });
    imported += 1;
    const instagram = record(page.instagram_business_account);
    const instagramId = text(instagram.id);
    if (instagramId) {
      await upsertSocialProfile(auth, folderId, {
        platform: "instagram_professional",
        externalId: instagramId,
        parentExternalId: pageId,
        displayName: text(instagram.username) ?? `${pageName} Instagram`,
        handle: text(instagram.username),
        avatarUrl: text(instagram.profile_picture_url),
        connectionId: connection.id,
        encryptedAccessToken: encryptSecret(pageToken),
        capabilities: getSocialCapabilities().instagram_professional,
      });
      imported += 1;
    }
  }
  await db
    .update(socialProfiles)
    .set({ updatedAt: new Date() })
    .where(eq(socialProfiles.projectId, project.id));
  return { imported };
}

export async function getDecryptedSocialProfileToken(
  profile: typeof socialProfiles.$inferSelect,
): Promise<string | null> {
  if (!profile.accessToken) return null;
  return decryptSecret(profile.accessToken);
}

export async function disconnectMeta(auth: AuthContext, folderId: string) {
  const project = await ensureSocialProject(auth, folderId);
  const [connection] = await db
    .select()
    .from(socialConnections)
    .where(
      and(
        eq(socialConnections.workspaceId, auth.workspaceId),
        eq(socialConnections.provider, "meta"),
        isNull(socialConnections.deletedAt),
      ),
    )
    .limit(1);
  if (!connection) return { disconnected: false };
  const now = new Date();
  db.transaction((tx) => {
    tx.update(socialConnections)
      .set({ deletedAt: now, deletedBy: auth.userId, status: "revoked" })
      .where(eq(socialConnections.id, connection.id))
      .run();
    tx.update(socialProfiles)
      .set({
        enabled: false,
        lastError: "Meta 연결이 해제되었습니다.",
        updatedAt: now,
      })
      .where(
        and(
          eq(socialProfiles.projectId, project.id),
          eq(socialProfiles.connectionId, connection.id),
        ),
      )
      .run();
  });
  return { disconnected: true };
}
