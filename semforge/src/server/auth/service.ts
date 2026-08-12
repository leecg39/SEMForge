// @TASK P2-A1-T1 - Invite-only authentication use cases
// @SPEC docs/planning/06-tasks.md#p2-a1-t1--초대-전용-인증과-세션
import { createHash } from "node:crypto";

import type {
  AuthSessionPrincipal,
  AuthStore,
  OperatorInviteStore,
} from "@/server/auth/contracts";
import { AuthServiceError } from "@/server/auth/contracts";
import {
  hashPassword,
  verifyPassword,
  verifyPasswordWithPolicy,
} from "@/server/auth/password";
import {
  acceptInviteInputSchema,
  createInviteInputSchema,
  loginInputSchema,
  newPasswordSchema,
  requestPasswordResetInputSchema,
  resetPasswordInputSchema,
  type AcceptInviteInput,
  type CreateInviteInput,
  type LoginInput,
  type RequestPasswordResetInput,
  type ResetPasswordInput,
} from "@/server/auth/schemas";
import { createOpaqueToken, hashOpaqueToken } from "@/server/auth/tokens";
import { requireCurrentLegalAcceptance } from "@/server/privacy/legal-documents";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1_000;

export interface AuthServiceDependencies {
  readonly store?: AuthStore;
  readonly inviteStore?: OperatorInviteStore;
  readonly passwordResetBaseUrl?: string;
  readonly now?: () => Date;
}

export interface AuthSessionResult {
  readonly token: string;
  readonly expiresAt: Date;
  readonly principal: AuthSessionPrincipal;
}

function invalidInvite(): AuthServiceError {
  return new AuthServiceError(
    "INVALID_INVITE",
    "초대 정보가 올바르지 않거나 더 이상 사용할 수 없습니다.",
  );
}

function configurationError(boundary: string): AuthServiceError {
  return new AuthServiceError(
    "AUTH_CONFIGURATION",
    `인증 서비스의 ${boundary} 경계가 구성되지 않았습니다.`,
  );
}

function invalidCredentials(): AuthServiceError {
  return new AuthServiceError(
    "INVALID_CREDENTIALS",
    "이메일 또는 비밀번호를 확인해 주세요.",
  );
}

function invalidPassword(message: string): AuthServiceError {
  return new AuthServiceError("INVALID_PASSWORD", message);
}

function parseNewPassword(password: string): string {
  const result = newPasswordSchema.safeParse(password);
  if (!result.success) {
    throw invalidPassword(
      result.error.issues[0]?.message ?? "비밀번호 정책을 확인해 주세요.",
    );
  }
  return result.data;
}

function throttleDigest(
  action: "login" | "forgot_password",
  dimension: "email" | "client_address",
  identifier: string,
): string {
  return createHash("sha256")
    .update(`semforge-auth-v2:${action}:${dimension}:${identifier}`)
    .digest("hex");
}

function throttleKeyHashes(
  action: "login" | "forgot_password",
  email: string,
  clientAddressHash?: string,
): readonly string[] {
  const normalizedEmail = email.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  return [
    throttleDigest(action, "email", normalizedEmail),
    ...(clientAddressHash
      ? [throttleDigest(action, "client_address", clientAddressHash)]
      : []),
  ];
}

function passwordResetUrl(baseUrl: string | undefined, token: string): string {
  if (!baseUrl) throw configurationError("password reset public URL");
  try {
    const base = new URL(baseUrl);
    if (
      (base.protocol !== "https:" && base.protocol !== "http:") ||
      base.username ||
      base.password
    ) {
      throw new Error("invalid public URL");
    }
    return new URL(`/reset-password/${token}`, base.origin).toString();
  } catch {
    throw configurationError("password reset public URL");
  }
}

