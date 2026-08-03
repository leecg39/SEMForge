import { and, asc, desc, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  contentArticles,
  contentBoards,
  contentMessages,
  contentPackageItems,
  contentPackages,
  contentProductionAssets,
  contentProductions,
  contentRuns,
  folders,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { assertCan, assertOwnershipOrAdmin } from "@/lib/rbac";
import type { AuthContext } from "@/lib/session";
import {
  approveContentPackageSchema,
  cancelContentPackageSchema,
  contentRunInputSchema,
  createContentPackageSchema,
  regenerateContentPackageSchema,
  updateContentPackageSchema,
  type ContentRunInput,
  type ContentVisualSpecification,
} from "@/server/content/contracts";
import { getContentBoard } from "@/server/content/boards";
import { getContentProduction } from "@/server/content/media";

type PackageRow = typeof contentPackages.$inferSelect;
type PackageItemRow = typeof contentPackageItems.$inferSelect;
type ArticleRow = typeof contentArticles.$inferSelect;
type ProductionInsert = typeof contentProductions.$inferInsert;
type PackageTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type PackageSettings = {
  article?: ContentRunInput;
  image: {
    preset: "hero" | "square" | "portrait" | "story";
    stylePreset: "editorial_photo" | "illustration" | "minimal_3d" | "abstract_graphic";
    displayTitle?: string;
    showTitle: boolean;
    titlePosition: "top_left" | "bottom_left";
    showLogo: boolean;
    focalX: number;
    focalY: number;
  };
  video: {
    targetDuration: 30 | 45 | 60;
    aspectRatio: "16:9" | "9:16" | "1:1";
    stylePreset: "editorial_photo" | "illustration" | "minimal_3d" | "abstract_graphic";
    nativeAudio: true;
  };
};

function parseObject<T extends object>(value: string | null): T {
  if (!value) return {} as T;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as T : {} as T;
  } catch {
    return {} as T;
  }
}

