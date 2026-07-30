import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * 주기 수집 due-runner.
 *
 * 서버 안에 상시 타이머를 두지 않고, 외부 cron/launchd 가
 * GET /api/cron/run-due 를 주기 호출하면 등록된 job 을 순차 실행하는 구조다.
 * 사이트 진단/포지션 추적 워커는 registerDueJob 으로 핸들러를 등록해 붙는다.
 *
 * 각 job 핸들러는 자기 도메인의 `*_schedule` 테이블(또는 next_run_at 필드)을
 * listDueScheduleRows 로 스캔해 실행할 대상을 골라낸다.
 */

export interface DueJobContext {
  /** 이번 실행의 기준 시각. 테스트에서 고정값을 주입할 수 있다. */
  now: Date;
  /** job 당 처리할 최대 행 수 상한 */
  limit: number;
}

export interface DueJobOutcome {
  /** due 대상으로 스캔된 행 수 */
  scanned: number;
  /** 실제 처리에 성공한 행 수 */
  processed: number;
  /** 처리에 실패한 행 수 */
  failed: number;
  /** 행 단위 실패 메시지 (최대 10개까지 보존) */
  errors: string[];
}

export type DueJobHandler = (
  context: DueJobContext
) => Promise<Partial<DueJobOutcome> | void>;

export interface DueJobReport {
  name: string;
  status: "ok" | "error";
  scanned: number;
  processed: number;
  failed: number;
  errors: string[];
  durationMs: number;
}

const MAX_KEPT_ERRORS = 10;
const DEFAULT_JOB_LIMIT = 25;
/** 식별자는 바인드 파라미터로 넘길 수 없어 raw 삽입하므로 엄격히 화이트리스트한다. */
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;
/** job 이름은 SQL 에 들어가지 않으므로 하이픈까지 허용한다 (예: "site-audit"). */
const JOB_NAME_PATTERN = /^[a-z][a-z0-9_-]*$/;

type DueJobRegistry = Map<string, DueJobHandler>;

// dev HMR 에서 모듈이 재평가돼도 등록된 job 이 유지되도록 globalThis 에 보관한다.
const globalForScheduler = globalThis as unknown as {
  __semrushCloneDueJobs?: DueJobRegistry;
};

function getRegistry(): DueJobRegistry {
  if (!globalForScheduler.__semrushCloneDueJobs) {
    globalForScheduler.__semrushCloneDueJobs = new Map();
  }
  return globalForScheduler.__semrushCloneDueJobs;
}

/**
 * due job 등록. 같은 이름으로 다시 등록하면 마지막 핸들러가 이긴다.
 * 등록은 모듈 import 시점에 하는 것을 권장한다 (cron 라우트가 import 해 실행).
 */
export function registerDueJob(name: string, handler: DueJobHandler): void {
  if (!JOB_NAME_PATTERN.test(name)) {
    throw new Error(`due job 이름이 올바르지 않습니다: ${name}`);
  }
  getRegistry().set(name, handler);
}

export function listDueJobs(): string[] {
  return [...getRegistry().keys()];
}

function emptyOutcome(): DueJobOutcome {
  return { scanned: 0, processed: 0, failed: 0, errors: [] };
}

/**
 * 등록된 job 을 모두 실행한다. 한 job 이 던진 예외는 다음 job 실행을 막지 않고
 * 해당 job 의 report 에 error 로 기록한다.
 */
