// @TASK NAVER-KI-SAVE-01 - 탐색 키워드 목록 저장
// @SPEC user-approved-plan#3-d-authenticated-features
// @TEST src/server/naver-keywords/save.test.ts
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { keywordListItems, keywordLists } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import type { AuthContext } from "@/lib/session";
import { KeywordInputError, normalizeKeyword } from "@/server/naver-keywords/normalization";

export type SavedKeywordIntent =
  | "informational"
  | "navigational"
  | "commercial"
  | "transactional";

export interface SaveNaverKeywordInput {
  keyword: string;
  snapshotId?: string;
  volume?: number;
  intent?: SavedKeywordIntent;
}

export interface SaveNaverKeywordsRequest {
  listId: string;
  items: SaveNaverKeywordInput[];
}

function validatedItems(items: readonly SaveNaverKeywordInput[]): SaveNaverKeywordInput[] {
  if (items.length < 1 || items.length > 100) {
    throw new ApiError("VALIDATION_ERROR", "저장할 키워드는 1~100개여야 합니다.", {
      fields: { items: "키워드를 1~100개 선택해 주세요." },
    });
  }
  const unique = new Map<string, SaveNaverKeywordInput>();
  for (const item of items) {
    let keyword: string;
    try {
      keyword = normalizeKeyword(item.keyword);
    } catch (error) {
      if (error instanceof KeywordInputError) {
        throw new ApiError("VALIDATION_ERROR", error.message, {
          fields: { items: error.message },
        });
      }
      throw error;
    }
    if (item.volume !== undefined && (!Number.isSafeInteger(item.volume) || item.volume < 0)) {
      throw new ApiError("VALIDATION_ERROR", "검색량은 0 이상의 정수여야 합니다.", {
        fields: { items: "검색량을 확인해 주세요." },
      });
    }
    const key = keyword.toLocaleLowerCase("ko-KR");
    if (!unique.has(key)) unique.set(key, { ...item, keyword });
  }
  return [...unique.values()];
}

export async function saveNaverKeywordsToList(
  auth: AuthContext,
  input: SaveNaverKeywordsRequest,
): Promise<{ saved: number; skipped: number }> {
  const listId = input.listId.trim();
  if (!listId) {
    throw new ApiError("VALIDATION_ERROR", "키워드 목록을 선택해 주세요.", {
      fields: { listId: "키워드 목록을 선택해 주세요." },
    });
  }
  const [list] = await db.select({ id: keywordLists.id, name: keywordLists.name })
    .from(keywordLists)
    .where(and(
      eq(keywordLists.id, listId),
      eq(keywordLists.workspaceId, auth.workspaceId),
      isNull(keywordLists.deletedAt),
    ))
    .limit(1);
  if (!list) throw new ApiError("NOT_FOUND", "키워드 목록을 찾을 수 없습니다.");

  const normalized = validatedItems(input.items);
  const existingRows = await db.select({ keyword: keywordListItems.keyword })
    .from(keywordListItems)
    .where(and(
      eq(keywordListItems.listId, listId),
      isNull(keywordListItems.deletedAt),
    ));
  const existing = new Set(
    existingRows.map((row) => row.keyword.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ko-KR")),
  );
  const pending = normalized.filter((item) => !existing.has(item.keyword.toLocaleLowerCase("ko-KR")));
  const now = new Date();
  const inserted = pending.length === 0
    ? []
    : await db.insert(keywordListItems).values(pending.map((item) => ({
      id: newId("kli"),
      listId,
      keyword: item.keyword,
      volume: item.volume ?? null,
      intent: item.intent ?? null,
      provider: "naver-search-ads",
      sourceSnapshotId: item.snapshotId?.trim() || null,
      measurement: "absolute" as const,
      createdAt: now,
      updatedAt: now,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    }))).onConflictDoNothing().returning({ id: keywordListItems.id });

  const result = { saved: inserted.length, skipped: input.items.length - inserted.length };
  writeAudit(auth, {
    action: "bulk_update",
    entityType: "keyword-lists",
    entityId: list.id,
    entityLabel: list.name,
    after: { source: "naver-search-ads", ...result },
  });
  return result;
}
