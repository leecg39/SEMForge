// @TASK P2-S1-T1 - Structural auth port for API runtime composition
// @SPEC docs/planning/06-tasks.md#p2-s1-t1--사이트와-추적-항목-api
import { ApiError } from "@/lib/api-v1";

export interface ApiSession {
  workspaceId: string;
  userId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ApiSessionResolver = (request: Request) => Promise<ApiSession>;

export async function resolveApiSession(request: Request): Promise<ApiSession> {
  const workspaceId = request.headers.get("x-semforge-workspace-id") ?? "";
  const userId = request.headers.get("x-semforge-user-id") ?? "";
  if (
    process.env.NODE_ENV !== "production" &&
    UUID_RE.test(workspaceId) &&
    UUID_RE.test(userId)
  ) {
    return { workspaceId, userId };
  }
  throw new ApiError("UNAUTHENTICATED");
}
