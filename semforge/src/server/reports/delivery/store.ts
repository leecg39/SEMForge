// @TASK P4-R1-T1 - PostgreSQL report asset and email delivery state
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import { createHash } from "node:crypto";

import type { WeeklyReportSnapshot } from "@/server/reports/types";

export interface DeliverySqlClient {
  query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

interface DeliverySqlConnection extends DeliverySqlClient {
  release(): void;
}

export type DeliverySqlSource = DeliverySqlClient & {
  connect?: () => Promise<DeliverySqlConnection>;
};

export interface PreparedEmailDelivery {
  readonly id: string;
  readonly reportId: string;
  readonly snapshot: WeeklyReportSnapshot;
  readonly attempts: number;
  readonly createdAt: Date;
  readonly alreadyDelivered: boolean;
}

export interface ReportPdfAsset {
  readonly id: string;
  readonly workspaceId: string;
  readonly reportId: string;
  readonly storageKey: string;
  readonly checksumSha256: string;
  readonly sizeBytes: number;
}

export interface ReportEmailDeliveryTransaction {
  findPdfAsset(input: { workspaceId: string; reportId: string; storageKey: string }): Promise<ReportPdfAsset | null>;
  savePdfAsset(input: {
    workspaceId: string;
    reportId: string;
    storageKey: string;
    checksumSha256: string;
    sizeBytes: number;
  }): Promise<ReportPdfAsset>;
  markEmailDelivered(input: { workspaceId: string; deliveryId: string; deliveredAt: Date }): Promise<void>;
  markEmailFailed(input: { workspaceId: string; deliveryId: string; errorCode: string }): Promise<void>;
}

export type ReportEmailDeliveryFenceResult<T> =
  | { readonly disposition: "suppressed" }
  | { readonly disposition: "already_delivered"; readonly prepared: PreparedEmailDelivery }
  | {
      readonly disposition: "executed";
      readonly prepared: PreparedEmailDelivery;
      readonly value: T;
    };

export interface ReportAccessStore {
  loadReportForAccess(input: { workspaceId: string; reportId: string }): Promise<{
    snapshot: WeeklyReportSnapshot;
    periodEnd: string;
  }>;
  findPdfAsset(input: { workspaceId: string; reportId: string; storageKey: string }): Promise<ReportPdfAsset | null>;
}

export interface ReportDeliveryStore {
  loadReportSnapshot(input: { workspaceId: string; reportId: string }): Promise<WeeklyReportSnapshot>;
  isEmailSuppressed(input: { workspaceId: string; recipient: string }): Promise<boolean>;
  prepareEmail(input: {
    workspaceId: string;
    reportId: string;
    recipient: string;
    idempotencyKey: string;
    now: Date;
  }): Promise<PreparedEmailDelivery>;
  markEmailDelivered(input: { workspaceId: string; deliveryId: string; deliveredAt: Date }): Promise<void>;
  markEmailFailed(input: { workspaceId: string; deliveryId: string; errorCode: string }): Promise<void>;
  findPdfAsset(input: { workspaceId: string; reportId: string; storageKey: string }): Promise<ReportPdfAsset | null>;
  savePdfAsset(input: {
    workspaceId: string;
    reportId: string;
    storageKey: string;
    checksumSha256: string;
    sizeBytes: number;
  }): Promise<ReportPdfAsset>;
  withEmailDeliveryFence<T>(input: {
    workspaceId: string;
    reportId: string;
    recipient: string;
    recipientHash: string;
    idempotencyKey: string;
    now: Date;
  }, operation: (
    prepared: PreparedEmailDelivery,
    transaction: ReportEmailDeliveryTransaction,
  ) => Promise<T>): Promise<ReportEmailDeliveryFenceResult<T>>;
}

export class ReportDeliveryStoreError extends Error {
  constructor(readonly code: "NOT_FOUND" | "CONFLICT" | "INVALID_STATE") {
    super(`REPORT_DELIVERY_${code}`);
    this.name = "ReportDeliveryStoreError";
  }
}

type ReportRow = {
  id: string;
  period_end?: Date | string;
  snapshot: WeeklyReportSnapshot | string | null;
};
type DeliveryRow = {
  id: string;
  report_id: string;
  recipient: string;
  status: "queued" | "sending" | "delivered" | "failed";
  attempts: number;
  created_at: Date | string;
};
type AssetRow = {
  id: string;
  workspace_id: string;
  report_id: string;
  storage_key: string;
  checksum_sha256: string;
  size_bytes: number | string | bigint;
};

function jsonValue<T>(value: T | string): T {
  return typeof value === "string" ? JSON.parse(value) as T : value;
}

function asset(row: AssetRow): ReportPdfAsset {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    reportId: row.report_id,
    storageKey: row.storage_key,
    checksumSha256: row.checksum_sha256,
    sizeBytes: Number(row.size_bytes),
  };
}

