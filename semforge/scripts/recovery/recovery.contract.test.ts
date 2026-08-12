// @TASK P5-O1-T1 - Executable recovery and reconciliation runbook harness
// @SPEC docs/planning/06-tasks.md#p5-o1-t1--운영-승인과-복구-리허설
// @TEST scripts/recovery/cli.ts
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);

async function recoveryCli(args: string[], options: { expectFailure?: boolean } = {}) {
  const result = await execFileAsync(
    process.execPath,
    ["--import", "tsx", "scripts/recovery/cli.ts", ...args],
    {
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: "0" },
      maxBuffer: 1024 * 1024,
    },
  ).then(
    ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
    (error: unknown) => {
      const failure = error as { code?: number; stdout?: string; stderr?: string };
      return {
        code: typeof failure.code === "number" ? failure.code : 1,
        stdout: failure.stdout ?? "",
        stderr: failure.stderr ?? "",
      };
    },
  );

  if (options.expectFailure) {
    assert.notEqual(result.code, 0, result.stdout || result.stderr);
  } else {
    assert.equal(result.code, 0, result.stderr);
  }
  return result;
}

function parseJson(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

test("doctor는 Docker/MinIO 가능 여부만 점검하고 운영 리소스 변경은 하지 않는다", async () => {
  const result = await recoveryCli(["doctor", "--json"]);
  const payload = parseJson(result.stdout);

  assert.equal(payload.command, "doctor");
  assert.equal(payload.requiresExplicitApply, true);
  assert.equal(payload.safeWorkspacePrefix, "semforge-recovery-");
  assert.deepEqual(payload.externalWrites, []);
  assert.equal(typeof (payload.checks as Record<string, unknown>).dockerAvailable, "boolean");
  assert.equal(typeof (payload.checks as Record<string, unknown>).minioClientAvailable, "boolean");
  assert.equal(typeof (payload.checks as Record<string, unknown>).postgresClientAvailable, "boolean");
});

test("PG PITR 계획은 원본 DB를 덮어쓰지 않고 새 인스턴스 검증과 증거 필드를 요구한다", async () => {
  const result = await recoveryCli([
    "pg-pitr-plan",
    "--incident",
    "INC-20260812-001",
    "--git-sha",
    "3702adec17136b4f98417496d85fa7b6c8740f99",
    "--target-time",
    "2026-08-12T08:55:00+09:00",
    "--source-instance",
    "semforge-prod",
    "--restore-instance",
    "semforge-pitr-inc-20260812-001",
  ]);
  const payload = parseJson(result.stdout);

  assert.equal(payload.command, "pg-pitr-plan");
  assert.equal(payload.safeToApplyAutomatically, false);
  assert.deepEqual(payload.externalWrites, []);
  assert.match(JSON.stringify(payload), /PGSSLMODE=verify-full/u);
  assert.match(JSON.stringify(payload), /pg_dump --format=custom/u);
  assert.match(JSON.stringify(payload), /pg_restore --exit-on-error/u);
  assert.match(JSON.stringify(payload), /semforge-pitr-inc-20260812-001/u);
  assert.doesNotMatch(JSON.stringify(payload), /overwrite original|DROP DATABASE semforge-prod/iu);
  assert.deepEqual(payload.requiredEvidence, [
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
  ]);
});

test("object-version-restore는 로컬 fixture에서 이전 버전을 복구 prefix로 복사하고 checksum을 검증한다", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "semforge-object-restore-"));
  try {
    await mkdir(path.join(fixture, "versions", "reports", "workspace-a"), { recursive: true });
    await mkdir(path.join(fixture, "current", "reports", "workspace-a"), { recursive: true });
    await writeFile(path.join(fixture, "versions", "reports", "workspace-a", "report.pdf.v1"), "old-pdf");
    await writeFile(path.join(fixture, "current", "reports", "workspace-a", "report.pdf"), "corrupt-pdf");

    const result = await recoveryCli([
      "object-version-restore",
      "--fixture-dir",
      fixture,
      "--object-key",
      "reports/workspace-a/report.pdf",
      "--version-id",
      "v1",
      "--restore-prefix",
      "recovered/INC-20260812-001",
    ]);
    const payload = parseJson(result.stdout);
    const restoredPath = payload.restoredPath as string;

    assert.equal(payload.command, "object-version-restore");
    assert.equal(payload.promotedCurrentVersion, false);
    assert.equal(payload.workspaceOwnershipVerified, true);
    assert.match(restoredPath, /recovered\/INC-20260812-001\/reports\/workspace-a\/report\.pdf/u);
    assert.equal(await readFile(restoredPath, "utf8"), "old-pdf");
    assert.equal(payload.restoredSha256, "4a491273fb93b2df99e945fafb47c11afc1496def483dd0fa7fc19564e118dc9");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("previous-image rollback 계획은 scheduler suspend, worker drain, 이전 digest 적용, health 검증 순서를 고정한다", async () => {
  const result = await recoveryCli([
    "image-rollback-plan",
    "--incident",
    "INC-20260812-002",
    "--failed-image",
    "registry.example.com/semforge/web@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "--previous-image",
    "registry.example.com/semforge/web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "--migration-journal",
    "0000_core",
  ]);
  const payload = parseJson(result.stdout);
  const steps = payload.steps as Array<Record<string, unknown>>;

  assert.equal(payload.command, "image-rollback-plan");
  assert.equal(payload.usesDownMigration, false);
  assert.deepEqual(
    steps.map((step) => step.id),
    [
      "freeze-schedulers",
      "drain-relay-worker",
      "apply-previous-digest",
      "health-check",
      "queue-boundary-check",
      "record-incident",
    ],
  );
  assert.match(JSON.stringify(payload), /\/health\/live/u);
  assert.match(JSON.stringify(payload), /\/health\/ready/u);
  assert.doesNotMatch(JSON.stringify(payload), /down migration|rollback schema/iu);
});

test("forward-compatible migration 감사는 additive 변경을 통과시키고 destructive SQL을 실패시킨다", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "semforge-migration-audit-"));
  try {
    await writeFile(
      path.join(fixture, "0001_additive.sql"),
      "alter table reports add column if not exists archived_at timestamptz;\ncreate index concurrently if not exists reports_archived_idx on reports (archived_at);\n",
    );
    const additive = parseJson((await recoveryCli(["forward-migration-audit", "--migrations-dir", fixture])).stdout);
    assert.equal(additive.pass, true);
    assert.deepEqual(additive.destructiveFindings, []);

    await writeFile(path.join(fixture, "0002_destructive.sql"), "drop table reports;\nalter table sites drop column domain;\n");
    const destructive = await recoveryCli(["forward-migration-audit", "--migrations-dir", fixture], {
      expectFailure: true,
    });
    const failed = parseJson(destructive.stdout);
    assert.equal(failed.pass, false);
    assert.deepEqual((failed.destructiveFindings as Array<Record<string, unknown>>).map((finding) => finding.keyword), [
      "drop table",
      "drop column",
    ]);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Toss reconciliation은 조회 조정과 수동 법정환불 ledger 절차만 만들고 결제/환불 API를 호출하지 않는다", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "semforge-toss-reconcile-"));
  try {
    const ledgerPath = path.join(fixture, "ledger.json");
    await writeFile(
      ledgerPath,
      JSON.stringify({
        incidentId: "INC-20260812-003",
        workspaceId: "11111111-1111-4111-8111-111111111111",
        billingPeriod: "2026-08",
        localLedger: [
          {
            orderId: "semforge-11111111-202608",
            status: "charge_pending",
            amountKrw: 49000,
            idempotencyKey: "billing:11111111:2026-08",
          },
        ],
        tossQueryResult: {
          orderId: "semforge-11111111-202608",
          status: "DONE",
          approvedAt: "2026-08-12T09:01:00+09:00",
          amountKrw: 49000,
          paymentKey: "pay_mock_safe",
        },
        legalRefundRequest: {
          amountKrw: 49000,
          reason: "statutory_refund",
          approvedBy: "legal-reviewer@example.com",
        },
      }),
    );

    const result = await recoveryCli(["toss-reconcile-plan", "--ledger-fixture", ledgerPath]);
    const payload = parseJson(result.stdout);

    assert.equal(payload.command, "toss-reconcile-plan");
    assert.equal(payload.mode, "dry-run");
    assert.deepEqual(payload.externalWrites, []);
    assert.deepEqual(payload.forbiddenOperations, ["charge", "refund", "cancelBillingKey"]);
    assert.match(JSON.stringify(payload), /Toss Query API로 orderId 조회/u);
    assert.match(JSON.stringify(payload), /local ledger adjustment: charge_succeeded/u);
    assert.match(JSON.stringify(payload), /manual legal refund adjustment/u);
    assert.match(JSON.stringify(payload), /requiresFinanceApproval/u);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
