import { and, desc, eq, isNull, like } from "drizzle-orm";
import { db } from "@/db/client";
import {
  contentArticles,
  contentBoards,
  contentPackageItems,
  contentPackages,
  contentProductionAssets,
  contentProductions,
  folders,
} from "@/db/schema";
import { assertCan } from "@/lib/rbac";
import type { AuthContext } from "@/lib/session";
import type { ContentLibraryItem, ContentWorkspaceItem } from "@/types/content";

function cleanQuery(value: string | null): string {
  return value?.trim().replace(/[%_]/gu, "") ?? "";
}

function packageMatchesType(targetStage: "article" | "image" | "video", type: string): boolean {
  if (type === "all" || type === "article") return true;
  if (type === "image") return targetStage === "image" || targetStage === "video";
  return type === "video" && targetStage === "video";
}

export async function listContentWorkspaceItems(auth: AuthContext, request: Request): Promise<ContentWorkspaceItem[]> {
  assertCan(auth, "read");
  const search = new URL(request.url).searchParams;
  const type = search.get("type") || "all";
  const group = search.get("group") === "item" ? "item" : "package";
  const folderId = search.get("folderId") || search.get("fid");
  const query = cleanQuery(search.get("q"));

  const [packageRows, packageItemRows, boardRows, productionRows] = await Promise.all([
    db.select({ contentPackage: contentPackages, folderName: folders.name })
      .from(contentPackages)
      .leftJoin(folders, eq(folders.id, contentPackages.folderId))
      .where(and(eq(contentPackages.workspaceId, auth.workspaceId), isNull(contentPackages.deletedAt)))
      .orderBy(desc(contentPackages.updatedAt)),
    db.select().from(contentPackageItems).where(and(
      eq(contentPackageItems.workspaceId, auth.workspaceId),
      isNull(contentPackageItems.deletedAt),
    )),
    db.select({ board: contentBoards, folderName: folders.name })
      .from(contentBoards)
      .leftJoin(folders, eq(folders.id, contentBoards.folderId))
      .where(and(eq(contentBoards.workspaceId, auth.workspaceId), isNull(contentBoards.deletedAt)))
      .orderBy(desc(contentBoards.updatedAt)),
    db.select({ production: contentProductions, folderName: folders.name })
      .from(contentProductions)
      .leftJoin(folders, eq(folders.id, contentProductions.folderId))
      .where(and(eq(contentProductions.workspaceId, auth.workspaceId), isNull(contentProductions.deletedAt)))
      .orderBy(desc(contentProductions.updatedAt)),
  ]);

  const linkedBoardIds = new Set(packageItemRows.flatMap((item) => item.boardId ? [item.boardId] : []));
  const linkedProductionIds = new Set(packageItemRows.flatMap((item) => item.productionId ? [item.productionId] : []));
  const boardMap = new Map(boardRows.map(({ board }) => [board.id, board]));
  const productionMap = new Map(productionRows.map(({ production }) => [production.id, production]));
  const itemsByPackage = new Map<string, typeof packageItemRows>();
  const packageTitleMap = new Map(packageRows.map(({ contentPackage }) => [contentPackage.id, contentPackage.title]));
  const boardPackageMap = new Map<string, string>();
  const productionPackageMap = new Map<string, string>();
  for (const item of packageItemRows) {
    const current = itemsByPackage.get(item.packageId) ?? [];
    current.push(item);
    itemsByPackage.set(item.packageId, current);
    if (item.boardId && (!boardPackageMap.has(item.boardId) || item.status === "active")) boardPackageMap.set(item.boardId, item.packageId);
    if (item.productionId && (!productionPackageMap.has(item.productionId) || item.status === "active")) productionPackageMap.set(item.productionId, item.packageId);
  }

  const items: ContentWorkspaceItem[] = (group === "package" ? packageRows : [])
    .filter(({ contentPackage }) => (!folderId || contentPackage.folderId === folderId)
      && (!query || contentPackage.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
      && packageMatchesType(contentPackage.targetStage, type))
    .map(({ contentPackage, folderName }) => {
      const packageItems = (itemsByPackage.get(contentPackage.id) ?? []).filter((item) => item.status === "active");
      const children = packageItems.flatMap<ContentWorkspaceItem>((item) => {
        if (item.kind === "article") {
          const board = item.boardId ? boardMap.get(item.boardId) : null;
          if (!board) return [];
          return [{
            id: board.id,
            kind: "article" as const,
            title: board.title,
            folderName,
            status: board.status,
            stage: `revision ${item.revision} · 기사`,
            href: `/content/workspaces/${board.id}/`,
            updatedAt: board.updatedAt.toISOString(),
            packageId: contentPackage.id,
            packageTitle: contentPackage.title,
            group: "item" as const,
          }];
        }
        const production = item.productionId ? productionMap.get(item.productionId) : null;
        if (!production) return [];
        return [{
          id: production.id,
          kind: production.kind,
          title: production.title,
          folderName,
          status: production.status,
          stage: `revision ${item.revision} · ${production.stage}`,
          href: `/content/productions/${production.id}/`,
          updatedAt: production.updatedAt.toISOString(),
          packageId: contentPackage.id,
          packageTitle: contentPackage.title,
          group: "item" as const,
        }];
      });
      return {
        id: contentPackage.id,
        kind: "package" as const,
        title: contentPackage.title,
        folderName,
        status: contentPackage.status,
        stage: contentPackage.currentStep,
        href: `/content/packages/${contentPackage.id}/`,
        updatedAt: contentPackage.updatedAt.toISOString(),
        packageId: contentPackage.id,
        packageTitle: contentPackage.title,
        group: "package" as const,
        children,
      };
    });

  if (type === "all" || type === "article") {
    items.push(...boardRows
      .filter(({ board }) => (group === "item" || !linkedBoardIds.has(board.id))
        && (!folderId || board.folderId === folderId)
        && (!query || board.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())))
      .map(({ board, folderName }) => {
        const packageId = boardPackageMap.get(board.id) ?? null;
        return {
          id: board.id,
          kind: "article" as const,
          title: board.title,
          folderName,
          status: board.status,
          stage: board.status === "completed" ? "라이브러리 저장" : "기사 작업",
          href: `/content/workspaces/${board.id}/`,
          updatedAt: board.updatedAt.toISOString(),
          packageId,
          packageTitle: packageId ? packageTitleMap.get(packageId) ?? null : null,
          group: "item" as const,
        };
      }));
  }
  if (type === "all" || type === "image" || type === "video") {
    items.push(...productionRows
      .filter(({ production }) => (group === "item" || !linkedProductionIds.has(production.id))
        && (type === "all" || production.kind === type)
        && (!folderId || production.folderId === folderId)
        && (!query || production.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())))
      .map(({ production, folderName }) => {
        const packageId = productionPackageMap.get(production.id) ?? null;
        return {
          id: production.id,
          kind: production.kind,
          title: production.title,
          folderName,
          status: production.status,
          stage: production.stage,
          href: `/content/productions/${production.id}/`,
          updatedAt: production.updatedAt.toISOString(),
          packageId,
          packageTitle: packageId ? packageTitleMap.get(packageId) ?? null : null,
          group: "item" as const,
        };
      }));
  }
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 100);
}

