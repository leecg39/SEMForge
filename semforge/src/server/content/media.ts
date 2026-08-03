import { and, asc, desc, eq, inArray, isNull, like, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  contentArticles,
  contentBrandKits,
  contentProductionAssets,
  contentProductions,
  contentVideoRuns,
  contentVideoScenes,
  contentVideoStoryboards,
  folders,
  workspaces,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { newId, newUuid } from "@/lib/ids";
import { assertCan, assertOwnershipOrAdmin } from "@/lib/rbac";
import type { AuthContext } from "@/lib/session";
import { requestChatMockText, getChatMockContentCapability } from "@/server/chatmock/client";
import {
  approveContentProductionSchema,
  createContentProductionSchema,
  updateContentProductionSchema,
  updateContentVideoSceneSchema,
  type ContentVisualSpecification,
} from "@/server/content/contracts";
import { getContentAiModelCapability, requestContentAiText } from "@/server/content/generation-providers";
import {
  buildKeyframePrompt,
  buildProductionImagePrompt,
  buildStoryboardPrompt,
  extractJsonObject,
  normalizeStoryboard,
} from "@/server/content/media-prompts";
import {
  deleteContentAsset,
  productionAssetKey,
  readContentAsset,
  sha256,
  writeContentAsset,
} from "@/server/content/visual-storage";
import {
  generateSourceArtwork,
  renderProductionImage,
  renderVideoKeyframe,
  renderVisualVariants,
} from "@/server/content/visual-renderer";
import { normalizeVisualSpecification } from "@/server/content/visuals";
import {
  downloadHappyHorseVideo,
  pollHappyHorseScene,
} from "@/server/content/happyhorse";
import {
  downloadXaiVideo,
  getXaiVideoCapability,
  pollXaiVideoScene,
  submitXaiVideoScene,
  verifyXaiVideoAccess,
} from "@/server/content/xai-video";
import { assembleProductionVideo, getFfmpegCapability, probeVideo } from "@/server/content/video-renderer";

const LEASE_MS = 5 * 60 * 1_000;
const DEFAULT_PRIMARY = "#ff5a1f";
const DEFAULT_SECONDARY = "#18181b";

type ProductionRow = typeof contentProductions.$inferSelect;
type ProductionAssetRow = typeof contentProductionAssets.$inferSelect;

type ProductionInputSnapshot = {
  article: null | {
    id: string;
    title: string;
    metaDescription: string | null;
    keyword: string | null;
    headings: string[];
    excerpt: string;
    version: number;
  };
  sourceVisual?: null | {
    productionId: string;
    assetId: string;
    sha256: string;
    specification: ContentVisualSpecification | null;
    title: string;
  };
  requestedAt: string;
};

type ImageSettings = {
  preset: "hero" | "square" | "portrait" | "story";
  stylePreset: "editorial_photo" | "illustration" | "minimal_3d" | "abstract_graphic";
  displayTitle: string;
  showTitle: boolean;
  titlePosition: "top_left" | "bottom_left";
  showLogo: boolean;
  focalX: number;
  focalY: number;
};

type VideoSettings = {
  targetDuration: 30 | 45 | 60;
  aspectRatio: "16:9" | "9:16" | "1:1";
  stylePreset: "editorial_photo" | "illustration" | "minimal_3d" | "abstract_graphic";
  nativeAudio: true;
};

type StoredError = { code?: string; message?: string; stage?: string; retryable?: boolean; failedAt?: string };

function parseObject<T extends object>(value: string | null): T {
  if (!value) return {} as T;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as T : {} as T;
  } catch {
    return {} as T;
  }
}