function articleSnapshot(article: ArticleRow) {
  const markdown = article.body ?? "";
  return {
    id: article.id,
    title: article.title,
    metaDescription: article.metaDescription,
    keyword: article.keyword,
    headings: markdown.split(/\r?\n/u)
      .map((line) => line.match(/^#{1,3}\s+(.+)$/u)?.[1]?.trim())
      .filter((value): value is string => Boolean(value))
      .slice(0, 10),
    excerpt: markdown
      .replace(/```[\s\S]*?```/gu, " ")
      .replace(/[#>*_`\[\]()!-]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 1_500),
    version: article.version,
  };
}

async function requireFolder(auth: AuthContext, folderId: string | null | undefined) {
  if (!folderId) return null;
  const [folder] = await db.select({ id: folders.id, name: folders.name }).from(folders).where(and(
    eq(folders.id, folderId),
    eq(folders.workspaceId, auth.workspaceId),
    isNull(folders.deletedAt),
  )).limit(1);
  if (!folder) throw new ApiError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  return folder;
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

async function requirePackage(auth: AuthContext, packageId: string) {
  const [contentPackage] = await db.select().from(contentPackages).where(and(
    eq(contentPackages.id, packageId),
    eq(contentPackages.workspaceId, auth.workspaceId),
    isNull(contentPackages.deletedAt),
  )).limit(1);
  if (!contentPackage) throw new ApiError("NOT_FOUND", "연계 제작 패키지를 찾을 수 없습니다.");
  return contentPackage;
}

async function requireItem(auth: AuthContext, packageId: string, itemId: string) {
  const [item] = await db.select().from(contentPackageItems).where(and(
    eq(contentPackageItems.id, itemId),
    eq(contentPackageItems.packageId, packageId),
    eq(contentPackageItems.workspaceId, auth.workspaceId),
    isNull(contentPackageItems.deletedAt),
  )).limit(1);
  if (!item) throw new ApiError("NOT_FOUND", "패키지 산출물을 찾을 수 없습니다.");
  return item;
}

async function activeItem(auth: AuthContext, packageId: string, kind: PackageItemRow["kind"]) {
  const [item] = await db.select().from(contentPackageItems).where(and(
    eq(contentPackageItems.packageId, packageId),
    eq(contentPackageItems.workspaceId, auth.workspaceId),
    eq(contentPackageItems.kind, kind),
    eq(contentPackageItems.status, "active"),
    isNull(contentPackageItems.deletedAt),
  )).orderBy(desc(contentPackageItems.revision)).limit(1);
  return item ?? null;
}

async function nextRevision(auth: AuthContext, packageId: string, kind: PackageItemRow["kind"]) {
  const [latest] = await db.select({ revision: contentPackageItems.revision }).from(contentPackageItems).where(and(
    eq(contentPackageItems.packageId, packageId),
    eq(contentPackageItems.workspaceId, auth.workspaceId),
    eq(contentPackageItems.kind, kind),
  )).orderBy(desc(contentPackageItems.revision)).limit(1);
  return (latest?.revision ?? 0) + 1;
}

function transitionPackage(
  tx: PackageTransaction,
  auth: AuthContext,
  packageId: string,
  version: number,
  now: Date,
  updates: Partial<typeof contentPackages.$inferInsert>,
) {
  const changed = tx.update(contentPackages).set({
    ...updates,
    updatedAt: now,
    updatedBy: auth.userId,
    version: sql`${contentPackages.version} + 1`,
  }).where(and(
    eq(contentPackages.id, packageId),
    eq(contentPackages.workspaceId, auth.workspaceId),
    eq(contentPackages.version, version),
  )).run();
  if (changed.changes !== 1) {
    throw new ApiError("VERSION_CONFLICT", "패키지가 다른 곳에서 수정되었습니다.");
  }
}

function transitionPackageItem(
  tx: PackageTransaction,
  auth: AuthContext,
  itemId: string,
  version: number,
  now: Date,
  updates: Partial<typeof contentPackageItems.$inferInsert>,
) {
  const changed = tx.update(contentPackageItems).set({
    ...updates,
    updatedAt: now,
    updatedBy: auth.userId,
    version: sql`${contentPackageItems.version} + 1`,
  }).where(and(
    eq(contentPackageItems.id, itemId),
    eq(contentPackageItems.workspaceId, auth.workspaceId),
    eq(contentPackageItems.version, version),
  )).run();
  if (changed.changes !== 1) {
    throw new ApiError("VERSION_CONFLICT", "승인 대상이 변경되었습니다.");
  }
}

function articleWorkRows(auth: AuthContext, input: {
  packageId: string;
  title: string;
  brief: string;
  folderId: string | null;
  requirements: ContentRunInput;
  revision: number;
}) {
  const now = new Date();
  const boardId = newId("ctb");
  const runId = newId("ctr");
  const itemId = newId("cpi");
  return {
    now,
    boardId,
    runId,
    itemId,
    board: {
      id: boardId,
      workspaceId: auth.workspaceId,
      folderId: input.folderId,
      title: input.title,
      intent: "create" as const,
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    },
    userMessage: {
      id: newId("ctm"),
      workspaceId: auth.workspaceId,
      boardId,
      role: "user" as const,
      kind: "text" as const,
      body: input.brief,
      payloadJson: JSON.stringify({ aiProfile: input.requirements.aiProfile, packageId: input.packageId }),
      createdAt: now,
      updatedAt: now,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    },
    requirementsMessage: {
      id: newId("ctm"),
      workspaceId: auth.workspaceId,
      boardId,
      role: "assistant" as const,
      kind: "requirements" as const,
      body: "연계 제작의 기사 생성 조건을 확정했습니다.",
      payloadJson: JSON.stringify(input.requirements),
      createdAt: now,
      updatedAt: now,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    },
    run: {
      id: runId,
      workspaceId: auth.workspaceId,
      boardId,
      idempotencyKey: `package-${input.packageId}-article-${input.revision}`,
      intent: "create" as const,
      status: "queued" as const,
      stage: "validate" as const,
      inputJson: JSON.stringify(input.requirements),
      createdAt: now,
      updatedAt: now,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    },
    item: {
      id: itemId,
      workspaceId: auth.workspaceId,
      packageId: input.packageId,
      kind: "article" as const,
      revision: input.revision,
      boardId,
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    },
  };
}

function productionRows(auth: AuthContext, input: {
  packageId: string;
  kind: "image" | "video";
  revision: number;
  title: string;
  prompt: string;
  folderId: string | null;
  article: ArticleRow;
  settings: PackageSettings["image"] | PackageSettings["video"];
  parentItemId: string;
  sourceVisual?: {
    production: typeof contentProductions.$inferSelect;
    asset: typeof contentProductionAssets.$inferSelect;
    specification: ContentVisualSpecification | null;
  } | null;
}) {
  const now = new Date();
  const productionId = newId("cpd");
  const itemId = newId("cpi");
  const sourceVisual = input.sourceVisual ? {
    productionId: input.sourceVisual.production.id,
    assetId: input.sourceVisual.asset.id,
    sha256: input.sourceVisual.asset.sha256,
    specification: input.sourceVisual.specification,
    title: input.sourceVisual.production.title,
  } : null;
  const production: ProductionInsert = {
    id: productionId,
    workspaceId: auth.workspaceId,
    folderId: input.folderId,
    articleId: input.article.id,
    articleVersion: input.article.version,
    sourceProductionId: sourceVisual?.productionId ?? null,
    sourceAssetId: sourceVisual?.assetId ?? null,
    sourceAssetSha256: sourceVisual?.sha256 ?? null,
    kind: input.kind,
    title: input.title,
    prompt: input.prompt,
    idempotencyKey: `package-${input.packageId}-${input.kind}-${input.revision}`,
    status: "draft",
    stage: "validate",
    settingsJson: JSON.stringify(input.settings),
    inputJson: JSON.stringify({ article: articleSnapshot(input.article), sourceVisual, requestedAt: now.toISOString() }),
    nextProcessAt: now,
    createdAt: now,
    updatedAt: now,
    createdBy: auth.userId,
    updatedBy: auth.userId,
  };
  return {
    production,
    item: {
      id: itemId,
      workspaceId: auth.workspaceId,
      packageId: input.packageId,
      kind: input.kind,
      revision: input.revision,
      productionId,
      parentItemId: input.parentItemId,
      sourceVersion: input.kind === "image" ? input.article.version : input.sourceVisual?.production.version ?? null,
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    },
  };
}

async function syncPackage(auth: AuthContext, initial: PackageRow): Promise<PackageRow> {
  if (["completed", "cancelled", "archived"].includes(initial.status)) return initial;
  const item = await activeItem(auth, initial.id, initial.currentStep.startsWith("article") ? "article" : initial.currentStep.startsWith("image") ? "image" : "video");
  if (!item) return initial;
  let updates: Partial<typeof contentPackages.$inferInsert> | null = null;
  let articleLink: { id: string; version: number } | null = null;
  if (item.kind === "article" && initial.currentStep === "article") {
    const [article] = item.boardId ? await db.select().from(contentArticles).where(and(eq(contentArticles.boardId, item.boardId), eq(contentArticles.workspaceId, auth.workspaceId), isNull(contentArticles.deletedAt))).orderBy(desc(contentArticles.updatedAt)).limit(1) : [];
    const [board] = item.boardId ? await db.select().from(contentBoards).where(and(eq(contentBoards.id, item.boardId), eq(contentBoards.workspaceId, auth.workspaceId))).limit(1) : [];
    const [run] = item.boardId ? await db.select().from(contentRuns).where(and(eq(contentRuns.boardId, item.boardId), eq(contentRuns.workspaceId, auth.workspaceId))).orderBy(desc(contentRuns.createdAt)).limit(1) : [];
    if (article && board?.status === "completed") {
      articleLink = { id: article.id, version: article.version };
      updates = { currentStep: "article_review", status: "awaiting_approval", errorJson: null };
    } else if (board?.status === "failed" || run?.status === "failed") {
      updates = { status: "failed", errorJson: run?.errorJson ?? JSON.stringify({ message: "기사 생성에 실패했습니다.", step: "article" }) };
    } else if (run && initial.status === "failed" && ["queued", "running"].includes(run.status)) {
      updates = { status: "active", errorJson: null };
    }
  } else if (item.productionId) {
    const [production] = await db.select().from(contentProductions).where(and(eq(contentProductions.id, item.productionId), eq(contentProductions.workspaceId, auth.workspaceId))).limit(1);
    if (production?.status === "failed") {
      updates = { status: "failed", errorJson: production.errorJson ?? JSON.stringify({ message: "미디어 제작에 실패했습니다.", step: item.kind }) };
    } else if (production?.status === "ready" && item.kind === "image" && initial.currentStep === "image") {
      updates = { currentStep: "image_review", status: "awaiting_approval", errorJson: null };
    } else if (production?.status === "ready" && item.kind === "video" && initial.currentStep === "video") {
      updates = { currentStep: "complete", status: "completed", completedAt: new Date(), errorJson: null };
    } else if (production && initial.status === "failed") {
      updates = { status: "active", errorJson: null };
    }
  }
  if (!updates && !articleLink) return initial;
  const now = new Date();
  db.transaction((tx) => {
    if (articleLink) {
      tx.update(contentPackageItems).set({ articleId: articleLink.id, sourceVersion: articleLink.version, updatedAt: now, updatedBy: auth.userId, version: sql`${contentPackageItems.version} + 1` }).where(and(eq(contentPackageItems.id, item.id), eq(contentPackageItems.workspaceId, auth.workspaceId))).run();
    }
    if (updates) {
      tx.update(contentPackages).set({ ...updates, updatedAt: now, updatedBy: auth.userId, version: sql`${contentPackages.version} + 1` }).where(and(
        eq(contentPackages.id, initial.id),
        eq(contentPackages.workspaceId, auth.workspaceId),
        eq(contentPackages.version, initial.version),
      )).run();
    }
  });
  return requirePackage(auth, initial.id);
}

async function publicPackage(auth: AuthContext, rawPackage: PackageRow) {
  const contentPackage = await syncPackage(auth, rawPackage);
  const [folder, items] = await Promise.all([
    contentPackage.folderId ? db.select({ name: folders.name }).from(folders).where(and(eq(folders.id, contentPackage.folderId), eq(folders.workspaceId, auth.workspaceId))).limit(1) : Promise.resolve([]),
    db.select().from(contentPackageItems).where(and(
      eq(contentPackageItems.packageId, contentPackage.id),
      eq(contentPackageItems.workspaceId, auth.workspaceId),
      isNull(contentPackageItems.deletedAt),
    )).orderBy(asc(contentPackageItems.createdAt)),
  ]);
  const views = await Promise.all(items.map(async (item) => {
    const [board, article, production] = await Promise.all([
      item.boardId ? getContentBoard(auth, item.boardId) : Promise.resolve(null),
      item.articleId ? requireArticle(auth, item.articleId).catch(() => null) : Promise.resolve(null),
      item.productionId ? getContentProduction(auth, item.productionId) : Promise.resolve(null),
    ]);
    let stale = Boolean(article && item.sourceVersion && article.version !== item.sourceVersion);
    if (production?.stale) stale = true;
    if (production?.sourceAssetId && production.sourceAssetSha256) {
      const [source] = await db.select({ sha256: contentProductionAssets.sha256 }).from(contentProductionAssets).where(and(
        eq(contentProductionAssets.id, production.sourceAssetId),
        eq(contentProductionAssets.workspaceId, auth.workspaceId),
        isNull(contentProductionAssets.deletedAt),
      )).limit(1);
      if (!source || source.sha256 !== production.sourceAssetSha256) stale = true;
    }
    return {
      id: item.id,
      kind: item.kind,
      revision: item.revision,
      parentItemId: item.parentItemId,
      sourceVersion: item.sourceVersion,
      status: item.status,
      version: item.version,
      stale,
      board,
      article: article ? { ...article, createdAt: article.createdAt.toISOString(), updatedAt: article.updatedAt.toISOString(), publishedAt: article.publishedAt?.toISOString() ?? null } : null,
      production,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }));
  const active = (kind: PackageItemRow["kind"]) => views.find((item) => item.kind === kind && item.status === "active") ?? null;
  return {
    id: contentPackage.id,
    folderId: contentPackage.folderId,
    folderName: folder[0]?.name ?? null,
    title: contentPackage.title,
    brief: contentPackage.brief,
    startMode: contentPackage.startMode,
    targetStage: contentPackage.targetStage,
    currentStep: contentPackage.currentStep,
    status: contentPackage.status,
    settings: parseObject<PackageSettings>(contentPackage.settingsJson),
    error: parseObject(contentPackage.errorJson),
    version: contentPackage.version,
    completedAt: contentPackage.completedAt?.toISOString() ?? null,
    cancelledAt: contentPackage.cancelledAt?.toISOString() ?? null,
    createdAt: contentPackage.createdAt.toISOString(),
    updatedAt: contentPackage.updatedAt.toISOString(),
    items: views,
    activeItems: { article: active("article"), image: active("image"), video: active("video") },
  };
}

export async function createContentPackage(auth: AuthContext, rawInput: unknown) {
  assertCan(auth, "create");
  const input = createContentPackageSchema.parse(rawInput);
  const folder = await requireFolder(auth, input.folderId);
  const [duplicate] = await db.select().from(contentPackages).where(and(
    eq(contentPackages.workspaceId, auth.workspaceId),
    eq(contentPackages.idempotencyKey, input.idempotencyKey),
  )).limit(1);
  if (duplicate) return { ...(await publicPackage(auth, duplicate)), reused: true };
  const id = newId("cpk");
  const now = new Date();
  const settings: PackageSettings = {
    ...(input.startMode === "new_article" ? { article: input.articleSettings } : {}),
    image: input.imageSettings,
    video: input.videoSettings,
  };
  const existingArticle = input.startMode === "existing_article" ? await requireArticle(auth, input.sourceArticleId) : null;
  const articleWork = input.startMode === "new_article" ? articleWorkRows(auth, {
    packageId: id,
    title: input.title,
    brief: input.brief,
    folderId: folder?.id ?? null,
    requirements: input.articleSettings,
    revision: 1,
  }) : null;
  db.transaction((tx) => {
    tx.insert(contentPackages).values({
      id,
      workspaceId: auth.workspaceId,
      folderId: folder?.id ?? null,
      idempotencyKey: input.idempotencyKey,
      title: input.title,
      brief: input.brief,
      startMode: input.startMode,
      targetStage: input.targetStage,
      currentStep: articleWork ? "article" : "article_review",
      status: articleWork ? "active" : "awaiting_approval",
      settingsJson: JSON.stringify(settings),
      createdAt: now,
      updatedAt: now,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    }).run();
    if (articleWork) {
      tx.insert(contentBoards).values(articleWork.board).run();
      tx.insert(contentMessages).values([articleWork.userMessage, articleWork.requirementsMessage]).run();
      tx.insert(contentRuns).values(articleWork.run).run();
      tx.insert(contentPackageItems).values(articleWork.item).run();
    } else if (existingArticle) {
      tx.insert(contentPackageItems).values({
        id: newId("cpi"),
        workspaceId: auth.workspaceId,
        packageId: id,
        kind: "article",
        revision: 1,
        boardId: existingArticle.boardId,
        articleId: existingArticle.id,
        sourceVersion: existingArticle.version,
        status: "active",
        createdAt: now,
        updatedAt: now,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      }).run();
    }
  });
  writeAudit(auth, { action: "create", entityType: "content_packages", entityId: id, entityLabel: input.title, after: { startMode: input.startMode, targetStage: input.targetStage } });
  return { ...(await getContentPackage(auth, id)), reused: false };
}

export async function getContentPackage(auth: AuthContext, packageId: string) {
  assertCan(auth, "read");
  return publicPackage(auth, await requirePackage(auth, packageId));
}

export async function listContentPackages(auth: AuthContext, request: Request) {
  assertCan(auth, "read");
  const search = new URL(request.url).searchParams;
  const conditions = [eq(contentPackages.workspaceId, auth.workspaceId), isNull(contentPackages.deletedAt)];
  const folderId = search.get("folderId") || search.get("fid");
  const query = search.get("q")?.trim();
  if (folderId) conditions.push(eq(contentPackages.folderId, folderId));
  if (query) conditions.push(like(contentPackages.title, `%${query.replace(/[%_]/gu, "")}%`));
  const rows = await db.select().from(contentPackages).where(and(...conditions)).orderBy(desc(contentPackages.updatedAt)).limit(100);
  return Promise.all(rows.map((row) => publicPackage(auth, row)));
}

export async function updateContentPackage(auth: AuthContext, packageId: string, rawInput: unknown) {
  assertCan(auth, "update");
  const contentPackage = await requirePackage(auth, packageId);
  assertOwnershipOrAdmin(auth, contentPackage);
  const input = updateContentPackageSchema.parse(rawInput);
  const [updated] = await db.update(contentPackages).set({
    title: input.title ?? contentPackage.title,
    status: input.status ?? contentPackage.status,
    updatedAt: new Date(),
    updatedBy: auth.userId,
    version: sql`${contentPackages.version} + 1`,
  }).where(and(
    eq(contentPackages.id, packageId),
    eq(contentPackages.workspaceId, auth.workspaceId),
    eq(contentPackages.version, input.version),
  )).returning();
  if (!updated) throw new ApiError("VERSION_CONFLICT", "패키지가 다른 곳에서 수정되었습니다.");
  return publicPackage(auth, updated);
}

async function imageSource(auth: AuthContext, item: PackageItemRow) {
  if (!item.productionId) throw new ApiError("VALIDATION_ERROR", "승인할 이미지 production이 없습니다.");
  const [row] = await db.select({ production: contentProductions, asset: contentProductionAssets })
    .from(contentProductions)
    .innerJoin(contentProductionAssets, eq(contentProductionAssets.productionId, contentProductions.id))
    .where(and(
      eq(contentProductions.id, item.productionId),
      eq(contentProductions.workspaceId, auth.workspaceId),
      eq(contentProductions.status, "ready"),
      eq(contentProductionAssets.workspaceId, auth.workspaceId),
      eq(contentProductionAssets.kind, "image_result"),
      isNull(contentProductionAssets.deletedAt),
    )).limit(1);
  if (!row) throw new ApiError("VALIDATION_ERROR", "승인할 대표 이미지가 준비되지 않았습니다.");
  const result = parseObject<{ specification?: ContentVisualSpecification }>(row.production.resultJson);
  return { ...row, specification: result.specification ?? null };
}

export async function approveContentPackage(auth: AuthContext, packageId: string, rawInput: unknown) {
  assertCan(auth, "update");
  const contentPackage = await requirePackage(auth, packageId);
  assertOwnershipOrAdmin(auth, contentPackage);
  const input = approveContentPackageSchema.parse(rawInput);
  if (input.packageVersion !== contentPackage.version) throw new ApiError("VERSION_CONFLICT", "패키지가 다른 곳에서 수정되었습니다.");
  const item = await requireItem(auth, packageId, input.itemId);
  if (item.version !== input.itemVersion || item.status !== "active") throw new ApiError("VERSION_CONFLICT", "승인 대상이 변경되었습니다.");
  const settings = parseObject<PackageSettings>(contentPackage.settingsJson);
  const now = new Date();
  if (input.gate === "article") {
    if (contentPackage.currentStep !== "article_review" || contentPackage.status !== "awaiting_approval" || item.kind !== "article") {
      throw new ApiError("VALIDATION_ERROR", "현재 기사 승인 단계가 아닙니다.");
    }
    if (!item.articleId) throw new ApiError("VALIDATION_ERROR", "승인할 기사가 없습니다.");
    const article = await requireArticle(auth, item.articleId);
    if (contentPackage.targetStage === "article") {
      db.transaction((tx) => {
        transitionPackage(tx, auth, packageId, input.packageVersion, now, { currentStep: "complete", status: "completed", completedAt: now });
        transitionPackageItem(tx, auth, item.id, input.itemVersion, now, { sourceVersion: article.version });
      });
    } else {
      const imageSettings = { ...settings.image, ...(input.nextSettings?.image ?? {}), displayTitle: input.nextSettings?.image?.displayTitle ?? settings.image.displayTitle ?? article.title.slice(0, 80) };
      const rows = productionRows(auth, { packageId, kind: "image", revision: await nextRevision(auth, packageId, "image"), title: `${article.title} 대표 이미지`, prompt: `${contentPackage.brief}\n기사의 핵심 메시지를 정확하게 표현하는 대표 이미지`, folderId: contentPackage.folderId, article, settings: imageSettings, parentItemId: item.id });
      db.transaction((tx) => {
        transitionPackage(tx, auth, packageId, input.packageVersion, now, { currentStep: "image", status: "active", settingsJson: JSON.stringify({ ...settings, image: imageSettings }), errorJson: null });
        transitionPackageItem(tx, auth, item.id, input.itemVersion, now, { sourceVersion: article.version });
        tx.insert(contentProductions).values(rows.production).run();
        tx.insert(contentPackageItems).values(rows.item).run();
      });
    }
  } else {
    if (contentPackage.currentStep !== "image_review" || contentPackage.status !== "awaiting_approval" || item.kind !== "image") {
      throw new ApiError("VALIDATION_ERROR", "현재 이미지 승인 단계가 아닙니다.");
    }
    const source = await imageSource(auth, item);
    if (contentPackage.targetStage === "image") {
      db.transaction((tx) => {
        transitionPackage(tx, auth, packageId, input.packageVersion, now, { currentStep: "complete", status: "completed", completedAt: now });
      });
    } else {
      const articleItem = await activeItem(auth, packageId, "article");
      if (!articleItem?.articleId) throw new ApiError("VALIDATION_ERROR", "영상에 연결할 기사가 없습니다.");
      const article = await requireArticle(auth, articleItem.articleId);
      const videoSettings = { ...settings.video, ...(input.nextSettings?.video ?? {}) };
      const rows = productionRows(auth, { packageId, kind: "video", revision: await nextRevision(auth, packageId, "video"), title: `${article.title} 영상`, prompt: `${contentPackage.brief}\n승인된 대표 이미지의 시각 언어를 유지해 기사를 영상으로 설명`, folderId: contentPackage.folderId, article, settings: videoSettings, parentItemId: item.id, sourceVisual: source });
      db.transaction((tx) => {
        transitionPackage(tx, auth, packageId, input.packageVersion, now, { currentStep: "video", status: "active", settingsJson: JSON.stringify({ ...settings, video: videoSettings }), errorJson: null });
        tx.insert(contentProductions).values(rows.production).run();
        tx.insert(contentPackageItems).values(rows.item).run();
      });
    }
  }
  writeAudit(auth, { action: "update", entityType: "content_packages", entityId: packageId, entityLabel: contentPackage.title, after: { approvedGate: input.gate, itemId: item.id } });
  return getContentPackage(auth, packageId);
}

function supersedeKinds(tx: PackageTransaction, packageId: string, kinds: PackageItemRow["kind"][], auth: AuthContext, now: Date) {
  tx.update(contentPackageItems).set({ status: "superseded", updatedAt: now, updatedBy: auth.userId, version: sql`${contentPackageItems.version} + 1` }).where(and(
    eq(contentPackageItems.packageId, packageId),
    eq(contentPackageItems.workspaceId, auth.workspaceId),
    inArray(contentPackageItems.kind, kinds),
    eq(contentPackageItems.status, "active"),
  )).run();
}

function stopActiveWork(
  tx: PackageTransaction,
  items: PackageItemRow[],
  auth: AuthContext,
  now: Date,
) {
  const boardIds = items.flatMap((item) => item.boardId ? [item.boardId] : []);
  const productionIds = items.flatMap((item) => item.productionId ? [item.productionId] : []);
  if (boardIds.length > 0) {
    tx.update(contentRuns).set({ status: "cancelled", cancelledAt: now, completedAt: now, leaseToken: null, leaseExpiresAt: null, updatedAt: now, updatedBy: auth.userId, version: sql`${contentRuns.version} + 1` }).where(and(
      inArray(contentRuns.boardId, boardIds),
      eq(contentRuns.workspaceId, auth.workspaceId),
      inArray(contentRuns.status, ["queued", "running"]),
    )).run();
  }
  if (productionIds.length > 0) {
    tx.update(contentProductions).set({ status: "cancelled", cancelledAt: now, nextProcessAt: null, leaseToken: null, leaseExpiresAt: null, updatedAt: now, updatedBy: auth.userId, version: sql`${contentProductions.version} + 1` }).where(and(
      inArray(contentProductions.id, productionIds),
      eq(contentProductions.workspaceId, auth.workspaceId),
      inArray(contentProductions.status, ["draft", "planning", "awaiting_storyboard_approval", "generating_keyframes", "awaiting_keyframe_approval", "generating", "assembling"]),
    )).run();
  }
}

export async function regenerateContentPackage(auth: AuthContext, packageId: string, rawInput: unknown) {
  assertCan(auth, "update");
  const contentPackage = await requirePackage(auth, packageId);
  assertOwnershipOrAdmin(auth, contentPackage);
  const input = regenerateContentPackageSchema.parse(rawInput);
  if (input.packageVersion !== contentPackage.version) throw new ApiError("VERSION_CONFLICT", "패키지가 다른 곳에서 수정되었습니다.");
  if (["cancelled", "archived"].includes(contentPackage.status)) throw new ApiError("VALIDATION_ERROR", "취소·보관된 패키지는 재생성할 수 없습니다.");
  const settings = parseObject<PackageSettings>(contentPackage.settingsJson);
  const now = new Date();
  const replacedKinds: PackageItemRow["kind"][] = input.kind === "article" ? ["article", "image", "video"] : input.kind === "image" ? ["image", "video"] : ["video"];
  const activeWork = await db.select().from(contentPackageItems).where(and(
    eq(contentPackageItems.packageId, packageId),
    eq(contentPackageItems.workspaceId, auth.workspaceId),
    inArray(contentPackageItems.kind, replacedKinds),
    eq(contentPackageItems.status, "active"),
    isNull(contentPackageItems.deletedAt),
  ));
  if (input.kind === "article") {
    const current = await activeItem(auth, packageId, "article");
    if (contentPackage.startMode === "existing_article") {
      if (!current?.articleId) throw new ApiError("VALIDATION_ERROR", "최신 버전을 연결할 기사가 없습니다.");
      const article = await requireArticle(auth, current.articleId);
      const revision = await nextRevision(auth, packageId, "article");
      db.transaction((tx) => {
        transitionPackage(tx, auth, packageId, input.packageVersion, now, { currentStep: "article_review", status: "awaiting_approval", completedAt: null, errorJson: null });
        stopActiveWork(tx, activeWork, auth, now);
        supersedeKinds(tx, packageId, ["article", "image", "video"], auth, now);
        tx.insert(contentPackageItems).values({ id: newId("cpi"), workspaceId: auth.workspaceId, packageId, kind: "article", revision, boardId: article.boardId, articleId: article.id, sourceVersion: article.version, status: "active", createdAt: now, updatedAt: now, createdBy: auth.userId, updatedBy: auth.userId }).run();
      });
    } else {
      if (!settings.article) throw new ApiError("INTERNAL", "기사 생성 설정이 없습니다.");
      const work = articleWorkRows(auth, { packageId, title: contentPackage.title, brief: contentPackage.brief, folderId: contentPackage.folderId, requirements: contentRunInputSchema.parse(settings.article), revision: await nextRevision(auth, packageId, "article") });
      db.transaction((tx) => {
        transitionPackage(tx, auth, packageId, input.packageVersion, now, { currentStep: "article", status: "active", completedAt: null, errorJson: null });
        stopActiveWork(tx, activeWork, auth, now);
        supersedeKinds(tx, packageId, ["article", "image", "video"], auth, now);
        tx.insert(contentBoards).values(work.board).run();
        tx.insert(contentMessages).values([work.userMessage, work.requirementsMessage]).run();
        tx.insert(contentRuns).values(work.run).run();
        tx.insert(contentPackageItems).values(work.item).run();
      });
    }
  } else if (input.kind === "image") {
    const articleItem = await activeItem(auth, packageId, "article");
    if (!articleItem?.articleId) throw new ApiError("VALIDATION_ERROR", "이미지에 연결할 기사가 없습니다.");
    const article = await requireArticle(auth, articleItem.articleId);
    const imageSettings = {
      ...settings.image,
      ...(input.nextSettings?.image ?? {}),
      displayTitle: input.nextSettings?.image?.displayTitle ?? settings.image.displayTitle ?? article.title.slice(0, 80),
    };
    const rows = productionRows(auth, { packageId, kind: "image", revision: await nextRevision(auth, packageId, "image"), title: `${article.title} 대표 이미지`, prompt: `${contentPackage.brief}\n기사의 핵심 메시지를 정확하게 표현하는 대표 이미지`, folderId: contentPackage.folderId, article, settings: imageSettings, parentItemId: articleItem.id });
    db.transaction((tx) => {
      transitionPackage(tx, auth, packageId, input.packageVersion, now, { currentStep: "image", status: "active", settingsJson: JSON.stringify({ ...settings, image: imageSettings }), completedAt: null, errorJson: null });
      stopActiveWork(tx, activeWork, auth, now);
      supersedeKinds(tx, packageId, ["image", "video"], auth, now);
      tx.insert(contentProductions).values(rows.production).run();
      tx.insert(contentPackageItems).values(rows.item).run();
    });
  } else {
    const [articleItem, imageItem] = await Promise.all([activeItem(auth, packageId, "article"), activeItem(auth, packageId, "image")]);
    if (!articleItem?.articleId || !imageItem) throw new ApiError("VALIDATION_ERROR", "영상에 연결할 기사와 이미지가 없습니다.");
    const [article, source] = await Promise.all([requireArticle(auth, articleItem.articleId), imageSource(auth, imageItem)]);
    const rows = productionRows(auth, { packageId, kind: "video", revision: await nextRevision(auth, packageId, "video"), title: `${article.title} 영상`, prompt: `${contentPackage.brief}\n승인된 대표 이미지의 시각 언어를 유지해 기사를 영상으로 설명`, folderId: contentPackage.folderId, article, settings: settings.video, parentItemId: imageItem.id, sourceVisual: source });
    db.transaction((tx) => {
      transitionPackage(tx, auth, packageId, input.packageVersion, now, { currentStep: "video", status: "active", completedAt: null, errorJson: null });
      stopActiveWork(tx, activeWork, auth, now);
      supersedeKinds(tx, packageId, ["video"], auth, now);
      tx.insert(contentProductions).values(rows.production).run();
      tx.insert(contentPackageItems).values(rows.item).run();
    });
  }
  writeAudit(auth, { action: "update", entityType: "content_packages", entityId: packageId, entityLabel: contentPackage.title, after: { regeneratedKind: input.kind } });
  return getContentPackage(auth, packageId);
}

export async function cancelContentPackage(auth: AuthContext, packageId: string, rawInput: unknown) {
  assertCan(auth, "update");
  const contentPackage = await requirePackage(auth, packageId);
  assertOwnershipOrAdmin(auth, contentPackage);
  const input = cancelContentPackageSchema.parse(rawInput);
  if (input.version !== contentPackage.version) throw new ApiError("VERSION_CONFLICT", "패키지가 다른 곳에서 수정되었습니다.");
  if (["completed", "cancelled", "archived"].includes(contentPackage.status)) return getContentPackage(auth, packageId);
  const kind = contentPackage.currentStep.startsWith("article") ? "article" : contentPackage.currentStep.startsWith("image") ? "image" : "video";
  const item = await activeItem(auth, packageId, kind);
  const now = new Date();
  db.transaction((tx) => {
    transitionPackage(tx, auth, packageId, input.version, now, { status: "cancelled", cancelledAt: now });
    if (item?.boardId) {
      tx.update(contentRuns).set({ status: "cancelled", cancelledAt: now, completedAt: now, leaseToken: null, leaseExpiresAt: null, updatedAt: now, updatedBy: auth.userId, version: sql`${contentRuns.version} + 1` }).where(and(eq(contentRuns.boardId, item.boardId), eq(contentRuns.workspaceId, auth.workspaceId), inArray(contentRuns.status, ["queued", "running"]))).run();
    }
    if (item?.productionId) {
      tx.update(contentProductions).set({ status: "cancelled", cancelledAt: now, nextProcessAt: null, leaseToken: null, leaseExpiresAt: null, updatedAt: now, updatedBy: auth.userId, version: sql`${contentProductions.version} + 1` }).where(and(eq(contentProductions.id, item.productionId), eq(contentProductions.workspaceId, auth.workspaceId), inArray(contentProductions.status, ["draft", "planning", "generating_keyframes", "generating", "assembling"]))).run();
    }
  });
  writeAudit(auth, { action: "update", entityType: "content_packages", entityId: packageId, entityLabel: contentPackage.title, after: { status: "cancelled" } });
  return getContentPackage(auth, packageId);
}