export async function listContentLibraryItems(auth: AuthContext, request: Request): Promise<ContentLibraryItem[]> {
  assertCan(auth, "read");
  const search = new URL(request.url).searchParams;
  const type = search.get("type") || "all";
  const folderId = search.get("folderId") || search.get("fid");
  const query = cleanQuery(search.get("q"));
  const [packageRows, packageItems] = await Promise.all([
    db.select({ id: contentPackages.id, title: contentPackages.title }).from(contentPackages).where(and(
      eq(contentPackages.workspaceId, auth.workspaceId),
      isNull(contentPackages.deletedAt),
    )),
    db.select().from(contentPackageItems).where(and(
      eq(contentPackageItems.workspaceId, auth.workspaceId),
      isNull(contentPackageItems.deletedAt),
    )).orderBy(desc(contentPackageItems.updatedAt)),
  ]);
  const packageTitles = new Map(packageRows.map((row) => [row.id, row.title]));
  const articlePackages = new Map<string, string>();
  const productionPackages = new Map<string, string>();
  for (const item of packageItems) {
    if (item.articleId && (!articlePackages.has(item.articleId) || item.status === "active")) articlePackages.set(item.articleId, item.packageId);
    if (item.productionId && (!productionPackages.has(item.productionId) || item.status === "active")) productionPackages.set(item.productionId, item.packageId);
  }

  const items: ContentLibraryItem[] = [];
  if (type === "all" || type === "article") {
    const conditions = [eq(contentArticles.workspaceId, auth.workspaceId), isNull(contentArticles.deletedAt)];
    if (folderId) conditions.push(eq(contentArticles.folderId, folderId));
    if (query) conditions.push(like(contentArticles.title, `%${query}%`));
    const rows = await db.select().from(contentArticles).where(and(...conditions)).orderBy(desc(contentArticles.updatedAt)).limit(100);
    items.push(...rows.map((article) => {
      const packageId = articlePackages.get(article.id) ?? null;
      return {
        id: article.id,
        kind: "article" as const,
        title: article.title,
        subtitle: `${article.keyword || "키워드 없음"} · ${article.wordCount.toLocaleString()}단어`,
        status: article.status,
        href: article.boardId ? `/content/workspaces/${article.boardId}/` : `/content/library/${article.id}/`,
        thumbnailUrl: null,
        updatedAt: article.updatedAt.toISOString(),
        packageId,
        packageTitle: packageId ? packageTitles.get(packageId) ?? null : null,
        group: "item" as const,
      };
    }));
  }
  if (type === "all" || type === "image" || type === "video") {
    const conditions = [
      eq(contentProductions.workspaceId, auth.workspaceId),
      eq(contentProductions.status, "ready"),
      isNull(contentProductions.deletedAt),
    ];
    if (type === "image" || type === "video") conditions.push(eq(contentProductions.kind, type));
    if (folderId) conditions.push(eq(contentProductions.folderId, folderId));
    if (query) conditions.push(like(contentProductions.title, `%${query}%`));
    const rows = await db.select().from(contentProductions).where(and(...conditions)).orderBy(desc(contentProductions.updatedAt)).limit(100);
    for (const production of rows) {
      const preferredKind = production.kind === "video" ? "poster" : "image_result";
      const [asset] = await db.select({ id: contentProductionAssets.id }).from(contentProductionAssets).where(and(
        eq(contentProductionAssets.productionId, production.id),
        eq(contentProductionAssets.kind, preferredKind),
        isNull(contentProductionAssets.deletedAt),
      )).orderBy(desc(contentProductionAssets.createdAt)).limit(1);
      const settings = JSON.parse(production.settingsJson) as Record<string, unknown>;
      const packageId = productionPackages.get(production.id) ?? null;
      items.push({
        id: production.id,
        kind: production.kind,
        title: production.title,
        subtitle: production.kind === "video"
          ? `${String(settings.targetDuration ?? 45)}초 · ${String(settings.aspectRatio ?? "16:9")}`
          : `${String(settings.preset ?? "hero")} · ChatMock + Sharp`,
        status: production.status,
        href: `/content/productions/${production.id}/`,
        thumbnailUrl: asset ? `/api/content/assets/${asset.id}/file/` : null,
        updatedAt: production.updatedAt.toISOString(),
        packageId,
        packageTitle: packageId ? packageTitles.get(packageId) ?? null : null,
        group: "item",
      });
    }
  }
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 100);
}
