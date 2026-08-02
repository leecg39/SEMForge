import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  positionTrackingCampaigns,
  positionTrackingKeywordTags,
  positionTrackingTags,
  trackedKeywords,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { ctrForPosition } from "@/lib/analytics/metrics";
import { newId } from "@/lib/ids";
import { assertCan } from "@/lib/rbac";
import type { AuthContext } from "@/lib/session";

const DEFAULT_TAG_COLOR = "#235FE2";
const MAX_TAG_NAME_LENGTH = 30;
const HEX_COLOR = /^#[0-9A-F]{6}$/i;

export interface CampaignTagSummary {
  id: string;
  name: string;
  color: string;
  keywordIds: string[];
  keywordCount: number;
  rankedCount: number;
  averagePosition: number | null;
  top3: number;
  top10: number;
  top20: number;
  /** 그룹의 모든 키워드가 1위일 때 100인 순위 기반 가시성. */
  visibility: number | null;
}

export interface CampaignTagKeyword {
  id: string;
  keyword: string;
  position: number | null;
  tagIds: string[];
}

export interface CampaignTagWorkspace {
  campaignId: string;
  tags: CampaignTagSummary[];
  keywords: CampaignTagKeyword[];
}

export interface CreateCampaignTagInput {
  name: string;
  color?: string | null;
}

export interface UpdateCampaignTagInput {
  tagId: string;
  name?: string;
  color?: string | null;
  /** 전달되면 기존 연결 전체를 이 목록으로 교체한다. */
  keywordIds?: string[];
}

/** 비교용 태그 이름: 유니코드·대소문자·연속 공백을 하나로 정규화한다. */
export function normalizeTagName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function displayTagName(name: string): string {
  const display = name.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!display || display.length > MAX_TAG_NAME_LENGTH) {
    throw new ApiError("VALIDATION_ERROR", "태그 이름을 확인해 주세요.", {
      fields: { name: `1~${MAX_TAG_NAME_LENGTH}자로 입력해 주세요.` },
    });
  }
  return display;
}

function normalizeColor(color: string | null | undefined): string {
  const value = color?.trim() || DEFAULT_TAG_COLOR;
  if (!HEX_COLOR.test(value)) {
    throw new ApiError("VALIDATION_ERROR", "태그 색상을 확인해 주세요.", {
      fields: { color: "#RRGGBB 형식으로 입력해 주세요." },
    });
  }
  return value.toUpperCase();
}

function duplicateTagError(): ApiError {
  return new ApiError("DUPLICATE", "같은 이름의 태그가 이미 존재합니다.", {
    fields: { name: "이 캠페인에서 사용 중인 태그 이름입니다." },
  });
}

function isTagUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /UNIQUE constraint failed/i.test(message) &&
    /position_tracking_tags\.(?:campaign_id|normalized_name)/i.test(message)
  );
}

async function requireCampaign(auth: AuthContext, campaignId: string) {
  if (!campaignId || campaignId.trim() !== campaignId || campaignId.length > 200) {
    throw new ApiError("VALIDATION_ERROR", "캠페인 식별자를 확인해 주세요.", {
      fields: { campaignId: "공백 없이 1~200자로 입력해 주세요." },
    });
  }
  const [campaign] = await db
    .select({ id: positionTrackingCampaigns.id })
    .from(positionTrackingCampaigns)
    .where(
      and(
        eq(positionTrackingCampaigns.id, campaignId),
        eq(positionTrackingCampaigns.workspaceId, auth.workspaceId),
        isNull(positionTrackingCampaigns.deletedAt),
      ),
    )
    .limit(1);
  if (!campaign) {
    throw new ApiError("NOT_FOUND", "포지션 추적 캠페인을 찾을 수 없습니다.");
  }
  return campaign;
}

async function requireTag(auth: AuthContext, campaignId: string, tagId: string) {
  const [tag] = await db
    .select()
    .from(positionTrackingTags)
    .where(
      and(
        eq(positionTrackingTags.id, tagId),
        eq(positionTrackingTags.workspaceId, auth.workspaceId),
        eq(positionTrackingTags.campaignId, campaignId),
        isNull(positionTrackingTags.deletedAt),
      ),
    )
    .limit(1);
  if (!tag) throw new ApiError("NOT_FOUND", "태그를 찾을 수 없습니다.");
  return tag;
}

