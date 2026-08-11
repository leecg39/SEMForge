// @TASK P2-A1-T1 - API v1 typed 오류
// @SPEC docs/planning/06-tasks.md#api-v1

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "DUPLICATE"
  | "CONFLICT"
  | "PLAN_LIMIT"
  | "RATE_LIMITED"
  | "INTERNAL";

const STATUS_BY_CODE = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  DUPLICATE: 409,
  CONFLICT: 409,
  PLAN_LIMIT: 402,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const satisfies Readonly<Record<ApiErrorCode, number>>;

const DEFAULT_MESSAGE_BY_CODE = {
  BAD_REQUEST: "요청을 처리할 수 없습니다.",
  VALIDATION_ERROR: "입력값을 확인해 주세요.",
  UNSUPPORTED_MEDIA_TYPE: "application/json 형식만 지원합니다.",
  UNAUTHENTICATED: "로그인이 필요합니다.",
  FORBIDDEN: "이 요청을 수행할 권한이 없습니다.",
  NOT_FOUND: "요청한 리소스를 찾을 수 없습니다.",
  METHOD_NOT_ALLOWED: "지원하지 않는 요청 방식입니다.",
  DUPLICATE: "이미 존재하는 값입니다.",
  CONFLICT: "현재 상태에서는 요청을 처리할 수 없습니다.",
  PLAN_LIMIT: "이용 한도를 초과했습니다.",
  RATE_LIMITED: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  INTERNAL: "일시적인 오류가 발생했습니다. 다시 시도해 주세요.",
} as const satisfies Readonly<Record<ApiErrorCode, string>>;

export interface ApiErrorOptions {
  fields?: Readonly<Record<string, string>>;
  cause?: unknown;
  retryAfterSeconds?: number;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly fields?: Readonly<Record<string, string>>;
  readonly retryAfterSeconds?: number;

  constructor(
    code: ApiErrorCode,
    /** 클라이언트에 노출해도 안전한 메시지만 전달한다. 내부 상세는 cause를 사용한다. */
    message: string = DEFAULT_MESSAGE_BY_CODE[code],
    options: ApiErrorOptions = {}
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.code = code;
    this.fields = options.fields;
    if (
      code === "RATE_LIMITED" &&
      Number.isSafeInteger(options.retryAfterSeconds) &&
      (options.retryAfterSeconds ?? -1) >= 0
    ) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }

  get publicMessage(): string {
    return this.code === "INTERNAL"
      ? DEFAULT_MESSAGE_BY_CODE.INTERNAL
      : this.message;
  }
}
