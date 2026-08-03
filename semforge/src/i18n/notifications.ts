import type { Locale } from "@/i18n/config";

const KO_TO_EN: Record<string, string> = {
  "앱 알림": "App notifications",
  알림: "Notifications",
  "모두 읽음": "Mark all as read",
  "아직 알림이 없습니다.": "No notifications yet.",
};

function translateDynamic(text: string): string | null {
  let match = text.match(/^(.+) 사이트 진단이 완료되었습니다$/u);
  if (match) return `${match[1]} site audit completed`;
  match = text.match(/^(.+) 사이트 진단에 실패했습니다$/u);
  if (match) return `${match[1]} site audit failed`;
  match = text.match(/^(\d+)개 페이지 · Site Health (.+) · 오류 (\d+)건 · 경고 (\d+)건$/u);
  if (match) {
    const health = match[2] === "미측정" ? "Not measured" : match[2];
    return `${match[1]} pages · Site Health ${health} · ${match[3]} errors · ${match[4]} warnings`;
  }
  match = text.match(/^(.+) 주간 순위 업데이트$/u);
  if (match) return `${match[1]} weekly ranking update`;
  match = text.match(/^(\d+)개 키워드 수집 완료(?: · (\d+)개 실패)?$/u);
  if (match) return `${match[1]} keywords collected${match[2] ? ` · ${match[2]} failed` : ""}`;
  return null;
}

export function translateNotificationText(locale: Locale, text: string): string {
  if (locale === "ko") return text;
  return KO_TO_EN[text] ?? translateDynamic(text) ?? text;
}

export function notificationAriaLabel(locale: Locale, unread: number): string {
  if (locale === "ko") return `앱 알림${unread > 0 ? `, 읽지 않음 ${unread}개` : ""}`;
  return `App notifications${unread > 0 ? `, ${unread} unread` : ""}`;
}
