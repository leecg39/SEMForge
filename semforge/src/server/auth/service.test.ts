// @TASK P2-A1-T1 - Invite-only authentication use cases
// @SPEC docs/planning/06-tasks.md#p2-a1-t1--초대-전용-인증과-세션
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  AuthServiceError,
} from "@/server/auth/contracts";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createAuthService } from "@/server/auth/service";
import type { AuthStore, OperatorInviteStore } from "@/server/auth/store";
import { currentLegalDocuments } from "@/server/privacy/legal-documents";
import { approvedLegalReleaseManifest } from "@/server/privacy/legal-documents.test-fixture";

const NOW = new Date("2026-08-11T03:00:00.000Z");
process.env.LEGAL_RELEASE_MANIFEST = approvedLegalReleaseManifest;

function legalConsent() {
  const documents = currentLegalDocuments();
  return {
    legalAccepted: true,
    legalTermsVersion: documents.terms.version,
    legalTermsSha256: documents.terms.sha256,
    legalPrivacyVersion: documents.privacy.version,
    legalPrivacySha256: documents.privacy.sha256,
    legalPresentedAt: "2026-08-11T02:59:00.000Z",
  };
}

function storeFixture(overrides: Partial<AuthStore> = {}): AuthStore {
  return {
    prepareInviteAcceptance: async () => ({ status: "invalid" }),
    acceptInviteAtomic: async () => { throw new Error("acceptInviteAtomic not implemented"); },
    findUserByEmail: async () => null,
    findUserById: async () => null,
    listMembershipsForUser: async () => [],
    rotateSession: async () => null,
    findSessionByTokenHash: async () => null,
    revokeSessionByTokenHash: async () => false,
    revokeSessionsForUser: async () => 0,
    createPasswordReset: async () => { throw new Error("createPasswordReset not implemented"); },
    resetPasswordAtomic: async () => ({ status: "invalid" }),
    consumeAuthThrottle: async () => ({
      allowed: true,
      remaining: 4,
      blockedUntil: null,
      retryAfterSeconds: 0,
    }),
    clearAuthThrottle: async () => undefined,
    ...overrides,
  };
}

