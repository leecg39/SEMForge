// @TASK P2-A1-T1 - API 요청 추적 ID
// @SPEC docs/planning/06-tasks.md#api-v1

const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function resolveRequestId(request: Request): string {
  const candidate = request.headers.get("x-request-id")?.trim();
  return candidate && SAFE_REQUEST_ID.test(candidate)
    ? candidate
    : crypto.randomUUID();
}
