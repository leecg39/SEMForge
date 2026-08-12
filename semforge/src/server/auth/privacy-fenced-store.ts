// @TASK P5-PRIVACY-AUTH - Race-safe auth mutations during workspace erasure
// @SPEC docs/ops/privacy-erasure-runbook.md
// @TEST src/server/auth/privacy-fenced-store.test.ts
import type {
  AcceptInviteResult,
  AuthStore,
  CreatePasswordResetInput,
  ResetPasswordResult,
} from "@/server/auth/store";

export type AuthWorkspaceSharedResult<T> =
  | { readonly disposition: "executed"; readonly value: T }
  | { readonly disposition: "skipped"; readonly state: "blocking" | "erased" };

/** PostgreSQL privacy fence가 구현하는 auth 전용 structural port다. */
export interface AuthWorkspacePrivacyFence {
  withShared<T>(
    workspaceId: string,
    operation: () => Promise<T>,
  ): Promise<AuthWorkspaceSharedResult<T>>;
  withSharedMany<T>(
    workspaceIds: readonly string[],
    operation: () => Promise<T>,
  ): Promise<AuthWorkspaceSharedResult<T>>;
}

function canonicalWorkspaceIds(
  memberships: Awaited<ReturnType<AuthStore["listMembershipsForUser"]>>,
): readonly string[] {
  return [...new Set(memberships.map((membership) => membership.workspaceId))].sort();
}

async function runAcrossAllMemberships<T>(input: {
  readonly store: AuthStore;
  readonly fence: AuthWorkspacePrivacyFence;
  readonly userId: string;
  readonly operation: () => Promise<T>;
}): Promise<AuthWorkspaceSharedResult<T> | null> {
  const workspaceIds = canonicalWorkspaceIds(
    await input.store.listMembershipsForUser(input.userId),
  );
  if (workspaceIds.length === 0) return null;
  return input.fence.withSharedMany(workspaceIds, input.operation);
}

/**
 * pre-tenant auth 조회는 제한된 auth role에 남기되, workspace가 확정된 순간부터
 * 모든 session/legal/reset/outbox mutation을 shared advisory fence 안에 둔다.
 */
export function createPrivacyFencedAuthStore(dependencies: {
  readonly store: AuthStore;
  readonly fence: AuthWorkspacePrivacyFence;
}): AuthStore {
  const { store, fence } = dependencies;
  return {
    prepareInviteAcceptance: (input) => store.prepareInviteAcceptance(input),

    async acceptInviteAtomic(input): Promise<AcceptInviteResult> {
      // 신규 사용자는 새 workspace와 active control row를 같은 DB transaction에서
      // 생성한다. 기존 사용자의 global identity/session은 기존 tenant 전체 fence가 필요하다.
      if (input.user.kind === "new") return store.acceptInviteAtomic(input);
      const result = await runAcrossAllMemberships({
        store,
        fence,
        userId: input.user.userId,
        operation: () => store.acceptInviteAtomic(input),
      });
      return result?.disposition === "executed" ? result.value : { status: "invalid" };
    },

    findUserByEmail: (email) => store.findUserByEmail(email),
    findUserById: (userId) => store.findUserById(userId),
    listMembershipsForUser: (userId) => store.listMembershipsForUser(userId),

    async rotateSession(input) {
      const result = await fence.withShared(
        input.workspaceId,
        () => store.rotateSession(input),
      );
      return result.disposition === "executed" ? result.value : null;
    },

    async findSessionByTokenHash(tokenHash, now) {
      const canonical = await store.findSessionByTokenHash(tokenHash, now);
      if (!canonical) return null;
      const result = await fence.withShared(
        canonical.workspaceId,
        () => store.findSessionByTokenHash(tokenHash, now),
      );
      return result.disposition === "executed" ? result.value : null;
    },

    async revokeSessionByTokenHash(tokenHash, now) {
      const canonical = await store.findSessionByTokenHash(tokenHash, now);
      if (!canonical) return false;
      const result = await fence.withShared(
        canonical.workspaceId,
        () => store.revokeSessionByTokenHash(tokenHash, now),
      );
      return result.disposition === "executed" ? result.value : false;
    },

    async revokeSessionsForUser(userId, now) {
      const result = await runAcrossAllMemberships({
        store,
        fence,
        userId,
        operation: () => store.revokeSessionsForUser(userId, now),
      });
      return result?.disposition === "executed" ? result.value : 0;
    },

    async createPasswordReset(input) {
      const workspaceIds = canonicalWorkspaceIds(
        await store.listMembershipsForUser(input.userId),
      );
      for (const workspaceId of workspaceIds) {
        const fencedInput: CreatePasswordResetInput = input.delivery
          ? { ...input, delivery: { ...input.delivery, workspaceId } }
          : input;
        const result = await fence.withShared(
          workspaceId,
          () => store.createPasswordReset(fencedInput),
        );
        if (result.disposition === "executed") return result.value;
      }
      return null;
    },

    preparePasswordReset: (tokenHash, now) => store.preparePasswordReset(tokenHash, now),

    async resetPasswordAtomic(input): Promise<ResetPasswordResult> {
      const prepared = await store.preparePasswordReset(input.tokenHash, input.now);
      if (prepared.status !== "ready") return prepared;
      const result = await runAcrossAllMemberships({
        store,
        fence,
        userId: prepared.userId,
        operation: () => store.resetPasswordAtomic(input),
      });
      return result?.disposition === "executed" ? result.value : { status: "invalid" };
    },

    consumeAuthThrottle: (input) => store.consumeAuthThrottle(input),
    clearAuthThrottle: (action, keyHash) => store.clearAuthThrottle(action, keyHash),
  };
}