export function createAuthService(dependencies: AuthServiceDependencies) {
  const now = dependencies.now ?? (() => new Date());

  return {
    async createInvite(input: CreateInviteInput) {
      const inviteStore = dependencies.inviteStore;
      if (!inviteStore) throw configurationError("operator invite store");
      const parsed = createInviteInputSchema.parse(input);
      const createdAt = now();
      const expiresAt = new Date(createdAt.getTime() + INVITE_TTL_MS);
      const token = createOpaqueToken();
      const invite = await inviteStore.createInvite({
        workspaceName: parsed.workspaceName,
        workspaceSlug: parsed.workspaceSlug,
        email: parsed.email,
        releaseTarget: parsed.releaseTarget,
        role: "owner",
        tokenHash: hashOpaqueToken(token),
        expiresAt,
        now: createdAt,
      });

      return {
        inviteId: invite.id,
        workspaceName: invite.workspaceName,
        workspaceSlug: invite.workspaceSlug,
        email: invite.email,
        releaseTarget: invite.releaseTarget,
        role: invite.role,
        token,
        expiresAt: invite.expiresAt,
      };
    },

    async acceptInvite(input: AcceptInviteInput): Promise<AuthSessionResult> {
      const store = dependencies.store;
      if (!store) throw configurationError("auth store");
      const parsed = acceptInviteInputSchema.parse(input);
      const acceptedAt = now();
      const legalAcceptance = (() => {
        try {
          return requireCurrentLegalAcceptance({
            termsVersion: parsed.legalTermsVersion,
            termsSha256: parsed.legalTermsSha256,
            privacyVersion: parsed.legalPrivacyVersion,
            privacySha256: parsed.legalPrivacySha256,
            presentedAt: parsed.legalPresentedAt,
            accepted: parsed.legalAccepted,
          });
        } catch {
          throw invalidInvite();
        }
      })();
      const tokenHash = hashOpaqueToken(parsed.token);
      const prepared = await store.prepareInviteAcceptance({
        tokenHash,
        email: parsed.email,
        now: acceptedAt,
      });
      if (prepared.status !== "ready") throw invalidInvite();
      const existingUser = prepared.user;

      let inviteUser;
      if (existingUser) {
        const verified = await verifyPassword(parsed.password, existingUser.passwordHash);
        if (!verified || existingUser.disabledAt) throw invalidInvite();
        inviteUser = {
          kind: "existing" as const,
          userId: existingUser.id,
          expectedPasswordHash: existingUser.passwordHash,
        };
      } else {
        const password = parseNewPassword(parsed.password);
        inviteUser = {
          kind: "new" as const,
          passwordHash: await hashPassword(password),
          displayName: parsed.displayName ?? null,
        };
      }

      const token = createOpaqueToken();
      const result = await store.acceptInviteAtomic({
        tokenHash,
        email: parsed.email,
        user: inviteUser,
        sessionTokenHash: hashOpaqueToken(token),
        legalAcceptance,
        ...(parsed.currentSessionToken
          ? { currentSessionTokenHash: hashOpaqueToken(parsed.currentSessionToken) }
          : {}),
        sessionExpiresAt: new Date(acceptedAt.getTime() + SESSION_TTL_MS),
        now: acceptedAt,
      });
      if (result.status !== "accepted") throw invalidInvite();

      return {
        token,
        expiresAt: result.principal.expiresAt,
        principal: result.principal,
      };
    },

    async login(input: LoginInput): Promise<AuthSessionResult> {
      const store = dependencies.store;
      if (!store) throw configurationError("auth store");
      const parsed = loginInputSchema.parse(input);
      const loggedInAt = now();
      const throttleKeyHashesForRequest = throttleKeyHashes(
        "login",
        parsed.email,
        parsed.clientAddressHash,
      );
      const throttles = await Promise.all(throttleKeyHashesForRequest.map((keyHash) =>
        store.consumeAuthThrottle({ action: "login", keyHash, now: loggedInAt })));
      const blocked = throttles.filter((throttle) => !throttle.allowed);
      if (blocked.length > 0) {
        throw new AuthServiceError(
          "RATE_LIMITED",
          "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
          Math.max(...blocked.map((throttle) => throttle.retryAfterSeconds)),
        );
      }

      const user = await store.findUserByEmail(parsed.email);
      const passwordVerification = user
        ? await verifyPasswordWithPolicy(parsed.password, user.passwordHash)
        : (await hashPassword(parsed.password), { verified: false, needsRehash: false });
      if (!user || !passwordVerification.verified || user.disabledAt) {
        throw invalidCredentials();
      }
      let expectedPasswordHash = user.passwordHash;
      if (passwordVerification.needsRehash) {
        const upgradedPasswordHash = await hashPassword(parsed.password);
        const upgraded = await store.upgradePasswordHash({
          userId: user.id,
          expectedPasswordHash: user.passwordHash,
          passwordHash: upgradedPasswordHash,
          now: loggedInAt,
        });
        // 동시 password reset/disable이 이긴 경우 이전 비밀번호로 session을 만들지 않는다.
        if (!upgraded) throw invalidCredentials();
        expectedPasswordHash = upgradedPasswordHash;
      }

      const memberships = await store.listMembershipsForUser(user.id);
      const membership = parsed.workspaceId
        ? memberships.find((candidate) => candidate.workspaceId === parsed.workspaceId)
        : memberships[0];
      if (!membership) throw invalidCredentials();

      const token = createOpaqueToken();
      const principal = await store.rotateSession({
        userId: user.id,
        workspaceId: membership.workspaceId,
        expectedPasswordHash,
        newTokenHash: hashOpaqueToken(token),
        ...(parsed.currentSessionToken
          ? { currentTokenHash: hashOpaqueToken(parsed.currentSessionToken) }
          : {}),
        expiresAt: new Date(loggedInAt.getTime() + SESSION_TTL_MS),
        now: loggedInAt,
      });
      if (!principal) throw invalidCredentials();

      // 정상 로그인은 사용자가 소유한 이메일 bucket만 초기화한다. 공유 IP
      // bucket을 초기화하면 공격자가 자신의 계정으로 성공 로그인한 뒤 다른
      // 이메일에 대한 spraying 제한을 반복해서 우회할 수 있다.
      await store
        .clearAuthThrottle("login", throttleKeyHashesForRequest[0]!)
        .catch(() => undefined);
      return {
        token,
        expiresAt: principal.expiresAt,
        principal,
      };
    },

    async getSession(sessionToken: string | undefined): Promise<AuthSessionPrincipal | null> {
      if (!sessionToken) return null;
      const store = dependencies.store;
      if (!store) throw configurationError("auth store");
      return store.findSessionByTokenHash(hashOpaqueToken(sessionToken), now());
    },

    async logout(sessionToken: string | undefined): Promise<{ readonly revoked: boolean }> {
      if (!sessionToken) return { revoked: false };
      const store = dependencies.store;
      if (!store) throw configurationError("auth store");
      const revoked = await store.revokeSessionByTokenHash(
        hashOpaqueToken(sessionToken),
        now(),
      );
      return { revoked };
    },

    async requestPasswordReset(
      input: RequestPasswordResetInput,
    ): Promise<{ readonly accepted: true }> {
      const store = dependencies.store;
      if (!store) throw configurationError("auth store");
      const parsed = requestPasswordResetInputSchema.parse(input);
      const accepted = { accepted: true } as const;
      const requestedAt = now();

      const throttles = await Promise.all(throttleKeyHashes(
        "forgot_password",
        parsed.email,
        parsed.clientAddressHash,
      ).map((keyHash) => store.consumeAuthThrottle({
        action: "forgot_password",
        keyHash,
        now: requestedAt,
      })));
      if (throttles.some((throttle) => !throttle.allowed)) return accepted;

      const user = await store.findUserByEmail(parsed.email);
      if (!user || user.disabledAt) return accepted;

      const token = createOpaqueToken();
      const expiresAt = new Date(requestedAt.getTime() + PASSWORD_RESET_TTL_MS);
      await store.createPasswordReset({
        userId: user.id,
        tokenHash: hashOpaqueToken(token),
        expiresAt,
        now: requestedAt,
        delivery: {
          email: user.email,
          resetUrl: passwordResetUrl(dependencies.passwordResetBaseUrl, token),
          expiresAt,
        },
      });
      return accepted;
    },

    async resetPassword(
      input: ResetPasswordInput,
    ): Promise<{ readonly reset: true }> {
      const store = dependencies.store;
      if (!store) throw configurationError("auth store");
      const parsed = resetPasswordInputSchema.parse(input);
      const password = parseNewPassword(parsed.password);
      const result = await store.resetPasswordAtomic({
        tokenHash: hashOpaqueToken(parsed.token),
        passwordHash: await hashPassword(password),
        now: now(),
      });
      if (result.status !== "reset") {
        throw new AuthServiceError(
          "INVALID_PASSWORD_RESET",
          "재설정 링크가 올바르지 않거나 더 이상 사용할 수 없습니다.",
        );
      }
      return { reset: true };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
