import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { jsonOk, route } from "@/lib/api";
import { likePattern, listMeta, parseListQuery } from "@/lib/list-query";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";

/**
 * 엔티티 감사 로그 (P).
 * 원본 Semrush 활동 로그는 인증 이벤트 전용이므로(증거 O), 변경 추적은 이 화면으로 분리했다.
 * 관리자 이상만 조회할 수 있다.
 */
export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "viewAudit");

  const query = parseListQuery(request, {
    sortableFields: ["createdAt", "action", "entityType"],
    defaultSort: "createdAt:desc",
    filterableFields: ["action", "entityType"],
  });

  const conds: SQL[] = [eq(auditLogs.workspaceId, auth.workspaceId)];
  if (query.q) {
    const pattern = likePattern(query.q);
    const combined = or(
      like(auditLogs.entityLabel, pattern),
      like(auditLogs.actorEmail, pattern)
    );
    if (combined) conds.push(combined);
  }
  if (query.filters.action?.length) {
    conds.push(inArray(auditLogs.action, query.filters.action as never[]));
  }
  if (query.filters.entityType?.length) {
    conds.push(inArray(auditLogs.entityType, query.filters.entityType));
  }

  const where = and(...conds);
  const rows = await db
    .select()
    .from(auditLogs)
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(query.pageSize)
    .offset(query.offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(auditLogs)
    .where(where);

  return jsonOk(rows, { meta: listMeta(query, Number(total)) });
});