test("초대 토큰은 7일 만료 SHA-256 해시로만 저장하고 raw token은 호출자에게 한 번 반환한다", async () => {
  let stored: Parameters<OperatorInviteStore["createInvite"]>[0] | undefined;
  const service = createAuthService({
    inviteStore: {
      createInvite: async (input) => {
        stored = input;
        return {
          id: "invite-1",
          acceptedWorkspaceId: null,
          workspaceName: input.workspaceName,
          workspaceSlug: input.workspaceSlug,
          email: input.email,
          role: input.role,
          expiresAt: input.expiresAt,
        };
      },
    },
    now: () => NOW,
  });

  const result = await service.createInvite({
    workspaceName: " Agency One ",
    workspaceSlug: "agency-one-0123456789abcdef",
    email: "  OWNER@Example.COM ",
  });

  assert.equal(result.inviteId, "invite-1");
  assert.match(result.token, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(result.expiresAt.toISOString(), "2026-08-18T03:00:00.000Z");
  assert.equal(stored?.email, "owner@example.com");
  assert.equal(stored?.workspaceName, "Agency One");
  assert.equal(stored?.workspaceSlug, "agency-one-0123456789abcdef");
  assert.equal(stored?.role, "owner");
  assert.equal(result.role, "owner");
  assert.equal(stored?.tokenHash, createHash("sha256").update(result.token).digest("hex"));
  assert.notEqual(stored?.tokenHash, result.token);
  assert.equal((stored?.expiresAt as Date).toISOString(), "2026-08-18T03:00:00.000Z");
});

test("신규 사용자는 강한 비밀번호로 초대를 원자 수락하고 raw session token만 받는다", async () => {
  let accepted: Parameters<AuthStore["acceptInviteAtomic"]>[0] | undefined;
  const principal = {
    sessionId: "session-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    email: "new@example.com",
    displayName: "새 사용자",
    role: "member" as const,
    expiresAt: new Date("2026-09-10T03:00:00.000Z"),
  };
  const service = createAuthService({
    store: storeFixture({
      prepareInviteAcceptance: async () => ({ status: "ready", user: null }),
      acceptInviteAtomic: async (input) => {
        accepted = input;
        return { status: "accepted", principal };
      },
    }),
    now: () => NOW,
  });
  const currentSessionToken = "z".repeat(43);

  const result = await service.acceptInvite({
    token: "a".repeat(43),
    email: " NEW@Example.com ",
    password: "긴비밀번호-for-beta-2026",
    displayName: "  새 사용자  ",
    currentSessionToken,
    ...legalConsent(),
  });

  assert.equal(result.principal, principal);
  assert.match(result.token, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(result.expiresAt.toISOString(), "2026-09-10T03:00:00.000Z");
  assert.equal(accepted?.email, "new@example.com");
  assert.equal(accepted?.tokenHash, createHash("sha256").update("a".repeat(43)).digest("hex"));
  assert.equal(
    accepted?.sessionTokenHash,
    createHash("sha256").update(result.token).digest("hex"),
  );
  assert.equal(
    (accepted as { currentSessionTokenHash?: string } | undefined)?.currentSessionTokenHash,
    createHash("sha256").update(currentSessionToken).digest("hex"),
  );
  assert.equal(JSON.stringify(accepted).includes(currentSessionToken), false);
  const user = accepted?.user as { kind: string; passwordHash: string; displayName: string };
  assert.equal(user.kind, "new");
  assert.equal(user.displayName, "새 사용자");
  assert.equal(await verifyPassword("긴비밀번호-for-beta-2026", user.passwordHash), true);
});

test("기존 사용자는 현재 비밀번호를 검증하되 해시를 덮어쓰지 않는다", async () => {
  const currentPasswordHash = await hashPassword("existing-password-2026");
  let acceptedUser: Record<string, unknown> | undefined;
  const principal = {
    sessionId: "session-2",
    userId: "user-existing",
    workspaceId: "workspace-1",
    email: "existing@example.com",
    displayName: "기존 사용자",
    role: "admin" as const,
    expiresAt: new Date("2026-09-10T03:00:00.000Z"),
  };
  const service = createAuthService({
    store: storeFixture({
      prepareInviteAcceptance: async () => ({
        status: "ready",
        user: {
          id: "user-existing",
          email: "existing@example.com",
          passwordHash: currentPasswordHash,
          displayName: "기존 사용자",
          disabledAt: null,
        },
      }),
      acceptInviteAtomic: async (input) => {
        acceptedUser = input.user;
        return { status: "accepted", principal };
      },
    }),
    now: () => NOW,
  });

  await service.acceptInvite({
    token: "b".repeat(43),
    email: "existing@example.com",
    password: "existing-password-2026",
    displayName: "공격자가 바꾸려는 이름",
    ...legalConsent(),
  });

  assert.deepEqual(acceptedUser, {
    kind: "existing",
    userId: "user-existing",
    expectedPasswordHash: currentPasswordHash,
  });
});

test("초대 preflight 실패와 기존 사용자 비밀번호 실패는 같은 오류로 응답한다", async () => {
  const currentPasswordHash = await hashPassword("existing-password-2026");
  let atomicAcceptCalls = 0;
  const invalidTokenService = createAuthService({
    store: storeFixture({
      prepareInviteAcceptance: async () => ({ status: "invalid" }),
      acceptInviteAtomic: async () => {
        atomicAcceptCalls += 1;
        throw new Error("must not be called");
      },
    }),
    now: () => NOW,
  });
  const wrongPasswordService = createAuthService({
    store: storeFixture({
      prepareInviteAcceptance: async () => ({
        status: "ready",
        user: {
          id: "user-existing",
          email: "existing@example.com",
          passwordHash: currentPasswordHash,
          displayName: null,
          disabledAt: null,
        },
      }),
      acceptInviteAtomic: async () => {
        atomicAcceptCalls += 1;
        throw new Error("must not be called");
      },
    }),
    now: () => NOW,
  });

  const assertInvalidInvite = (error: unknown) =>
    error instanceof AuthServiceError && error.code === "INVALID_INVITE";
  await assert.rejects(
    () => invalidTokenService.acceptInvite({
      token: "c".repeat(43),
      email: "existing@example.com",
      password: "x",
      currentSessionToken: "y".repeat(43),
      ...legalConsent(),
    }),
    assertInvalidInvite,
  );
  await assert.rejects(
    () => wrongPasswordService.acceptInvite({
      token: "d".repeat(43),
      email: "existing@example.com",
      password: "wrong-password-2026",
      ...legalConsent(),
    }),
    assertInvalidInvite,
  );
  assert.equal(atomicAcceptCalls, 0);
});

test("로그인은 throttle 통과 후 워크스페이스를 검증하고 기존 cookie session을 원자 회전한다", async () => {
  const passwordHash = await hashPassword("login-password-2026");
  let throttleInput: Parameters<AuthStore["consumeAuthThrottle"]>[0] | undefined;
  let rotationInput: Parameters<AuthStore["rotateSession"]>[0] | undefined;
  let cleared = false;
  const principal = {
    sessionId: "session-login",
    userId: "user-login",
    workspaceId: "00000000-0000-4000-8000-000000000002",
    email: "login@example.com",
    displayName: "로그인 사용자",
    role: "owner" as const,
    expiresAt: new Date("2026-09-10T03:00:00.000Z"),
  };
  const store = storeFixture({
    consumeAuthThrottle: async (input) => {
      throttleInput = input;
      return { allowed: true, remaining: 4, blockedUntil: null, retryAfterSeconds: 0 };
    },
    findUserByEmail: async () => ({
      id: "user-login",
      email: "login@example.com",
      passwordHash,
      displayName: "로그인 사용자",
      disabledAt: null,
    }),
    listMembershipsForUser: async () => [
      {
        workspaceId: "00000000-0000-4000-8000-000000000001",
        workspaceName: "Agency One",
        workspaceSlug: "agency-one",
        role: "member",
      },
      {
        workspaceId: "00000000-0000-4000-8000-000000000002",
        workspaceName: "Agency Two",
        workspaceSlug: "agency-two",
        role: "owner",
      },
    ],
    rotateSession: async (input) => {
      rotationInput = input;
      return principal;
    },
    clearAuthThrottle: async () => {
      cleared = true;
    },
  });
  const service = createAuthService({ store, now: () => NOW });
  const currentSessionToken = "e".repeat(43);

  const result = await service.login({
    email: " LOGIN@Example.COM ",
    password: "login-password-2026",
    workspaceId: "00000000-0000-4000-8000-000000000002",
    currentSessionToken,
    throttleKey: "203.0.113.10",
  });

  assert.equal(result.principal, principal);
  assert.match(result.token, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(throttleInput?.action, "login");
  assert.match(String(throttleInput?.keyHash), /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(throttleInput).includes("login@example.com"), false);
  assert.equal(rotationInput?.workspaceId, "00000000-0000-4000-8000-000000000002");
  assert.equal(
    rotationInput?.currentTokenHash,
    createHash("sha256").update(currentSessionToken).digest("hex"),
  );
  assert.equal(
    rotationInput?.newTokenHash,
    createHash("sha256").update(result.token).digest("hex"),
  );
  assert.equal((rotationInput?.expiresAt as Date).toISOString(), "2026-09-10T03:00:00.000Z");
  assert.equal(cleared, true);
});

test("존재하지 않는 계정과 잘못된 비밀번호는 같은 로그인 오류를 반환한다", async () => {
  const passwordHash = await hashPassword("correct-password-2026");
  const missingService = createAuthService({
    store: storeFixture({ findUserByEmail: async () => null }),
    now: () => NOW,
  });
  const wrongService = createAuthService({
    store: storeFixture({
      findUserByEmail: async () => ({
        id: "user-login",
        email: "login@example.com",
        passwordHash,
        displayName: null,
        disabledAt: null,
      }),
    }),
    now: () => NOW,
  });
  const capture = async (operation: () => Promise<unknown>) => {
    try {
      await operation();
      assert.fail("예상한 로그인 오류가 발생하지 않았습니다.");
    } catch (error) {
      assert.equal(error instanceof AuthServiceError, true);
      return error as AuthServiceError;
    }
  };

  const missing = await capture(() => missingService.login({
    email: "missing@example.com",
    password: "wrong-password-2026",
  }));
  const wrong = await capture(() => wrongService.login({
    email: "login@example.com",
    password: "wrong-password-2026",
  }));
  assert.deepEqual(
    { code: missing.code, status: missing.status, message: missing.message },
    { code: wrong.code, status: wrong.status, message: wrong.message },
  );
  assert.equal(missing.code, "INVALID_CREDENTIALS");
});

test("login throttle이 차단하면 계정 조회 전에 retry-after 오류를 반환한다", async () => {
  let accountLookups = 0;
  const service = createAuthService({
    store: storeFixture({
      consumeAuthThrottle: async () => ({
        allowed: false,
        remaining: 0,
        blockedUntil: new Date("2026-08-11T03:02:00.000Z"),
        retryAfterSeconds: 120,
      }),
      findUserByEmail: async () => {
        accountLookups += 1;
        return null;
      },
    }),
    now: () => NOW,
  });

  await assert.rejects(
    () => service.login({ email: "login@example.com", password: "wrong-password-2026" }),
    (error: unknown) =>
      error instanceof AuthServiceError &&
      error.code === "RATE_LIMITED" &&
      error.status === 429 &&
      error.retryAfterSeconds === 120,
  );
  assert.equal(accountLookups, 0);
});

test("세션 조회와 로그아웃은 raw cookie를 저장소에 넘기지 않고 폐기는 멱등적이다", async () => {
  const rawToken = "f".repeat(43);
  const expectedHash = createHash("sha256").update(rawToken).digest("hex");
  const principal = {
    sessionId: "session-active",
    userId: "user-active",
    workspaceId: "workspace-active",
    email: "active@example.com",
    displayName: null,
    role: "member" as const,
    expiresAt: new Date("2026-08-12T03:00:00.000Z"),
  };
  let lookupHash: string | undefined;
  let revokedHash: string | undefined;
  const service = createAuthService({
    store: storeFixture({
      findSessionByTokenHash: async (tokenHash) => {
        lookupHash = tokenHash;
        return principal;
      },
      revokeSessionByTokenHash: async (tokenHash) => {
        revokedHash = tokenHash;
        return true;
      },
    }),
    now: () => NOW,
  });

  assert.equal(await service.getSession(rawToken), principal);
  assert.equal(lookupHash, expectedHash);
  assert.deepEqual(await service.logout(rawToken), { revoked: true });
  assert.equal(revokedHash, expectedHash);
  assert.deepEqual(await service.logout(undefined), { revoked: false });
  assert.equal(await service.getSession(undefined), null);
});

test("비밀번호 재설정 요청은 30분 해시 토큰과 outbox delivery를 원자 저장 경계에 전달한다", async () => {
  let resetRecord: Parameters<AuthStore["createPasswordReset"]>[0] | undefined;
  const service = createAuthService({
    store: storeFixture({
      findUserByEmail: async () => ({
        id: "user-reset",
        email: "reset@example.com",
        passwordHash: "not-used",
        displayName: null,
        disabledAt: null,
      }),
      createPasswordReset: async (input) => {
        resetRecord = input;
        return {
          id: "reset-1",
          userId: input.userId,
          expiresAt: input.expiresAt,
        };
      },
    }),
    passwordResetBaseUrl: "https://app.semforge.test",
    now: () => NOW,
  });

  assert.deepEqual(
    await service.requestPasswordReset({
      email: " RESET@Example.com ",
      throttleKey: "203.0.113.20",
    }),
    { accepted: true },
  );

  const delivery = resetRecord?.delivery;
  const resetUrl = String(delivery?.resetUrl);
  const rawToken = new URL(resetUrl).pathname.split("/").at(-1) ?? "";
  assert.match(rawToken, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(delivery?.email, "reset@example.com");
  assert.equal(delivery?.expiresAt.toISOString(), "2026-08-11T03:30:00.000Z");
  assert.equal(resetUrl, `https://app.semforge.test/reset-password/${rawToken}`);
  assert.equal(
    resetRecord?.tokenHash,
    createHash("sha256").update(rawToken).digest("hex"),
  );
  assert.equal(JSON.stringify({ ...resetRecord, delivery: undefined }).includes(rawToken), false);
});

test("비밀번호 재설정 요청은 계정 존재·throttle은 숨기되 outbox 영속화 실패는 성공으로 숨기지 않는다", async () => {
  const missingService = createAuthService({
    store: storeFixture({ findUserByEmail: async () => null }),
    now: () => NOW,
  });
  const blockedService = createAuthService({
    store: storeFixture({
      consumeAuthThrottle: async () => ({
        allowed: false,
        remaining: 0,
        blockedUntil: new Date("2026-08-11T03:15:00.000Z"),
        retryAfterSeconds: 900,
      }),
      findUserByEmail: async () => {
        throw new Error("blocked request must stop before account lookup");
      },
    }),
    now: () => NOW,
  });
  const deliveryService = createAuthService({
    store: storeFixture({
      findUserByEmail: async () => ({
        id: "user-reset",
        email: "nobody@example.com",
        passwordHash: "not-used",
        displayName: null,
        disabledAt: null,
      }),
      createPasswordReset: async (reset) => ({
        id: "reset-outage",
        userId: reset.userId,
        expiresAt: reset.expiresAt,
      }),
    }),
    passwordResetBaseUrl: "https://app.semforge.test",
    now: () => NOW,
  });
  const outboxFailureService = createAuthService({
    store: storeFixture({
      findUserByEmail: async () => ({
        id: "user-reset",
        email: "nobody@example.com",
        passwordHash: "not-used",
        displayName: null,
        disabledAt: null,
      }),
      createPasswordReset: async () => {
        throw new Error("email outbox unavailable");
      },
    }),
    passwordResetBaseUrl: "https://app.semforge.test",
    now: () => NOW,
  });

  const input = { email: "nobody@example.com", throttleKey: "203.0.113.20" };
  assert.deepEqual(await missingService.requestPasswordReset(input), { accepted: true });
  assert.deepEqual(await blockedService.requestPasswordReset(input), { accepted: true });
  assert.deepEqual(await deliveryService.requestPasswordReset(input), { accepted: true });
  await assert.rejects(
    () => outboxFailureService.requestPasswordReset(input),
    /email outbox unavailable/u,
  );
});

test("비밀번호 재설정은 새 해시와 토큰 해시를 원자 소비 경계에 전달한다", async () => {
  let resetInput: Parameters<AuthStore["resetPasswordAtomic"]>[0] | undefined;
  const service = createAuthService({
    store: storeFixture({
      resetPasswordAtomic: async (input) => {
        resetInput = input;
        return { status: "reset", userId: "user-reset" };
      },
    }),
    now: () => NOW,
  });
  const rawToken = "g".repeat(43);

  assert.deepEqual(
    await service.resetPassword({
      token: rawToken,
      password: "new-secure-password-2026",
    }),
    { reset: true },
  );

  assert.equal(
    resetInput?.tokenHash,
    createHash("sha256").update(rawToken).digest("hex"),
  );
  assert.equal(
    await verifyPassword("new-secure-password-2026", String(resetInput?.passwordHash)),
    true,
  );
  assert.equal((resetInput?.now as Date).toISOString(), NOW.toISOString());
});

test("만료·재사용 재설정 토큰과 약한 비밀번호는 안전한 공개 오류로 변환한다", async () => {
  const expiredService = createAuthService({
    store: storeFixture({ resetPasswordAtomic: async () => ({ status: "expired" }) }),
    now: () => NOW,
  });
  const invalidReset = (error: unknown) =>
    error instanceof AuthServiceError &&
    error.code === "INVALID_PASSWORD_RESET" &&
    error.status === 400;
  await assert.rejects(
    () => expiredService.resetPassword({
      token: "h".repeat(43),
      password: "new-secure-password-2026",
    }),
    invalidReset,
  );

  const weakPassword = (error: unknown) =>
    error instanceof AuthServiceError &&
    error.code === "INVALID_PASSWORD" &&
    error.status === 422;
  await assert.rejects(
    () => expiredService.resetPassword({
      token: "h".repeat(43),
      password: "short1",
    }),
    weakPassword,
  );
});
