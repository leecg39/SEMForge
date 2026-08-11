// @TASK P2-A1-T1 - Invite-only auth persistence port
// @SPEC docs/planning/06-tasks.md#p2-a1-t1--초대-전용-인증과-세션
// @TEST src/server/auth/postgres-store.test.ts

export type AuthMembershipRole = "owner" | "admin" | "member";
export type AuthThrottleAction = "login" | "forgot_password";

export const DEFAULT_AUTH_THROTTLE_LIMIT = 5;
export const DEFAULT_AUTH_THROTTLE_WINDOW_MS = 15 * 60 * 1_000;

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string | null;
  readonly disabledAt: Date | null;
}

export interface AuthMembership {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly workspaceSlug: string;
  readonly role: AuthMembershipRole;
}

/** 서비스가 쿠키 원문 없이 인증 결과를 전달하는 공개 session view다. */
export interface AuthSessionPrincipal {
  readonly sessionId: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly role: AuthMembershipRole;
  readonly expiresAt: Date;
}

export interface AuthInvite {
  readonly id: string;
  readonly acceptedWorkspaceId: null;
  readonly workspaceName: string;
  readonly workspaceSlug: string;
  readonly email: string;
  readonly role: "owner";
  readonly expiresAt: Date;
}

interface CreateInviteBase {
  readonly email: string;
  readonly tokenHash: string;
  readonly role: "owner";
  readonly expiresAt: Date;
  readonly now?: Date;
}

export type CreateInviteInput = CreateInviteBase & {
  readonly workspaceName: string;
  readonly workspaceSlug: string;
};

export type AcceptInviteUser =
  | {
      readonly kind: "new";
      readonly passwordHash: string;
      readonly displayName?: string | null;
    }
  | {
      /**
       * 서비스가 검증한 기존 hash를 transaction 안에서 다시 비교한다.
       * 비밀번호가 중간에 변경되면 수락을 중단하고 기존 hash는 절대 덮어쓰지 않는다.
       */
      readonly kind: "existing";
      readonly userId: string;
      readonly expectedPasswordHash: string;
    };

export interface AcceptInviteInput {
  readonly tokenHash: string;
  readonly email: string;
  readonly user: AcceptInviteUser;
  readonly sessionTokenHash: string;
  /** 초대 수락 후 교체할 현재 쿠키의 hash다. 다른 사용자의 session은 건드리지 않는다. */
  readonly currentSessionTokenHash?: string;
  readonly sessionExpiresAt: Date;
  readonly now: Date;
}

export interface PrepareInviteAcceptanceInput {
  readonly tokenHash: string;
  readonly email: string;
  readonly now: Date;
}

export type PrepareInviteAcceptanceResult =
  | { readonly status: "ready"; readonly user: AuthUser | null }
  | { readonly status: "invalid" };

export type AcceptInviteResult =
  | { readonly status: "accepted"; readonly principal: AuthSessionPrincipal }
  | { readonly status: "invalid" | "expired" | "email_mismatch" };

export interface RotateSessionInput {
  readonly userId: string;
  readonly workspaceId: string;
  readonly newTokenHash: string;
  readonly currentTokenHash?: string;
  readonly expiresAt: Date;
  readonly now: Date;
}

export interface CreatePasswordResetInput {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly now: Date;
}

export interface AuthPasswordReset {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
}

export interface ResetPasswordInput {
  readonly tokenHash: string;
  readonly passwordHash: string;
  readonly now: Date;
}

export type ResetPasswordResult =
  | { readonly status: "reset"; readonly userId: string }
  | { readonly status: "invalid" | "expired" };

export interface ConsumeAuthThrottleInput {
  readonly action: AuthThrottleAction;
  /** 정규화된 이메일/IP 등 원문 식별자를 저장하지 않는 안정적인 digest다. */
  readonly keyHash: string;
  readonly now: Date;
  readonly limit?: number;
  readonly windowMs?: number;
}

export interface AuthThrottleDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly blockedUntil: Date | null;
  readonly retryAfterSeconds: number;
}

/** 운영자 전용 연결은 workspace provisioning intent만 발급한다. */
export interface OperatorInviteStore {
  createInvite(input: CreateInviteInput): Promise<AuthInvite>;
}

/**
 * 인증은 tenant가 정해지기 전 실행되므로 workspace-scoped web role을 사용할 수 없다.
 * 구현 어댑터는 권한이 auth 테이블과 onboarding write로 제한된 semforge_auth role만 사용한다.
 */
export interface AuthStore {
  prepareInviteAcceptance(
    input: PrepareInviteAcceptanceInput,
  ): Promise<PrepareInviteAcceptanceResult>;
  acceptInviteAtomic(input: AcceptInviteInput): Promise<AcceptInviteResult>;

  findUserByEmail(email: string): Promise<AuthUser | null>;
  findUserById(userId: string): Promise<AuthUser | null>;
  listMembershipsForUser(userId: string): Promise<readonly AuthMembership[]>;

  rotateSession(input: RotateSessionInput): Promise<AuthSessionPrincipal | null>;
  findSessionByTokenHash(tokenHash: string, now: Date): Promise<AuthSessionPrincipal | null>;
  revokeSessionByTokenHash(tokenHash: string, now: Date): Promise<boolean>;
  revokeSessionsForUser(userId: string, now: Date): Promise<number>;

  createPasswordReset(input: CreatePasswordResetInput): Promise<AuthPasswordReset>;
  resetPasswordAtomic(input: ResetPasswordInput): Promise<ResetPasswordResult>;

  consumeAuthThrottle(input: ConsumeAuthThrottleInput): Promise<AuthThrottleDecision>;
  clearAuthThrottle(action: AuthThrottleAction, keyHash: string): Promise<void>;
}