async function withTransaction<T>(
  source: DeliverySqlSource,
  workspaceId: string,
  operation: (database: DeliverySqlClient) => Promise<T>,
): Promise<T> {
  const connection = source.connect ? await source.connect() : null;
  const database = connection ?? source;
  try {
    await database.query("begin");
    try {
      await database.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
      const result = await operation(database);
      await database.query("commit");
      return result;
    } catch (error) {
      await database.query("rollback");
      throw error;
    }
  } finally {
    connection?.release();
  }
}

const ASSET_COLUMNS = `
  id::text, workspace_id::text, report_id::text, storage_key,
  checksum_sha256, size_bytes`;

async function isEmailSuppressedInTransaction(
  database: DeliverySqlClient,
  input: { workspaceId: string; recipientHash: string },
): Promise<boolean> {
  const result = await database.query<{ suppressed: boolean }>(
    `select exists(
       select 1 from email_suppressions
        where workspace_id = $1 and recipient_hash = $2
     ) as suppressed`,
    [input.workspaceId, input.recipientHash],
  );
  return result.rows[0]?.suppressed === true;
}

async function prepareEmailInTransaction(
  database: DeliverySqlClient,
  input: {
    workspaceId: string;
    reportId: string;
    recipient: string;
    idempotencyKey: string;
    now: Date;
  },
): Promise<PreparedEmailDelivery> {
  const report = (
    await database.query<ReportRow>(
      `select id::text, snapshot from weekly_reports
        where workspace_id = $1 and id = $2 and snapshot is not null`,
      [input.workspaceId, input.reportId],
    )
  ).rows[0];
  if (!report?.snapshot) throw new ReportDeliveryStoreError("NOT_FOUND");
  await database.query(
    `insert into deliveries
      (workspace_id, report_id, channel, recipient, status, idempotency_key, created_at)
     values ($1, $2, 'email', $3, 'queued', $4, $5)
     on conflict (workspace_id, idempotency_key) do nothing`,
    [input.workspaceId, input.reportId, input.recipient, input.idempotencyKey, input.now],
  );
  const delivery = (
    await database.query<DeliveryRow>(
      `select id::text, report_id::text, recipient, status, attempts, created_at
         from deliveries
        where workspace_id = $1 and idempotency_key = $2
        for update`,
      [input.workspaceId, input.idempotencyKey],
    )
  ).rows[0];
  if (!delivery || delivery.report_id !== input.reportId || delivery.recipient !== input.recipient) {
    throw new ReportDeliveryStoreError("CONFLICT");
  }
  if (delivery.status === "delivered") {
    return {
      id: delivery.id,
      reportId: report.id,
      snapshot: jsonValue(report.snapshot),
      attempts: delivery.attempts,
      createdAt: new Date(delivery.created_at),
      alreadyDelivered: true,
    };
  }
  const changed = (
    await database.query<{ attempts: number }>(
      `update deliveries
          set status = 'sending', attempts = attempts + 1, last_error = null
        where workspace_id = $1 and id = $2 and status <> 'delivered'
        returning attempts`,
      [input.workspaceId, delivery.id],
    )
  ).rows[0];
  if (!changed) throw new ReportDeliveryStoreError("INVALID_STATE");
  return {
    id: delivery.id,
    reportId: report.id,
    snapshot: jsonValue(report.snapshot),
    attempts: changed.attempts,
    createdAt: new Date(delivery.created_at),
    alreadyDelivered: false,
  };
}

