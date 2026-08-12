// @TASK P5-S1-T1 - Encrypted password-reset email delivery
// @SPEC docs/planning/06-tasks.md#p2-a1-t1--초대-전용-인증과-세션
// @TEST src/server/auth/password-reset-email.test.ts
import { createHash } from "node:crypto";

import { z } from "zod";

import type { SecretCrypto } from "@/lib/crypto";
import { passwordResetDeliveryAad } from "@/server/auth/postgres-store";
import {
  defineJobHandler,
  jobDead,
  jobRetryable,
  jobSucceeded,
  type JobHandler,
} from "@/server/jobs/contracts";
import type { SqlQueryable } from "@/server/jobs/queue";
import type { TransactionalEmailSender } from "@/server/reports/delivery/resend";
import { ReportEmailSenderError } from "@/server/reports/delivery/service";

export const PASSWORD_RESET_EMAIL_JOB = "email.password_reset";

const EncryptedPayload = z.object({
  kind: z.literal("password_reset"),
  resetId: z.uuid(),
  encryptedDelivery: z.string().startsWith("enc:v1:").max(8_192),
  expiresAt: z.iso.datetime({ offset: true }),
}).strict();

const ResetPayloadIdentity = z.object({
  kind: z.literal("password_reset"),
  resetId: z.uuid(),
}).passthrough();

const ScrubState = z.enum([
  "delivered",
  "rejected",
  "expired",
  "invalid",
  "retry_exhausted",
]);

const ScrubbedPayload = z.object({
  kind: z.literal("password_reset_scrubbed"),
  resetId: z.uuid(),
  state: ScrubState,
  scrubbedAt: z.iso.datetime({ offset: true }),
  providerMessageId: z.string().trim().min(1).max(200).optional(),
}).strict();

const SuppressionRecipient = z.string().trim().toLowerCase().max(320).pipe(z.email());

const Delivery = z.object({
  email: SuppressionRecipient,
  resetUrl: z.url().max(2_048),
  expiresAt: z.iso.datetime({ offset: true }),
}).strict();

export type PasswordResetEmailScrubState = z.infer<typeof ScrubState>;

export interface PasswordResetEmailScrubInput {
  readonly workspaceId: string;
  readonly jobId: string;
  readonly resetId: string;
  readonly state: PasswordResetEmailScrubState;
  readonly scrubbedAt: Date;
  readonly providerMessageId?: string;
}

export interface PasswordResetEmailStore {
  scrub(input: PasswordResetEmailScrubInput): Promise<void>;
}

export interface PasswordResetEmailSuppressionPolicy {
  isSuppressed(input: {
    readonly workspaceId: string;
    readonly recipient: string;
  }): Promise<boolean>;
}

interface PasswordResetEmailSqlConnection extends SqlQueryable {
  release(): void;
}

export interface PasswordResetEmailTenantSqlSource {
  connect(): Promise<PasswordResetEmailSqlConnection>;
}

