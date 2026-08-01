import { after } from "next/server";
import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { ensureSiteAuditDueJob } from "@/server/siteaudit/due";
import { enqueueSiteAuditRun, executeSiteAuditRun } from "@/server/siteaudit/run";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 실행을 DB 큐에 먼저 저장하고 202를 반환한다. 실제 크롤은 응답 이후 `after()`에서
 * 수행되므로 브라우저 연결이 긴 크롤의 생명주기를 붙잡지 않는다. 유실된 queued 실행은
 * /api/cron/run-due 의 site_audit 복구 경로가 회수한다.
 */
export const POST = route(async (request: Request, context: Ctx) => {
  ensureSiteAuditDueJob();
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const { id } = await context.params;
  const run = await enqueueSiteAuditRun(auth, id);
  after(async () => {
    const result = await executeSiteAuditRun(auth, run.id);
    if (result.status === "failed") {
      console.error(`[siteaudit] background run ${run.id} failed: ${result.message}`);
    }
  });
  return jsonOk(run, {
    status: 202,
    meta: {
      execution: "background",
      poll: `/api/site-audits/runs/${run.id}/`,
      recovery: "/api/cron/run-due/?only=site_audit",
    },
  });
});