export async function runDueJobs(options?: {
  now?: Date;
  limit?: number;
  /** 특정 job 이름만 실행하고 싶을 때 */
  only?: string[];
}): Promise<DueJobReport[]> {
  const now = options?.now ?? new Date();
  const limit =
    Number.isFinite(options?.limit) && (options?.limit ?? 0) > 0
      ? Math.floor(options!.limit!)
      : DEFAULT_JOB_LIMIT;
  const only = options?.only ? new Set(options.only) : null;
  const reports: DueJobReport[] = [];

  for (const [name, handler] of getRegistry()) {
    if (only && !only.has(name)) continue;
    const startedAt = Date.now();
    const outcome = emptyOutcome();
    let status: DueJobReport["status"] = "ok";
    try {
      const result = await handler({ now, limit });
      if (result) {
        outcome.scanned = result.scanned ?? 0;
        outcome.processed = result.processed ?? 0;
        outcome.failed = result.failed ?? 0;
        outcome.errors = (result.errors ?? []).slice(0, MAX_KEPT_ERRORS);
      }
    } catch (error) {
      status = "error";
      outcome.errors = [
        error instanceof Error ? error.message : String(error),
      ];
    }
    reports.push({
      name,
      status,
      ...outcome,
      durationMs: Date.now() - startedAt,
    });
  }
  return reports;
}

export interface DueScheduleRow {
  id: string;
  nextRunAt: Date;
}

/**
 * `*_schedule` 성격의 테이블에서 next_run_at 이 기준 시각 이하인 행을 스캔한다.
 * 테이블/컬럼명은 식별자 화이트리스트 검증 후 raw 로 삽입한다.
 */
export function listDueScheduleRows(options: {
  table: string;
  idColumn?: string;
  nextRunAtColumn?: string;
  now?: Date;
  limit?: number;
}): DueScheduleRow[] {
  const table = options.table;
  const idColumn = options.idColumn ?? "id";
  const nextRunAtColumn = options.nextRunAtColumn ?? "next_run_at";
  for (const identifier of [table, idColumn, nextRunAtColumn]) {
    if (!IDENTIFIER_PATTERN.test(identifier)) {
      throw new Error(`schedule 테이블 식별자가 올바르지 않습니다: ${identifier}`);
    }
  }
  const nowMs = (options.now ?? new Date()).getTime();
  const limit =
    Number.isFinite(options.limit) && (options.limit ?? 0) > 0
      ? Math.floor(options.limit!)
      : DEFAULT_JOB_LIMIT;

  // 식별자만 raw 로 삽입하고, 값은 바인드 파라미터로 넘긴다.
  const rows = db.all<{ id: string; next_run_at: number | null }>(
    sql`SELECT ${sql.raw(idColumn)} AS id, ${sql.raw(nextRunAtColumn)} AS next_run_at FROM ${sql.raw(table)} WHERE ${sql.raw(nextRunAtColumn)} IS NOT NULL AND ${sql.raw(nextRunAtColumn)} <= ${nowMs} ORDER BY ${sql.raw(nextRunAtColumn)} ASC LIMIT ${limit}`
  );
  return rows
    .filter((row) => row.next_run_at !== null)
    .map((row) => ({ id: row.id, nextRunAt: new Date(row.next_run_at as number) }));
}

/**
 * 처리가 끝난 schedule 행의 next_run_at 을 다음 시각으로 밀어 놓는다.
 * nextRunAt 을 null 로 주면 스케줄을 끈 것으로 기록한다 (재스캔 대상에서 제외).
 */
export function markScheduleRun(options: {
  table: string;
  id: string;
  idColumn?: string;
  nextRunAtColumn?: string;
  nextRunAt: Date | null;
}): void {
  const { table, idColumn = "id", nextRunAtColumn = "next_run_at" } = options;
  for (const identifier of [table, idColumn, nextRunAtColumn]) {
    if (!IDENTIFIER_PATTERN.test(identifier)) {
      throw new Error(`schedule 테이블 식별자가 올바르지 않습니다: ${identifier}`);
    }
  }
  const nextMs = options.nextRunAt === null ? null : options.nextRunAt.getTime();
  db.run(
    sql`UPDATE ${sql.raw(table)} SET ${sql.raw(nextRunAtColumn)} = ${nextMs} WHERE ${sql.raw(idColumn)} = ${options.id}`
  );
}

/** weekly/monthly 반복 스케줄의 다음 실행 시각. site audit 캠페인·리포트 스케줄이 공유한다. */
export function computeNextRunAt(
  frequency: "weekly" | "monthly",
  from: Date
): Date {
  const next = new Date(from.getTime());
  if (frequency === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}
