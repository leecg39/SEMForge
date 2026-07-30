import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { registerDueJob, type DueJobOutcome } from "@/server/providers/scheduler";

/**
 * DB 보존 정책 job.
 *
 * append-only 스냅샷 테이블과 만료된 인증 부속 데이터를 주기적으로 정리한다.
 * /api/cron/run-due 가 실행하며, 보존 기간은 env 로 조정한다.
 *   - SNAPSHOT_RETENTION_DAYS (기본 90): serp/ai_visibility/map_rank 스냅샷 보존 일수
 * 세션은 만료·폐기 후 7일, 삭제 확인 코드는 소비되었거나 만료 1일 뒤 정리한다.
 */

export const DB_RETENTION_JOB_NAME = "db_retention";
const DEFAULT_SNAPSHOT_RETENTION_DAYS = 90;
const SESSION_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const CONFIRMATION_GRACE_MS = 24 * 60 * 60 * 1000;

function snapshotRetentionDays(): number {
  const raw = Number(process.env.SNAPSHOT_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_SNAPSHOT_RETENTION_DAYS;
}

interface RetentionTarget {
  label: string;
  run: (nowMs: number) => number;
}

function deleteWhere(table: string, where: ReturnType<typeof sql>): number {
  const result = db.run(sql`DELETE FROM ${sql.raw(table)} WHERE ${where}`);
  return Number(result.changes ?? 0);
}

/** 보존 정책을 1회 실행한다. 반환은 due job outcome 형태다. */
export function runRetention(now = new Date()): DueJobOutcome {
  const nowMs = now.getTime();
  const snapshotCutoff = nowMs - snapshotRetentionDays() * 24 * 60 * 60 * 1000;

  const targets: RetentionTarget[] = [
    {
      label: "serp_snapshots",
      run: () => deleteWhere("serp_snapshots", sql`captured_at < ${snapshotCutoff}`),
    },
    {
      label: "ai_visibility_snapshots",
      run: () => deleteWhere("ai_visibility_snapshots", sql`captured_at < ${snapshotCutoff}`),
    },
    {
      label: "map_rank_snapshots",
      run: () => deleteWhere("map_rank_snapshots", sql`captured_at < ${snapshotCutoff}`),
    },
    {
      label: "sessions(만료·폐기)",
      run: () =>
        deleteWhere(
          "sessions",
          sql`(expires_at < ${nowMs - SESSION_GRACE_MS}) OR (revoked_at IS NOT NULL AND revoked_at < ${nowMs - SESSION_GRACE_MS})`
        ),
    },
    {
      label: "delete_confirmations(소비·만료)",
      run: () =>
        deleteWhere(
          "delete_confirmations",
          sql`consumed_at IS NOT NULL OR expires_at < ${nowMs - CONFIRMATION_GRACE_MS}`
        ),
    },
  ];

  const outcome: DueJobOutcome = { scanned: targets.length, processed: 0, failed: 0, errors: [] };
  for (const target of targets) {
    try {
      const deleted = target.run(nowMs);
      if (deleted > 0) outcome.processed += deleted;
    } catch (error) {
      outcome.failed += 1;
      outcome.errors.push(
        `${target.label}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return outcome;
}

let registered = false;

/** /api/cron/run-due 레지스트리에 보존 job 을 등록한다 (멱등). */
export function ensureDbRetentionJob(): void {
  if (registered) return;
  registerDueJob(DB_RETENTION_JOB_NAME, ({ now }) => Promise.resolve(runRetention(now)));
  registered = true;
}
