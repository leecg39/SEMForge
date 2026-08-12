#!/usr/bin/env node
// @TASK P5-O1-T1 - Executable recovery and reconciliation runbook harness
// @SPEC docs/planning/06-tasks.md#p5-o1-t1--운영-승인과-복구-리허설
// @TEST scripts/recovery/recovery.contract.test.ts
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type ParsedArgs = {
  command: string;
  flags: Map<string, string | boolean>;
};

const SAFE_WORKSPACE_PREFIX = "semforge-recovery-";

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  if (!command) {
    throw new CliError(64, "missing command");
  }

  const flags = new Map<string, string | boolean>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]!;
    if (!token.startsWith("--")) {
      throw new CliError(64, `unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      flags.set(key, true);
      continue;
    }
    flags.set(key, next);
    index += 1;
  }

  return { command, flags };
}

class CliError extends Error {
  constructor(
    readonly exitCode: number,
    message: string,
    readonly details: Record<string, JsonValue> = {},
  ) {
    super(message);
  }
}

function requireFlag(flags: Map<string, string | boolean>, name: string): string {
  const value = flags.get(name);
  if (typeof value !== "string" || value.trim() === "") {
    throw new CliError(64, `missing --${name}`);
  }
  return value;
}

function optionalFlag(flags: Map<string, string | boolean>, name: string): string | undefined {
  const value = flags.get(name);
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function commandAvailable(command: string): boolean {
  const result = spawnSync("sh", ["-c", `command -v ${command} >/dev/null 2>&1`], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertNoSecret(value: string, fieldName: string): void {
  if (/postgres(?:ql)?:\/\/[^@]+@/iu.test(value) || /sk_(?:test|live)|secret|billingKey|paymentKey_live/iu.test(value)) {
    throw new CliError(65, `${fieldName} appears to contain a secret`);
  }
}

function assertDigest(value: string, fieldName: string): void {
  assertNoSecret(value, fieldName);
  if (!/@sha256:[a-f0-9]{64}$/u.test(value)) {
    throw new CliError(64, `${fieldName} must be an immutable image digest`);
  }
}

function assertIncident(value: string): void {
  if (!/^INC-\d{8}-\d{3}$/u.test(value)) {
    throw new CliError(64, "incident must use INC-YYYYMMDD-NNN");
  }
}

async function listSqlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

function doctor(): Record<string, JsonValue> {
  return {
    command: "doctor",
    requiresExplicitApply: true,
    safeWorkspacePrefix: SAFE_WORKSPACE_PREFIX,
    externalWrites: [],
    checks: {
      dockerAvailable: commandAvailable("docker"),
      minioClientAvailable: commandAvailable("mc"),
      postgresClientAvailable: commandAvailable("psql") && commandAvailable("pg_dump") && commandAvailable("pg_restore"),
      nodeMajor: Number.parseInt(process.versions.node.split(".", 1)[0] ?? "0", 10),
    },
    notes: [
      "doctor only checks local binaries and never creates containers, buckets, databases, or payments",
      "all destructive recovery steps require a separate human-approved apply run outside this harness",
    ],
  };
}

function pgPitrPlan(flags: Map<string, string | boolean>): Record<string, JsonValue> {
  const incident = requireFlag(flags, "incident");
  assertIncident(incident);
  const gitSha = requireFlag(flags, "git-sha");
  const targetTime = requireFlag(flags, "target-time");
  const sourceInstance = requireFlag(flags, "source-instance");
  const restoreInstance = requireFlag(flags, "restore-instance");

  for (const [field, value] of Object.entries({ gitSha, targetTime, sourceInstance, restoreInstance })) {
    assertNoSecret(value, field);
  }
  if (sourceInstance === restoreInstance) {
    throw new CliError(65, "restore-instance must not equal source-instance");
  }

  return {
    command: "pg-pitr-plan",
    safeToApplyAutomatically: false,
    externalWrites: [],
    incidentId: incident,
    gitSha,
    sourceInstance,
    restoreInstance,
    pitrTargetTime: targetTime,
    invariants: [
      "원본 인스턴스에는 쓰기 작업을 수행하지 않는다",
      "복구는 새 PostgreSQL 16 인스턴스에서 읽기 전용 검증 후 승인한다",
      "모든 운영 DSN은 PGSSLMODE=verify-full 또는 sslmode=verify-full로만 사용한다",
    ],
    commands: [
      {
        id: "logical-backup-before-release",
        command: "pg_dump --format=custom --no-owner --no-privileges --file=semforge-pre-release.dump \"$MIGRATION_DATABASE_URL\"",
      },
      {
        id: "checksum-backup",
        command: "sha256sum semforge-pre-release.dump",
      },
      {
        id: "provider-pitr-restore",
        command: `restore managed PostgreSQL 16 instance ${sourceInstance} to ${restoreInstance} at ${targetTime}`,
      },
      {
        id: "logical-restore-rehearsal",
        command: "pg_restore --exit-on-error --clean --if-exists --no-owner --dbname=\"$RESTORE_DATABASE_URL\" semforge-pre-release.dump",
      },
      {
        id: "read-only-compare",
        command:
          "compare drizzle migration journal, workspace/site/report counts, billing ledger boundaries, jobs/outbox unfinished counts",
      },
    ],
    requiredEvidence: [
      "incidentId",
      "operator",
      "reviewer",
      "gitSha",
      "migrationJournal",
      "backupChecksum",
      "pitrTargetTime",
      "restoreInstanceId",
      "readOnlyValidation",
      "goNoGoDecision",
    ],
  };
}

async function objectVersionRestore(flags: Map<string, string | boolean>): Promise<Record<string, JsonValue>> {
  const fixtureDir = requireFlag(flags, "fixture-dir");
  const objectKey = requireFlag(flags, "object-key");
  const versionId = requireFlag(flags, "version-id");
  const restorePrefix = requireFlag(flags, "restore-prefix");

  assertNoSecret(objectKey, "object-key");
  if (objectKey.startsWith("/") || objectKey.includes("..")) {
    throw new CliError(64, "object-key must be a relative key without traversal");
  }
  if (restorePrefix.startsWith("/") || restorePrefix.includes("..")) {
    throw new CliError(64, "restore-prefix must be a relative prefix without traversal");
  }

  const sourcePath = path.join(fixtureDir, "versions", `${objectKey}.${versionId}`);
  const restoredPath = path.join(fixtureDir, restorePrefix, objectKey);
  const currentPath = path.join(fixtureDir, "current", objectKey);

  const [sourceBytes, currentStats] = await Promise.all([
    readFile(sourcePath),
    stat(currentPath).catch(() => null),
  ]);
  if (!currentStats?.isFile()) {
    throw new CliError(66, "current object fixture is missing");
  }
  await mkdir(path.dirname(restoredPath), { recursive: true });
  await copyFile(sourcePath, restoredPath);

  return {
    command: "object-version-restore",
    mode: "fixture",
    externalWrites: [],
    objectKey,
    versionId,
    restoredPath,
    restoredSha256: sha256(sourceBytes),
    promotedCurrentVersion: false,
    workspaceOwnershipVerified: /^reports\/[^/]+\/[^/]+$/u.test(objectKey),
    evidenceRequiredBeforePromotion: [
      "objectKey",
      "sourceVersionId",
      "restoredSha256",
      "contentType",
      "workspaceId",
      "reportSnapshotId",
      "approver",
      "newSignedUrlIssued",
    ],
  };
}

function imageRollbackPlan(flags: Map<string, string | boolean>): Record<string, JsonValue> {
  const incident = requireFlag(flags, "incident");
  assertIncident(incident);
  const failedImage = requireFlag(flags, "failed-image");
  const previousImage = requireFlag(flags, "previous-image");
  const migrationJournal = requireFlag(flags, "migration-journal");
  assertDigest(failedImage, "failed-image");
  assertDigest(previousImage, "previous-image");
  assertNoSecret(migrationJournal, "migration-journal");

  return {
    command: "image-rollback-plan",
    incidentId: incident,
    failedImage,
    previousImage,
    migrationJournal,
    externalWrites: [],
    safeToApplyAutomatically: false,
    usesDownMigration: false,
    forwardCompatibleMigrationRequired: true,
    steps: [
      {
        id: "freeze-schedulers",
        action: "suspend weekly collection and report schedulers before any image change",
      },
      {
        id: "drain-relay-worker",
        action: "scale relay and worker to zero after a 45 second graceful shutdown window",
      },
      {
        id: "apply-previous-digest",
        action: "replace web, relay, worker, scheduler image digest with the previous immutable digest",
      },
      {
        id: "health-check",
        action: "require /health/live and /health/ready success before resuming background processing",
      },
      {
        id: "queue-boundary-check",
        action: "verify queue lag, outbox lag, and no duplicate billing/provider idempotency keys",
      },
      {
        id: "record-incident",
        action: "record incident timeline, digests, migration journal, operator, reviewer, and go/no-go decision",
      },
    ],
  };
}

async function forwardMigrationAudit(flags: Map<string, string | boolean>): Promise<Record<string, JsonValue>> {
  const migrationsDir = requireFlag(flags, "migrations-dir");
  const sqlFiles = await listSqlFiles(migrationsDir);
  const destructivePatterns = [
    { keyword: "drop table", pattern: /\bdrop\s+table\b/iu },
    { keyword: "drop column", pattern: /\bdrop\s+column\b/iu },
    { keyword: "alter type drop value", pattern: /\balter\s+type\b[\s\S]*\bdrop\s+value\b/iu },
    { keyword: "truncate", pattern: /\btruncate\b/iu },
    { keyword: "delete without where", pattern: /\bdelete\s+from\s+[\w".]+(?:\s*;|\s*$)/iu },
  ];
  const destructiveFindings: Array<Record<string, JsonValue>> = [];

  for (const file of sqlFiles) {
    const sql = await readFile(file, "utf8");
    for (const destructive of destructivePatterns) {
      if (destructive.pattern.test(sql)) {
        destructiveFindings.push({
          file: path.relative(migrationsDir, file),
          keyword: destructive.keyword,
        });
      }
    }
  }

  const pass = destructiveFindings.length === 0;
  return {
    command: "forward-migration-audit",
    pass,
    externalWrites: [],
    filesScanned: sqlFiles.length,
    destructiveFindings,
    requiredProperties: [
      "additive SQL only",
      "previous application image remains compatible with migrated schema",
      "no automatic down migration",
    ],
  };
}

async function tossReconcilePlan(flags: Map<string, string | boolean>): Promise<Record<string, JsonValue>> {
  const ledgerFixture = requireFlag(flags, "ledger-fixture");
  const fixture = JSON.parse(await readFile(ledgerFixture, "utf8")) as {
    incidentId?: string;
    workspaceId?: string;
    billingPeriod?: string;
    localLedger?: Array<{ orderId?: string; status?: string; amountKrw?: number; idempotencyKey?: string }>;
    tossQueryResult?: { orderId?: string; status?: string; amountKrw?: number; approvedAt?: string; paymentKey?: string };
    legalRefundRequest?: { amountKrw?: number; reason?: string; approvedBy?: string };
  };
  const local = fixture.localLedger?.[0];
  const toss = fixture.tossQueryResult;
  if (!local?.orderId || !toss?.orderId || local.orderId !== toss.orderId) {
    throw new CliError(65, "ledger fixture must contain matching local and Toss orderId");
  }

  const adjustments: JsonValue[] = [];
  if (local.status !== "succeeded" && toss.status === "DONE") {
    adjustments.push({
      type: "local ledger adjustment: charge_succeeded",
      orderId: local.orderId,
      amountKrw: toss.amountKrw ?? local.amountKrw ?? null,
      source: "Toss Query API로 orderId 조회",
      idempotencyKey: local.idempotencyKey ?? null,
    });
  }
  if (fixture.legalRefundRequest) {
    adjustments.push({
      type: "manual legal refund adjustment",
      orderId: local.orderId,
      amountKrw: fixture.legalRefundRequest.amountKrw ?? null,
      reason: fixture.legalRefundRequest.reason ?? "statutory_refund",
      approvedBy: fixture.legalRefundRequest.approvedBy ?? null,
      requiresFinanceApproval: true,
    });
  }

  return {
    command: "toss-reconcile-plan",
    mode: "dry-run",
    incidentId: fixture.incidentId ?? null,
    workspaceId: fixture.workspaceId ?? null,
    billingPeriod: fixture.billingPeriod ?? null,
    externalWrites: [],
    forbiddenOperations: ["charge", "refund", "cancelBillingKey"],
    providerReads: ["Toss Query API로 orderId 조회"],
    adjustments,
    evidenceRequiredBeforeManualEntry: [
      "incidentId",
      "workspaceId",
      "orderId",
      "billingPeriod",
      "Toss query response hash",
      "local ledger before/after",
      "finance approver",
      "legal basis",
    ],
  };
}

async function run(parsed: ParsedArgs): Promise<Record<string, JsonValue>> {
  switch (parsed.command) {
    case "doctor":
      return doctor();
    case "pg-pitr-plan":
      return pgPitrPlan(parsed.flags);
    case "object-version-restore":
      return objectVersionRestore(parsed.flags);
    case "image-rollback-plan":
      return imageRollbackPlan(parsed.flags);
    case "forward-migration-audit":
      return forwardMigrationAudit(parsed.flags);
    case "toss-reconcile-plan":
      return tossReconcilePlan(parsed.flags);
    default:
      throw new CliError(64, `unknown command: ${parsed.command}`);
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const payload = await run(parsed);
  process.stdout.write(`${JSON.stringify(payload, null, optionalFlag(parsed.flags, "json") ? 2 : 0)}\n`);
  if (payload.command === "forward-migration-audit" && payload.pass === false) {
    process.exitCode = 65;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error: unknown) => {
    if (error instanceof CliError) {
      process.stdout.write(
        `${JSON.stringify({
          command: process.argv[2] ?? null,
          pass: false,
          error: error.message,
          ...error.details,
        })}\n`,
      );
      process.exitCode = error.exitCode;
      return;
    }
    process.stdout.write(
      `${JSON.stringify({
        command: process.argv[2] ?? null,
        pass: false,
        error: "recovery harness failed",
      })}\n`,
    );
    process.exitCode = 70;
  });
}