function headings(markdown: string | null): string[] {
  return (markdown ?? "")
    .split(/\r?\n/u)
    .map((line) => line.match(/^#{1,3}\s+(.+)$/u)?.[1]?.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, 10);
}

function excerpt(markdown: string | null): string {
  return (markdown ?? "")
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/[#>*_`\[\]()!-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 1_500);
}

async function requireArticle(auth: AuthContext, articleId: string) {
  const [article] = await db.select().from(contentArticles).where(and(
    eq(contentArticles.id, articleId),
    eq(contentArticles.workspaceId, auth.workspaceId),
    isNull(contentArticles.deletedAt),
  )).limit(1);
  if (!article) throw new ApiError("NOT_FOUND", "연결할 콘텐츠 문서를 찾을 수 없습니다.");
  return article;
}

async function requireProduction(auth: AuthContext, productionId: string) {
  const [production] = await db.select().from(contentProductions).where(and(
    eq(contentProductions.id, productionId),
    eq(contentProductions.workspaceId, auth.workspaceId),
    isNull(contentProductions.deletedAt),
  )).limit(1);
  if (!production) throw new ApiError("NOT_FOUND", "미디어 작업판을 찾을 수 없습니다.");
  return production;
}

async function requireScene(auth: AuthContext, sceneId: string) {
  const [scene] = await db.select().from(contentVideoScenes).where(and(
    eq(contentVideoScenes.id, sceneId),
    eq(contentVideoScenes.workspaceId, auth.workspaceId),
    isNull(contentVideoScenes.deletedAt),
  )).limit(1);
  if (!scene) throw new ApiError("NOT_FOUND", "영상 장면을 찾을 수 없습니다.");
  return scene;
}

async function validateFolder(auth: AuthContext, folderId: string | null | undefined) {
  if (!folderId) return;
  const [folder] = await db.select({ id: folders.id }).from(folders).where(and(
    eq(folders.id, folderId),
    eq(folders.workspaceId, auth.workspaceId),
    isNull(folders.deletedAt),
  )).limit(1);
  if (!folder) throw new ApiError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
}

async function articleSnapshot(auth: AuthContext, articleId: string | null | undefined): Promise<ProductionInputSnapshot["article"]> {
  if (!articleId) return null;
  const article = await requireArticle(auth, articleId);
  return {
    id: article.id,
    title: article.title,
    metaDescription: article.metaDescription,
    keyword: article.keyword,
    headings: headings(article.body),
    excerpt: excerpt(article.body),
    version: article.version,
  };
}

async function resolvedBrand(auth: AuthContext) {
  const [kit] = await db.select().from(contentBrandKits).where(and(
    eq(contentBrandKits.workspaceId, auth.workspaceId),
    isNull(contentBrandKits.deletedAt),
  )).limit(1);
  if (kit) {
    return {
      brandName: kit.brandName,
      primaryColor: kit.primaryColor,
      secondaryColor: kit.secondaryColor,
      logo: kit.logoStorageKey ? await readContentAsset(kit.logoStorageKey).catch(() => null) : null,
    };
  }
  const [workspace] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, auth.workspaceId)).limit(1);
  return {
    brandName: workspace?.name || auth.workspaceName || "SEMForge",
    primaryColor: DEFAULT_PRIMARY,
    secondaryColor: DEFAULT_SECONDARY,
    logo: null,
  };
}

function publicAsset(asset: ProductionAssetRow) {
  return {
    id: asset.id,
    kind: asset.kind,
    url: `/api/content/assets/${asset.id}/file/`,
    downloadUrl: `/api/content/assets/${asset.id}/file/?download=1`,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    byteSize: asset.byteSize,
    durationMs: asset.durationMs,
    fps: asset.fps,
    hasAudio: asset.hasAudio,
    altText: asset.altText,
    sceneId: asset.sceneId,
  };
}

async function publicProduction(auth: AuthContext, production: ProductionRow) {
  const assets = await db.select().from(contentProductionAssets).where(and(
    eq(contentProductionAssets.productionId, production.id),
    eq(contentProductionAssets.workspaceId, auth.workspaceId),
    isNull(contentProductionAssets.deletedAt),
  )).orderBy(asc(contentProductionAssets.createdAt));
  const [folder] = production.folderId
    ? await db.select({ name: folders.name }).from(folders).where(eq(folders.id, production.folderId)).limit(1)
    : [];
  const [article] = production.articleId
    ? await db.select({ version: contentArticles.version }).from(contentArticles).where(and(
        eq(contentArticles.id, production.articleId),
        eq(contentArticles.workspaceId, auth.workspaceId),
        isNull(contentArticles.deletedAt),
      )).limit(1)
    : [];
  const [storyboard] = production.kind === "video"
    ? await db.select().from(contentVideoStoryboards).where(and(
        eq(contentVideoStoryboards.productionId, production.id),
        eq(contentVideoStoryboards.workspaceId, auth.workspaceId),
        isNull(contentVideoStoryboards.deletedAt),
      )).orderBy(desc(contentVideoStoryboards.revision)).limit(1)
    : [];
  const scenes = storyboard
    ? await db.select().from(contentVideoScenes).where(and(
        eq(contentVideoScenes.storyboardId, storyboard.id),
        eq(contentVideoScenes.workspaceId, auth.workspaceId),
        isNull(contentVideoScenes.deletedAt),
      )).orderBy(asc(contentVideoScenes.ordinal))
    : [];
  const publicAssets = assets.map(publicAsset);
  return {
    id: production.id,
    kind: production.kind,
    folderId: production.folderId,
    folderName: folder?.name ?? null,
    articleId: production.articleId,
    articleVersion: production.articleVersion,
    articleCurrentVersion: article?.version ?? null,
    sourceProductionId: production.sourceProductionId,
    sourceAssetId: production.sourceAssetId,
    sourceAssetSha256: production.sourceAssetSha256,
    stale: Boolean(production.articleVersion && article?.version && production.articleVersion !== article.version),
    title: production.title,
    prompt: production.prompt,
    status: production.status,
    stage: production.stage,
    settings: parseObject(production.settingsJson),
    result: parseObject(production.resultJson),
    provenance: parseObject(production.provenanceJson),
    error: parseObject<StoredError>(production.errorJson),
    startedAt: production.startedAt?.toISOString() ?? null,
    completedAt: production.completedAt?.toISOString() ?? null,
    cancelledAt: production.cancelledAt?.toISOString() ?? null,
    version: production.version,
    createdAt: production.createdAt.toISOString(),
    updatedAt: production.updatedAt.toISOString(),
    assets: publicAssets,
    storyboard: storyboard ? {
      id: storyboard.id,
      revision: storyboard.revision,
      status: storyboard.status,
      totalDuration: storyboard.totalDuration,
      aspectRatio: storyboard.aspectRatio,
      stylePreset: storyboard.stylePreset,
      summary: storyboard.summary,
      visualBible: parseObject(storyboard.visualBibleJson),
      approvedAt: storyboard.approvedAt?.toISOString() ?? null,
      scenes: scenes.map((scene) => ({
        id: scene.id,
        ordinal: scene.ordinal,
        title: scene.title,
        duration: scene.duration,
        prompt: scene.prompt,
        audioPrompt: scene.audioPrompt,
        transition: scene.transition,
        status: scene.status,
        providerTaskId: scene.providerTaskId,
        error: parseObject<StoredError>(scene.errorJson),
        version: scene.version,
        keyframe: publicAssets.find((asset) => asset.sceneId === scene.id && asset.kind === "keyframe") ?? null,
        video: publicAssets.find((asset) => asset.sceneId === scene.id && asset.kind === "scene_video") ?? null,
      })),
    } : null,
  };
}

export async function createContentProduction(auth: AuthContext, rawInput: unknown) {
  assertCan(auth, "create");
  const input = createContentProductionSchema.parse(rawInput);
  await validateFolder(auth, input.folderId);
  const snapshotArticle = await articleSnapshot(auth, input.sourceArticleId);
  let sourceVisual: ProductionInputSnapshot["sourceVisual"] = null;
  if (input.sourceProductionId || input.sourceAssetId || input.sourceAssetSha256) {
    if (input.kind !== "video" || !input.sourceProductionId || !input.sourceAssetId || !input.sourceAssetSha256) {
      throw new ApiError("VALIDATION_ERROR", "영상 원본 production, asset, SHA-256을 모두 지정해야 합니다.");
    }
    const [source] = await db.select({ production: contentProductions, asset: contentProductionAssets })
      .from(contentProductions)
      .innerJoin(contentProductionAssets, eq(contentProductionAssets.productionId, contentProductions.id))
      .where(and(
        eq(contentProductions.id, input.sourceProductionId),
        eq(contentProductions.workspaceId, auth.workspaceId),
        eq(contentProductions.kind, "image"),
        eq(contentProductions.status, "ready"),
        eq(contentProductionAssets.id, input.sourceAssetId),
        eq(contentProductionAssets.kind, "image_result"),
        eq(contentProductionAssets.sha256, input.sourceAssetSha256),
        isNull(contentProductions.deletedAt),
        isNull(contentProductionAssets.deletedAt),
      )).limit(1);
    if (!source) throw new ApiError("NOT_FOUND", "승인된 원본 이미지를 찾을 수 없습니다.");
    sourceVisual = {
      productionId: source.production.id,
      assetId: source.asset.id,
      sha256: source.asset.sha256,
      specification: parseObject<{ specification?: ContentVisualSpecification }>(source.production.resultJson).specification ?? null,
      title: source.production.title,
    };
  }
  const [duplicate] = await db.select().from(contentProductions).where(and(
    eq(contentProductions.workspaceId, auth.workspaceId),
    eq(contentProductions.idempotencyKey, input.idempotencyKey),
  )).limit(1);
  if (duplicate) return { ...(await publicProduction(auth, duplicate)), reused: true };
  const now = new Date();
  const id = newId("cpd");
  await db.insert(contentProductions).values({
    id,
    workspaceId: auth.workspaceId,
    folderId: input.folderId || null,
    articleId: snapshotArticle?.id ?? null,
    articleVersion: snapshotArticle?.version ?? null,
    sourceProductionId: sourceVisual?.productionId ?? null,
    sourceAssetId: sourceVisual?.assetId ?? null,
    sourceAssetSha256: sourceVisual?.sha256 ?? null,
    kind: input.kind,
    title: input.title,
    prompt: input.prompt,
    idempotencyKey: input.idempotencyKey,
    status: "draft",
    stage: "validate",
    settingsJson: JSON.stringify(input.settings),
    inputJson: JSON.stringify({ article: snapshotArticle, sourceVisual, requestedAt: now.toISOString() } satisfies ProductionInputSnapshot),
    nextProcessAt: now,
    createdAt: now,
    updatedAt: now,
    createdBy: auth.userId,
    updatedBy: auth.userId,
  });
  writeAudit(auth, {
    action: "create",
    entityType: "content_productions",
    entityId: id,
    entityLabel: input.title,
    after: { kind: input.kind, articleId: snapshotArticle?.id ?? null },
  });
  return { ...(await getContentProduction(auth, id)), reused: false };
}

export async function getContentProduction(auth: AuthContext, productionId: string) {
  assertCan(auth, "read");
  return publicProduction(auth, await requireProduction(auth, productionId));
}

export async function listContentProductions(auth: AuthContext, request: Request) {
  assertCan(auth, "read");
  const search = new URL(request.url).searchParams;
  const conditions = [eq(contentProductions.workspaceId, auth.workspaceId), isNull(contentProductions.deletedAt)];
  const kind = search.get("type");
  const status = search.get("status");
  const folderId = search.get("folderId") || search.get("fid");
  const query = search.get("q")?.trim();
  if (kind === "image" || kind === "video") conditions.push(eq(contentProductions.kind, kind));
  if (status && ["draft", "planning", "awaiting_storyboard_approval", "generating_keyframes", "awaiting_keyframe_approval", "generating", "assembling", "ready", "failed", "cancelled", "archived"].includes(status)) {
    conditions.push(eq(contentProductions.status, status as ProductionRow["status"]));
  }
  if (folderId) conditions.push(eq(contentProductions.folderId, folderId));
  if (query) conditions.push(like(contentProductions.title, `%${query.replace(/[%_]/gu, "")} %`.replace(" ", "")));
  const limit = Math.min(100, Math.max(1, Number(search.get("limit")) || 50));
  const rows = await db.select().from(contentProductions).where(and(...conditions)).orderBy(desc(contentProductions.updatedAt)).limit(limit);
  return Promise.all(rows.map((row) => publicProduction(auth, row)));
}

export async function updateContentProduction(auth: AuthContext, productionId: string, rawInput: unknown) {
  assertCan(auth, "update");
  const production = await requireProduction(auth, productionId);
  assertOwnershipOrAdmin(auth, production);
  const input = updateContentProductionSchema.parse(rawInput);
  if (input.version !== production.version) throw new ApiError("VERSION_CONFLICT", "미디어 작업판이 다른 곳에서 수정되었습니다.");
  await db.update(contentProductions).set({
    title: input.title ?? production.title,
    prompt: input.prompt ?? production.prompt,
    status: input.status ?? production.status,
    updatedAt: new Date(),
    updatedBy: auth.userId,
    version: sql`${contentProductions.version} + 1`,
  }).where(and(eq(contentProductions.id, production.id), eq(contentProductions.version, input.version)));
  return getContentProduction(auth, production.id);
}

async function claimProduction(auth: AuthContext, productionId: string) {
  const production = await requireProduction(auth, productionId);
  if (!(["draft", "planning", "generating_keyframes", "generating", "assembling"] as string[]).includes(production.status)) return null;
  const now = new Date();
  if (production.nextProcessAt && production.nextProcessAt > now) return null;
  const leaseToken = newUuid();
  const [claimed] = await db.update(contentProductions).set({
    leaseToken,
    leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
    startedAt: production.startedAt ?? now,
    updatedAt: now,
    updatedBy: auth.userId,
    version: sql`${contentProductions.version} + 1`,
  }).where(and(
    eq(contentProductions.id, production.id),
    eq(contentProductions.workspaceId, auth.workspaceId),
    or(isNull(contentProductions.leaseToken), lt(contentProductions.leaseExpiresAt, now)),
  )).returning();
  return claimed ? { production: claimed, leaseToken } : null;
}

async function advanceProduction(
  auth: AuthContext,
  production: ProductionRow,
  leaseToken: string,
  updates: Partial<typeof contentProductions.$inferInsert>,
) {
  await db.update(contentProductions).set({
    ...updates,
    errorJson: null,
    leaseToken: null,
    leaseExpiresAt: null,
    updatedAt: new Date(),
    updatedBy: auth.userId,
    version: sql`${contentProductions.version} + 1`,
  }).where(and(eq(contentProductions.id, production.id), eq(contentProductions.leaseToken, leaseToken)));
}

async function failProduction(auth: AuthContext, production: ProductionRow, leaseToken: string, error: unknown) {
  const apiError = error instanceof ApiError ? error : new ApiError("INTERNAL", error instanceof Error ? error.message : "미디어 제작에 실패했습니다.");
  const details = apiError.details && typeof apiError.details === "object" ? apiError.details as Record<string, unknown> : {};
  // validate 단계는 외부 공급자에 비용이 발생하기 전이므로 환경 설정을 보완한 뒤 안전하게 재시도할 수 있다.
  const retryable = production.stage === "validate"
    || apiError.code === "UNAUTHENTICATED"
    || apiError.code === "PLAN_LIMIT"
    || apiError.code === "RATE_LIMITED"
    || (apiError.code === "INTERNAL" && details.uncertainSubmission !== true);
  const now = new Date();
  await db.update(contentProductions).set({
    status: "failed",
    errorJson: JSON.stringify({ code: apiError.code, message: apiError.message, stage: production.stage, retryable, failedAt: now.toISOString() }),
    completedAt: now,
    nextProcessAt: null,
    leaseToken: null,
    leaseExpiresAt: null,
    updatedAt: now,
    updatedBy: auth.userId,
    version: sql`${contentProductions.version} + 1`,
  }).where(and(eq(contentProductions.id, production.id), eq(contentProductions.leaseToken, leaseToken)));
}

async function upsertAsset(auth: AuthContext, input: {
  productionId: string;
  sceneId?: string | null;
  runId?: string | null;
  kind: ProductionAssetRow["kind"];
  storageKey: string;
  mimeType: ProductionAssetRow["mimeType"];
  width: number;
  height: number;
  bytes: Buffer;
  durationMs?: number | null;
  fps?: number | null;
  hasAudio?: boolean | null;
  altText?: string | null;
}) {
  const conditions = [
    eq(contentProductionAssets.productionId, input.productionId),
    eq(contentProductionAssets.kind, input.kind),
    input.sceneId ? eq(contentProductionAssets.sceneId, input.sceneId) : isNull(contentProductionAssets.sceneId),
    input.runId ? eq(contentProductionAssets.runId, input.runId) : isNull(contentProductionAssets.runId),
  ];
  const [existing] = await db.select().from(contentProductionAssets).where(and(...conditions)).limit(1);
  const now = new Date();
  const values = {
    storageKey: input.storageKey,
    mimeType: input.mimeType,
    width: input.width,
    height: input.height,
    byteSize: input.bytes.length,
    sha256: sha256(input.bytes),
    durationMs: input.durationMs ?? null,
    fps: input.fps ?? null,
    hasAudio: input.hasAudio ?? null,
    altText: input.altText ?? null,
    updatedAt: now,
    updatedBy: auth.userId,
  };
  if (existing) {
    await db.update(contentProductionAssets).set({ ...values, version: sql`${contentProductionAssets.version} + 1` }).where(eq(contentProductionAssets.id, existing.id));
    if (existing.storageKey !== input.storageKey) await deleteContentAsset(existing.storageKey);
    return existing.id;
  }
  const id = newId("cpa");
  await db.insert(contentProductionAssets).values({
    id,
    workspaceId: auth.workspaceId,
    productionId: input.productionId,
    sceneId: input.sceneId ?? null,
    runId: input.runId ?? null,
    kind: input.kind,
    ...values,
    createdAt: now,
    createdBy: auth.userId,
  });
  return id;
}

async function imageGenerateStage(auth: AuthContext, production: ProductionRow, leaseToken: string) {
  const settings = parseObject<ImageSettings>(production.settingsJson);
  const snapshot = parseObject<ProductionInputSnapshot>(production.inputJson);
  const brand = await resolvedBrand(auth);
  const response = await requestChatMockText(buildProductionImagePrompt({
    prompt: production.prompt,
    title: production.title,
    article: snapshot.article,
    stylePreset: settings.stylePreset,
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
    aspectLabel: settings.preset,
  }));
  const specification = normalizeVisualSpecification(extractJsonObject(response.text, "ChatMock 이미지 명세"), {
    subject: snapshot.article?.keyword || snapshot.article?.title || production.title,
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
  });
  const source = await generateSourceArtwork({
    stylePreset: settings.stylePreset,
    specification,
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
  });
  const key = productionAssetKey({ workspaceId: auth.workspaceId, productionId: production.id, filename: "source.webp" });
  await writeContentAsset(key, source);
  await upsertAsset(auth, {
    productionId: production.id,
    kind: "image_source",
    storageKey: key,
    mimeType: "image/webp",
    width: 1536,
    height: 1024,
    bytes: source,
    altText: specification.altText,
  });
  await advanceProduction(auth, production, leaseToken, {
    status: "generating",
    stage: "render",
    resultJson: JSON.stringify({ specification }),
    provenanceJson: JSON.stringify({ generation: response.provenance, renderer: "sharp+svg", promptVersion: "semforge-media-v1" }),
    nextProcessAt: new Date(),
  });
}

async function imageRenderStage(auth: AuthContext, production: ProductionRow, leaseToken: string) {
  const settings = parseObject<ImageSettings>(production.settingsJson);
  const result = parseObject<{ specification?: ContentVisualSpecification }>(production.resultJson);
  if (!result.specification) throw new ApiError("INTERNAL", "렌더링할 ChatMock 이미지 명세가 없습니다.");
  const [sourceAsset] = await db.select().from(contentProductionAssets).where(and(
    eq(contentProductionAssets.productionId, production.id),
    eq(contentProductionAssets.kind, "image_source"),
    isNull(contentProductionAssets.deletedAt),
  )).limit(1);
  if (!sourceAsset) throw new ApiError("INTERNAL", "렌더링할 이미지 원본이 없습니다.");
  const source = await readContentAsset(sourceAsset.storageKey);
  const brand = await resolvedBrand(auth);
  const presentation = {
    displayTitle: settings.displayTitle,
    showTitle: settings.showTitle,
    titlePosition: settings.titlePosition ?? "bottom_left",
    showLogo: settings.showLogo,
    focalX: settings.focalX,
    focalY: settings.focalY,
  };
  const rendered = await renderProductionImage({ source, preset: settings.preset, presentation, brand });
  const resultKey = productionAssetKey({ workspaceId: auth.workspaceId, productionId: production.id, filename: `${settings.preset}.jpg` });
  await writeContentAsset(resultKey, rendered.bytes);
  await upsertAsset(auth, {
    productionId: production.id,
    kind: "image_result",
    storageKey: resultKey,
    mimeType: "image/jpeg",
    ...rendered,
    altText: result.specification.altText,
  });
  if (production.articleId) {
    const variants = await renderVisualVariants({ source, presentation, brand });
    const thumbnailKey = productionAssetKey({ workspaceId: auth.workspaceId, productionId: production.id, filename: "thumbnail.svg" });
    const openGraphKey = productionAssetKey({ workspaceId: auth.workspaceId, productionId: production.id, filename: "open-graph.svg" });
    await Promise.all([
      writeContentAsset(thumbnailKey, variants.thumbnail),
      writeContentAsset(openGraphKey, variants.openGraph),
    ]);
    await upsertAsset(auth, { productionId: production.id, kind: "thumbnail", storageKey: thumbnailKey, mimeType: "image/svg+xml", width: 1280, height: 720, bytes: variants.thumbnail, altText: result.specification.altText });
    await upsertAsset(auth, { productionId: production.id, kind: "open_graph", storageKey: openGraphKey, mimeType: "image/svg+xml", width: 1200, height: 630, bytes: variants.openGraph, altText: result.specification.altText });
  }
  await advanceProduction(auth, production, leaseToken, {
    status: "ready",
    stage: "persist",
    completedAt: new Date(),
    nextProcessAt: null,
  });
}

async function planVideoStage(auth: AuthContext, production: ProductionRow, leaseToken: string) {
  const settings = parseObject<VideoSettings>(production.settingsJson);
  const snapshot = parseObject<ProductionInputSnapshot>(production.inputJson);
  const brand = await resolvedBrand(auth);
  const response = await requestContentAiText(buildStoryboardPrompt({
    prompt: production.prompt,
    title: production.title,
    article: snapshot.article,
    targetDuration: settings.targetDuration,
    aspectRatio: settings.aspectRatio,
    stylePreset: settings.stylePreset,
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
    sourceVisual: snapshot.sourceVisual ?? null,
  }), "xai-grok-4.5");
  const storyboard = normalizeStoryboard(extractJsonObject(response.text, "Grok 콘티"), settings.targetDuration);
  const storyboardId = newId("cvs");
  const now = new Date();
  await db.transaction((tx) => {
    tx.insert(contentVideoStoryboards).values({
      id: storyboardId,
      workspaceId: auth.workspaceId,
      productionId: production.id,
      revision: 1,
      status: "draft",
      totalDuration: settings.targetDuration,
      aspectRatio: settings.aspectRatio,
      stylePreset: settings.stylePreset,
      summary: storyboard.summary,
      visualBibleJson: JSON.stringify(storyboard.visualBible),
      provenanceJson: JSON.stringify(response.provenance),
      createdAt: now,
      updatedAt: now,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    }).run();
    tx.insert(contentVideoScenes).values(storyboard.scenes.map((scene, index) => ({
      id: newId("csc"),
      workspaceId: auth.workspaceId,
      productionId: production.id,
      storyboardId,
      ordinal: index + 1,
      title: scene.title,
      duration: scene.duration,
      prompt: scene.prompt,
      audioPrompt: scene.audioPrompt,
      transition: scene.transition,
      status: "draft" as const,
      createdAt: now,
      updatedAt: now,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    }))).run();
  });
  await advanceProduction(auth, production, leaseToken, {
    status: "awaiting_storyboard_approval",
    stage: "plan",
    provenanceJson: JSON.stringify({ storyboard: response.provenance }),
    nextProcessAt: null,
  });
}

async function generateOneKeyframe(auth: AuthContext, production: ProductionRow, leaseToken: string) {
  const settings = parseObject<VideoSettings>(production.settingsJson);
  const [storyboard] = await db.select().from(contentVideoStoryboards).where(and(
    eq(contentVideoStoryboards.productionId, production.id),
    inArray(contentVideoStoryboards.status, ["draft", "approved"]),
  )).orderBy(desc(contentVideoStoryboards.revision)).limit(1);
  if (!storyboard) throw new ApiError("INTERNAL", "키프레임을 만들 콘티가 없습니다.");
  const scenes = await db.select().from(contentVideoScenes).where(and(
    eq(contentVideoScenes.storyboardId, storyboard.id),
    isNull(contentVideoScenes.deletedAt),
  )).orderBy(asc(contentVideoScenes.ordinal));
  const assets = await db.select().from(contentProductionAssets).where(and(
    eq(contentProductionAssets.productionId, production.id),
    eq(contentProductionAssets.kind, "keyframe"),
    isNull(contentProductionAssets.deletedAt),
  ));
  const existing = new Set(assets.map((asset) => asset.sceneId));
  const scene = scenes.find((candidate) => !existing.has(candidate.id));
  if (!scene) {
    await advanceProduction(auth, production, leaseToken, {
      status: "awaiting_keyframe_approval",
      stage: "keyframes",
      nextProcessAt: null,
    });
    return;
  }
  const brand = await resolvedBrand(auth);
  const visualBible = parseObject<Record<string, unknown>>(storyboard.visualBibleJson);
  const response = await requestContentAiText(buildKeyframePrompt({
    sceneTitle: scene.title,
    scenePrompt: scene.prompt,
    visualBible,
    stylePreset: settings.stylePreset,
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
    aspectRatio: settings.aspectRatio,
  }), "xai-grok-4.5");
  const specification = normalizeVisualSpecification(extractJsonObject(response.text, "Grok 키프레임 명세"), {
    subject: typeof visualBible.subject === "string" ? visualBible.subject : scene.title,
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
  });
  const source = await generateSourceArtwork({
    stylePreset: settings.stylePreset,
    specification,
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
  });
  const keyframe = await renderVideoKeyframe({ source, aspectRatio: settings.aspectRatio });
  const key = productionAssetKey({
    workspaceId: auth.workspaceId,
    productionId: production.id,
    scope: "keyframes",
    ownerId: scene.id,
    filename: "keyframe.webp",
  });
  await writeContentAsset(key, keyframe.bytes);
  await upsertAsset(auth, {
    productionId: production.id,
    sceneId: scene.id,
    kind: "keyframe",
    storageKey: key,
    mimeType: "image/webp",
    ...keyframe,
    altText: specification.altText,
  });
  await db.update(contentVideoScenes).set({
    seed: specification.seed,
    provenanceJson: JSON.stringify({ keyframe: response.provenance, specification }),
    updatedAt: new Date(),
    updatedBy: auth.userId,
    version: sql`${contentVideoScenes.version} + 1`,
  }).where(eq(contentVideoScenes.id, scene.id));
  const isLast = scenes.every((candidate) => candidate.id === scene.id || existing.has(candidate.id));
  await advanceProduction(auth, production, leaseToken, {
    status: isLast ? "awaiting_keyframe_approval" : "generating_keyframes",
    stage: "keyframes",
    nextProcessAt: isLast ? null : new Date(),
  });
}

async function submitOneScene(auth: AuthContext, production: ProductionRow, leaseToken: string) {
  const settings = parseObject<VideoSettings>(production.settingsJson);
  const [run] = await db.select().from(contentVideoRuns).where(and(
    eq(contentVideoRuns.productionId, production.id),
    inArray(contentVideoRuns.status, ["queued", "running"]),
  )).orderBy(desc(contentVideoRuns.createdAt)).limit(1);
  if (!run) throw new ApiError("INTERNAL", "영상 실행을 찾을 수 없습니다.");
  const [scene] = await db.select().from(contentVideoScenes).where(and(
    eq(contentVideoScenes.runId, run.id),
    eq(contentVideoScenes.status, "queued"),
  )).orderBy(asc(contentVideoScenes.ordinal)).limit(1);
  if (!scene) {
    await db.update(contentVideoRuns).set({ status: "running", stage: "poll_scenes", updatedAt: new Date(), updatedBy: auth.userId, version: sql`${contentVideoRuns.version} + 1` }).where(eq(contentVideoRuns.id, run.id));
    await advanceProduction(auth, production, leaseToken, { status: "generating", stage: "poll_scenes", nextProcessAt: new Date() });
    return;
  }
  const [keyframe] = await db.select().from(contentProductionAssets).where(and(
    eq(contentProductionAssets.sceneId, scene.id),
    eq(contentProductionAssets.kind, "keyframe"),
    isNull(contentProductionAssets.deletedAt),
  )).limit(1);
  if (!keyframe || !(["image/webp", "image/jpeg", "image/png"] as const).includes(
    keyframe.mimeType as "image/webp" | "image/jpeg" | "image/png",
  )) throw new ApiError("INTERNAL", "장면 키프레임을 찾을 수 없습니다.");
  const now = new Date();
  await db.update(contentVideoScenes).set({
    status: "submitting",
    submittedAt: now,
    updatedAt: now,
    updatedBy: auth.userId,
    version: sql`${contentVideoScenes.version} + 1`,
  }).where(and(eq(contentVideoScenes.id, scene.id), eq(contentVideoScenes.status, "queued")));
  try {
    const submitted = await submitXaiVideoScene({
      prompt: `${scene.prompt}\nAudio: ${scene.audioPrompt}`,
      keyframe: await readContentAsset(keyframe.storageKey),
      keyframeMimeType: keyframe.mimeType as "image/webp" | "image/jpeg" | "image/png",
      duration: scene.duration,
      aspectRatio: settings.aspectRatio,
    });
    await db.update(contentVideoScenes).set({
      status: "processing",
      provider: "xai",
      model: submitted.model,
      providerTaskId: submitted.taskId,
      providerRequestId: submitted.requestId,
      provenanceJson: JSON.stringify({ ...parseObject(scene.provenanceJson), video: submitted }),
      errorJson: null,
      updatedAt: new Date(),
      updatedBy: auth.userId,
      version: sql`${contentVideoScenes.version} + 1`,
    }).where(eq(contentVideoScenes.id, scene.id));
    await advanceProduction(auth, production, leaseToken, { status: "generating", stage: "submit_scenes", nextProcessAt: new Date() });
  } catch (error) {
    const uncertain = error instanceof ApiError && Boolean((error.details as { uncertainSubmission?: boolean } | undefined)?.uncertainSubmission);
    await db.update(contentVideoScenes).set({
      status: uncertain ? "unknown" : "failed",
      errorJson: JSON.stringify({ code: error instanceof ApiError ? error.code : "INTERNAL", message: error instanceof Error ? error.message : "장면 제출 실패", retryable: !uncertain }),
      updatedAt: new Date(),
      updatedBy: auth.userId,
      version: sql`${contentVideoScenes.version} + 1`,
    }).where(eq(contentVideoScenes.id, scene.id));
    throw error;
  }
}

async function pollOneScene(auth: AuthContext, production: ProductionRow, leaseToken: string) {
  const [run] = await db.select().from(contentVideoRuns).where(and(
    eq(contentVideoRuns.productionId, production.id),
    inArray(contentVideoRuns.status, ["queued", "running"]),
  )).orderBy(desc(contentVideoRuns.createdAt)).limit(1);
  if (!run) throw new ApiError("INTERNAL", "영상 실행을 찾을 수 없습니다.");
  const [scene] = await db.select().from(contentVideoScenes).where(and(
    eq(contentVideoScenes.runId, run.id),
    eq(contentVideoScenes.status, "processing"),
  )).orderBy(asc(contentVideoScenes.updatedAt)).limit(1);
  if (!scene) {
    const [notReady] = await db.select({ id: contentVideoScenes.id }).from(contentVideoScenes).where(and(
      eq(contentVideoScenes.runId, run.id),
      inArray(contentVideoScenes.status, ["queued", "submitting", "processing", "failed", "unknown"]),
    )).limit(1);
    if (notReady) throw new ApiError("INTERNAL", "완료되지 않은 영상 장면이 있습니다.");
    await db.update(contentVideoRuns).set({ stage: "assemble", status: "running", updatedAt: new Date(), updatedBy: auth.userId, version: sql`${contentVideoRuns.version} + 1` }).where(eq(contentVideoRuns.id, run.id));
    await advanceProduction(auth, production, leaseToken, { status: "assembling", stage: "assemble", nextProcessAt: new Date() });
    return;
  }
  if (!scene.providerTaskId) throw new ApiError("INTERNAL", "영상 생성 request_id가 없습니다.");
  const legacyHappyHorse = scene.provider === "alibaba_model_studio";
  const result = legacyHappyHorse
    ? await pollHappyHorseScene(scene.providerTaskId)
    : await pollXaiVideoScene(scene.providerTaskId);
  if (result.status === "pending") {
    await db.update(contentVideoScenes).set({ updatedAt: new Date(), updatedBy: auth.userId }).where(eq(contentVideoScenes.id, scene.id));
    await advanceProduction(auth, production, leaseToken, { status: "generating", stage: "poll_scenes", nextProcessAt: new Date(Date.now() + 15_000) });
    return;
  }
  if (result.status !== "succeeded" || !result.videoUrl) {
    const providerLabel = legacyHappyHorse ? "HappyHorse" : "xAI";
    const message = result.error || (result.status === "unknown" ? `${providerLabel} 작업이 만료되었거나 상태를 알 수 없습니다.` : `${providerLabel} 장면 생성에 실패했습니다.`);
    await db.update(contentVideoScenes).set({
      status: result.status === "unknown" ? "unknown" : "failed",
      errorJson: JSON.stringify({ code: "INTERNAL", message, retryable: result.status !== "unknown" }),
      updatedAt: new Date(),
      updatedBy: auth.userId,
      version: sql`${contentVideoScenes.version} + 1`,
    }).where(eq(contentVideoScenes.id, scene.id));
    throw new ApiError("INTERNAL", message, { details: { uncertainSubmission: result.status === "unknown" } });
  }
  const bytes = legacyHappyHorse
    ? await downloadHappyHorseVideo(result.videoUrl)
    : await downloadXaiVideo(result.videoUrl);
  const metadata = await probeVideo(bytes);
  const key = productionAssetKey({ workspaceId: auth.workspaceId, productionId: production.id, scope: "scenes", ownerId: scene.id, filename: "scene.mp4" });
  await writeContentAsset(key, bytes);
  await upsertAsset(auth, {
    productionId: production.id,
    sceneId: scene.id,
    runId: run.id,
    kind: "scene_video",
    storageKey: key,
    mimeType: "video/mp4",
    ...metadata,
    bytes,
    altText: scene.title,
  });
  await db.update(contentVideoScenes).set({
    status: "ready",
    completedAt: new Date(),
    providerRequestId: result.requestId ?? scene.providerRequestId,
    provenanceJson: JSON.stringify({ ...parseObject(scene.provenanceJson), completion: { usage: result.usage, downloadedAt: new Date().toISOString() } }),
    errorJson: null,
    updatedAt: new Date(),
    updatedBy: auth.userId,
    version: sql`${contentVideoScenes.version} + 1`,
  }).where(eq(contentVideoScenes.id, scene.id));
  const [remaining] = await db.select({ id: contentVideoScenes.id }).from(contentVideoScenes).where(and(
    eq(contentVideoScenes.runId, run.id),
    inArray(contentVideoScenes.status, ["queued", "submitting", "processing"]),
  )).limit(1);
  await advanceProduction(auth, production, leaseToken, {
    status: remaining ? "generating" : "assembling",
    stage: remaining ? "poll_scenes" : "assemble",
    nextProcessAt: new Date(),
  });
  if (!remaining) {
    await db.update(contentVideoRuns).set({ stage: "assemble", updatedAt: new Date(), updatedBy: auth.userId, version: sql`${contentVideoRuns.version} + 1` }).where(eq(contentVideoRuns.id, run.id));
  }
}

async function assembleVideoStage(auth: AuthContext, production: ProductionRow, leaseToken: string) {
  const settings = parseObject<VideoSettings>(production.settingsJson);
  const [run] = await db.select().from(contentVideoRuns).where(and(
    eq(contentVideoRuns.productionId, production.id),
    inArray(contentVideoRuns.status, ["queued", "running"]),
  )).orderBy(desc(contentVideoRuns.createdAt)).limit(1);
  if (!run) throw new ApiError("INTERNAL", "조립할 영상 실행을 찾을 수 없습니다.");
  const scenes = await db.select().from(contentVideoScenes).where(eq(contentVideoScenes.runId, run.id)).orderBy(asc(contentVideoScenes.ordinal));
  const assets = await db.select().from(contentProductionAssets).where(and(
    eq(contentProductionAssets.runId, run.id),
    eq(contentProductionAssets.kind, "scene_video"),
    isNull(contentProductionAssets.deletedAt),
  ));
  const inputs = await Promise.all(scenes.map(async (scene) => {
    const asset = assets.find((candidate) => candidate.sceneId === scene.id);
    if (!asset) throw new ApiError("INTERNAL", `${scene.ordinal}번 장면 영상이 없습니다.`);
    return { bytes: await readContentAsset(asset.storageKey), duration: scene.duration };
  }));
  const rendered = await assembleProductionVideo({ scenes: inputs, aspectRatio: settings.aspectRatio });
  const videoKey = productionAssetKey({ workspaceId: auth.workspaceId, productionId: production.id, scope: "final", ownerId: run.id, filename: "final.mp4" });
  const posterKey = productionAssetKey({ workspaceId: auth.workspaceId, productionId: production.id, scope: "final", ownerId: run.id, filename: "poster.jpg" });
  await Promise.all([writeContentAsset(videoKey, rendered.video), writeContentAsset(posterKey, rendered.poster)]);
  await upsertAsset(auth, {
    productionId: production.id,
    runId: run.id,
    kind: "final_video",
    storageKey: videoKey,
    mimeType: "video/mp4",
    width: rendered.width,
    height: rendered.height,
    durationMs: rendered.durationMs,
    fps: rendered.fps,
    hasAudio: rendered.hasAudio,
    bytes: rendered.video,
    altText: production.title,
  });
  await upsertAsset(auth, {
    productionId: production.id,
    runId: run.id,
    kind: "poster",
    storageKey: posterKey,
    mimeType: "image/jpeg",
    width: rendered.width,
    height: rendered.height,
    bytes: rendered.poster,
    altText: `${production.title} 영상 포스터`,
  });
  await db.update(contentVideoRuns).set({ stage: "persist", status: "running", updatedAt: new Date(), updatedBy: auth.userId, version: sql`${contentVideoRuns.version} + 1` }).where(eq(contentVideoRuns.id, run.id));
  await advanceProduction(auth, production, leaseToken, { status: "assembling", stage: "persist", nextProcessAt: new Date() });
}

async function persistVideoStage(auth: AuthContext, production: ProductionRow, leaseToken: string) {
  const [run] = await db.select().from(contentVideoRuns).where(and(
    eq(contentVideoRuns.productionId, production.id),
    inArray(contentVideoRuns.status, ["queued", "running"]),
  )).orderBy(desc(contentVideoRuns.createdAt)).limit(1);
  const now = new Date();
  if (run) {
    await db.update(contentVideoRuns).set({ status: "completed", completedAt: now, updatedAt: now, updatedBy: auth.userId, version: sql`${contentVideoRuns.version} + 1` }).where(eq(contentVideoRuns.id, run.id));
  }
  await advanceProduction(auth, production, leaseToken, { status: "ready", stage: "persist", completedAt: now, nextProcessAt: null });
}

export async function processContentProduction(auth: AuthContext, productionId: string) {
  assertCan(auth, "create");
  const claimed = await claimProduction(auth, productionId);
  if (!claimed) return getContentProduction(auth, productionId);
  const { production, leaseToken } = claimed;
  try {
    if (production.stage === "validate") {
      if (production.kind === "video") {
        const [planner, ffmpeg] = await Promise.all([getContentAiModelCapability("xai-grok-4.5"), getFfmpegCapability()]);
        const xaiVideo = getXaiVideoCapability();
        if (!planner.enabled) throw new ApiError("VALIDATION_ERROR", planner.reason ?? "Grok 4.5 설정이 필요합니다.");
        if (!xaiVideo.enabled) throw new ApiError("VALIDATION_ERROR", xaiVideo.reason ?? "xAI 영상 생성 설정이 필요합니다.");
        if (!ffmpeg.enabled) throw new ApiError("VALIDATION_ERROR", ffmpeg.reason ?? "FFmpeg 설정이 필요합니다.");
        await verifyXaiVideoAccess();
        await advanceProduction(auth, production, leaseToken, { status: "planning", stage: "plan", nextProcessAt: new Date() });
      } else {
        const chatMock = await getChatMockContentCapability();
        if (!chatMock.enabled) throw new ApiError("VALIDATION_ERROR", chatMock.reason ?? "ChatMock 서버가 필요합니다.");
        await advanceProduction(auth, production, leaseToken, { status: "generating", stage: "generate", nextProcessAt: new Date() });
      }
    } else if (production.kind === "image" && production.stage === "generate") {
      await imageGenerateStage(auth, production, leaseToken);
    } else if (production.kind === "image" && production.stage === "render") {
      await imageRenderStage(auth, production, leaseToken);
    } else if (production.kind === "video" && production.stage === "plan") {
      await planVideoStage(auth, production, leaseToken);
    } else if (production.kind === "video" && production.stage === "keyframes") {
      await generateOneKeyframe(auth, production, leaseToken);
    } else if (production.kind === "video" && production.stage === "submit_scenes") {
      await submitOneScene(auth, production, leaseToken);
    } else if (production.kind === "video" && production.stage === "poll_scenes") {
      await pollOneScene(auth, production, leaseToken);
    } else if (production.kind === "video" && production.stage === "assemble") {
      await assembleVideoStage(auth, production, leaseToken);
    } else if (production.kind === "video" && production.stage === "persist") {
      await persistVideoStage(auth, production, leaseToken);
    }
  } catch (error) {
    await failProduction(auth, production, leaseToken, error);
  }
  return getContentProduction(auth, productionId);
}

export async function approveContentProduction(auth: AuthContext, productionId: string, rawInput: unknown) {
  assertCan(auth, "update");
  const production = await requireProduction(auth, productionId);
  assertOwnershipOrAdmin(auth, production);
  const input = approveContentProductionSchema.parse(rawInput);
  if (input.version !== production.version) throw new ApiError("VERSION_CONFLICT", "미디어 작업판이 다른 곳에서 수정되었습니다.");
  if (production.kind !== "video") throw new ApiError("VALIDATION_ERROR", "영상 작업판만 승인할 수 있습니다.");
  const [storyboard] = await db.select().from(contentVideoStoryboards).where(and(
    eq(contentVideoStoryboards.productionId, production.id),
    isNull(contentVideoStoryboards.deletedAt),
  )).orderBy(desc(contentVideoStoryboards.revision)).limit(1);
  if (!storyboard) throw new ApiError("VALIDATION_ERROR", "승인할 콘티가 없습니다.");
  const now = new Date();
  if (input.gate === "storyboard") {
    if (production.status !== "awaiting_storyboard_approval") throw new ApiError("VALIDATION_ERROR", "현재 콘티 승인 단계가 아닙니다.");
    const scenes = await db.select().from(contentVideoScenes).where(eq(contentVideoScenes.storyboardId, storyboard.id));
    const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0);
    if (totalDuration < 30 || totalDuration > 60) throw new ApiError("VALIDATION_ERROR", "전체 장면 길이는 30~60초여야 합니다.");
    await db.transaction((tx) => {
      tx.update(contentVideoStoryboards).set({ status: "approved", totalDuration, approvedAt: now, updatedAt: now, updatedBy: auth.userId, version: sql`${contentVideoStoryboards.version} + 1` }).where(eq(contentVideoStoryboards.id, storyboard.id)).run();
      tx.update(contentProductions).set({ status: "generating_keyframes", stage: "keyframes", nextProcessAt: now, updatedAt: now, updatedBy: auth.userId, version: sql`${contentProductions.version} + 1` }).where(and(eq(contentProductions.id, production.id), eq(contentProductions.version, input.version))).run();
    });
  } else {
    if (production.status !== "awaiting_keyframe_approval") throw new ApiError("VALIDATION_ERROR", "현재 키프레임 승인 단계가 아닙니다.");
    const scenes = await db.select().from(contentVideoScenes).where(eq(contentVideoScenes.storyboardId, storyboard.id));
    const keyframes = await db.select().from(contentProductionAssets).where(and(eq(contentProductionAssets.productionId, production.id), eq(contentProductionAssets.kind, "keyframe"), isNull(contentProductionAssets.deletedAt)));
    if (scenes.some((scene) => !keyframes.some((asset) => asset.sceneId === scene.id))) throw new ApiError("VALIDATION_ERROR", "모든 장면의 키프레임이 준비되지 않았습니다.");
    const runId = newId("cvr");
    await db.transaction((tx) => {
      tx.insert(contentVideoRuns).values({
        id: runId,
        workspaceId: auth.workspaceId,
        productionId: production.id,
        storyboardId: storyboard.id,
        idempotencyKey: `approved-${storyboard.id}-${input.version}`,
        status: "queued",
        stage: "submit_scenes",
        createdAt: now,
        updatedAt: now,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      }).run();
      tx.update(contentVideoScenes).set({ runId, status: "queued", errorJson: null, updatedAt: now, updatedBy: auth.userId, version: sql`${contentVideoScenes.version} + 1` }).where(eq(contentVideoScenes.storyboardId, storyboard.id)).run();
      tx.update(contentProductions).set({ status: "generating", stage: "submit_scenes", nextProcessAt: now, updatedAt: now, updatedBy: auth.userId, version: sql`${contentProductions.version} + 1` }).where(and(eq(contentProductions.id, production.id), eq(contentProductions.version, input.version))).run();
    });
  }
  writeAudit(auth, { action: "update", entityType: "content_productions", entityId: production.id, entityLabel: production.title, after: { approvedGate: input.gate } });
  return getContentProduction(auth, production.id);
}