async function markEmailDeliveredInTransaction(
  database: DeliverySqlClient,
  input: { workspaceId: string; deliveryId: string; deliveredAt: Date },
): Promise<void> {
  const delivery = (
    await database.query<{ report_id: string }>(
      `update deliveries
          set status = 'delivered', last_error = null, delivered_at = coalesce(delivered_at, $3)
        where workspace_id = $1 and id = $2 and status <> 'delivered'
        returning report_id::text`,
      [input.workspaceId, input.deliveryId, input.deliveredAt],
    )
  ).rows[0];
  if (!delivery) {
    const existing = await database.query(
      "select 1 from deliveries where workspace_id = $1 and id = $2 and status = 'delivered'",
      [input.workspaceId, input.deliveryId],
    );
    if (!existing.rows[0]) throw new ReportDeliveryStoreError("NOT_FOUND");
    return;
  }
  await database.query(
    `update weekly_reports
        set status = 'delivered', delivered_at = $3, updated_at = $3
      where workspace_id = $1 and id = $2 and delivered_at is null`,
    [input.workspaceId, delivery.report_id, input.deliveredAt],
  );
}

async function markEmailFailedInTransaction(
  database: DeliverySqlClient,
  input: { workspaceId: string; deliveryId: string; errorCode: string },
): Promise<void> {
  await database.query(
    `update deliveries
        set status = 'failed', last_error = $3
      where workspace_id = $1 and id = $2 and status <> 'delivered'`,
    [input.workspaceId, input.deliveryId, input.errorCode],
  );
}

async function findPdfAssetInTransaction(
  database: DeliverySqlClient,
  input: { workspaceId: string; reportId: string; storageKey: string },
): Promise<ReportPdfAsset | null> {
  const row = (
    await database.query<AssetRow>(
      `select ${ASSET_COLUMNS} from report_assets
        where workspace_id = $1 and report_id = $2 and kind = 'pdf' and storage_key = $3`,
      [input.workspaceId, input.reportId, input.storageKey],
    )
  ).rows[0];
  return row ? asset(row) : null;
}

async function savePdfAssetInTransaction(
  database: DeliverySqlClient,
  input: {
    workspaceId: string;
    reportId: string;
    storageKey: string;
    checksumSha256: string;
    sizeBytes: number;
  },
): Promise<ReportPdfAsset> {
  await database.query(
    `insert into report_assets
      (workspace_id, report_id, kind, storage_key, content_type, checksum_sha256, size_bytes)
     values ($1, $2, 'pdf', $3, 'application/pdf', $4, $5)
     on conflict (storage_key) do nothing`,
    [input.workspaceId, input.reportId, input.storageKey, input.checksumSha256, input.sizeBytes],
  );
  const row = (
    await database.query<AssetRow>(
      `select ${ASSET_COLUMNS} from report_assets
        where workspace_id = $1 and report_id = $2 and kind = 'pdf' and storage_key = $3`,
      [input.workspaceId, input.reportId, input.storageKey],
    )
  ).rows[0];
  if (!row) throw new ReportDeliveryStoreError("CONFLICT");
  const stored = asset(row);
  if (stored.checksumSha256 !== input.checksumSha256 || stored.sizeBytes !== input.sizeBytes) {
    throw new ReportDeliveryStoreError("CONFLICT");
  }
  return stored;
}

export class PostgresReportDeliveryStore implements ReportDeliveryStore, ReportAccessStore {
  constructor(private readonly source: DeliverySqlSource) {}

  async isEmailSuppressed(input: {
    workspaceId: string;
    recipient: string;
  }): Promise<boolean> {
    const recipient = input.recipient.trim().toLowerCase();
    const recipientHash = createHash("sha256").update(recipient, "utf8").digest("hex");
    return withTransaction(this.source, input.workspaceId, async (database) => {
      return isEmailSuppressedInTransaction(database, {
        workspaceId: input.workspaceId,
        recipientHash,
      });
    });
  }

  async loadReportForAccess(input: {
    workspaceId: string;
    reportId: string;
  }): Promise<{ snapshot: WeeklyReportSnapshot; periodEnd: string }> {
    return withTransaction(this.source, input.workspaceId, async (database) => {
      const report = (
        await database.query<ReportRow>(
          `select id::text, period_end, snapshot from weekly_reports
            where workspace_id = $1 and id = $2 and snapshot is not null`,
          [input.workspaceId, input.reportId],
        )
      ).rows[0];
      if (!report?.snapshot || report.period_end === undefined) {
        throw new ReportDeliveryStoreError("NOT_FOUND");
      }
      const periodEnd = report.period_end instanceof Date
        ? report.period_end.toISOString().slice(0, 10)
        : String(report.period_end).slice(0, 10);
      return { snapshot: jsonValue(report.snapshot), periodEnd };
    });
  }

