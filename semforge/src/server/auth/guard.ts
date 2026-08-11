// @TASK P2-A1-T1 - Reusable authenticated API guard
// @SPEC docs/planning/06-tasks.md#p2-a1-t1--초대-전용-인증과-세션
// @TEST src/server/auth/guard.test.ts
import {
  ApiError,
  assertSameOrigin,
  resolveRequestId,
} from "@/lib/api-v1";
import { readSessionTokenFromRequest } from "@/lib/session";
import {
  AuthServiceError,
  type AuthMembershipRole,
  type AuthSessionPrincipal,
} from "@/server/auth/contracts";
import { authServiceErrorToApiError } from "@/server/auth/http";

export interface AuthGuardService {
  getSession(sessionToken: string | undefined): Promise<AuthSessionPrincipal | null>;
}

export interface AuthGuardDependencies {
  readonly getService: () => AuthGuardService;
  readonly trustedOrigin?: string;
}

export interface RequireAuthOptions {
  readonly csrf?: boolean;
  readonly roles?: readonly AuthMembershipRole[];
  readonly requestId?: string;
}

export interface RequiredAuth {
  readonly userId: string;
  readonly workspaceId: string;
  readonly role: AuthMembershipRole;
  readonly requestId: string;
}

export type RequireAuth = (
  request: Request,
  options?: RequireAuthOptions,
) => Promise<RequiredAuth>;

export function createRequireAuth(
  dependencies: AuthGuardDependencies,
): RequireAuth {
  return async (request, options = {}) => {
    if (options.csrf) {
      assertSameOrigin(request, dependencies.trustedOrigin);
    }

    const requestId = options.requestId ?? resolveRequestId(request);
    const sessionToken = readSessionTokenFromRequest(request) ?? undefined;
    if (!sessionToken) throw new ApiError("UNAUTHENTICATED");

    let principal: AuthSessionPrincipal | null;
    try {
      principal = await dependencies.getService().getSession(sessionToken);
    } catch (error) {
      if (error instanceof AuthServiceError) {
        throw authServiceErrorToApiError(error);
      }
      throw error;
    }
    if (!principal) throw new ApiError("UNAUTHENTICATED");
    if (options.roles && !options.roles.includes(principal.role)) {
      throw new ApiError("FORBIDDEN");
    }

    return {
      userId: principal.userId,
      workspaceId: principal.workspaceId,
      role: principal.role,
      requestId,
    };
  };
}