export async function updateContentVideoScene(auth: AuthContext, sceneId: string, rawInput: unknown) {
  assertCan(auth, "update");
  const scene = await requireScene(auth, sceneId);
  const production = await requireProduction(auth, scene.productionId);
  assertOwnershipOrAdmin(auth, production);
  if (production.status !== "awaiting_storyboard_approval") throw new ApiError("VALIDATION_ERROR", "콘티 승인 전 단계에서만 장면을 수정할 수 있습니다.");
  const input = updateContentVideoSceneSchema.parse(rawInput);
  if (input.version !== scene.version) throw new ApiError("VERSION_CONFLICT", "장면이 다른 곳에서 수정되었습니다.");
  await db.update(contentVideoScenes).set({
    title: input.title ?? scene.title,
    duration: input.duration ?? scene.duration,
    prompt: input.prompt ?? scene.prompt,
    audioPrompt: input.audioPrompt ?? scene.audioPrompt,
    transition: input.transition ?? scene.transition,
    updatedAt: new Date(),
    updatedBy: auth.userId,
    version: sql`${contentVideoScenes.version} + 1`,
  }).where(and(eq(contentVideoScenes.id, scene.id), eq(contentVideoScenes.version, input.version)));
  await db.update(contentProductions).set({ updatedAt: new Date(), updatedBy: auth.userId, version: sql`${contentProductions.version} + 1` }).where(eq(contentProductions.id, production.id));
  return getContentProduction(auth, production.id);
}

