// @TASK P2-A1-T1 - API v1 응답 봉투
// @SPEC docs/planning/06-tasks.md#api-v1

import type { ApiError } from "./error";
import type {
  ApiEnvelope,
  ApiSuccess,
  ApiSuccessStatus,
} from "./types";

export interface ApiSuccessOptions {
  status?: ApiSuccessStatus;
  headers?: HeadersInit;
}

const API_SUCCESS_STATUSES = new Set<ApiSuccessStatus>([200, 201, 202]);

export function apiSuccess<T>(
  data: T,
  options: ApiSuccessOptions = {}
): ApiSuccess<T> {
  const status = options.status ?? 200;
  if (!API_SUCCESS_STATUSES.has(status)) {
    throw new RangeError("API 성공 상태 코드는 200, 201, 202만 허용합니다.");
  }
  return {
    data,
    status,
    ...(options.headers === undefined ? {} : { headers: options.headers }),
  };
}

export function successResponse<T>(
  result: ApiSuccess<T>,
  requestId: string
): Response {
  const headers = new Headers(result.headers);
  headers.set("cache-control", "no-store");
  headers.set("content-type", "application/json");
  headers.set("x-request-id", requestId);

  const envelope: ApiEnvelope<T | null> = {
    data: result.data === undefined ? null : result.data,
    error: null,
    requestId,
  };

  return Response.json(envelope, { status: result.status, headers });
}

export function errorResponse(error: ApiError, requestId: string): Response {
  const headers = new Headers();
  if (error.retryAfterSeconds !== undefined) {
    headers.set("retry-after", String(error.retryAfterSeconds));
  }
  headers.set("cache-control", "no-store");
  headers.set("content-type", "application/json");
  headers.set("x-request-id", requestId);
  const envelope: ApiEnvelope<never> = {
    data: null,
    error: {
      code: error.code,
      message: error.publicMessage,
      ...(error.code === "INTERNAL" || error.fields === undefined
        ? {}
        : { fields: error.fields }),
    },
    requestId,
  };

  return Response.json(envelope, { status: error.status, headers });
}
