// @TASK P2-A1-T1 - Authentication service boundary contracts
// @SPEC docs/planning/06-tasks.md#p2-a1-t1--초대-전용-인증과-세션

import type { AuthMembershipRole } from "@/server/auth/store";

export type {
  AuthMembership,
  AuthMembershipRole,
  AuthSessionPrincipal,
  AuthStore,
  AuthUser,
  OperatorInviteStore,
} from "@/server/auth/store";

export const TENANT_WORKSPACE_MANAGER_ROLES = ["owner", "admin"] as const satisfies
  readonly AuthMembershipRole[];

export function isTenantWorkspaceManager(role: AuthMembershipRole): boolean {
  return TENANT_WORKSPACE_MANAGER_ROLES.some((allowedRole) => allowedRole === role);
}

export interface PasswordResetNotification {
  readonly email: string;
  readonly token: string;
  readonly expiresAt: Date;
}

export interface PasswordResetNotifier {
  enqueuePasswordReset(notification: PasswordResetNotification): Promise<void>;
}

export type AuthServiceErrorCode =
  | "INVALID_INVITE"
  | "INVALID_CREDENTIALS"
  | "RATE_LIMITED"
  | "INVALID_PASSWORD_RESET"
  | "INVALID_PASSWORD"
  | "AUTH_CONFIGURATION";

const AUTH_SERVICE_STATUS = {
  INVALID_INVITE: 400,
  INVALID_CREDENTIALS: 401,
  RATE_LIMITED: 429,
  INVALID_PASSWORD_RESET: 400,
  INVALID_PASSWORD: 422,
  AUTH_CONFIGURATION: 500,
} as const satisfies Readonly<Record<AuthServiceErrorCode, number>>;

export class AuthServiceError extends Error {
  constructor(
    readonly code: AuthServiceErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AuthServiceError";
  }

  get status(): number {
    return AUTH_SERVICE_STATUS[this.code];
  }
}