  async loadReportSnapshot(input: {
    workspaceId: string;
    reportId: string;
  }): Promise<WeeklyReportSnapshot> {
    return withTransaction(this.source, input.workspaceId, async (database) => {
      const report = (
        await database.query<ReportRow>(
          `select id::text, snapshot from weekly_reports
            where workspace_id = $1 and id = $2 and snapshot is not null`,
          [input.workspaceId, input.reportId],
        )
      ).rows[0];
      if (!report?.snapshot) throw new ReportDeliveryStoreError("NOT_FOUND");
      return jsonValue(report.snapshot);
    });
  }

  async prepareEmail(input: {
    workspaceId: string;
    reportId: string;
    recipient: string;
    idempotencyKey: string;
    now: Date;
  }): Promise<PreparedEmailDelivery> {
    return withTransaction(this.source, input.workspaceId, async (database) => {
      return prepareEmailInTransaction(database, input);
    });
  }

  async markEmailDelivered(input: {
    workspaceId: string;
    deliveryId: string;
    deliveredAt: Date;
  }): Promise<void> {
    await withTransaction(this.source, input.workspaceId, async (database) => {
      await markEmailDeliveredInTransaction(database, input);
    });
  }

  async markEmailFailed(input: {
    workspaceId: string;
    deliveryId: string;
    errorCode: string;
  }): Promise<void> {
    await withTransaction(this.source, input.workspaceId, async (database) => {
      await markEmailFailedInTransaction(database, input);
    });
  }

  async findPdfAsset(input: {
    workspaceId: string;
    reportId: string;
    storageKey: string;
  }): Promise<ReportPdfAsset | null> {
    return withTransaction(this.source, input.workspaceId, async (database) => {
      return findPdfAssetInTransaction(database, input);
    });
  }

  async savePdfAsset(input: {
    workspaceId: string;
    reportId: string;
    storageKey: string;
    checksumSha256: string;
    sizeBytes: number;
  }): Promise<ReportPdfAsset> {
    return withTransaction(this.source, input.workspaceId, async (database) => {
      return savePdfAssetInTransaction(database, input);
    });
  }

  async withEmailDeliveryFence<T>(input: {
    workspaceId: string;
    reportId: string;
    recipient: string;
    recipientHash: string;
    idempotencyKey: string;
    now: Date;
  }, operation: (
    prepared: PreparedEmailDelivery,
    transaction: ReportEmailDeliveryTransaction,
  ) => Promise<T>): Promise<ReportEmailDeliveryFenceResult<T>> {
    let operationError: unknown;
    const result: ReportEmailDeliveryFenceResult<T> | { readonly disposition: "operation_failed" } =
      await withTransaction(this.source, input.workspaceId, async (database) => {
      await database.query(
        "select privacy_lock_recipient_email_shared($1::uuid, $2::text)",
        [input.workspaceId, input.recipientHash],
      );
      if (await isEmailSuppressedInTransaction(database, input)) {
        return { disposition: "suppressed" } as const;
      }
      const prepared = await prepareEmailInTransaction(database, input);
      if (prepared.alreadyDelivered) {
        return { disposition: "already_delivered", prepared } as const;
      }
      const transaction: ReportEmailDeliveryTransaction = {
        findPdfAsset: (value) => findPdfAssetInTransaction(database, value),
        savePdfAsset: (value) => savePdfAssetInTransaction(database, value),
        markEmailDelivered: (value) => markEmailDeliveredInTransaction(database, value),
        markEmailFailed: (value) => markEmailFailedInTransaction(database, value),
      };
      try {
        return {
          disposition: "executed",
          prepared,
          value: await operation(prepared, transaction),
        } as const;
      } catch (error) {
        operationError = error;
        return { disposition: "operation_failed" } as const;
      }
    });
    if (operationError !== undefined) throw operationError;
    if (result.disposition === "operation_failed") {
      throw new ReportDeliveryStoreError("INVALID_STATE");
    }
    return result;
  }
}
