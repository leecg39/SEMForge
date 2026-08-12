// @TASK P5-PRIVACY-AUTH - Race-safe auth mutations during workspace erasure
// @SPEC docs/ops/privacy-erasure-runbook.md
// @TEST src/server/auth/privacy-fenced-store.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  AuthStore,
  AuthUser,
  CreatePasswordResetInput,
} from "@/server/auth/store";
import {
  createPrivacyFencedAuthStore,
  type AuthWorkspacePrivacyFence,
} from "@/server/auth/privacy-fenced-store";

const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-08-12T07:00:00.000Z");

function user(): AuthUser {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    email: "shared@example.com",
    passwordHash: "scrypt:test",
    displayName: "Shared owner",
    disabledAt: null,
  };
}

function storeFixture(overrides: Partial<AuthStore> = {}): AuthStore {
  return {
    prepareInviteAcceptance: async () => ({ status: "invalid" }),
    acceptInviteAtomic: async () => ({ status: "invalid" }),
    findUserByEmail: async () => user(),
    findUserById: async () => user(),
    upgradePasswordHash: async () => false,
    listMembershipsForUser: async () => [
      { workspaceId: WORKSPACE_A, workspaceName: "A", workspaceSlug: "a", role: "owner" },
      { workspaceId: WORKSPACE_B, workspaceName: "B", workspaceSlug: "b", role: "admin" },
    ],
    rotateSession: async () => null,
    findSessionByTokenHash: async () => null,
    revokeSessionByTokenHash: async () => false,
    revokeSessionsForUser: async () => 0,
    createPasswordReset: async () => null,
    preparePasswordReset: async () => ({ status: "invalid" }),
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

function fenceFixture(options: {
  readonly blocked?: ReadonlySet<string>;
  readonly calls?: string[];
  readonly manyCalls?: string[][];
} = {}): AuthWorkspacePrivacyFence {
  const blocked = options.blocked ?? new Set<string>();
  return {
    async withShared(workspaceId, operation) {
      options.calls?.push(workspaceId);
      if (blocked.has(workspaceId)) {
        return { disposition: "skipped", state: "blocking" };
      }
      return { disposition: "executed", value: await operation() };
    },
    async withSharedMany(workspaceIds, operation) {
      const canonical = [...new Set(workspaceIds)].sort();
      options.manyCalls?.push(canonical);
      if (canonical.some((workspaceId) => blocked.has(workspaceId))) {
        return { disposition: "skipped", state: "blocking" };
      }
      return { disposition: "executed", value: await operation() };
    },
  };
}

test("blocking workspace 로그인은 session 회전 delegate를 호출하지 않는다", async () => {
  let rotations = 0;
  const calls: string[] = [];
  const store = createPrivacyFencedAuthStore({
    store: storeFixture({
      rotateSession: async () => {
        rotations += 1;
        throw new Error("must not rotate");
      },
    }),
    fence: fenceFixture({ blocked: new Set([WORKSPACE_A]), calls }),
  });

  const principal = await store.rotateSession({
    userId: user().id,
    workspaceId: WORKSPACE_A,
    newTokenHash: "a".repeat(64),
    expiresAt: new Date("2026-09-12T07:00:00.000Z"),
    now: NOW,
  });

  assert.equal(principal, null);
  assert.equal(rotations, 0);
  assert.deepEqual(calls, [WORKSPACE_A]);
});

test("비밀번호 hash 업그레이드는 사용자의 모든 workspace privacy fence 안에서 실행한다", async () => {
  const manyCalls: string[][] = [];
  let upgrades = 0;
  const store = createPrivacyFencedAuthStore({
    store: storeFixture({
      upgradePasswordHash: async () => {
        upgrades += 1;
        return true;
      },
    }),
    fence: fenceFixture({ manyCalls }),
  });

  assert.equal(await store.upgradePasswordHash({
    userId: user().id,
    expectedPasswordHash: "scrypt:legacy",
    passwordHash: "scrypt:current",
    now: NOW,
  }), true);
  assert.deepEqual(manyCalls, [[WORKSPACE_A, WORKSPACE_B]]);
  assert.equal(upgrades, 1);
});

test("진행 중 session commit이 끝날 때까지 삭제 drain이 기다리고 이후 login delegate는 0건이다", async () => {
  let state: "active" | "blocking" = "active";
  let shared = 0;
  let releaseCommit!: () => void;
  let enteredCommit!: () => void;
  const commitEntered = new Promise<void>((resolve) => { enteredCommit = resolve; });
  const commitReleased = new Promise<void>((resolve) => { releaseCommit = resolve; });
  let drained!: () => void;
  const drainWait = new Promise<void>((resolve) => { drained = resolve; });
  let delegates = 0;
  const fence: AuthWorkspacePrivacyFence = {
    async withShared(_workspaceId, operation) {
      if ((state as string) !== "active") {
        return { disposition: "skipped", state: "blocking" };
      }
      shared += 1;
      try {
        return { disposition: "executed", value: await operation() };
      } finally {
        shared -= 1;
        if (state === "blocking" && shared === 0) drained();
      }
    },
    async withSharedMany(_workspaceIds, operation) {
      return this.withShared(WORKSPACE_A, operation);
    },
  };
  const principal = {
    sessionId: "30000000-0000-4000-8000-000000000002",
    userId: user().id,
    workspaceId: WORKSPACE_A,
    email: user().email,
    displayName: user().displayName,
    role: "owner" as const,
    expiresAt: new Date("2026-09-12T07:00:00.000Z"),
  };
  const store = createPrivacyFencedAuthStore({
    store: storeFixture({
      rotateSession: async () => {
        delegates += 1;
        enteredCommit();
        await commitReleased;
        return principal;
      },
    }),
    fence,
  });
  const input = {
    userId: user().id,
    workspaceId: WORKSPACE_A,
    newTokenHash: "9".repeat(64),
    expiresAt: principal.expiresAt,
    now: NOW,
  };

  const startedBeforeDeletion = store.rotateSession(input);
  await commitEntered;
  state = "blocking";
  let deletionDrained = false;
  void drainWait.then(() => { deletionDrained = true; });
  await Promise.resolve();
  assert.equal(deletionDrained, false);

  assert.equal(await store.rotateSession({ ...input, newTokenHash: "8".repeat(64) }), null);
  assert.equal(delegates, 1);
  assert.equal(deletionDrained, false);

  releaseCommit();
  assert.deepEqual(await startedBeforeDeletion, principal);
  await drainWait;
  assert.equal(deletionDrained, true);
});

test("blocking workspace session은 인증·logout 모두 fail closed하고 revoke가 0건이다", async () => {
  let lookups = 0;
  let revocations = 0;
  const rawPrincipal = {
    sessionId: "30000000-0000-4000-8000-000000000001",
    userId: user().id,
    workspaceId: WORKSPACE_A,
    email: user().email,
    displayName: user().displayName,
    role: "owner" as const,
    expiresAt: new Date("2026-09-12T07:00:00.000Z"),
  };
  const store = createPrivacyFencedAuthStore({
    store: storeFixture({
      findSessionByTokenHash: async () => {
        lookups += 1;
        return rawPrincipal;
      },
      revokeSessionByTokenHash: async () => {
        revocations += 1;
        return true;
      },
    }),
    fence: fenceFixture({ blocked: new Set([WORKSPACE_A]) }),
  });

  assert.equal(await store.findSessionByTokenHash("b".repeat(64), NOW), null);
  assert.equal(await store.revokeSessionByTokenHash("b".repeat(64), NOW), false);
  assert.equal(lookups, 2);
  assert.equal(revocations, 0);
});

test("forgot password는 membership 하나라도 blocking이면 reset token과 outbox를 만들지 않는다", async () => {
  let created: CreatePasswordResetInput | undefined;
  const manyCalls: string[][] = [];
  const store = createPrivacyFencedAuthStore({
    store: storeFixture({
      createPasswordReset: async (input) => {
        created = input;
        throw new Error("must not create");
      },
    }),
    fence: fenceFixture({ blocked: new Set([WORKSPACE_A]), manyCalls }),
  });

  const reset = await store.createPasswordReset({
    userId: user().id,
    tokenHash: "c".repeat(64),
    expiresAt: new Date("2026-08-12T07:30:00.000Z"),
    now: NOW,
    delivery: {
      email: user().email,
      resetUrl: "https://app.semforge.test/reset-password/raw",
      expiresAt: new Date("2026-08-12T07:30:00.000Z"),
    },
  });

  assert.equal(reset, null);
  assert.deepEqual(manyCalls, [[WORKSPACE_A, WORKSPACE_B]]);
  assert.equal(created, undefined);
});

test("forgot password는 모든 canonical membership lock을 한 번 잡고 정렬 첫 workspace로 delivery를 만든다", async () => {
  let created: CreatePasswordResetInput | undefined;
  const manyCalls: string[][] = [];
  const store = createPrivacyFencedAuthStore({
    store: storeFixture({
      listMembershipsForUser: async () => [
        { workspaceId: WORKSPACE_B, workspaceName: "B", workspaceSlug: "b", role: "admin" },
        { workspaceId: WORKSPACE_A, workspaceName: "A", workspaceSlug: "a", role: "owner" },
        { workspaceId: WORKSPACE_B, workspaceName: "B", workspaceSlug: "b", role: "admin" },
      ],
      createPasswordReset: async (input) => {
        created = input;
        return { id: "40000000-0000-4000-8000-000000000001", userId: input.userId, expiresAt: input.expiresAt };
      },
    }),
    fence: fenceFixture({ manyCalls }),
  });

  const reset = await store.createPasswordReset({
    userId: user().id,
    tokenHash: "c".repeat(64),
    expiresAt: new Date("2026-08-12T07:30:00.000Z"),
    now: NOW,
    delivery: {
      email: user().email,
      resetUrl: "https://app.semforge.test/reset-password/raw",
      expiresAt: new Date("2026-08-12T07:30:00.000Z"),
    },
  });

  assert.ok(reset);
  assert.deepEqual(manyCalls, [[WORKSPACE_A, WORKSPACE_B]]);
  assert.equal(created?.delivery?.workspaceId, WORKSPACE_A);
});

test("membership이 없으면 reset token과 outbox를 만들지 않는다", async () => {
  let creates = 0;
  const manyCalls: string[][] = [];
  const store = createPrivacyFencedAuthStore({
    store: storeFixture({
      listMembershipsForUser: async () => [],
      createPasswordReset: async () => {
        creates += 1;
        throw new Error("must not create");
      },
    }),
    fence: fenceFixture({ manyCalls }),
  });

  assert.equal(await store.createPasswordReset({
    userId: user().id,
    tokenHash: "d".repeat(64),
    expiresAt: new Date("2026-08-12T07:30:00.000Z"),
    now: NOW,
  }), null);
  assert.equal(creates, 0);
  assert.deepEqual(manyCalls, []);
});

test("password reset은 모든 canonical membership shared lock 안에서만 원자 실행한다", async () => {
  let resets = 0;
  const manyCalls: string[][] = [];
  const blockedStore = createPrivacyFencedAuthStore({
    store: storeFixture({
      preparePasswordReset: async () => ({ status: "ready", userId: user().id }),
      resetPasswordAtomic: async () => {
        resets += 1;
        throw new Error("must not reset");
      },
    }),
    fence: fenceFixture({ blocked: new Set([WORKSPACE_B]), manyCalls }),
  });
  const input = { tokenHash: "e".repeat(64), passwordHash: "scrypt:new", now: NOW };

  assert.deepEqual(await blockedStore.resetPasswordAtomic(input), { status: "invalid" });
  assert.equal(resets, 0);
  assert.deepEqual(manyCalls, [[WORKSPACE_A, WORKSPACE_B]]);

  const activeStore = createPrivacyFencedAuthStore({
    store: storeFixture({
      preparePasswordReset: async () => ({ status: "ready", userId: user().id }),
      resetPasswordAtomic: async () => {
        resets += 1;
        return { status: "reset", userId: user().id };
      },
    }),
    fence: fenceFixture(),
  });
  assert.deepEqual(await activeStore.resetPasswordAtomic(input), {
    status: "reset",
    userId: user().id,
  });
  assert.equal(resets, 1);
});

test("기존 사용자 invite는 기존 membership fence를 요구하고 신규 사용자는 새 workspace를 원자 생성하도록 통과시킨다", async () => {
  let accepts = 0;
  const inner = storeFixture({
    acceptInviteAtomic: async () => {
      accepts += 1;
      return { status: "invalid" };
    },
  });
  const blockedStore = createPrivacyFencedAuthStore({
    store: inner,
    fence: fenceFixture({ blocked: new Set([WORKSPACE_A]) }),
  });
  const existingInput = {
    tokenHash: "f".repeat(64),
    email: user().email,
    user: { kind: "existing" as const, userId: user().id, expectedPasswordHash: user().passwordHash },
    sessionTokenHash: "1".repeat(64),
    sessionExpiresAt: new Date("2026-09-12T07:00:00.000Z"),
    now: NOW,
  };

  assert.deepEqual(await blockedStore.acceptInviteAtomic(existingInput), { status: "invalid" });
  assert.equal(accepts, 0);

  const newInput = {
    ...existingInput,
    user: { kind: "new" as const, passwordHash: "scrypt:new" },
  };
  assert.deepEqual(await blockedStore.acceptInviteAtomic(newInput), { status: "invalid" });
  assert.equal(accepts, 1);
});
