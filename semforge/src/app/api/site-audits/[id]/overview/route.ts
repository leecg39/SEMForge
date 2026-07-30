import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { getSiteAuditOverview } from "@/server/siteaudit/overview";

type Ctx = { params: Promise<{ id: string }> };

/** 개요 대시보드용 집계(게이지/수치/상위 이슈/테마별 점수/통계)를 한 번에 반환한다. */
export const GET = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  const { id } = await context.params;
  const overview = await getSiteAuditOverview(auth, id);
  return jsonOk(overview);
});
