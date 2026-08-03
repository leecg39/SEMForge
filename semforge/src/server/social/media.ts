import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { socialMediaAssets } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId } from "@/lib/ids";
import type { AuthContext } from "@/lib/session";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const PUBLIC_URL_TTL_SECONDS = 30 * 60;

function root(): string {
  const configured = process.env.SOCIAL_ASSET_ROOT?.trim();
  if (configured)
    return path.isAbsolute(configured)
      ? path.normalize(configured)
      : path.join(/*turbopackIgnore: true*/ process.cwd(), configured);
  return path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "data",
    "social-assets",
  );
}

function safeSegment(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9_-]/gu, "_");
  if (!safe)
    throw new ApiError("VALIDATION_ERROR", "자산 식별자가 올바르지 않습니다.");
  return safe;
}

function storagePath(storageKey: string): string {
  if (
    !/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/u.test(storageKey) ||
    storageKey.includes("..")
  ) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "안전하지 않은 소셜 자산 경로입니다.",
    );
  }
  const base = root();
  const target = path.join(/*turbopackIgnore: true*/ base, storageKey);
  if (!target.startsWith(`${base}${path.sep}`))
    throw new ApiError(
      "VALIDATION_ERROR",
      "자산 경로가 저장소를 벗어났습니다.",
    );
  return target;
}

function signingSecret(): string | null {
  return process.env.APP_SECRET?.trim() || null;
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSocialMediaToken(
  assetId: string,
  expiresAt = Math.floor(Date.now() / 1000) + PUBLIC_URL_TTL_SECONDS,
): string {
  const secret = signingSecret();
  if (!secret)
    throw new ApiError(
      "INTERNAL",
      "APP_SECRET이 없어 공개 이미지 URL을 서명할 수 없습니다.",
    );
  const payload = Buffer.from(
    JSON.stringify({ assetId, exp: expiresAt }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifySocialMediaToken(token: string): {
  assetId: string;
  exp: number;
} {
  const secret = signingSecret();
  if (!secret) throw new ApiError("NOT_FOUND", "이미지를 찾을 수 없습니다.");
  const [payload, received] = token.split(".");
  if (!payload || !received)
    throw new ApiError("NOT_FOUND", "이미지를 찾을 수 없습니다.");
  const expected = signature(payload, secret);
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right))
    throw new ApiError("NOT_FOUND", "이미지를 찾을 수 없습니다.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new ApiError("NOT_FOUND", "이미지를 찾을 수 없습니다.");
  }
  const assetId =
    typeof (parsed as { assetId?: unknown }).assetId === "string"
      ? (parsed as { assetId: string }).assetId
      : "";
  const exp =
    typeof (parsed as { exp?: unknown }).exp === "number"
      ? (parsed as { exp: number }).exp
      : 0;
  if (!assetId || exp < Math.floor(Date.now() / 1000))
    throw new ApiError("NOT_FOUND", "이미지 링크가 만료되었습니다.");
  return { assetId, exp };
}

export function socialPublicBaseUrl(): string | null {
  const value = process.env.APP_PUBLIC_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function signedSocialMediaUrl(assetId: string): string | null {
  const base = socialPublicBaseUrl();
  if (!base || !signingSecret()) return null;
  return `${base}/api/social/media/public/${encodeURIComponent(createSocialMediaToken(assetId))}/`;
}

export async function saveSocialImage(
  auth: AuthContext,
  input: { projectId: string; bytes: Buffer; altText?: string | null },
) {
  if (input.bytes.length === 0 || input.bytes.length > MAX_UPLOAD_BYTES) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "이미지는 10MB 이하의 JPEG 또는 PNG 파일이어야 합니다.",
    );
  }
  let normalized: Buffer;
  try {
    normalized = await sharp(input.bytes)
      .rotate()
      .resize({
        width: 1440,
        height: 1440,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new ApiError(
      "VALIDATION_ERROR",
      "처리할 수 없는 이미지입니다. JPEG 또는 PNG 파일을 사용해 주세요.",
    );
  }
  const metadata = await sharp(normalized).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const ratio = height > 0 ? width / height : 0;
  if (!width || !height || ratio < 0.8 || ratio > 1.91) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "이미지 비율은 4:5에서 1.91:1 사이여야 합니다.",
    );
  }
  const id = newId("sma");
  const storageKey = [
    safeSegment(auth.workspaceId),
    safeSegment(input.projectId),
    `${safeSegment(id)}.jpg`,
  ].join("/");
  const target = storagePath(storageKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, normalized, { flag: "wx", mode: 0o600 });
  try {
    const [asset] = await db
      .insert(socialMediaAssets)
      .values({
        id,
        workspaceId: auth.workspaceId,
        projectId: input.projectId,
        storageKey,
        width,
        height,
        byteSize: normalized.length,
        sha256: createHash("sha256").update(normalized).digest("hex"),
        altText: input.altText?.trim() || null,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      })
      .returning();
    return asset;
  } catch (error) {
    await fs.rm(target, { force: true });
    throw error;
  }
}

export async function requireSocialMediaAsset(
  auth: AuthContext,
  assetId: string,
) {
  const [asset] = await db
    .select()
    .from(socialMediaAssets)
    .where(
      and(
        eq(socialMediaAssets.id, assetId),
        eq(socialMediaAssets.workspaceId, auth.workspaceId),
        isNull(socialMediaAssets.deletedAt),
      ),
    )
    .limit(1);
  if (!asset)
    throw new ApiError("NOT_FOUND", "소셜 이미지를 찾을 수 없습니다.");
  return asset;
}

export async function readSocialMediaAsset(assetId: string) {
  const [asset] = await db
    .select()
    .from(socialMediaAssets)
    .where(
      and(
        eq(socialMediaAssets.id, assetId),
        isNull(socialMediaAssets.deletedAt),
      ),
    )
    .limit(1);
  if (!asset) throw new ApiError("NOT_FOUND", "이미지를 찾을 수 없습니다.");
  try {
    return {
      asset,
      bytes: await fs.readFile(
        /*turbopackIgnore: true*/ storagePath(asset.storageKey),
      ),
    };
  } catch {
    throw new ApiError("NOT_FOUND", "이미지 파일을 찾을 수 없습니다.");
  }
}