function round(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

/** 캠페인의 태그, 연결 가능한 키워드, 실제 순위 집계를 함께 반환한다. */
export async function loadCampaignTagWorkspace(
  auth: AuthContext,
  campaignId: string,
): Promise<CampaignTagWorkspace> {
  await requireCampaign(auth, campaignId);
  const [tagRows, keywordRows] = await Promise.all([
    db
      .select({
        id: positionTrackingTags.id,
        name: positionTrackingTags.name,
        color: positionTrackingTags.color,
      })
      .from(positionTrackingTags)
      .where(
        and(
          eq(positionTrackingTags.workspaceId, auth.workspaceId),
          eq(positionTrackingTags.campaignId, campaignId),
          isNull(positionTrackingTags.deletedAt),
        ),
      )
      .orderBy(asc(positionTrackingTags.name), asc(positionTrackingTags.id)),
    db
      .select({
        id: trackedKeywords.id,
        keyword: trackedKeywords.keyword,
        position: trackedKeywords.position,
      })
      .from(trackedKeywords)
      .where(
        and(
          eq(trackedKeywords.campaignId, campaignId),
          isNull(trackedKeywords.deletedAt),
        ),
      )
      .orderBy(asc(trackedKeywords.keyword), asc(trackedKeywords.id)),
  ]);

  const tagIds = tagRows.map((tag) => tag.id);
  const keywordIds = keywordRows.map((keyword) => keyword.id);
  const linkRows =
    tagIds.length > 0 && keywordIds.length > 0
      ? await db
          .select({
            tagId: positionTrackingKeywordTags.tagId,
            keywordId: positionTrackingKeywordTags.keywordId,
          })
          .from(positionTrackingKeywordTags)
          .where(
            and(
              inArray(positionTrackingKeywordTags.tagId, tagIds),
              inArray(positionTrackingKeywordTags.keywordId, keywordIds),
            ),
          )
      : [];

  const keywordById = new Map(keywordRows.map((keyword) => [keyword.id, keyword]));
  const keywordIdsByTag = new Map<string, string[]>();
  const tagIdsByKeyword = new Map<string, string[]>();
  for (const link of linkRows) {
    keywordIdsByTag.set(link.tagId, [
      ...(keywordIdsByTag.get(link.tagId) ?? []),
      link.keywordId,
    ]);
    tagIdsByKeyword.set(link.keywordId, [
      ...(tagIdsByKeyword.get(link.keywordId) ?? []),
      link.tagId,
    ]);
  }

  const tags = tagRows.map<CampaignTagSummary>((tag) => {
    const assignedIds = (keywordIdsByTag.get(tag.id) ?? []).toSorted();
    const assigned = assignedIds.flatMap((id) => {
      const keyword = keywordById.get(id);
      return keyword ? [keyword] : [];
    });
    const ranked = assigned.filter(
      (keyword): keyword is typeof keyword & { position: number } =>
        keyword.position !== null,
    );
    const keywordCount = assigned.length;
    const ctrSum = ranked.reduce(
      (sum, keyword) => sum + ctrForPosition(keyword.position),
      0,
    );
    return {
      id: tag.id,
      name: tag.name,
      color: tag.color ?? DEFAULT_TAG_COLOR,
      keywordIds: assignedIds,
      keywordCount,
      rankedCount: ranked.length,
      averagePosition:
        ranked.length === 0
          ? null
          : round(
              ranked.reduce((sum, keyword) => sum + keyword.position, 0) /
                ranked.length,
            ),
      top3: ranked.filter((keyword) => keyword.position <= 3).length,
      top10: ranked.filter((keyword) => keyword.position <= 10).length,
      top20: ranked.filter((keyword) => keyword.position <= 20).length,
      visibility:
        keywordCount === 0
          ? null
          : round((ctrSum / (keywordCount * ctrForPosition(1))) * 100),
    };
  });

  return {
    campaignId,
    tags,
    keywords: keywordRows.map((keyword) => ({
      ...keyword,
      tagIds: (tagIdsByKeyword.get(keyword.id) ?? []).toSorted(),
    })),
  };
}

/** 편집자 이상이 캠페인 태그를 만든다. */
export async function createCampaignTag(
  auth: AuthContext,
  campaignId: string,
  input: CreateCampaignTagInput,
): Promise<CampaignTagWorkspace> {
  assertCan(auth, "create");
  await requireCampaign(auth, campaignId);
  const name = displayTagName(input.name);
  const normalizedName = normalizeTagName(name);
  const color = normalizeColor(input.color);
  const [duplicate] = await db
    .select({ id: positionTrackingTags.id })
    .from(positionTrackingTags)
    .where(
      and(
        eq(positionTrackingTags.campaignId, campaignId),
        eq(positionTrackingTags.normalizedName, normalizedName),
        isNull(positionTrackingTags.deletedAt),
      ),
    )
    .limit(1);
  if (duplicate) throw duplicateTagError();

  try {
    await db.insert(positionTrackingTags).values({
      id: newId("ptt"),
      workspaceId: auth.workspaceId,
      campaignId,
      name,
      normalizedName,
      color,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    });
  } catch (error) {
    if (isTagUniqueConstraintError(error)) throw duplicateTagError();
    throw error;
  }
  return loadCampaignTagWorkspace(auth, campaignId);
}

/** 이름·색상 또는 키워드 연결 전체를 변경한다. */
export async function updateCampaignTag(
  auth: AuthContext,
  campaignId: string,
  input: UpdateCampaignTagInput,
): Promise<CampaignTagWorkspace> {
  assertCan(auth, "update");
  await requireCampaign(auth, campaignId);
  const current = await requireTag(auth, campaignId, input.tagId);
  const name = input.name === undefined ? current.name : displayTagName(input.name);
  const normalizedName = normalizeTagName(name);
  const color = input.color === undefined ? current.color : normalizeColor(input.color);
  const keywordIds = input.keywordIds
    ? [...new Set(input.keywordIds.map((id) => id.trim()).filter(Boolean))]
    : undefined;

  if (keywordIds) {
    const validKeywords =
      keywordIds.length === 0
        ? []
        : await db
            .select({ id: trackedKeywords.id })
            .from(trackedKeywords)
            .where(
              and(
                inArray(trackedKeywords.id, keywordIds),
                eq(trackedKeywords.campaignId, campaignId),
                isNull(trackedKeywords.deletedAt),
              ),
            );
    if (validKeywords.length !== keywordIds.length) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "이 캠페인에 속하지 않은 키워드는 태그에 연결할 수 없습니다.",
        { fields: { keywordIds: "현재 캠페인의 활성 키워드만 선택해 주세요." } },
      );
    }
  }

  try {
    db.transaction((tx) => {
      tx.update(positionTrackingTags)
        .set({
          name,
          normalizedName,
          color: color ?? DEFAULT_TAG_COLOR,
          updatedAt: new Date(),
          updatedBy: auth.userId,
          version: sql`${positionTrackingTags.version} + 1`,
        })
        .where(eq(positionTrackingTags.id, input.tagId))
        .run();

      if (keywordIds !== undefined) {
        tx.delete(positionTrackingKeywordTags)
          .where(eq(positionTrackingKeywordTags.tagId, input.tagId))
          .run();
        if (keywordIds.length > 0) {
          tx.insert(positionTrackingKeywordTags)
            .values(
              keywordIds.map((keywordId) => ({
                id: newId("ptk"),
                tagId: input.tagId,
                keywordId,
              })),
            )
            .run();
        }
      }
    });
  } catch (error) {
    if (isTagUniqueConstraintError(error)) throw duplicateTagError();
    throw error;
  }
  return loadCampaignTagWorkspace(auth, campaignId);
}

/** 태그를 소프트 삭제하고 연결 행은 즉시 제거한다. */
export async function deleteCampaignTag(
  auth: AuthContext,
  campaignId: string,
  tagId: string,
): Promise<CampaignTagWorkspace> {
  assertCan(auth, "delete");
  await requireCampaign(auth, campaignId);
  await requireTag(auth, campaignId, tagId);
  const deletedAt = new Date();
  db.transaction((tx) => {
    tx.delete(positionTrackingKeywordTags)
      .where(eq(positionTrackingKeywordTags.tagId, tagId))
      .run();
    tx.update(positionTrackingTags)
      .set({
        deletedAt,
        deletedBy: auth.userId,
        updatedAt: deletedAt,
        updatedBy: auth.userId,
        version: sql`${positionTrackingTags.version} + 1`,
      })
      .where(eq(positionTrackingTags.id, tagId))
      .run();
  });
  return loadCampaignTagWorkspace(auth, campaignId);
}
