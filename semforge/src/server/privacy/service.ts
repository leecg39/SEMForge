// @TASK P5-PRIVACY - Operator-only DSAR, deletion, and retention workflow
// @SPEC paid-beta privacy lifecycle blockers
import { createHash } from "node:crypto";

export interface PrivacySql {
  query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

export interface PrivacyProcessorClient {
  revokeGscConnection(input: {
    workspaceId: string;
    connectionId: string;
    refreshTokenEncrypted: string;
  }): Promise<void>;
  deleteObject(input: { workspaceId: string; storageKey: string }): Promise<void>;
  markEmailSuppressed(input: { workspaceId: string; emailHash: string; requestUuid: string }): Promise<void>;
}

export interface PrivacyRequestInput {
  readonly workspaceId: string;
  readonly operatorId: string;
  readonly requestId: string;
  readonly now: Date;
}

export interface PrivacyRetentionPolicy {
  readonly expiredSessionsDays: number;
  readonly consumedInvitesDays: number;
  readonly passwordResetsDays: number;
  readonly oauthStatesDays: number;
  readonly publishedOutboxDays: number;
  readonly terminalJobsDays: number;
  readonly providerRawMetadataDays: number;
  readonly deliveryRecipientDays: number;
}

export interface PrivacyRetentionResult {
  readonly dryRun: boolean;
  readonly items: readonly { readonly target: string; readonly matched: number }[];
}

const retentionPolicyKeys = [
  "expiredSessionsDays",
  "consumedInvitesDays",
  "passwordResetsDays",
  "oauthStatesDays",
  "publishedOutboxDays",
  "terminalJobsDays",
  "providerRawMetadataDays",
  "deliveryRecipientDays",
] as const satisfies readonly (keyof PrivacyRetentionPolicy)[];

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function configuredProcessor(): PrivacyProcessorClient {
  const missing = async (): Promise<void> => {
    throw new Error("PRIVACY_PROCESSOR_NOT_CONFIGURED");
  };
  return {
    revokeGscConnection: missing,
    deleteObject: missing,
    markEmailSuppressed: missing,
  };
}

async function beginRequest(
  db: PrivacySql,
  input: PrivacyRequestInput & { type: "export" | "correction" | "deletion" },
): Promise<string> {
  const row = (
    await db.query<{ id: string }>(
      `insert into privacy_requests
         (workspace_id, request_id, type, status, operator_id, requested_at)
       values ($1, $2, $3, 'running', $4, $5)
       on conflict (workspace_id, request_id) do update
         set status = 'running', operator_id = excluded.operator_id
       returning id::text`,
      [input.workspaceId, input.requestId, input.type, input.operatorId, input.now],
    )
  ).rows[0];
  if (!row) throw new Error("PRIVACY_REQUEST_NOT_CREATED");
  return row.id;
}

async function recordStep(
  db: PrivacySql,
  input: {
    workspaceId: string;
    requestUuid: string;
    stepKey: string;
    status: "succeeded" | "failed" | "skipped";
    now: Date;
    error?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db.query(
    `insert into privacy_request_steps
       (workspace_id, request_id, step_key, status, last_error, metadata, completed_at)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7)
     on conflict (workspace_id, request_id, step_key) do update
       set status = excluded.status,
           attempts = privacy_request_steps.attempts + 1,
           last_error = excluded.last_error,
           metadata = excluded.metadata,
           completed_at = excluded.completed_at`,
    [
      input.workspaceId,
      input.requestUuid,
      input.stepKey,
      input.status,
      input.error ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.now,
    ],
  );
}

async function finishRequest(
  db: PrivacySql,
  workspaceId: string,
  requestUuid: string,
  status: "completed" | "failed",
  now: Date,
): Promise<void> {
  await db.query(
    "update privacy_requests set status = $3, completed_at = $4 where workspace_id = $1 and id = $2",
    [workspaceId, requestUuid, status, now],
  );
}

export function parsePrivacyRetentionPolicy(raw: string | undefined): PrivacyRetentionPolicy {
  if (!raw?.trim()) throw new Error("PRIVACY_RETENTION_POLICY is required");
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new Error("PRIVACY_RETENTION_POLICY must be valid JSON");
  }
  if (!decoded || Array.isArray(decoded) || typeof decoded !== "object") {
    throw new Error("PRIVACY_RETENTION_POLICY must be a JSON object");
  }
  const record = decoded as Record<string, unknown>;
  const policy = Object.fromEntries(
    retentionPolicyKeys.map((key) => {
      const value = record[key];
      if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 3_650) {
        throw new Error(`PRIVACY_RETENTION_POLICY.${key} must be an integer from 1 to 3650`);
      }
      return [key, value];
    }),
  ) as unknown as PrivacyRetentionPolicy;
  const extra = Object.keys(record).filter(
    (key) => !(retentionPolicyKeys as readonly string[]).includes(key),
  );
  if (extra.length > 0) {
    throw new Error(`PRIVACY_RETENTION_POLICY has unknown keys: ${extra.sort().join(", ")}`);
  }
  return policy;
}

