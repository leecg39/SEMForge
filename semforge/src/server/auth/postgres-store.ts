// @TASK P2-A1-T1 - PostgreSQL invite-only auth adapter
// @SPEC docs/planning/06-tasks.md#p2-a1-t1--초대-전용-인증과-세션
// @TEST src/server/auth/postgres-store.test.ts
import { randomUUID } from "node:crypto";

import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";

import { getDatabase, type SemforgeDatabase } from "@/db/client";
import {
  authActionThrottles,
  billingCustomers,
  invites,
  legalAcceptances,
  memberships,
  outbox,
  passwordResets,
  sessions,
  subscriptions,
  users,
  workspaces,
} from "@/db/schema";
import type {
  AcceptInviteInput,
  AcceptInviteResult,
  AuthStore,
  AuthPasswordReset,
  AuthInvite,
  AuthMembership,
  AuthSessionPrincipal,
  AuthThrottleAction,
  AuthThrottleDecision,
  AuthUser,
  ConsumeAuthThrottleInput,
  CreatePasswordResetInput,
  CreateInviteInput,
  PrepareInviteAcceptanceInput,
  PrepareInviteAcceptanceResult,
  OperatorInviteStore,
  ResetPasswordInput,
  ResetPasswordResult,
  RotateSessionInput,
} from "@/server/auth/store";
import {
  DEFAULT_AUTH_THROTTLE_LIMIT,
  DEFAULT_AUTH_THROTTLE_WINDOW_MS,
} from "@/server/auth/store";
import { createInviteInputSchema } from "@/server/auth/schemas";
import { currentLegalDocuments } from "@/server/privacy/legal-documents";

function normalizeEmail(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function normalizedDisplayName(value: string | null | undefined): string | null {
  const result = value?.normalize("NFKC").trim();
  return result ? result : null;
}

function normalizeWorkspaceName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function assertFuture(date: Date, now: Date, label: string): void {
  if (Number.isNaN(date.getTime()) || date <= now) {
    throw new RangeError(`${label}은 현재보다 미래여야 합니다.`);
  }
}

class AuthAtomicConflictError extends Error {
  constructor() {
    super("인증 상태가 다른 요청에 의해 변경되었습니다.");
    this.name = "AuthAtomicConflictError";
  }
}

function toAuthUser(row: typeof users.$inferSelect): AuthUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    disabledAt: row.disabledAt,
  };
}

function deriveTossCustomerKey(workspaceId: string): string {
  return `semforge_${workspaceId.replaceAll("-", "")}`;
}

/** pending invite의 workspace provisioning intent만 쓰는 운영자 전용 경계다. */
export class PostgresOperatorInviteStore implements OperatorInviteStore {
  constructor(
    private readonly database: SemforgeDatabase = getDatabase("operator"),
  ) {}

  async createInvite(input: CreateInviteInput): Promise<AuthInvite> {
    const now = input.now ?? new Date();
    const validation = createInviteInputSchema.safeParse({
      email: input.email,
      workspaceName: input.workspaceName,
      workspaceSlug: input.workspaceSlug,
    });
    if (!validation.success) {
      const issue = validation.error.issues[0];
      const field = issue?.path[0];
      if (field === "email") {
        throw new TypeError("유효한 초대 이메일을 입력하세요.");
      }
      if (field === "workspaceName") {
        throw new TypeError("유효한 workspace name을 입력하세요.");
      }
      if (field === "workspaceSlug") {
        throw new TypeError("유효한 workspace slug를 입력하세요.");
      }
      throw new TypeError("초대 입력값이 올바르지 않습니다.");
    }
    const email = normalizeEmail(validation.data.email);
    const workspaceName = normalizeWorkspaceName(validation.data.workspaceName);
    const workspaceSlug = validation.data.workspaceSlug
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase("en-US");
    if (!email || !input.tokenHash) throw new TypeError("초대 이메일과 token hash가 필요합니다.");
    if (input.role !== "owner") throw new TypeError("신규 workspace 초대 role은 owner여야 합니다.");
    if (!workspaceName || !workspaceSlug) {
      throw new TypeError("workspace name과 slug가 필요합니다.");
    }
    assertFuture(input.expiresAt, now, "초대 만료 시각");

    return this.database.transaction(async (transaction) => {
      const tx = transaction as SemforgeDatabase;
      await tx
        .update(invites)
        .set({ supersededAt: sql`now()` })
        .where(
          and(
            isNull(invites.acceptedAt),
            isNull(invites.supersededAt),
            sql`${invites.expiresAt} <= now()`,
            or(
              sql`lower(${invites.email}) = ${email}`,
              eq(invites.workspaceSlug, workspaceSlug),
            ),
          ),
        );

      const [invite] = await tx
        .insert(invites)
        .values({
          workspaceName,
          workspaceSlug,
          email,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        })
        .returning({ id: invites.id });
      if (!invite) throw new Error("초대를 생성하지 못했습니다.");
      return {
        id: invite.id,
        acceptedWorkspaceId: null,
        workspaceName,
        workspaceSlug,
        email,
        role: "owner",
        expiresAt: input.expiresAt,
      };
    });
  }
}

