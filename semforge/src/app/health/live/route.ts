// @TASK P4-O1-T1 - Public liveness endpoint
// @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
// @TEST src/server/health/health.test.ts
import { createLivenessResponse } from "@/server/health/health";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return createLivenessResponse();
}
