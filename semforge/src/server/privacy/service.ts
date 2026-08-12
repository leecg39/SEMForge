// @TASK P5-PRIVACY - Operator-approved DSAR, deletion, and retention workflow
// @SPEC paid-beta privacy lifecycle blockers
// @TEST src/server/privacy/service.integration.test.ts
import { createHash } from "node:crypto";

import type {
  WorkspacePrivacyFence,
  WorkspacePrivacyFenceSql,
} from "@/server/privacy/fence";

export interface PrivacySql {
  query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

export interface PrivacySqlConnection extends PrivacySql {
  release(destroy?: boolean | Error): void;
}

export interface PrivacySqlPool extends PrivacySql {
  connect(): Promise<PrivacySqlConnection>;
}

export interface PrivacyProcessorClient {
  revokeGscConnection(input: {
    workspaceId: string;
    connectionId: string;
    refreshTokenEncrypted: string;
  }): Promise<void>;
  /** Exact-key erasure is retained exclusively for restored-backup retention. */
  deleteObject(input: { workspaceId: string; storageKey: string }): Promise<void>;
  /** Purges every version and delete marker in reports/{workspaceId}/. */
  deleteWorkspaceObjects(input: { workspaceId: string }): Promise<void>;
  markEmailSuppressed(input: {
    workspaceId: string;
    emailHash: string;
    requestUuid: string;
  }): Promise<void>;
}

export interface PrivacyRequestInput {
  readonly workspaceId: string;
  readonly operatorId: string;
  readonly requestId: string;
  readonly subjectUserId?: string | null;
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

interface PrivacyExportPayload {
  readonly request: {
    readonly id: string;
    readonly external_id: string;
    readonly type: string;
    readonly subject_user_id: string;
  };
  readonly workspace: { readonly id: string };
  readonly subject: {
    readonly id: string;
    readonly email: string;
    readonly display_name: string | null;
    readonly role: string;
  };
  readonly legalAcceptances: readonly unknown[];
  readonly sessions: readonly unknown[];
}

interface PrivacyDeletionTargets {
  readonly gscConnections: readonly {
    readonly id: string;
    readonly refreshTokenEncrypted: string;
  }[];
  readonly storageKeys: readonly string[];
  readonly recipients: readonly string[];
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

const retentionTargets = [
  ["sessions", "expiredSessionsDays"],
  ["invites", "consumedInvitesDays"],
  ["password_resets", "passwordResetsDays"],
  ["oauth_states", "oauthStatesDays"],
  ["outbox", "publishedOutboxDays"],
  ["jobs", "terminalJobsDays"],
  ["provider_calls.raw_metadata", "providerRawMetadataDays"],
  ["deliveries.recipient", "deliveryRecipientDays"],
] as const satisfies readonly [string, keyof PrivacyRetentionPolicy][];

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sanitizedProcessorError(error: unknown): string {
  if (error instanceof Error && /^PRIVACY_[A-Z_]+$/u.test(error.message)) return error.message;
  return "PRIVACY_PROCESSOR_FAILED";
}

async function rollback(database: PrivacySql): Promise<void> {
  await database.query("rollback").catch(() => undefined);
}

/** Gives SECURITY DEFINER privacy functions the tenant GUC without leaking it across pooled sessions. */
async function withTenantTransaction<T>(
  source: PrivacySql | PrivacySqlPool,
  workspaceId: string,
  operation: (database: PrivacySql) => Promise<T>,
): Promise<T> {
  const pool = source as Partial<PrivacySqlPool>;
  const connection = typeof pool.connect === "function" ? await pool.connect() : source;
  let transaction = false;
  let destroy = false;
  try {
    await connection.query("begin");
    transaction = true;
    await connection.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
    const value = await operation(connection);
    await connection.query("commit");
    transaction = false;
    return value;
  } catch (error) {
    if (transaction) await rollback(connection);
    destroy = true;
    throw error;
  } finally {
    if ("release" in connection && typeof connection.release === "function") {
      connection.release(destroy);
    }
  }
}

async function claimRequest(
  db: PrivacySql,
  input: PrivacyRequestInput & { type: "export" | "correction" | "erasure" | "workspace_deletion" },
): Promise<{ id: string; status: "running" | "completed" }> {
  const row = (
    await db.query<{ id: string; status: "running" | "completed" }>(
      `select id::text, status::text
         from privacy_claim_request($1::uuid, $2::text, $3::text, $4::text, $5::timestamptz, $6::uuid)`,
      [
        input.workspaceId,
        input.requestId,
        input.type,
        input.operatorId,
        input.now,
        input.subjectUserId ?? null,
      ],
    )
  ).rows[0];
  if (!row || (row.status !== "running" && row.status !== "completed")) {
    throw new Error("PRIVACY_REQUEST_NOT_APPROVED");
  }
  return row;
}

async function succeededSteps(
  db: PrivacySql,
  input: Pick<PrivacyRequestInput, "workspaceId" | "operatorId"> & { requestUuid: string },
): Promise<Set<string>> {
  const rows = await db.query<{ step_key: string }>(
    `select step_key
       from privacy_succeeded_request_steps($1::uuid, $2::uuid, $3::text)`,
    [input.workspaceId, input.requestUuid, input.operatorId],
  );
  return new Set(rows.rows.map((row) => row.step_key));
}

async function recordStep(
  db: PrivacySql,
  input: {
    workspaceId: string;
    requestUuid: string;
    operatorId: string;
    stepKey: string;
    status: "succeeded" | "failed" | "skipped";
    now: Date;
    error?: string;
    metadata?: Readonly<Record<string, unknown>>;
  },
): Promise<void> {
  await db.query(
    `select privacy_record_request_step(
       $1::uuid, $2::uuid, $3::text, $4::text, $5::text,
       $6::text, $7::jsonb, $8::timestamptz
     )`,
    [
      input.workspaceId,
      input.requestUuid,
      input.operatorId,
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
  input: Pick<PrivacyRequestInput, "workspaceId" | "operatorId" | "now"> & {
    requestUuid: string;
  },
): Promise<void> {
  await db.query(
    `select privacy_finish_request(
       $1::uuid, $2::uuid, $3::text, 'completed', $4::timestamptz
     )`,
    [input.workspaceId, input.requestUuid, input.operatorId, input.now],
  );
}

async function lockSubjectEmailErasure(
  db: PrivacySql,
  input: {
    workspaceId: string;
    emailHash: string;
  },
): Promise<void> {
  await db.query(
    `select privacy_lock_recipient_email_exclusive($1::uuid, $2::text)`,
    [input.workspaceId, input.emailHash],
  );
}

function decodeJsonObject(value: unknown, code: string): Record<string, unknown> {
  let decoded = value;
  if (typeof decoded === "string") {
    try { decoded = JSON.parse(decoded) as unknown; } catch { throw new Error(code); }
  }
  if (!decoded || Array.isArray(decoded) || typeof decoded !== "object") throw new Error(code);
  return decoded as Record<string, unknown>;
}

function decodeExport(value: unknown): PrivacyExportPayload {
  const payload = decodeJsonObject(value, "PRIVACY_EXPORT_INVALID");
  if (!payload.request || typeof payload.request !== "object" || Array.isArray(payload.request) ||
      !payload.workspace || typeof payload.workspace !== "object" || Array.isArray(payload.workspace) ||
      !payload.subject || typeof payload.subject !== "object" || Array.isArray(payload.subject)) {
    throw new Error("PRIVACY_EXPORT_INVALID");
  }
  for (const key of ["legalAcceptances", "sessions"] as const) {
    if (!Array.isArray(payload[key])) throw new Error("PRIVACY_EXPORT_INVALID");
  }
  return payload as unknown as PrivacyExportPayload;
}

function decodeDeletionTargets(value: unknown): PrivacyDeletionTargets {
  const payload = decodeJsonObject(value, "PRIVACY_DELETION_TARGETS_INVALID");
  if (!Array.isArray(payload.gscConnections) || !Array.isArray(payload.storageKeys) ||
      !Array.isArray(payload.recipients)) {
    throw new Error("PRIVACY_DELETION_TARGETS_INVALID");
  }
  const storageKeys = payload.storageKeys;
  const recipients = payload.recipients;
  const connections = payload.gscConnections;
  if (storageKeys.some((key) => typeof key !== "string") ||
      recipients.some((recipient) => typeof recipient !== "string") ||
      connections.some((connection) => {
        if (!connection || Array.isArray(connection) || typeof connection !== "object") return true;
        const row = connection as Record<string, unknown>;
        return typeof row.id !== "string" || typeof row.refreshTokenEncrypted !== "string";
      })) {
    throw new Error("PRIVACY_DELETION_TARGETS_INVALID");
  }
  return payload as unknown as PrivacyDeletionTargets;
}

function requireSubjectUserId(input: PrivacyRequestInput): string {
  if (!input.subjectUserId?.trim()) throw new Error("PRIVACY_SUBJECT_REQUIRED");
  return input.subjectUserId;
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
  const policy = Object.fromEntries(retentionPolicyKeys.map((key) => {
    const value = record[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 3_650) {
      throw new Error(`PRIVACY_RETENTION_POLICY.${key} must be an integer from 1 to 3650`);
    }
    return [key, value];
  })) as unknown as PrivacyRetentionPolicy;
  const extra = Object.keys(record).filter(
    (key) => !(retentionPolicyKeys as readonly string[]).includes(key),
  );
  if (extra.length > 0) {
    throw new Error(`PRIVACY_RETENTION_POLICY has unknown keys: ${extra.sort().join(", ")}`);
  }
  return policy;
}

export function readPrivacyRetentionPolicy(
  source: Readonly<Record<string, string | undefined>> = process.env,
): PrivacyRetentionPolicy {
  return parsePrivacyRetentionPolicy(source.PRIVACY_RETENTION_POLICY);
}

function since(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1_000);
}

export async function runPrivacyRetention(input: {
  db: PrivacySql;
  now: Date;
  policy?: PrivacyRetentionPolicy;
  dryRun: boolean;
  processor?: Pick<PrivacyProcessorClient, "deleteWorkspaceObjects">;
}): Promise<PrivacyRetentionResult> {
  const policy = input.policy ?? readPrivacyRetentionPolicy();
  const restoredWorkspaces = (
    await input.db.query<{ workspace_id: string; storage_prefix: string }>(
      `select workspace_id::text, storage_prefix
         from privacy_retention_storage_workspaces()`,
    )
  ).rows;
  if (!input.dryRun && restoredWorkspaces.length > 0) {
    if (!input.processor) throw new Error("PRIVACY_PROCESSOR_NOT_CONFIGURED");
    for (const workspace of restoredWorkspaces) {
      if (workspace.storage_prefix !== `reports/${workspace.workspace_id}/`) {
        throw new Error("PRIVACY_BACKUP_DELETION_MARKER_INVALID");
      }
      await input.processor.deleteWorkspaceObjects({ workspaceId: workspace.workspace_id });
    }
  }
  const items: Array<{ target: string; matched: number }> = [
    { target: "backup-restored-workspaces", matched: restoredWorkspaces.length },
  ];
  for (const [target, policyKey] of retentionTargets) {
    const cutoff = since(input.now, policy[policyKey]);
    const count = (
      await input.db.query<{ matched: number }>(
        "select privacy_retention_count($1::text, $2::timestamptz)::int as matched",
        [target, cutoff],
      )
    ).rows[0]?.matched ?? 0;
    if (!input.dryRun && Number(count) > 0) {
      await input.db.query(
        "select privacy_retention_apply($1::text, $2::timestamptz)",
        [target, cutoff],
      );
    }
    items.push({ target, matched: Number(count) });
  }
  return { dryRun: input.dryRun, items };
}

class ExternalPrivacyStepFailed extends Error {
  constructor() { super("PRIVACY_EXTERNAL_STEP_FAILED"); }
}

export function createPrivacyService(options: {
  db: PrivacySql | PrivacySqlPool;
  processor?: PrivacyProcessorClient;
  processorFactory?: (database: WorkspacePrivacyFenceSql) => PrivacyProcessorClient;
  erasureFence?: WorkspacePrivacyFence;
}) {
  const db = options.db;

  return {
    async exportWorkspaceSubject(input: PrivacyRequestInput) {
      return withTenantTransaction(db, input.workspaceId, async (database) => {
        const subjectUserId = requireSubjectUserId(input);
        const request = await claimRequest(database, { ...input, type: "export" });
        const payloadRow = (
          await database.query<{ payload: unknown }>(
            `select privacy_export_workspace($1::uuid, $2::uuid, $3::text, $4::uuid) as payload`,
            [input.workspaceId, request.id, input.operatorId, subjectUserId],
          )
        ).rows[0];
        const payload = decodeExport(payloadRow?.payload);
        if (request.status === "running") {
          await recordStep(database, {
            workspaceId: input.workspaceId,
            requestUuid: request.id,
            operatorId: input.operatorId,
            stepKey: "export.snapshot",
            status: "succeeded",
            now: input.now,
            metadata: {
              subjectUserId,
              legalAcceptances: payload.legalAcceptances.length,
              sessions: payload.sessions.length,
            },
          });
          await finishRequest(database, { ...input, requestUuid: request.id });
        }
        return { requestId: input.requestId, ...payload };
      });
    },

    async correctWorkspaceSubject(input: PrivacyRequestInput & {
      displayName?: string;
    }): Promise<{ requestId: string; status: "completed" }> {
      return withTenantTransaction(db, input.workspaceId, async (database) => {
        const subjectUserId = requireSubjectUserId(input);
        const request = await claimRequest(database, { ...input, type: "correction" });
        if (request.status === "completed") {
          return { requestId: input.requestId, status: "completed" };
        }
        await database.query(
          `select privacy_correct_workspace(
             $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::timestamptz, $7::uuid
           )`,
          [
            input.workspaceId,
            request.id,
            input.operatorId,
            input.displayName ?? null,
            null,
            input.now,
            subjectUserId,
          ],
        );
        await recordStep(database, {
          workspaceId: input.workspaceId,
          requestUuid: request.id,
          operatorId: input.operatorId,
          stepKey: "correction.local",
          status: "succeeded",
          now: input.now,
        });
        await finishRequest(database, { ...input, requestUuid: request.id });
        return { requestId: input.requestId, status: "completed" };
      });
    },

    async deleteWorkspaceSubject(input: PrivacyRequestInput): Promise<{
      requestId: string;
      status: "completed" | "failed";
    }> {
      if (!options.processor && !options.processorFactory) {
        throw new Error("PRIVACY_PROCESSOR_NOT_CONFIGURED");
      }
      if (input.subjectUserId?.trim()) {
        const subjectUserId = requireSubjectUserId(input);
        const suppression = await withTenantTransaction(db, input.workspaceId, async (database) => {
          const request = await claimRequest(database, { ...input, type: "erasure" });
          if (request.status === "completed") {
            return { emailHash: null, requestUuid: request.id, status: "completed" as const };
          }
          const targetRow = (
            await database.query<{ email: string }>(
              `select email
                 from privacy_erasure_subject($1::uuid, $2::uuid, $3::text, $4::uuid)`,
              [input.workspaceId, request.id, input.operatorId, subjectUserId],
            )
          ).rows[0];
          if (!targetRow?.email) throw new Error("PRIVACY_ERASURE_SUBJECT_INVALID");
          const completedSteps = await succeededSteps(database, {
            workspaceId: input.workspaceId,
            requestUuid: request.id,
            operatorId: input.operatorId,
          });
          const emailHash = digest(targetRow.email.trim().toLowerCase());
          const suppressionStep = `email.suppress:${emailHash}`;
          if (!completedSteps.has(suppressionStep)) {
            const processor = options.processorFactory?.(database as WorkspacePrivacyFenceSql) ?? options.processor!;
            await processor.markEmailSuppressed({
              workspaceId: input.workspaceId,
              emailHash,
              requestUuid: request.id,
            });
            await recordStep(database, {
              workspaceId: input.workspaceId,
              requestUuid: request.id,
              operatorId: input.operatorId,
              stepKey: suppressionStep,
              status: "succeeded",
              now: input.now,
              metadata: { recipientHash: emailHash },
            });
            completedSteps.add(suppressionStep);
          }
          return { emailHash, requestUuid: request.id, status: "running" as const };
        });
        if (suppression.status === "completed") {
          return { requestId: input.requestId, status: "completed" };
        }

        return withTenantTransaction(db, input.workspaceId, async (database) => {
          const request = await claimRequest(database, { ...input, type: "erasure" });
          if (request.id !== suppression.requestUuid) {
            throw new Error("PRIVACY_REQUEST_CHANGED");
          }
          if (request.status === "completed") {
            return { requestId: input.requestId, status: "completed" };
          }
          const completedSteps = await succeededSteps(database, {
            workspaceId: input.workspaceId,
            requestUuid: request.id,
            operatorId: input.operatorId,
          });
          if (!completedSteps.has("local.subject_erasure")) {
            await lockSubjectEmailErasure(database, {
              workspaceId: input.workspaceId,
              emailHash: suppression.emailHash,
            });
            await database.query(
              `select privacy_erase_subject($1::uuid, $2::uuid, $3::text, $4::uuid, $5::timestamptz)`,
              [input.workspaceId, request.id, input.operatorId, subjectUserId, input.now],
            );
            await recordStep(database, {
              workspaceId: input.workspaceId,
              requestUuid: request.id,
              operatorId: input.operatorId,
              stepKey: "local.subject_erasure",
              status: "succeeded",
              now: input.now,
            });
          }
          await finishRequest(database, { ...input, requestUuid: request.id });
          return { requestId: input.requestId, status: "completed" };
        });
      }
      if (!options.erasureFence) throw new Error("PRIVACY_ERASURE_FENCE_NOT_CONFIGURED");
      const request = await withTenantTransaction(db, input.workspaceId, (database) =>
        claimRequest(database, { ...input, type: "workspace_deletion" }));
      if (request.status === "completed") {
        return { requestId: input.requestId, status: "completed" };
      }

      try {
        await options.erasureFence.withExclusiveErasure({
          workspaceId: input.workspaceId,
          requestUuid: request.id,
          operatorId: input.operatorId,
          now: input.now,
        }, async (database) => {
          const processor = options.processorFactory?.(database) ?? options.processor!;
          const completedSteps = await succeededSteps(database, {
            workspaceId: input.workspaceId,
            requestUuid: request.id,
            operatorId: input.operatorId,
          });
          const targetRow = (
            await database.query<{ payload: unknown }>(
              `select privacy_deletion_targets($1::uuid, $2::uuid, $3::text) as payload`,
              [input.workspaceId, request.id, input.operatorId],
            )
          ).rows[0];
          const targets = decodeDeletionTargets(targetRow?.payload);
          const storageKeys = [...new Set(targets.storageKeys)].sort();
          const storagePrefix = `reports/${input.workspaceId}/`;
          await database.query(
            `select privacy_set_request_storage_manifest(
               $1::uuid, $2::uuid, $3::text, $4::jsonb
             )`,
            [
              input.workspaceId,
              request.id,
              input.operatorId,
              JSON.stringify({
                storagePrefix,
                storageKeyHashes: storageKeys.map(digest),
              }),
            ],
          );

          const runExternalStep = async (
            stepKey: string,
            metadata: Readonly<Record<string, unknown>>,
            action: () => Promise<void>,
          ): Promise<void> => {
            if (completedSteps.has(stepKey)) return;
            try {
              await action();
              await recordStep(database, {
                workspaceId: input.workspaceId,
                requestUuid: request.id,
                operatorId: input.operatorId,
                stepKey,
                status: "succeeded",
                now: input.now,
                metadata,
              });
              completedSteps.add(stepKey);
            } catch (error) {
              await recordStep(database, {
                workspaceId: input.workspaceId,
                requestUuid: request.id,
                operatorId: input.operatorId,
                stepKey,
                status: "failed",
                now: input.now,
                error: sanitizedProcessorError(error),
                metadata,
              });
              await database.query(
                `select privacy_fail_request(
                   $1::uuid, $2::uuid, $3::text, $4::timestamptz
                 )`,
                [input.workspaceId, request.id, input.operatorId, input.now],
              );
              throw new ExternalPrivacyStepFailed();
            }
          };

          for (const connection of targets.gscConnections) {
            await runExternalStep(`gsc.revoke:${connection.id}`, { connectionId: connection.id }, () =>
              processor.revokeGscConnection({
                workspaceId: input.workspaceId,
                connectionId: connection.id,
                refreshTokenEncrypted: connection.refreshTokenEncrypted,
              }));
          }

          await runExternalStep("objects.delete:workspace-prefix", {
            storagePrefixHash: digest(storagePrefix),
          }, () => processor.deleteWorkspaceObjects({ workspaceId: input.workspaceId }));

          for (const recipient of [...new Set(targets.recipients.map((value) => value.trim().toLowerCase()))]
            .filter(Boolean).sort()) {
            const emailHash = digest(recipient);
            await runExternalStep(`email.suppress:${emailHash}`, { recipientHash: emailHash }, () =>
              processor.markEmailSuppressed({
                workspaceId: input.workspaceId,
                emailHash,
                requestUuid: request.id,
              }));
          }
        });
      } catch (error) {
        if (error instanceof ExternalPrivacyStepFailed) {
          return { requestId: input.requestId, status: "failed" };
        }
        throw error;
      }
      return { requestId: input.requestId, status: "completed" };
    },
  };
}
