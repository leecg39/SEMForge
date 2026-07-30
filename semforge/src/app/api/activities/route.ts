import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { authEvents } from "@/db/schema";
import { jsonOk, route } from "@/lib/api";
import { listMeta, parseListQuery } from "@/lib/list-query";
import { requireAuth } from "@/lib/session";

/**
 * 인증 활동 로그.
 * 원본 `/accounts/activities/` 의 컬럼 구성(날짜 및 시간 / 이벤트 유형 / IP / 국가 / 사용자 에이전트)을
 * 그대로 재현한다. (증거 O)
 */
export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const query = parseListQuery(request, {
    sortableFields: ["occurredAt", "eventType"],
    defaultSort: "occurredAt:desc",
    defaultPageSize: 20,
  });

  const where = eq(authEvents.userId, auth.userId);
  const rows = await db
    .select()
    .from(authEvents)
    .where(where)
    .orderBy(desc(authEvents.occurredAt))
    .limit(query.pageSize)
    .offset(query.offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(authEvents)
    .where(where);

  return jsonOk(rows, { meta: listMeta(query, Number(total)) });
});