export function readPrivacyRetentionPolicy(
  source: Record<string, string | undefined> = process.env,
): PrivacyRetentionPolicy {
  return parsePrivacyRetentionPolicy(source.PRIVACY_RETENTION_POLICY);
}

function since(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1_000);
}

async function countOrApply(
  db: PrivacySql,
  dryRun: boolean,
  target: string,
  countSql: string,
  applySql: string,
  values: readonly unknown[],
): Promise<{ target: string; matched: number }> {
  const count = (await db.query<{ count: number }>(countSql, values)).rows[0]?.count ?? 0;
  if (!dryRun && count > 0) await db.query(applySql, values);
  return { target, matched: Number(count) };
}

export async function runPrivacyRetention(input: {
  db: PrivacySql;
  now: Date;
  policy?: PrivacyRetentionPolicy;
  dryRun: boolean;
}): Promise<PrivacyRetentionResult> {
  const policy = input.policy ?? readPrivacyRetentionPolicy();
  const items = [
    await countOrApply(
      input.db,
      input.dryRun,
      "sessions",
      "select count(*)::int as count from sessions where (expires_at < $1 or revoked_at < $1)",
      "delete from sessions where (expires_at < $1 or revoked_at < $1)",
      [since(input.now, policy.expiredSessionsDays)],
    ),
    await countOrApply(
      input.db,
      input.dryRun,
      "invites",
      "select count(*)::int as count from invites where coalesce(accepted_at, superseded_at, expires_at) < $1",
      "delete from invites where coalesce(accepted_at, superseded_at, expires_at) < $1",
      [since(input.now, policy.consumedInvitesDays)],
    ),
    await countOrApply(
      input.db,
      input.dryRun,
      "password_resets",
      "select count(*)::int as count from password_resets where coalesce(used_at, expires_at) < $1",
      "delete from password_resets where coalesce(used_at, expires_at) < $1",
      [since(input.now, policy.passwordResetsDays)],
    ),
    await countOrApply(
      input.db,
      input.dryRun,
      "oauth_states",
      "select count(*)::int as count from oauth_states where coalesce(consumed_at, expires_at) < $1",
      "delete from oauth_states where coalesce(consumed_at, expires_at) < $1",
      [since(input.now, policy.oauthStatesDays)],
    ),
    await countOrApply(
      input.db,
      input.dryRun,
      "outbox",
      "select count(*)::int as count from outbox where published_at is not null and published_at < $1",
      "delete from outbox where published_at is not null and published_at < $1",
      [since(input.now, policy.publishedOutboxDays)],
    ),
    await countOrApply(
      input.db,
      input.dryRun,
      "jobs",
      "select count(*)::int as count from jobs where status in ('succeeded', 'dead') and updated_at < $1",
      "delete from jobs where status in ('succeeded', 'dead') and updated_at < $1",
      [since(input.now, policy.terminalJobsDays)],
    ),
    await countOrApply(
      input.db,
      input.dryRun,
      "provider_calls.raw_metadata",
      "select count(*)::int as count from provider_calls where completed_at < $1 and response_metadata ? 'rawResponse'",
      "update provider_calls set response_metadata = response_metadata - 'rawResponse' where completed_at < $1 and response_metadata ? 'rawResponse'",
      [since(input.now, policy.providerRawMetadataDays)],
    ),
    await countOrApply(
      input.db,
      input.dryRun,
      "deliveries.recipient",
      "select count(*)::int as count from deliveries where created_at < $1 and recipient !~ '^erased:'",
      "update deliveries set recipient = 'erased:' || encode(sha256(recipient::bytea), 'hex') where created_at < $1 and recipient !~ '^erased:'",
      [since(input.now, policy.deliveryRecipientDays)],
    ),
  ];
  return { dryRun: input.dryRun, items };
}

