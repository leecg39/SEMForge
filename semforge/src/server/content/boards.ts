import { and, desc, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  contentArticles,
  contentBoards,
  contentMessages,
  contentRuns,
  folders,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { assertCan, assertOwnershipOrAdmin } from "@/lib/rbac";
import type { AuthContext } from "@/lib/session";
import type { ContentAiProfile, ContentIntent } from "@/server/content/contracts";

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function parsePayload(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function boardTitle(prompt: string): string {
  const firstLine = prompt.split(/\r?\n/u)[0].replace(/\s+/g, " ").trim();
  return firstLine.length <= 72 ? firstLine : `${firstLine.slice(0, 69).trim()}…`;
}

async function requireFolder(auth: AuthContext, folderId: string | null | undefined) {
  if (!folderId) return null;
  const [folder] = await db
    .select({ id: folders.id, name: folders.name })
    .from(folders)
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.workspaceId, auth.workspaceId),
        isNull(folders.deletedAt),
      ),
    )
    .limit(1);
  if (!folder) throw new ApiError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  return folder;
}

export async function requireContentBoard(auth: AuthContext, boardId: string) {
  const [board] = await db
    .select()
    .from(contentBoards)
    .where(
      and(
        eq(contentBoards.id, boardId),
        eq(contentBoards.workspaceId, auth.workspaceId),
        isNull(contentBoards.deletedAt),
      ),
    )
    .limit(1);
  if (!board) throw new ApiError("NOT_FOUND", "콘텐츠 작업판을 찾을 수 없습니다.");
  return board;
}

export async function createContentBoard(
  auth: AuthContext,
  input: {
    prompt: string;
    folderId?: string | null;
    intent: ContentIntent;
    aiProfile: ContentAiProfile;
  },
) {
  assertCan(auth, "create");
  const folder = await requireFolder(auth, input.folderId);
  const boardId = newId("ctb");
  const messageId = newId("ctm");
  const now = new Date();
  const title = boardTitle(input.prompt);

  db.transaction((tx) => {
    tx.insert(contentBoards).values({
      id: boardId,
      workspaceId: auth.workspaceId,
      folderId: folder?.id ?? null,
      title,
      intent: input.intent,
      status: "active",
      createdAt: now,
      updatedAt: now,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    }).run();
    tx.insert(contentMessages).values({
      id: messageId,
      workspaceId: auth.workspaceId,
      boardId,
      role: "user",
      kind: "text",
      body: input.prompt,
      payloadJson: JSON.stringify({ aiProfile: input.aiProfile }),
      createdAt: now,
      updatedAt: now,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    }).run();
  });
  writeAudit(auth, {
    action: "create",
    entityType: "content_boards",
    entityId: boardId,
    entityLabel: title,
    after: { folderId: folder?.id ?? null, intent: input.intent, title, aiProfile: input.aiProfile },
  });
  return getContentBoard(auth, boardId);
}

export async function listContentBoards(auth: AuthContext, request: Request) {
  assertCan(auth, "read");
  const url = new URL(request.url);
  const statuses = url.searchParams
    .getAll("status")
    .filter((value): value is "active" | "completed" | "failed" | "archived" =>
      ["active", "completed", "failed", "archived"].includes(value),
    );
  const folderId = url.searchParams.get("folderId");
  const query = url.searchParams.get("q")?.trim();
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 40));
  const conditions = [
    eq(contentBoards.workspaceId, auth.workspaceId),
    isNull(contentBoards.deletedAt),
    ...(statuses.length ? [inArray(contentBoards.status, statuses)] : []),
    ...(folderId ? [eq(contentBoards.folderId, folderId)] : []),
    ...(query ? [like(contentBoards.title, `%${query.replace(/[\\%_]/g, "\\$&")}%`)] : []),
  ];
  const boards = await db
    .select({
      id: contentBoards.id,
      folderId: contentBoards.folderId,
      folderName: folders.name,
      title: contentBoards.title,
      intent: contentBoards.intent,
      status: contentBoards.status,
      version: contentBoards.version,
      updatedAt: contentBoards.updatedAt,
      createdAt: contentBoards.createdAt,
    })
    .from(contentBoards)
    .leftJoin(folders, eq(folders.id, contentBoards.folderId))
    .where(and(...conditions))
    .orderBy(desc(contentBoards.updatedAt))
    .limit(limit);

  const ids = boards.map((board) => board.id);
  const runRows = ids.length
    ? await db
        .select({
          id: contentRuns.id,
          boardId: contentRuns.boardId,
          status: contentRuns.status,
          stage: contentRuns.stage,
          errorJson: contentRuns.errorJson,
          updatedAt: contentRuns.updatedAt,
        })
        .from(contentRuns)
        .where(and(inArray(contentRuns.boardId, ids), eq(contentRuns.workspaceId, auth.workspaceId)))
        .orderBy(desc(contentRuns.createdAt))
    : [];
  const latestRuns = new Map<string, (typeof runRows)[number]>();
  for (const run of runRows) if (!latestRuns.has(run.boardId)) latestRuns.set(run.boardId, run);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(contentBoards)
    .where(and(...conditions));

  return {
    data: boards.map((board) => {
      const run = latestRuns.get(board.id);
      return {
        ...board,
        createdAt: board.createdAt.toISOString(),
        updatedAt: board.updatedAt.toISOString(),
        latestRun: run
          ? {
              id: run.id,
              status: run.status,
              stage: run.stage,
              error: parsePayload(run.errorJson),
              updatedAt: run.updatedAt.toISOString(),
            }
          : null,
      };
    }),
    meta: { total: Number(total) },
  };
}