/**
 * 로그인·초대 수락은 workspace가 확정되기 전 실행된다. 따라서 이 어댑터는
 * tenant GUC가 필요한 web role이 아니라 auth 표와 onboarding write만 허용된
 * `semforge_auth` 연결을 사용한다. 이 role은 NOBYPASSRLS이며 범용 tenant 접근권이 없다.
 */
export class PostgresAuthStore implements AuthStore {
  constructor(
    private readonly database: SemforgeDatabase = getDatabase("auth"),
  ) {}

  async prepareInviteAcceptance(
    input: PrepareInviteAcceptanceInput,
  ): Promise<PrepareInviteAcceptanceResult> {
    const email = normalizeEmail(input.email);
    const [invite] = await this.database
      .select({ id: invites.id })
      .from(invites)
      .where(
        and(
          eq(invites.tokenHash, input.tokenHash),
          isNull(invites.acceptedWorkspaceId),
          isNull(invites.acceptedAt),
          isNull(invites.supersededAt),
          gt(invites.expiresAt, input.now),
          sql`lower(${invites.email}) = ${email}`,
        ),
      )
      .limit(1);
    if (!invite) return { status: "invalid" };

    const user = await this.findUserByEmail(email);
    if (user?.disabledAt) return { status: "invalid" };
    return { status: "ready", user };
  }