export async function getContentVideoScene(auth: AuthContext, sceneId: string) {
  assertCan(auth, "read");
  const scene = await requireScene(auth, sceneId);
  const production = await getContentProduction(auth, scene.productionId);
  return production.storyboard?.scenes.find((candidate) => candidate.id === scene.id) ?? null;
}

export async function regenerateContentVideoScene(auth: AuthContext, sceneId: string) {
  assertCan(auth, "update");
  const scene = await requireScene(auth, sceneId);
  const production = await requireProduction(auth, scene.productionId);
  assertOwnershipOrAdmin(auth, production);
  if (!(production.status === "awaiting_keyframe_approval" || production.status === "failed")) {
    throw new ApiError("VALIDATION_ERROR", "키프레임 검토 또는 실패 단계에서만 다시 생성할 수 있습니다.");
  }
  const now = new Date();
  if (production.status === "failed" && scene.runId && (scene.status === "failed" || scene.status === "unknown")) {
    const runId = scene.runId;
    await db.transaction((tx) => {
      tx.update(contentVideoScenes).set({
        status: "queued",
        providerTaskId: null,
        providerRequestId: null,
        submittedAt: null,
        completedAt: null,
        errorJson: null,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: now,
        updatedBy: auth.userId,
        version: sql`${contentVideoScenes.version} + 1`,
      }).where(eq(contentVideoScenes.id, scene.id)).run();
      tx.update(contentVideoRuns).set({
        status: "running",
        stage: "submit_scenes",
        errorJson: null,
        completedAt: null,
        updatedAt: now,
        updatedBy: auth.userId,
        version: sql`${contentVideoRuns.version} + 1`,
      }).where(eq(contentVideoRuns.id, runId)).run();
      tx.update(contentProductions).set({
        status: "generating",
        stage: "submit_scenes",
        errorJson: null,
        completedAt: null,
        nextProcessAt: now,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: now,
        updatedBy: auth.userId,
        version: sql`${contentProductions.version} + 1`,
      }).where(eq(contentProductions.id, production.id)).run();
    });
    return getContentProduction(auth, production.id);
  }
  const [asset] = await db.select().from(contentProductionAssets).where(and(eq(contentProductionAssets.sceneId, scene.id), eq(contentProductionAssets.kind, "keyframe"), isNull(contentProductionAssets.deletedAt))).limit(1);
  if (asset) {
    await deleteContentAsset(asset.storageKey);
    await db.delete(contentProductionAssets).where(eq(contentProductionAssets.id, asset.id));
  }
  await db.update(contentVideoScenes).set({ status: "draft", errorJson: null, updatedAt: now, updatedBy: auth.userId, version: sql`${contentVideoScenes.version} + 1` }).where(eq(contentVideoScenes.id, scene.id));
  await db.update(contentProductions).set({ status: "generating_keyframes", stage: "keyframes", errorJson: null, completedAt: null, nextProcessAt: now, updatedAt: now, updatedBy: auth.userId, version: sql`${contentProductions.version} + 1` }).where(eq(contentProductions.id, production.id));
  return getContentProduction(auth, production.id);
}

