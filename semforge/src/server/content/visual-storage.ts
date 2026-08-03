import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ApiError } from "@/lib/api";

const SAFE_KEY = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/u;

export function contentAssetRoot(): string {
  const configuredRoot = process.env.CONTENT_ASSET_ROOT?.trim();
  if (configuredRoot) {
    return path.isAbsolute(configuredRoot)
      ? path.normalize(configuredRoot)
      : path.join(/*turbopackIgnore: true*/ process.cwd(), configuredRoot);
  }
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "content-assets");
}

export function resolveContentAssetPath(storageKey: string): string {
  if (!SAFE_KEY.test(storageKey) || storageKey.includes("..")) {
    throw new ApiError("VALIDATION_ERROR", "안전하지 않은 콘텐츠 자산 경로입니다.");
  }
  const root = contentAssetRoot();
  const resolved = path.join(/*turbopackIgnore: true*/ root, storageKey);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new ApiError("VALIDATION_ERROR", "콘텐츠 자산 경로가 저장소를 벗어났습니다.");
  }
  return resolved;
}

function safeSegment(value: string): string {
  const segment = value.replace(/[^A-Za-z0-9_-]/gu, "_");
  if (!segment) throw new ApiError("VALIDATION_ERROR", "콘텐츠 자산 식별자가 올바르지 않습니다.");
  return segment;
}

export function visualAssetKey(input: {
  workspaceId: string;
  articleId: string;
  visualId: string;
  filename:
    | "source.webp"
    | "thumbnail.jpg"
    | "open-graph.jpg"
    | "thumbnail.svg"
    | "open-graph.svg";
}): string {
  return [
    safeSegment(input.workspaceId),
    "articles",
    safeSegment(input.articleId),
    safeSegment(input.visualId),
    input.filename,
  ].join("/");
}

export function brandLogoKey(workspaceId: string): string {
  return [safeSegment(workspaceId), "brand", "logo.png"].join("/");
}

export function productionAssetKey(input: {
  workspaceId: string;
  productionId: string;
  scope?: "images" | "keyframes" | "scenes" | "final";
  ownerId?: string;
  filename: string;
}): string {
  if (!/^[A-Za-z0-9_.-]+$/u.test(input.filename) || input.filename.includes("..")) {
    throw new ApiError("VALIDATION_ERROR", "콘텐츠 자산 파일명이 올바르지 않습니다.");
  }
  return [
    safeSegment(input.workspaceId),
    "productions",
    safeSegment(input.productionId),
    input.scope ?? "images",
    ...(input.ownerId ? [safeSegment(input.ownerId)] : []),
    input.filename,
  ].join("/");
}

export async function writeContentAsset(storageKey: string, bytes: Buffer): Promise<void> {
  const target = resolveContentAssetPath(storageKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function readContentAsset(storageKey: string): Promise<Buffer> {
  try {
    return await fs.readFile(/*turbopackIgnore: true*/ resolveContentAssetPath(storageKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ApiError("NOT_FOUND", "콘텐츠 이미지 파일을 찾을 수 없습니다.");
    }
    throw error;
  }
}

export async function deleteContentAsset(storageKey: string | null | undefined): Promise<void> {
  if (!storageKey) return;
  await fs.rm(resolveContentAssetPath(storageKey), { force: true });
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
