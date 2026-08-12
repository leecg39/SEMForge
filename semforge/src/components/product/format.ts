// @TASK P4-F1-T1 - Korean product UI formatting
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/components/product/product-ui.test.tsx

export function formatDateKo(value: string, timeZone = "Asia/Seoul") {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone }).format(date)
    : "확인 불가";
}

export function formatDateTimeKo(value: string, timeZone = "Asia/Seoul") {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone }).format(date)
    : "확인 불가";
}

export function formatCalendarDateKo(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "확인 불가";
  return `${year}. ${month}. ${day}.`;
}

export function formatPeriodKo(start: string, end: string) {
  return `${formatCalendarDateKo(start)} – ${formatCalendarDateKo(end)}`;
}

export function formatNumberKo(value: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);
}

export function formatKrw(value: number) {
  return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(value)}원`;
}
