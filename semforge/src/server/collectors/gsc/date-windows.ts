// @TASK P3-C2-T1 - Search Console PT maturity window calculation
// @SPEC docs/planning/06-tasks.md#p3-r1-t1--주간-불변-리포트-스냅샷
// @TEST src/server/collectors/gsc/date-windows.test.ts

export interface GscDateRange {
  readonly startDate: string;
  readonly endDate: string;
}

export interface GscMatureWindows {
  readonly current: GscDateRange;
  readonly comparison: GscDateRange;
}

function datePartsInPacificTime(instant: Date): { year: number; month: number; day: number } {
  if (Number.isNaN(instant.getTime())) throw new TypeError("INVALID_EXECUTION_TIME");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    calendar: "gregory",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (type: "year" | "month" | "day"): number => {
    const parsed = Number(parts.find((part) => part.type === type)?.value);
    if (!Number.isInteger(parsed)) throw new TypeError("INVALID_EXECUTION_TIME");
    return parsed;
  };
  return { year: value("year"), month: value("month"), day: value("day") };
}

function addCalendarDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function calendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Search Console dates are property-Pacific dates. The reporting cut-off is the
 * latest Thursday already reached in America/Los_Angeles, independent of KST or
 * daylight-saving offset changes.
 */
export function calculateMatureGscWindows(executedAt: Date): GscMatureWindows {
  const { year, month, day } = datePartsInPacificTime(executedAt);
  const pacificCalendarDate = new Date(Date.UTC(year, month - 1, day));
  const daysSinceThursday = (pacificCalendarDate.getUTCDay() - 4 + 7) % 7;
  const currentEnd = addCalendarDays(pacificCalendarDate, -daysSinceThursday);
  const currentStart = addCalendarDays(currentEnd, -6);
  const comparisonEnd = addCalendarDays(currentStart, -1);
  const comparisonStart = addCalendarDays(comparisonEnd, -6);

  return {
    current: {
      startDate: calendarDate(currentStart),
      endDate: calendarDate(currentEnd),
    },
    comparison: {
      startDate: calendarDate(comparisonStart),
      endDate: calendarDate(comparisonEnd),
    },
  };
}
