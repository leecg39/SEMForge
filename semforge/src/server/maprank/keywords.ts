import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { mapRankKeywords } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId } from "@/lib/ids";
import type { AuthContext } from "@/lib/session";

function normalizeKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

/** 지도 순위 추적 키워드 목록. */
export async function listMapRankKeywords(auth: AuthContext) {
  return db
    .select()
    .from(mapRankKeywords)
    .where(and(eq(mapRankKeywords.workspaceId, auth.workspaceId), isNull(mapRankKeywords.deletedAt)))
    .orderBy(desc(mapRankKeywords.createdAt));
}

/** 추적 키워드 추가. 같은 사업체+키워드+국가 조합은 409. */
export async function addMapRankKeyword(
  auth: AuthContext,
  input: { businessName: string; keyword: string; locationText?: string; countryCode?: string }
) {
  const businessName = input.businessName.trim();
  const keyword = input.keyword.trim().replace(/\s+/g, " ");
  if (!businessName) {
    throw new ApiError("VALIDATION_ERROR", "사업체명을 입력해 주세요.", {
      fields: { businessName: "로컬팩에 표시되는 사업체명" },
    });
  }
  if (!keyword) {
    throw new ApiError("VALIDATION_ERROR", "추적할 키워드를 입력해 주세요.", {
      fields: { keyword: "예: 강남 카페, 서울 치과" },
    });
  }
  const countryCode = (input.countryCode ?? "KR").toUpperCase();

  const [duplicate] = await db
    .select({ id: mapRankKeywords.id })
    .from(mapRankKeywords)
    .where(
      and(
        eq(mapRankKeywords.workspaceId, auth.workspaceId),
        eq(mapRankKeywords.businessName, businessName),
        eq(mapRankKeywords.normalizedKeyword, normalizeKeyword(keyword)),
        eq(mapRankKeywords.countryCode, countryCode),
        isNull(mapRankKeywords.deletedAt)
      )
    )
    .limit(1);
  if (duplicate) {
    throw new ApiError("DUPLICATE", "이미 추적 중인 키워드입니다.", {
      fields: { keyword: "이미 추적 중인 키워드입니다." },
    });
  }

  const [row] = await db
    .insert(mapRankKeywords)
    .values({
      id: newId("mrk"),
      workspaceId: auth.workspaceId,
      businessName,
      keyword,
      normalizedKeyword: normalizeKeyword(keyword),
      locationText: input.locationText?.trim() ?? "",
      countryCode,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    })
    .returning();
  return row;
}

/** 추적 키워드 삭제 (소프트 삭제). */
export async function removeMapRankKeyword(auth: AuthContext, keywordId: string) {
  const [row] = await db
    .select({ id: mapRankKeywords.id })
    .from(mapRankKeywords)
    .where(
      and(
        eq(mapRankKeywords.id, keywordId),
        eq(mapRankKeywords.workspaceId, auth.workspaceId),
        isNull(mapRankKeywords.deletedAt)
      )
    )
    .limit(1);
  if (!row) {
    throw new ApiError("NOT_FOUND", "추적 키워드를 찾을 수 없습니다.");
  }
  await db
    .update(mapRankKeywords)
    .set({ deletedAt: new Date(), deletedBy: auth.userId })
    .where(eq(mapRankKeywords.id, keywordId));
  return { id: keywordId, deleted: true };
}
