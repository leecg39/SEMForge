// @TASK P4-O1-T1 - Safe PostgreSQL readiness endpoint
// @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
// @TEST src/server/health/health.test.ts
import { getPool } from "@/db/client";
import { resolveRequestId } from "@/lib/api-v1/request-id";
import { createReadinessResponse } from "@/server/health/health";
import { createJsonLogger } from "@/server/observability/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const response = await createReadinessResponse(getPool("web"));
  if (response.status !== 200) {
    createJsonLogger({ service: "web" }).warn("readiness check failed", {
      requestId: resolveRequestId(request),
    });
  }
  return response;
}
