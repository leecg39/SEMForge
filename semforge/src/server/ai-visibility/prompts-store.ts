import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { aiVisibilityPrompts, type AiPromptIntent } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { newId } from "@/lib/ids";
import { can } from "@/lib/rbac";
import type { AuthContext } from "@/lib/session";

export interface CreatePromptInput {
  domain: string;
  prompt: string;
  topic?: string | null;
  intent?: AiPromptIntent | null;
  countryCode?: string;
  locale?: string;
}

/** 프롬프트 비교용 텍스트를 소문자와 단일 공백으로 정규화한다. */
export function normalizePrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ").toLowerCase();
}

function duplicateError(): ApiError {
  return new ApiError("DUPLICATE", "이미 등록된 프롬프트입니다.", {
    fields: { prompt: "같은 도메인, 국가, 언어에 이미 등록된 프롬프트입니다." },
  });
}

function isPromptUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /UNIQUE constraint failed/i.test(message) &&
    /ai_visibility_prompts\.(?:workspace_id|normalized_prompt)/i.test(message)
  );
}

/** 워크스페이스의 활성 AI 가시성 프롬프트 목록을 반환한다. */
export async function listPrompts(auth: AuthContext, domain?: string) {
  const normalizedDomain = domain ? normalizeDomain(domain) : "";
  const conditions = [
    eq(aiVisibilityPrompts.workspaceId, auth.workspaceId),
    isNull(aiVisibilityPrompts.deletedAt),
    ...(normalizedDomain ? [eq(aiVisibilityPrompts.domain, normalizedDomain)] : []),
  ];

  return db
    .select()
    .from(aiVisibilityPrompts)
    .where(and(...conditions))
    .orderBy(desc(aiVisibilityPrompts.createdAt));
}

/** AI 답변을 관측할 프롬프트를 추가한다. 활성 중복 조합은 409 로 거부한다. */
export async function createPrompt(auth: AuthContext, input: CreatePromptInput) {
  const domain = normalizeDomain(input.domain);
  if (!domain || !domain.includes(".")) {
    throw new ApiError("VALIDATION_ERROR", "유효한 도메인을 입력해 주세요.", {
      fields: { domain: "예: example.com" },
    });
  }

  const prompt = input.prompt.trim().replace(/\s+/g, " ");
  if (!prompt) {
    throw new ApiError("VALIDATION_ERROR", "관측할 프롬프트를 입력해 주세요.", {
      fields: { prompt: "자연어 질문을 입력해 주세요." },
    });
  }

  const normalizedPrompt = normalizePrompt(prompt);
  const countryCode = (input.countryCode ?? "KR").trim().toUpperCase();
  const locale = (input.locale ?? "ko").trim().toLowerCase();
  const [duplicate] = await db
    .select({ id: aiVisibilityPrompts.id })
    .from(aiVisibilityPrompts)
    .where(
      and(
        eq(aiVisibilityPrompts.workspaceId, auth.workspaceId),
        eq(aiVisibilityPrompts.domain, domain),
        eq(aiVisibilityPrompts.normalizedPrompt, normalizedPrompt),
        eq(aiVisibilityPrompts.countryCode, countryCode),
        eq(aiVisibilityPrompts.locale, locale),
        isNull(aiVisibilityPrompts.deletedAt),
      ),
    )
    .limit(1);
  if (duplicate) throw duplicateError();

  try {
    const [row] = await db
      .insert(aiVisibilityPrompts)
      .values({
        id: newId("avp"),
        workspaceId: auth.workspaceId,
        domain,
        prompt,
        normalizedPrompt,
        topic: input.topic?.trim() || null,
        intent: input.intent ?? null,
        countryCode,
        locale,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      })
      .returning();
    return row;
  } catch (error) {
    if (isPromptUniqueConstraintError(error)) throw duplicateError();
    throw error;
  }
}

/** 실과금 정기 수집 대상 여부를 편집자 이상만 변경한다. */
export async function setPromptTracked(
  auth: AuthContext,
  promptId: string,
  tracked: boolean,
) {
  if (!can(auth.role, "update")) {
    throw new ApiError("FORBIDDEN", "프롬프트 추적 여부를 변경할 권한이 없습니다.");
  }

  const [row] = await db
    .update(aiVisibilityPrompts)
    .set({
      tracked,
      updatedAt: new Date(),
      updatedBy: auth.userId,
      version: sql`${aiVisibilityPrompts.version} + 1`,
    })
    .where(
      and(
        eq(aiVisibilityPrompts.id, promptId),
        eq(aiVisibilityPrompts.workspaceId, auth.workspaceId),
        isNull(aiVisibilityPrompts.deletedAt),
      ),
    )
    .returning();
  if (!row) {
    throw new ApiError("NOT_FOUND", "프롬프트를 찾을 수 없습니다.");
  }
  return row;
}

/** 워크스페이스의 활성 프롬프트를 소프트 삭제한다. */
export async function softDeletePrompt(auth: AuthContext, promptId: string) {
  const deletedAt = new Date();
  const [row] = await db
    .update(aiVisibilityPrompts)
    .set({
      deletedAt,
      deletedBy: auth.userId,
      updatedAt: deletedAt,
      updatedBy: auth.userId,
      version: sql`${aiVisibilityPrompts.version} + 1`,
    })
    .where(
      and(
        eq(aiVisibilityPrompts.id, promptId),
        eq(aiVisibilityPrompts.workspaceId, auth.workspaceId),
        isNull(aiVisibilityPrompts.deletedAt),
      ),
    )
    .returning({ id: aiVisibilityPrompts.id });
  if (!row) {
    throw new ApiError("NOT_FOUND", "프롬프트를 찾을 수 없습니다.");
  }
  return { id: row.id, deleted: true };
}
