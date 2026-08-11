// @TASK P2-S1-T1 - Structural auth port for API runtime composition
// @SPEC docs/planning/06-tasks.md#p2-s1-t1--사이트와-추적-항목-api
import { ApiError } from "@/lib/api-v1";
import { resolveRequestId } from "@/lib/api-v1/request-id";
import { readSessionTokenFromRequest } from "@/lib/session";
import { createRuntimeAuthService } from "@/server/auth/runtime";
import type { AuthMembershipRole, AuthSessionPrincipal } from "@/server/auth/contracts";

export interface ApiSession {
  workspaceId: string;
  userId: string;
  role: AuthMembershipRole;
  requestId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ApiSessionResolver = (request: Request) => Promise<ApiSession>;

export interface ApiSessionAuthService {
  getSession(sessionToken: string | undefined): Promise<AuthSessionPrincipal | null>;
}

export interface ApiSessionResolverOptions {
  readonly getService?: () => ApiSessionAuthService;
  readonly production?: boolean;
}

export function createApiSessionResolver(
  options: ApiSessionResolverOptions = {},
): ApiSessionResolver {
  return async (request: Request): Promise<ApiSession> => {
    const requestId = resolveRequestId(request);
    const production = options.production ?? process.env.NODE_ENV === "production";
    if (!production) {
      const workspaceId = request.headers.get("x-semforge-workspace-id") ?? "";
      const userId = request.headers.get("x-semforge-user-id") ?? "";
      if (UUID_RE.test(workspaceId) && UUID_RE.test(userId)) {
        return {
          workspaceId,
          userId,
          role: "owner",
          requestId,
        };
      }
    }

    const token = readSessionTokenFromRequest(request) ?? undefined;
    if (!token) throw new ApiError("UNAUTHENTICATED");
    const principal = await (options.getService ?? createRuntimeAuthService)().getSession(token);
    if (!principal) throw new ApiError("UNAUTHENTICATED");
    return {
      workspaceId: principal.workspaceId,
      userId: principal.userId,
      role: principal.role,
      requestId,
    };
  };
}

export async function resolveApiSession(request: Request): Promise<ApiSession> {
  return createApiSessionResolver()(request);
}

export async function resolveDevelopmentHeaderApiSession(request: Request): Promise<ApiSession> {
  const workspaceId = request.headers.get("x-semforge-workspace-id") ?? "";
  const userId = request.headers.get("x-semforge-user-id") ?? "";
  if (UUID_RE.test(workspaceId) && UUID_RE.test(userId)) {
    return {
      workspaceId,
      userId,
      role: "owner",
      requestId: resolveRequestId(request),
    };
  }
  throw new ApiError("UNAUTHENTICATED");
}
