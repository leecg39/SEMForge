import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { aiVisibilityQueries } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { newId } from "@/lib/ids";
import type { AuthContext } from "@/lib/session";

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

/** 워크스페이스의 AI 가시성 추적 쿼리 목록 (도메인 필터 선택). */
export async function listAiVisibilityQueries(auth: AuthContext, domain?: string) {
  const conditions = [
    eq(aiVisibilityQueries.workspaceId, auth.workspaceId),
    isNull(aiVisibilityQueries.deletedAt),
  ];
  const normalized = domain ? normalizeDomain(domain) : null;
  if (normalized) conditions.push(eq(aiVisibilityQueries.domain, normalized));

  return db
    .select()
    .from(aiVisibilityQueries)
    .where(and(...conditions))
    .orderBy(desc(aiVisibilityQueries.createdAt));
}

/** 추적 쿼리 추가. 같은 도메인+쿼리+국가+기기 조합은 409. */
export async function addAiVisibilityQuery(
  auth: AuthContext,
  input: {
    domain: string;
    query: string;
    countryCode?: string;
    device?: "desktop" | "mobile";
  }
) {
  const domain = normalizeDomain(input.domain);
  if (!domain || !domain.includes(".")) {
    throw new ApiError("VALIDATION_ERROR", "유효한 도메인을 입력해 주세요.", {
      fields: { domain: "예: example.com" },
    });
  }
  const query = input.query.trim().replace(/\s+/g, " ");
  if (!query) {
    throw new ApiError("VALIDATION_ERROR", "추적할 쿼리를 입력해 주세요.", {
      fields: { query: "예: 브랜드명, 제품 관련 질문" },
    });
  }

  const [duplicate] = await db
    .select({ id: aiVisibilityQueries.id })
    .from(aiVisibilityQueries)
    .where(
      and(
        eq(aiVisibilityQueries.workspaceId, auth.workspaceId),
        eq(aiVisibilityQueries.domain, domain),
        eq(aiVisibilityQueries.normalizedQuery, normalizeQuery(query)),
        eq(aiVisibilityQueries.countryCode, (input.countryCode ?? "KR").toUpperCase()),
        eq(aiVisibilityQueries.device, input.device ?? "desktop"),
        isNull(aiVisibilityQueries.deletedAt)
      )
    )
    .limit(1);
  if (duplicate) {
    throw new ApiError("DUPLICATE", "이미 추적 중인 쿼리입니다.", {
      fields: { query: "이미 추적 중인 쿼리입니다." },
    });
  }

  const [row] = await db
    .insert(aiVisibilityQueries)
    .values({
      id: newId("avq"),
      workspaceId: auth.workspaceId,
      domain,
      query,
      normalizedQuery: normalizeQuery(query),
      countryCode: (input.countryCode ?? "KR").toUpperCase(),
      device: input.device ?? "desktop",
      createdBy: auth.userId,
      updatedBy: auth.userId,
    })
    .returning();
  return row;
}

/** 추적 쿼리 삭제 (소프트 삭제). */
export async function removeAiVisibilityQuery(auth: AuthContext, queryId: string) {
  const [row] = await db
    .select()
    .from(aiVisibilityQueries)
    .where(
      and(
        eq(aiVisibilityQueries.id, queryId),
        eq(aiVisibilityQueries.workspaceId, auth.workspaceId),
        isNull(aiVisibilityQueries.deletedAt)
      )
    )
    .limit(1);
  if (!row) {
    throw new ApiError("NOT_FOUND", "추적 쿼리를 찾을 수 없습니다.");
  }
  await db
    .update(aiVisibilityQueries)
    .set({ deletedAt: new Date(), deletedBy: auth.userId })
    .where(eq(aiVisibilityQueries.id, queryId));
  return { id: queryId, deleted: true };
}
