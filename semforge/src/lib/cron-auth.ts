import { timingSafeEqual } from "node:crypto";

/**
 * 크론 엔드포인트 인증.
 *
 * 수집 잡은 외부 API 크레딧(TalorData/Firecrawl)을 소비하므로
 * **시크릿이 없으면 열리는(fail-open) 설계를 쓰지 않는다.**
 * CRON_SECRET 미설정은 "인증 생략"이 아니라 "크론 경로 비활성"으로 다룬다.
 */

export type CronAuthResult =
  | { ok: true }
  | { ok: false; code: "not-configured" | "invalid"; message: string };

const HEADER = "x-cron-secret";

/** 길이를 노출하지 않는 상수 시간 비교. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // 길이가 달라도 비교 시간을 유지하기 위해 같은 길이 버퍼로 한 번 더 비교한다.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * x-cron-secret 헤더를 검증한다.
 * CRON_SECRET 이 없으면 항상 실패한다 (fail-closed).
 */
export function verifyCronSecret(request: Request): CronAuthResult {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return {
      ok: false,
      code: "not-configured",
      message:
        "CRON_SECRET 이 설정되지 않아 크론 실행 경로가 비활성화되어 있습니다. .env.local 에 CRON_SECRET 을 추가한 뒤 x-cron-secret 헤더로 호출하세요.",
    };
  }
  const provided = request.headers.get(HEADER)?.trim();
  if (!provided || !secretsMatch(provided, expected)) {
    return { ok: false, code: "invalid", message: "유효한 cron 시크릿이 필요합니다." };
  }
  return { ok: true };
}

/** 크론 시크릿이 유효한 호출인지 여부 (세션 인증과 병행하는 라우트용). */
export function hasValidCronSecret(request: Request): boolean {
  return verifyCronSecret(request).ok;
}
