// @TASK P3-R1-T1 - KST collection schedule and PT mature GSC windows
// @SPEC docs/planning/06-tasks.md#p3-r1-t1--주간-불변-리포트-스냅샷
// @TEST src/server/reports/schedule.test.ts

import { calculateMatureGscWindows } from "@/server/collectors/gsc/date-windows";

const KST_OFFSET_HOURS = 9;
const REPORT_MONDAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const GSC_TIMEZONE = "America/Los_Angeles" as const;

export interface ReportDateRange {
  readonly start: string;
  readonly end: string;
}

export interface WeeklyReportSchedule {
  readonly cycleMonday: string;
  readonly collectionAt: Date;
  readonly retryCutoffAt: Date;
  readonly snapshotAt: Date;
  readonly gsc: {
    readonly timezone: typeof GSC_TIMEZONE;
    readonly current: ReportDateRange;
    readonly comparison: ReportDateRange;
  };
}

function parseCalendarDate(value: string): Date {
  if (!REPORT_MONDAY_RE.test(value)) throw new RangeError("cycleMonday must be YYYY-MM-DD");
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (formatCalendarDate(parsed) !== value) throw new RangeError("cycleMonday is not a valid date");
  return parsed;
}

function formatCalendarDate(value: Date): string {
  return [
    value.getUTCFullYear().toString().padStart(4, "0"),
    (value.getUTCMonth() + 1).toString().padStart(2, "0"),
    value.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

function addCalendarDays(value: Date, days: number): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + days));
}

function kstInstant(date: Date, hour: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour - KST_OFFSET_HOURS),
  );
}

export function buildWeeklyReportSchedule(cycleMonday: string): WeeklyReportSchedule {
  const monday = parseCalendarDate(cycleMonday);
  if (monday.getUTCDay() !== 1) throw new RangeError("cycleMonday must be a Monday");

  const sunday = addCalendarDays(monday, -1);
  const snapshotAt = kstInstant(monday, 8);
  const gsc = calculateMatureGscWindows(snapshotAt);

  return {
    cycleMonday,
    collectionAt: kstInstant(sunday, 18),
    retryCutoffAt: kstInstant(monday, 7),
    snapshotAt,
    gsc: {
      timezone: GSC_TIMEZONE,
      current: {
        start: gsc.current.startDate,
        end: gsc.current.endDate,
      },
      comparison: {
        start: gsc.comparison.startDate,
        end: gsc.comparison.endDate,
      },
    },
  };
}

export function nextCollectionRetryAt(
  now: Date,
  delayMs: number,
  schedule: Pick<WeeklyReportSchedule, "retryCutoffAt">,
): Date | null {
  if (!Number.isFinite(now.getTime()) || !Number.isSafeInteger(delayMs) || delayMs < 0) {
    throw new RangeError("valid now and non-negative integer delayMs are required");
  }
  const candidate = new Date(now.getTime() + delayMs);
  return now < schedule.retryCutoffAt && candidate < schedule.retryCutoffAt ? candidate : null;
}