export interface PasswordResetEmailJobDependencies {
  readonly crypto: Pick<SecretCrypto, "decryptOrThrow">;
  readonly sender: TransactionalEmailSender;
  readonly store: PasswordResetEmailStore;
  readonly suppression: PasswordResetEmailSuppressionPolicy;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function terminalError(state: PasswordResetEmailScrubState): string {
  switch (state) {
    case "rejected": return "PASSWORD_RESET_EMAIL_REJECTED";
    case "expired": return "PASSWORD_RESET_EMAIL_EXPIRED";
    case "invalid": return "PASSWORD_RESET_EMAIL_INVALID_PAYLOAD";
    case "retry_exhausted": return "PASSWORD_RESET_EMAIL_RETRY_EXHAUSTED";
    case "delivered": return "PASSWORD_RESET_EMAIL_ALREADY_DELIVERED";
  }
}

function replayScrubbed(payload: z.infer<typeof ScrubbedPayload>) {
  return payload.state === "delivered"
    ? jobSucceeded({ resetId: payload.resetId, deliveryStatus: "already_delivered" })
    : jobDead(terminalError(payload.state));
}

export function createPasswordResetEmailJobHandler(
  dependencies: PasswordResetEmailJobDependencies,
): JobHandler<Record<string, unknown>> {
  return defineJobHandler<Record<string, unknown>>(async (job, context) => {
    if (job.workspaceId !== context.workspaceId) {
      return jobDead("PASSWORD_RESET_EMAIL_WORKSPACE_MISMATCH");
    }
    if (job.type !== PASSWORD_RESET_EMAIL_JOB) {
      return jobDead("PASSWORD_RESET_EMAIL_INVALID_TYPE");
    }

    const scrubbed = ScrubbedPayload.safeParse(job.payload);
    if (scrubbed.success) return replayScrubbed(scrubbed.data);

    const parsed = EncryptedPayload.safeParse(job.payload);
    if (!parsed.success) {
      const identity = ResetPayloadIdentity.safeParse(job.payload);
      if (!identity.success) return jobDead("PASSWORD_RESET_EMAIL_INVALID_PAYLOAD");
      try {
        await dependencies.store.scrub({
          workspaceId: job.workspaceId,
          jobId: job.id,
          resetId: identity.data.resetId,
          state: "invalid",
          scrubbedAt: context.now(),
        });
        return jobDead("PASSWORD_RESET_EMAIL_INVALID_PAYLOAD");
      } catch {
        return jobRetryable("PASSWORD_RESET_EMAIL_SCRUB_RETRYABLE");
      }
    }
    if (context.signal.aborted) return jobRetryable("PASSWORD_RESET_EMAIL_ABORTED");

    const scrub = async (
      state: PasswordResetEmailScrubState,
      providerMessageId?: string,
    ) => dependencies.store.scrub({
      workspaceId: job.workspaceId,
      jobId: job.id,
      resetId: parsed.data.resetId,
      state,
      scrubbedAt: context.now(),
      ...(providerMessageId ? { providerMessageId } : {}),
    });

    const terminalAfterScrub = async (
      state: Exclude<PasswordResetEmailScrubState, "delivered">,
      error: string,
    ) => {
      try {
        await scrub(state);
        return jobDead(error);
      } catch {
        return jobRetryable("PASSWORD_RESET_EMAIL_SCRUB_RETRYABLE");
      }
    };

    const outerExpiry = new Date(parsed.data.expiresAt);
    if (outerExpiry <= context.now()) {
      return terminalAfterScrub("expired", "PASSWORD_RESET_EMAIL_EXPIRED");
    }

    let delivery: z.infer<typeof Delivery>;
    try {
      const decrypted = dependencies.crypto.decryptOrThrow(
        parsed.data.encryptedDelivery,
        passwordResetDeliveryAad(job.workspaceId, parsed.data.resetId),
      );
      const result = Delivery.safeParse(JSON.parse(decrypted) as unknown);
      if (!result.success || result.data.expiresAt !== parsed.data.expiresAt) {
        return terminalAfterScrub("invalid", "PASSWORD_RESET_EMAIL_INVALID_PAYLOAD");
      }
      const resetUrl = new URL(result.data.resetUrl);
      if (resetUrl.protocol !== "https:" && resetUrl.hostname !== "localhost") {
        return terminalAfterScrub("invalid", "PASSWORD_RESET_EMAIL_INVALID_PAYLOAD");
      }
      delivery = result.data;
    } catch {
      return terminalAfterScrub("invalid", "PASSWORD_RESET_EMAIL_INVALID_PAYLOAD");
    }

    try {
      if (await dependencies.suppression.isSuppressed({
        workspaceId: job.workspaceId,
        recipient: delivery.email,
      })) {
        return terminalAfterScrub("rejected", "PASSWORD_RESET_EMAIL_SUPPRESSED");
      }
    } catch {
      // suppression 확인 실패는 발송 허용으로 폴백하지 않는다.
      return jobRetryable("PASSWORD_RESET_EMAIL_SUPPRESSION_RETRYABLE");
    }

    let sent: { providerMessageId: string };
    try {
      sent = await dependencies.sender.sendTransactional({
        recipient: delivery.email,
        subject: "SEMForge 비밀번호 재설정",
        html: `<p>요청한 비밀번호 재설정 링크입니다.</p><p><a href="${escapeHtml(delivery.resetUrl)}">비밀번호 재설정</a></p><p>이 링크는 30분 후 만료됩니다.</p>`,
        idempotencyKey: `password-reset:${parsed.data.resetId}`,
      });
    } catch (error) {
      if (error instanceof ReportEmailSenderError && error.disposition === "rejected") {
        return terminalAfterScrub("rejected", "PASSWORD_RESET_EMAIL_REJECTED");
      }
      if (job.attempt >= job.maxAttempts) {
        return terminalAfterScrub(
          "retry_exhausted",
          "PASSWORD_RESET_EMAIL_RETRY_EXHAUSTED",
        );
      }
      return jobRetryable("PASSWORD_RESET_EMAIL_RETRYABLE");
    }

    try {
      await scrub("delivered", sent.providerMessageId);
    } catch {
      // Provider replay uses the same key, so a DB outage remains safely retryable.
      return jobRetryable("PASSWORD_RESET_EMAIL_SCRUB_RETRYABLE");
    }
    await context.audit("auth.password_reset_email.delivered", {
      resetId: parsed.data.resetId,
    }).catch(() => undefined);
    return jobSucceeded({
      resetId: parsed.data.resetId,
      deliveryStatus: "delivered",
    });
  });
}

export class PostgresPasswordResetEmailStore implements PasswordResetEmailStore {
  constructor(private readonly database: SqlQueryable) {}