export async function retryContentProduction(auth: AuthContext, productionId: string) {
  assertCan(auth, "update");
  const production = await requireProduction(auth, productionId);
  assertOwnershipOrAdmin(auth, production);
  if (production.status !== "failed") throw new ApiError("VALIDATION_ERROR", "실패한 미디어 작업만 재시도할 수 있습니다.");
  const error = parseObject<StoredError>(production.errorJson);
  // 이전 버전에서 validate 오류를 retryable=false로 기록했더라도 공급자 요청 전 실패이므로 재시도를 허용한다.
  if (error.retryable === false && production.stage !== "validate") {
    throw new ApiError("VALIDATION_ERROR", "비용 중복 가능성이 있어 자동 재시도할 수 없습니다.");
  }
  const now = new Date();
  if (production.kind === "video" && (production.stage === "submit_scenes" || production.stage === "poll_scenes")) {
    const [run] = await db.select().from(contentVideoRuns).where(and(
      eq(contentVideoRuns.productionId, production.id),
      inArray(contentVideoRuns.status, ["queued", "running"]),
    )).orderBy(desc(contentVideoRuns.createdAt)).limit(1);
    if (!run) throw new ApiError("INTERNAL", "재시도할 영상 실행을 찾을 수 없습니다.");
    await db.transaction((tx) => {
      tx.update(contentVideoScenes).set({
        status: "queued",
        providerTaskId: null,
        providerRequestId: null,
        submittedAt: null,
        completedAt: null,
        errorJson: null,
        updatedAt: now,
        updatedBy: auth.userId,
        version: sql`${contentVideoScenes.version} + 1`,
      }).where(and(eq(contentVideoScenes.runId, run.id), eq(contentVideoScenes.status, "failed"))).run();
      tx.update(contentVideoRuns).set({ status: "running", stage: "submit_scenes", errorJson: null, completedAt: null, updatedAt: now, updatedBy: auth.userId, version: sql`${contentVideoRuns.version} + 1` }).where(eq(contentVideoRuns.id, run.id)).run();
      tx.update(contentProductions).set({ status: "generating", stage: "submit_scenes", errorJson: null, completedAt: null, nextProcessAt: now, leaseToken: null, leaseExpiresAt: null, updatedAt: now, updatedBy: auth.userId, version: sql`${contentProductions.version} + 1` }).where(eq(contentProductions.id, production.id)).run();
    });
    return getContentProduction(auth, production.id);
  }
  const status: ProductionRow["status"] = production.stage === "validate"
    ? "draft"
    : production.stage === "plan"
      ? "planning"
      : production.stage === "keyframes"
        ? "generating_keyframes"
        : production.stage === "assemble" || production.stage === "persist"
          ? "assembling"
          : "generating";
  await db.update(contentProductions).set({
    status,
    errorJson: null,
    completedAt: null,
    nextProcessAt: now,
    leaseToken: null,
    leaseExpiresAt: null,
    updatedAt: now,
    updatedBy: auth.userId,
    version: sql`${contentProductions.version} + 1`,
  }).where(eq(contentProductions.id, production.id));
  return getContentProduction(auth, production.id);
}