export async function getContentBoard(auth: AuthContext, boardId: string) {
  assertCan(auth, "read");
  const board = await requireContentBoard(auth, boardId);
  const [folder, messages, runs, articles] = await Promise.all([
    board.folderId
      ? db.select({ id: folders.id, name: folders.name }).from(folders).where(eq(folders.id, board.folderId)).limit(1)
      : Promise.resolve([]),
    db.select().from(contentMessages).where(
      and(
        eq(contentMessages.boardId, board.id),
        eq(contentMessages.workspaceId, auth.workspaceId),
        isNull(contentMessages.deletedAt),
      ),
    ).orderBy(contentMessages.createdAt),
    db.select().from(contentRuns).where(
      and(eq(contentRuns.boardId, board.id), eq(contentRuns.workspaceId, auth.workspaceId)),
    ).orderBy(desc(contentRuns.createdAt)),
    db.select().from(contentArticles).where(
      and(
        eq(contentArticles.boardId, board.id),
        eq(contentArticles.workspaceId, auth.workspaceId),
        isNull(contentArticles.deletedAt),
      ),
    ).orderBy(desc(contentArticles.updatedAt)),
  ]);
  return {
    id: board.id,
    folderId: board.folderId,
    folderName: folder[0]?.name ?? null,
    title: board.title,
    intent: board.intent,
    status: board.status,
    version: board.version,
    createdAt: board.createdAt.toISOString(),
    updatedAt: board.updatedAt.toISOString(),
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      kind: message.kind,
      body: message.body,
      payload: parsePayload(message.payloadJson),
      createdAt: message.createdAt.toISOString(),
    })),
    runs: runs.map((run) => ({
      id: run.id,
      boardId: run.boardId,
      articleId: run.articleId,
      intent: run.intent,
      status: run.status,
      stage: run.stage,
      processing: Boolean(
        run.leaseToken
        && run.leaseExpiresAt
        && run.leaseExpiresAt.getTime() > Date.now(),
      ),
      input: parsePayload(run.inputJson),
      provenance: parsePayload(run.provenanceJson),
      output: parsePayload(run.outputJson),
      error: parsePayload(run.errorJson),
      startedAt: toIso(run.startedAt),
      completedAt: toIso(run.completedAt),
      cancelledAt: toIso(run.cancelledAt),
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    })),
    articles: articles.map((article) => ({
      ...article,
      createdAt: article.createdAt.toISOString(),
      updatedAt: article.updatedAt.toISOString(),
      publishedAt: toIso(article.publishedAt),
      deletedAt: toIso(article.deletedAt),
    })),
  };
}

export async function updateContentBoard(
  auth: AuthContext,
  boardId: string,
  input: { title?: string; status?: "active" | "completed" | "failed" | "archived"; version: number },
) {
  assertCan(auth, "update");
  const before = await requireContentBoard(auth, boardId);
  assertOwnershipOrAdmin(auth, before);
  const [updated] = await db
    .update(contentBoards)
    .set({
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.status === undefined ? {} : { status: input.status }),
      updatedAt: new Date(),
      updatedBy: auth.userId,
      version: sql`${contentBoards.version} + 1`,
    })
    .where(and(eq(contentBoards.id, boardId), eq(contentBoards.version, input.version)))
    .returning();
  if (!updated) {
    throw new ApiError("VERSION_CONFLICT", "작업판이 다른 곳에서 수정되었습니다. 새로고침해 주세요.");
  }
  writeAudit(auth, {
    action: "update",
    entityType: "content_boards",
    entityId: boardId,
    entityLabel: updated.title,
    before,
    after: updated,
  });
  return getContentBoard(auth, boardId);
}

export async function appendContentMessage(
  auth: AuthContext,
  boardId: string,
  input: {
    role: "user" | "assistant";
    kind: "text" | "requirements";
    body: string;
    payload?: Record<string, unknown> | null;
  },
) {
  assertCan(auth, "update");
  const board = await requireContentBoard(auth, boardId);
  assertOwnershipOrAdmin(auth, board);
  const now = new Date();
  const [message] = await db.insert(contentMessages).values({
    id: newId("ctm"),
    workspaceId: auth.workspaceId,
    boardId,
    role: input.role,
    kind: input.kind,
    body: input.body,
    payloadJson: input.payload ? JSON.stringify(input.payload) : null,
    createdAt: now,
    updatedAt: now,
    createdBy: auth.userId,
    updatedBy: auth.userId,
  }).returning();
  await db.update(contentBoards).set({ updatedAt: now, updatedBy: auth.userId }).where(eq(contentBoards.id, boardId));
  return {
    id: message.id,
    role: message.role,
    kind: message.kind,
    body: message.body,
    payload: parsePayload(message.payloadJson),
    createdAt: message.createdAt.toISOString(),
  };
}