  async scrub(input: PasswordResetEmailScrubInput): Promise<void> {
    const result = await this.database.query<{ scrubbed: boolean }>(
      `select scrub_password_reset_delivery($1, $2, $3, $4, $5, $6) as scrubbed`,
      [
        input.workspaceId,
        input.jobId,
        input.resetId,
        input.state,
        input.scrubbedAt,
        input.providerMessageId ?? null,
      ],
    );
    if (result.rows[0]?.scrubbed !== true) {
      throw new Error("PASSWORD_RESET_EMAIL_SCRUB_FAILED");
    }
  }
}

/**
 * auth role은 수신자의 workspace 목록만 식별하고, suppression 테이블은
 * workspace별로 pin된 worker role transaction에서만 조회한다.
 */
export class PostgresPasswordResetEmailSuppressionPolicy
implements PasswordResetEmailSuppressionPolicy {
  constructor(private readonly options: {
    readonly identityDatabase: SqlQueryable;
    readonly tenantDatabase: PasswordResetEmailTenantSqlSource;
  }) {}

  private async isSuppressedInWorkspace(
    workspaceId: string,
    recipientHash: string,
  ): Promise<boolean> {
    const connection = await this.options.tenantDatabase.connect();
    try {
      await connection.query("begin");
      await connection.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
      const result = await connection.query<{ suppressed: boolean }>(
        `select exists(
           select 1 from email_suppressions
            where workspace_id = $1 and recipient_hash = $2
         ) as suppressed`,
        [workspaceId, recipientHash],
      );
      await connection.query("commit");
      return result.rows[0]?.suppressed === true;
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  async isSuppressed(input: {
    readonly workspaceId: string;
    readonly recipient: string;
  }): Promise<boolean> {
    const parsedRecipient = SuppressionRecipient.safeParse(input.recipient);
    if (!parsedRecipient.success) throw new Error("PASSWORD_RESET_EMAIL_SUPPRESSION_INVALID_RECIPIENT");
    const recipient = parsedRecipient.data;
    const recipientHash = createHash("sha256").update(recipient, "utf8").digest("hex");
    const memberships = await this.options.identityDatabase.query<{ workspace_id: string }>(
      `select distinct memberships.workspace_id::text as workspace_id
         from memberships
         inner join users on users.id = memberships.user_id
        where lower(btrim(users.email)) = $1
          and users.disabled_at is null
        order by memberships.workspace_id::text`,
      [recipient],
    );
    const workspaceIds = new Set<string>([
      input.workspaceId,
      ...memberships.rows.map((row) => row.workspace_id),
    ]);
    for (const workspaceId of workspaceIds) {
      if (await this.isSuppressedInWorkspace(workspaceId, recipientHash)) return true;
    }
    return false;
  }
}
