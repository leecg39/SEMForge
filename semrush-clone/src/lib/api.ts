import { z, ZodError, type ZodType } from "zod";

// 서버 메시지는 한국어 우선 정책이므로 zod 필드 오류도 한국어로 통일한다.
// (기본값은 영어 원문 그대로라 "Invalid input: expected string…" 같은
// 개발자용 문구가 폼 인라인 오류로 노출됐다)
z.config(z.locales.ko());

/**
 * API 응답 봉투와 오류 코드 체계.
 * 클라이언트는 error.code 로 분기하고, error.fields 로 폼 인라인 오류를 표시한다.
 */

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "DUPLICATE"
  | "VERSION_CONFLICT"
  | "RELATION_RESTRICT"
  | "PLAN_LIMIT"
  | "RATE_LIMITED"
  | "INTERNAL";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  DUPLICATE: 409,
  VERSION_CONFLICT: 409,
  RELATION_RESTRICT: 409,
  PLAN_LIMIT: 402,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    fields?: Record<string, string>;
    details?: unknown;
  };
}

export class ApiError extends Error {
  code: ApiErrorCode;
  fields?: Record<string, string>;
  details?: unknown;

  constructor(
    code: ApiErrorCode,
    message: string,
    options?: { fields?: Record<string, string>; details?: unknown }
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.fields = options?.fields;
    this.details = options?.details;
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }
}

export function jsonOk<T>(data: T, init?: { status?: number; meta?: unknown }) {
  return Response.json(
    init?.meta === undefined ? { data } : { data, meta: init.meta },
    { status: init?.status ?? 200 }
  );
}

export function jsonError(error: ApiError) {
  const body: ApiErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.fields ? { fields: error.fields } : {}),
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
  return Response.json(body, { status: error.status });
}

function zodToFields(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_root";
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** 요청 본문을 스키마로 검증한다. 실패 시 필드별 메시지를 담은 400 을 던진다. */
export async function parseBody<T>(
  request: Request,
  schema: ZodType<T>
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "요청 본문이 올바른 JSON이 아닙니다.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError("VALIDATION_ERROR", "입력값을 확인해 주세요.", {
      fields: zodToFields(result.error),
    });
  }
  return result.data;
}

/**
 * 모든 Route Handler 를 감싸 오류를 단일 형식으로 변환한다.
 * 예상하지 못한 예외는 내부 메시지를 노출하지 않고 500 으로 축약한다.
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return jsonError(error);
      }
      if (error instanceof ZodError) {
        return jsonError(
          new ApiError("VALIDATION_ERROR", "입력값을 확인해 주세요.", {
            fields: zodToFields(error),
          })
        );
      }
      const message =
        error instanceof Error ? error.message : String(error);
      if (/UNIQUE constraint failed/i.test(message)) {
        return jsonError(
          new ApiError("DUPLICATE", "이미 존재하는 값입니다.")
        );
      }
      if (/FOREIGN KEY constraint failed/i.test(message)) {
        return jsonError(
          new ApiError(
            "RELATION_RESTRICT",
            "연결된 데이터가 있어 처리할 수 없습니다."
          )
        );
      }
      console.error("[api] unhandled error", error);
      return jsonError(
        new ApiError("INTERNAL", "일시적인 오류가 발생했습니다. 다시 시도해 주세요.")
      );
    }
  };
}
