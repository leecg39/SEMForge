import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { siteAuditRuns } from "@/db/schema";
import { ApiError, jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";

type Ctx = { params: Promise<{ runId: string }> };

export const GET = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  const { runId } = await context.params;
  const [run] = await db
    .select()
    .from(siteAuditRuns)
    .where(
      and(eq(siteAuditRuns.id, runId), eq(siteAuditRuns.workspaceId, auth.workspaceId))
    )
    .limit(1);
  if (!run) throw new ApiError("NOT_FOUND", "사이트 진단 실행을 찾을 수 없습니다.");
  return jsonOk({
    ...run,
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    heartbeatAt: run.heartbeatAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  });
});