  async acceptInviteAtomic(input: AcceptInviteInput): Promise<AcceptInviteResult> {
    const email = normalizeEmail(input.email);
    assertFuture(input.sessionExpiresAt, input.now, "세션 만료 시각");

    try {
      return await this.database.transaction(async (transaction): Promise<AcceptInviteResult> => {
        const tx = transaction as SemforgeDatabase;
        const [invite] = await tx
          .select()
          .from(invites)
          .where(eq(invites.tokenHash, input.tokenHash))
          .limit(1)
          .for("update");

        if (
          !invite ||
          invite.acceptedAt ||
          invite.acceptedWorkspaceId ||
          invite.supersededAt
        ) {
          return { status: "invalid" };
        }
        if (invite.expiresAt <= input.now) return { status: "expired" };
        if (normalizeEmail(invite.email) !== email) return { status: "email_mismatch" };
        if (!invite.workspaceName || !invite.workspaceSlug || invite.role !== "owner") {
          return { status: "invalid" };
        }

        let user: typeof users.$inferSelect | undefined;
        if (input.user.kind === "existing") {
          [user] = await tx
            .select()
            .from(users)
            .where(eq(users.id, input.user.userId))
            .limit(1)
            .for("update");
          if (
            !user ||
            user.disabledAt ||
            normalizeEmail(user.email) !== email ||
            user.passwordHash !== input.user.expectedPasswordHash
          ) {
            return { status: "invalid" };
          }
        } else {
          [user] = await tx
            .insert(users)
            .values({
              email,
              passwordHash: input.user.passwordHash,
              displayName: normalizedDisplayName(input.user.displayName),
              emailVerifiedAt: input.now,
              createdAt: input.now,
              updatedAt: input.now,
            })
            .onConflictDoNothing()
            .returning();
          if (!user) return { status: "invalid" };
        }

        const [workspace] = await tx
          .insert(workspaces)
          .values({
            name: invite.workspaceName,
            slug: invite.workspaceSlug,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .onConflictDoNothing()
          .returning({ id: workspaces.id });
        if (!workspace) throw new AuthAtomicConflictError();

        const [membership] = await tx
          .insert(memberships)
          .values({
            workspaceId: workspace.id,
            userId: user.id,
            role: "owner",
            createdAt: input.now,
          })
          .returning({ role: memberships.role });
        if (!membership) throw new AuthAtomicConflictError();

        const billingCustomerId = randomUUID();
        await tx
          .insert(billingCustomers)
          .values({
            id: billingCustomerId,
            workspaceId: workspace.id,
            tossCustomerKey: deriveTossCustomerKey(workspace.id),
            createdAt: input.now,
            updatedAt: input.now,
          })
          .onConflictDoNothing();

        await tx
          .insert(subscriptions)
          .values({
            id: randomUUID(),
            workspaceId: workspace.id,
            billingCustomerId,
            status: "account_created",
            amountKrw: 49_000,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .onConflictDoNothing();

        const legalDocuments = currentLegalDocuments();
        const legalAcceptance = input.legalAcceptance ?? {
          termsVersion: legalDocuments.terms.version,
          termsSha256: legalDocuments.terms.sha256,
          privacyVersion: legalDocuments.privacy.version,
          privacySha256: legalDocuments.privacy.sha256,
          presentedAt: input.now,
        };
        await tx.insert(legalAcceptances).values({
          workspaceId: workspace.id,
          userId: user.id,
          termsVersion: legalAcceptance.termsVersion,
          termsSha256: legalAcceptance.termsSha256,
          privacyVersion: legalAcceptance.privacyVersion,
          privacySha256: legalAcceptance.privacySha256,
          presentedAt: legalAcceptance.presentedAt,
          acceptedAt: input.now,
          createdAt: input.now,
        });

        const consumed = await tx
          .update(invites)
          .set({
            acceptedWorkspaceId: workspace.id,
          acceptedAt: sql`now()`,
          acceptedByUserId: user.id,
        })
          .where(
            and(
              eq(invites.id, invite.id),
              isNull(invites.acceptedWorkspaceId),
              isNull(invites.acceptedAt),
            ),
          )
          .returning({ id: invites.id });
        if (consumed.length !== 1) throw new AuthAtomicConflictError();

        if (input.currentSessionTokenHash) {
          await tx
            .update(sessions)
            .set({ revokedAt: input.now })
            .where(
              and(
                eq(sessions.tokenHash, input.currentSessionTokenHash),
                eq(sessions.userId, user.id),
                isNull(sessions.revokedAt),
              ),
            );
        }

        const [session] = await tx
          .insert(sessions)
          .values({
            workspaceId: workspace.id,
            userId: user.id,
            tokenHash: input.sessionTokenHash,
            expiresAt: input.sessionExpiresAt,
            createdAt: input.now,
          })
          .returning({ id: sessions.id, expiresAt: sessions.expiresAt });
        if (!session) throw new AuthAtomicConflictError();

        return {
          status: "accepted",
          principal: {
            sessionId: session.id,
            userId: user.id,
            workspaceId: workspace.id,
            email: user.email,
            displayName: user.displayName,
            role: membership.role,
            expiresAt: session.expiresAt,
          },
        };
      });
    } catch (error) {
      if (error instanceof AuthAtomicConflictError) return { status: "invalid" };
      throw error;
    }
  }

  async findUserByEmail(email: string): Promise<AuthUser | null> {
    const [user] = await this.database
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizeEmail(email)}`)
      .limit(1);
    return user ? toAuthUser(user) : null;
  }

  async findUserById(userId: string): Promise<AuthUser | null> {
    const [user] = await this.database.select().from(users).where(eq(users.id, userId)).limit(1);
    return user ? toAuthUser(user) : null;
  }

  async listMembershipsForUser(userId: string): Promise<readonly AuthMembership[]> {
    return this.database
      .select({
        workspaceId: memberships.workspaceId,
        workspaceName: workspaces.name,
        workspaceSlug: workspaces.slug,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
      .where(eq(memberships.userId, userId))
      .orderBy(asc(memberships.createdAt), asc(memberships.workspaceId));
  }

  async findSessionByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<AuthSessionPrincipal | null> {
    const [principal] = await this.database
      .select({
        sessionId: sessions.id,
        userId: users.id,
        workspaceId: sessions.workspaceId,
        email: users.email,
        displayName: users.displayName,
        role: memberships.role,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .innerJoin(
        memberships,
        and(
          eq(memberships.userId, sessions.userId),
          eq(memberships.workspaceId, sessions.workspaceId),
        ),
      )
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
          isNull(users.disabledAt),
        ),
      )
      .limit(1);
    return principal ?? null;
  }

  async rotateSession(input: RotateSessionInput): Promise<AuthSessionPrincipal | null> {
    assertFuture(input.expiresAt, input.now, "세션 만료 시각");
    if (!input.newTokenHash) throw new TypeError("새 session token hash가 필요합니다.");
    if (input.currentTokenHash === input.newTokenHash) {
      throw new TypeError("session rotation에는 서로 다른 token hash가 필요합니다.");
    }

    return this.database.transaction(async (transaction) => {
      const tx = transaction as SemforgeDatabase;
      const [identity] = await tx
        .select({
          email: users.email,
          displayName: users.displayName,
          role: memberships.role,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.userId, input.userId),
            eq(memberships.workspaceId, input.workspaceId),
            isNull(users.disabledAt),
          ),
        )
        .limit(1)
        .for("update");
      if (!identity) return null;

      if (input.currentTokenHash) {
        await tx
          .update(sessions)
          .set({ revokedAt: input.now })
          .where(
            and(
              eq(sessions.tokenHash, input.currentTokenHash),
              eq(sessions.userId, input.userId),
              eq(sessions.workspaceId, input.workspaceId),
              isNull(sessions.revokedAt),
            ),
          );
      }

      const [session] = await tx
        .insert(sessions)
        .values({
          userId: input.userId,
          workspaceId: input.workspaceId,
          tokenHash: input.newTokenHash,
          expiresAt: input.expiresAt,
          createdAt: input.now,
        })
        .returning({ id: sessions.id, expiresAt: sessions.expiresAt });
      if (!session) throw new Error("session rotation에 실패했습니다.");

      return {
        sessionId: session.id,
        userId: input.userId,
        workspaceId: input.workspaceId,
        email: identity.email,
        displayName: identity.displayName,
        role: identity.role,
        expiresAt: session.expiresAt,
      };
    });
  }

  async revokeSessionByTokenHash(tokenHash: string, now: Date): Promise<boolean> {
    const revoked = await this.database
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    return revoked.length > 0;
  }

  async revokeSessionsForUser(userId: string, now: Date): Promise<number> {
    const revoked = await this.database
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    return revoked.length;
  }

  async createPasswordReset(input: CreatePasswordResetInput): Promise<AuthPasswordReset> {
    assertFuture(input.expiresAt, input.now, "비밀번호 재설정 만료 시각");
    if (!input.tokenHash) throw new TypeError("password reset token hash가 필요합니다.");

    return this.database.transaction(async (transaction) => {
      const tx = transaction as SemforgeDatabase;
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, input.userId), isNull(users.disabledAt)))
        .limit(1)
        .for("update");
      if (!user) throw new Error("비밀번호 재설정 사용자를 찾을 수 없습니다.");

      await tx
        .update(passwordResets)
        .set({ usedAt: input.now })
        .where(
          and(
            eq(passwordResets.userId, input.userId),
            isNull(passwordResets.usedAt),
          ),
        );

      const [reset] = await tx
        .insert(passwordResets)
        .values({
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          createdAt: input.now,
        })
        .returning({
          id: passwordResets.id,
          userId: passwordResets.userId,
          expiresAt: passwordResets.expiresAt,
        });
      if (!reset) throw new Error("비밀번호 재설정 token을 생성하지 못했습니다.");

      if (input.delivery) {
        const [membership] = await tx
          .select({ workspaceId: memberships.workspaceId })
          .from(memberships)
          .where(eq(memberships.userId, input.userId))
          .orderBy(asc(memberships.createdAt), asc(memberships.workspaceId))
          .limit(1);
        if (!membership) {
          throw new Error("비밀번호 재설정 outbox workspace를 찾을 수 없습니다.");
        }

        await tx
          .insert(outbox)
          .values({
            workspaceId: membership.workspaceId,
            topic: "email.password_reset",
            payload: {
              kind: "password_reset",
              email: input.delivery.email,
              resetUrl: input.delivery.resetUrl,
              expiresAt: input.delivery.expiresAt.toISOString(),
            },
            idempotencyKey: `password-reset:${reset.id}`,
            availableAt: input.now,
            createdAt: input.now,
          });
      }
      return reset;
    });
  }

  async resetPasswordAtomic(input: ResetPasswordInput): Promise<ResetPasswordResult> {
    if (!input.passwordHash) throw new TypeError("새 password hash가 필요합니다.");

    try {
      return await this.database.transaction(async (transaction): Promise<ResetPasswordResult> => {
        const tx = transaction as SemforgeDatabase;
        const [reset] = await tx
          .select()
          .from(passwordResets)
          .where(eq(passwordResets.tokenHash, input.tokenHash))
          .limit(1)
          .for("update");
        if (!reset || reset.usedAt) return { status: "invalid" };
        if (reset.expiresAt <= input.now) return { status: "expired" };

        const [user] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, reset.userId), isNull(users.disabledAt)))
          .limit(1)
          .for("update");
        if (!user) return { status: "invalid" };

        const consumed = await tx
          .update(passwordResets)
          .set({ usedAt: input.now })
          .where(and(eq(passwordResets.id, reset.id), isNull(passwordResets.usedAt)))
          .returning({ id: passwordResets.id });
        if (consumed.length !== 1) throw new AuthAtomicConflictError();

        const changed = await tx
          .update(users)
          .set({ passwordHash: input.passwordHash, updatedAt: input.now })
          .where(eq(users.id, user.id))
          .returning({ id: users.id });
        if (changed.length !== 1) throw new AuthAtomicConflictError();

        await tx
          .update(sessions)
          .set({ revokedAt: input.now })
          .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
        return { status: "reset", userId: user.id };
      });
    } catch (error) {
      if (error instanceof AuthAtomicConflictError) return { status: "invalid" };
      throw error;
    }
  }

  async consumeAuthThrottle(input: ConsumeAuthThrottleInput): Promise<AuthThrottleDecision> {
    const limit = input.limit ?? DEFAULT_AUTH_THROTTLE_LIMIT;
    const windowMs = input.windowMs ?? DEFAULT_AUTH_THROTTLE_WINDOW_MS;
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError("auth throttle limit은 1 이상의 정수여야 합니다.");
    }
    if (!Number.isInteger(windowMs) || windowMs < 1_000) {
      throw new RangeError("auth throttle window는 1초 이상의 정수 밀리초여야 합니다.");
    }
    if (!/^[0-9a-f]{64}$/u.test(input.keyHash)) {
      throw new TypeError("auth throttle key는 SHA-256 lower-hex hash여야 합니다.");
    }

    const windowExpired = sql`${authActionThrottles.windowStartedAt} + (${windowMs} * interval '1 millisecond') <= ${input.now}`;
    const activeBlock = sql`${authActionThrottles.blockedUntil} > ${input.now}`;
    const [row] = await this.database
      .insert(authActionThrottles)
      .values({
        action: input.action,
        keyHash: input.keyHash,
        windowStartedAt: input.now,
        attemptCount: 1,
        blockedUntil: null,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [authActionThrottles.action, authActionThrottles.keyHash],
        set: {
          windowStartedAt: sql`case when ${windowExpired} then ${input.now} else ${authActionThrottles.windowStartedAt} end`,
          attemptCount: sql`case when ${windowExpired} then 1 when ${activeBlock} then ${authActionThrottles.attemptCount} else ${authActionThrottles.attemptCount} + 1 end`,
          blockedUntil: sql`case when ${windowExpired} then null when ${activeBlock} then ${authActionThrottles.blockedUntil} when ${authActionThrottles.attemptCount} + 1 > ${limit} then ${authActionThrottles.windowStartedAt} + (${windowMs} * interval '1 millisecond') else null end`,
          updatedAt: input.now,
        },
      })
      .returning({
        attemptCount: authActionThrottles.attemptCount,
        blockedUntil: authActionThrottles.blockedUntil,
      });
    if (!row) throw new Error("auth throttle을 갱신하지 못했습니다.");

    const allowed = !row.blockedUntil || row.blockedUntil <= input.now;
    return {
      allowed,
      remaining: allowed ? Math.max(0, limit - row.attemptCount) : 0,
      blockedUntil: allowed ? null : row.blockedUntil,
      retryAfterSeconds: allowed
        ? 0
        : Math.max(1, Math.ceil((row.blockedUntil!.getTime() - input.now.getTime()) / 1_000)),
    };
  }

  async clearAuthThrottle(action: AuthThrottleAction, keyHash: string): Promise<void> {
    await this.database
      .delete(authActionThrottles)
      .where(
        and(
          eq(authActionThrottles.action, action),
          eq(authActionThrottles.keyHash, keyHash),
        ),
      );
  }
}