export function createPrivacyService(options: {
  db: PrivacySql;
  processor?: PrivacyProcessorClient;
}) {
  const db = options.db;
  const processor = options.processor ?? configuredProcessor();

  return {
    async exportWorkspaceSubject(input: PrivacyRequestInput) {
      const requestUuid = await beginRequest(db, { ...input, type: "export" });
      const workspace = (
        await db.query<{ id: string; name: string; slug: string; logo_url: string | null }>(
          "select id::text, name, slug, logo_url from workspaces where id = $1",
          [input.workspaceId],
        )
      ).rows[0];
      if (!workspace) throw new Error("PRIVACY_WORKSPACE_NOT_FOUND");
      const users = (
        await db.query<{ id: string; email: string; display_name: string | null }>(
          `select users.id::text, users.email, users.display_name
             from memberships
             join users on users.id = memberships.user_id
            where memberships.workspace_id = $1
            order by users.email`,
          [input.workspaceId],
        )
      ).rows;
      const legal = (await db.query("select terms_version, terms_sha256, privacy_version, privacy_sha256, presented_at, accepted_at from legal_acceptances where workspace_id = $1", [input.workspaceId])).rows;
      const sites = (await db.query("select id::text, name, domain from sites where workspace_id = $1 order by domain", [input.workspaceId])).rows;
      const reports = (await db.query("select id::text, period_start, period_end, status from weekly_reports where workspace_id = $1 order by period_end", [input.workspaceId])).rows;
      await recordStep(db, {
        workspaceId: input.workspaceId,
        requestUuid,
        stepKey: "export.snapshot",
        status: "succeeded",
        now: input.now,
        metadata: { users: users.length, sites: sites.length, reports: reports.length },
      });
      await finishRequest(db, input.workspaceId, requestUuid, "completed", input.now);
      return {
        requestId: input.requestId,
        workspace,
        users,
        legalAcceptances: legal,
        sites,
        reports,
      };
    },

    async correctWorkspaceSubject(input: PrivacyRequestInput & {
      displayName?: string;
      workspaceName?: string;
    }): Promise<{ requestId: string; status: "completed" }> {
      const requestUuid = await beginRequest(db, { ...input, type: "correction" });
      if (input.displayName !== undefined) {
        await db.query(
          `update users
              set display_name = $2, updated_at = $3
            where id in (select user_id from memberships where workspace_id = $1)`,
          [input.workspaceId, input.displayName, input.now],
        );
      }
      if (input.workspaceName !== undefined) {
        await db.query("update workspaces set name = $2, updated_at = $3 where id = $1", [
          input.workspaceId,
          input.workspaceName,
          input.now,
        ]);
      }
      await recordStep(db, {
        workspaceId: input.workspaceId,
        requestUuid,
        stepKey: "correction.local",
        status: "succeeded",
        now: input.now,
      });
      await finishRequest(db, input.workspaceId, requestUuid, "completed", input.now);
      return { requestId: input.requestId, status: "completed" };
    },

    async deleteWorkspaceSubject(input: PrivacyRequestInput): Promise<{
      requestId: string;
      status: "completed" | "failed";
    }> {
      const requestUuid = await beginRequest(db, { ...input, type: "deletion" });
      const gscConnections = (
        await db.query<{ id: string; refresh_token_encrypted: string }>(
          "select id::text, refresh_token_encrypted from gsc_connections where workspace_id = $1 and disconnected_at is null",
          [input.workspaceId],
        )
      ).rows;
      const objects = (
        await db.query<{ storage_key: string }>(
          "select storage_key from report_assets where workspace_id = $1 order by storage_key",
          [input.workspaceId],
        )
      ).rows;
      const recipients = (
        await db.query<{ recipient: string }>(
          "select distinct recipient from deliveries where workspace_id = $1 and recipient !~ '^erased:'",
          [input.workspaceId],
        )
      ).rows;

      const runExternalStep = async (
        stepKey: string,
        metadata: Record<string, unknown>,
        action: () => Promise<void>,
      ): Promise<boolean> => {
        try {
          await action();
          await recordStep(db, {
            workspaceId: input.workspaceId,
            requestUuid,
            stepKey,
            status: "succeeded",
            now: input.now,
            metadata,
          });
          return true;
        } catch (error) {
          await recordStep(db, {
            workspaceId: input.workspaceId,
            requestUuid,
            stepKey,
            status: "failed",
            now: input.now,
            error: error instanceof Error ? error.message : "processor failed",
            metadata,
          });
          await finishRequest(db, input.workspaceId, requestUuid, "failed", input.now);
          return false;
        }
      };

      const gscRevoked = await runExternalStep("gsc.revoke", { count: gscConnections.length }, async () => {
        for (const connection of gscConnections) {
          await processor.revokeGscConnection({
            workspaceId: input.workspaceId,
            connectionId: connection.id,
            refreshTokenEncrypted: connection.refresh_token_encrypted,
          });
        }
      });
      if (!gscRevoked) return { requestId: input.requestId, status: "failed" };

      const objectsDeleted = await runExternalStep("objects.delete", { count: objects.length }, async () => {
        for (const object of objects) {
          await processor.deleteObject({
            workspaceId: input.workspaceId,
            storageKey: object.storage_key,
          });
        }
      });
      if (!objectsDeleted) return { requestId: input.requestId, status: "failed" };

      const emailsSuppressed = await runExternalStep("processors.email_suppress", { count: recipients.length }, async () => {
        for (const recipient of recipients) {
          await processor.markEmailSuppressed({
            workspaceId: input.workspaceId,
            emailHash: digest(recipient.recipient),
            requestUuid,
          });
        }
      });
      if (!emailsSuppressed) return { requestId: input.requestId, status: "failed" };

      await db.query("select privacy_erase_workspace($1::uuid, $2::uuid, $3::text)", [
        input.workspaceId,
        requestUuid,
        input.operatorId,
      ]);
      await recordStep(db, {
        workspaceId: input.workspaceId,
        requestUuid,
        stepKey: "local.erasure",
        status: "succeeded",
        now: input.now,
      });
      await finishRequest(db, input.workspaceId, requestUuid, "completed", input.now);
      return { requestId: input.requestId, status: "completed" };
    },
  };
}
