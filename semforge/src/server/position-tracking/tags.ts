import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { trackedKeywords } from "@/db/schema";
import { ApiError } from "@/lib/api";
import type { AuthContext } from "@/lib/session";
import { requireCampaign } from "@/server/position-tracking/insights";

/**
 * 키워드 태그 일괄 편집.
 * 태그는 tracked_keywords.tags(JSON 문자열 배열)에 저장되는 사용자 입력
 * 메타데이터다 — 수집 데이터가 아니므로 provenance 대상이 아니다.
 */

const MAX_TAG_LENGTH = 40;
const MAX_TAGS_PER_KEYWORD = 20;

/** 공백 정리 + 소문자 통일. 원본도 대소문자 무시로 태그를 묶는다. */
export function normalizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

export interface UpdateTagsInput {
  keywordIds: string[];
  /** 선택 키워드에 추가할 태그 */
  add: string[];
  /** 선택 키워드에서 제거할 태그 */
  remove: string[];
}

export interface UpdateTagsResult {
  updated: number;
}

/** 선택한 키워드들에 태그를 추가/제거한다. 캠페인 소유권을 강제한다. */
export async function updateKeywordTags(
  auth: AuthContext,
  campaignId: string,
  input: UpdateTagsInput
): Promise<UpdateTagsResult> {
  await requireCampaign(auth, campaignId);

  const add = [...new Set(input.add.map(normalizeTag).filter(Boolean))];
  const remove = new Set(input.remove.map(normalizeTag).filter(Boolean));
  if (add.some((tag) => tag.length > MAX_TAG_LENGTH)) {
    throw new ApiError("VALIDATION_ERROR", `태그는 ${MAX_TAG_LENGTH}자 이하여야 합니다.`);
  }
  if (input.keywordIds.length === 0 || (add.length === 0 && remove.size === 0)) {
    return { updated: 0 };
  }

  const rows = await db
    .select({ id: trackedKeywords.id, tags: trackedKeywords.tags })
    .from(trackedKeywords)
    .where(
      and(
        eq(trackedKeywords.campaignId, campaignId),
        inArray(trackedKeywords.id, input.keywordIds),
        isNull(trackedKeywords.deletedAt)
      )
    );

  let updated = 0;
  for (const row of rows) {
    const current = parseTags(row.tags);
    const next = [
      ...new Set([...current.filter((tag) => !remove.has(normalizeTag(tag))), ...add]),
    ].slice(0, MAX_TAGS_PER_KEYWORD);
    if (JSON.stringify(next) === JSON.stringify(current)) continue;
    await db
      .update(trackedKeywords)
      .set({ tags: JSON.stringify(next), updatedBy: auth.userId })
      .where(eq(trackedKeywords.id, row.id));
    updated += 1;
  }
  return { updated };
}
