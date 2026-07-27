import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "@/db/client";
import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { RESOURCES, TRASHABLE_KEYS } from "@/server/resources";

/**
 * 휴지통 통합 목록 (P — 원본에는 존재하지 않는 화면).
 * 리소스별 소프트 삭제 행을 모아 삭제 시각 역순으로 반환한다.
 */
export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");

  const url = new URL(request.url);
  const only = url.searchParams.get("type");
  const keys = only && TRASHABLE_KEYS.includes(only) ? [only] : TRASHABLE_KEYS;

  const items: Record<string, unknown>[] = [];
  for (const key of keys) {
    const cfg = RESOURCES[key];
    if (!cfg) continue;
    const cols = cfg.table as unknown as Record<string, SQLiteColumn>;
    if (!cols.deletedAt) continue;

    const rows = await db
      .select({
        id: cols.id,
        label: cols[cfg.labelField],
        deletedAt: cols.deletedAt,
        deletedBy: cols.deletedBy,
        createdBy: cols.createdBy,
      })
      .from(cfg.table)
      .where(and(eq(cols.workspaceId, auth.workspaceId), isNotNull(cols.deletedAt)))
      .orderBy(desc(cols.deletedAt))
      .limit(200);

    for (const row of rows) {
      items.push({ ...row, resource: key, resourceLabel: cfg.label });
    }
  }

  items.sort((a, b) => {
    const at = a.deletedAt instanceof Date ? a.deletedAt.getTime() : 0;
    const bt = b.deletedAt instanceof Date ? b.deletedAt.getTime() : 0;
    return bt - at;
  });

  const counts = Object.fromEntries(
    TRASHABLE_KEYS.map((key) => [
      key,
      items.filter((i) => i.resource === key).length,
    ])
  );

  return jsonOk(items, { meta: { counts, total: items.length } });
});
