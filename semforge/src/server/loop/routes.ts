import path from "node:path";

/**
 * 라우트 스모크의 대상 선정과 결과 분류 규칙.
 *
 * scripts/loop-smoke.ts 에서 분리했다. 스크립트는 최상위에서 main() 을 실행하므로
 * import 만 해도 실제 HTTP 요청이 나가 단위 테스트를 붙일 수 없었다.
 */

export type SmokeOutcome = "OK" | "OK_REDIRECT" | "OK_CLIENT" | "FAIL" | "SKIPPED";

export interface SmokeResult {
  route: string;
  outcome: SmokeOutcome;
  status: number | null;
  durationMs: number;
  reason: string | null;
}

/** 실과금·외부 API 클라이언트를 import 하는 라우트를 자동 감지한다. */
export const PAID_IMPORT_PATTERN =
  /talordata|firecrawl|server\/psi|gsc\/client|gbp\/client|onpage\/analyze|siteaudit\/(crawl|run)/;

/** 호출만으로 상태가 파괴되거나 비용이 발생하는 경로. --include-external 로도 열지 않는다. */
export const HARD_DENYLIST: readonly string[] = [
  "/api/cron/run-due/",
  "/api/auth/logout/",
  "/api/gsc/disconnect/",
  "/api/gbp/disconnect/",
  "/api/gsc/callback/",
  "/api/gbp/callback/",
];

/**
 * 앱 디렉터리 기준 파일 경로를 URL 경로로 바꾼다.
 * 라우트 그룹 (marketing) 은 URL 에 나타나지 않고, 동적 세그먼트는 대상에서 제외한다.
 * next.config 의 trailingSlash: true 에 맞춰 항상 / 로 끝낸다.
 */
export function toRoutePath(appDir: string, filePath: string): string | null {
  const segments = path
    .relative(appDir, path.dirname(filePath))
    .split(path.sep)
    .filter((segment) => segment.length > 0 && segment !== ".")
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));
  // 실제 id 없이는 호출할 수 없으므로 동적 라우트는 스모크 대상이 아니다.
  if (segments.some((segment) => segment.includes("["))) return null;
  return segments.length === 0 ? "/" : `/${segments.join("/")}/`;
}

/**
 * 상태 코드를 "핸들러가 살아 있는가" 기준으로 분류한다.
 * 인증 거절·메서드 불일치·검증 실패는 핸들러가 동작했다는 증거이므로 실패가 아니다.
 */
export function classifyStatus(status: number): { outcome: SmokeOutcome; reason: string | null } {
  if (status >= 200 && status < 300) return { outcome: "OK", reason: null };
  if (status >= 300 && status < 400) return { outcome: "OK_REDIRECT", reason: null };
  if (status === 404) return { outcome: "FAIL", reason: "라우트를 찾을 수 없습니다 (404)" };
  if (status >= 500) return { outcome: "FAIL", reason: `서버 오류 (${status})` };
  return { outcome: "OK_CLIENT", reason: `핸들러가 요청을 거절했습니다 (${status})` };
}

export function isHardDenied(route: string): boolean {
  return HARD_DENYLIST.includes(route);
}

export function usesPaidClient(source: string): boolean {
  return PAID_IMPORT_PATTERN.test(source);
}