export async function cancelContentProduction(auth: AuthContext, productionId: string) {
  assertCan(auth, "update");
  const production = await requireProduction(auth, productionId);
  assertOwnershipOrAdmin(auth, production);
  if (["ready", "cancelled", "archived"].includes(production.status)) return getContentProduction(auth, production.id);
  const now = new Date();
  await db.update(contentProductions).set({
    status: "cancelled",
    cancelledAt: now,
    nextProcessAt: null,
    leaseToken: null,
    leaseExpiresAt: null,
    updatedAt: now,
    updatedBy: auth.userId,
    version: sql`${contentProductions.version} + 1`,
  }).where(eq(contentProductions.id, production.id));
  await db.update(contentVideoScenes).set({ status: "cancelled", updatedAt: now, updatedBy: auth.userId, version: sql`${contentVideoScenes.version} + 1` }).where(and(
    eq(contentVideoScenes.productionId, production.id),
    inArray(contentVideoScenes.status, ["draft", "queued", "submitting"]),
  ));
  return getContentProduction(auth, production.id);
}

export async function getProductionAssetFile(auth: AuthContext, assetId: string) {
  assertCan(auth, "read");
  const [asset] = await db.select().from(contentProductionAssets).where(and(
    eq(contentProductionAssets.id, assetId),
    eq(contentProductionAssets.workspaceId, auth.workspaceId),
    isNull(contentProductionAssets.deletedAt),
  )).limit(1);
  if (!asset) throw new ApiError("NOT_FOUND", "콘텐츠 미디어 파일을 찾을 수 없습니다.");
  return { asset, bytes: await readContentAsset(asset.storageKey) };
}

export async function listDueContentProductionIds(now: Date, limit: number) {
  return db.select({ id: contentProductions.id, workspaceId: contentProductions.workspaceId, createdBy: contentProductions.createdBy }).from(contentProductions).where(and(
    inArray(contentProductions.status, ["draft", "planning", "generating_keyframes", "generating", "assembling"]),
    or(isNull(contentProductions.nextProcessAt), lte(contentProductions.nextProcessAt, now)),
    or(isNull(contentProductions.leaseToken), lt(contentProductions.leaseExpiresAt, now)),
    isNull(contentProductions.deletedAt),
  )).orderBy(asc(contentProductions.nextProcessAt), asc(contentProductions.updatedAt)).limit(limit);
}
