// @TASK P2-A1-T1 - API v1 공통 계약
// @SPEC docs/planning/06-tasks.md#api-v1

import type { ApiErrorCode } from "./error";

export interface ApiErrorPayload {
  code: ApiErrorCode;
  message: string;
  fields?: Readonly<Record<string, string>>;
}

export type ApiEnvelope<T> =
  | {
      data: T;
      error: null;
      requestId: string;
    }
  | {
      data: null;
      error: ApiErrorPayload;
      requestId: string;
    };

export type ApiSuccessStatus = 200 | 201 | 202;

export interface ApiSuccess<T> {
  data: T;
  status: ApiSuccessStatus;
  headers?: HeadersInit;
}

export interface ApiRequestContext {
  requestId: string;
}

export type OriginPolicy = "same-origin" | "none" | "external-webhook";

export interface ApiRouteOptions {
  originPolicy?: OriginPolicy;
  trustedOrigin?: string;
}

export type ApiRouteHandler<T, TRouteContext> = (
  request: Request,
  routeContext: TRouteContext,
  apiContext: ApiRequestContext
) => ApiSuccess<T> | Promise<ApiSuccess<T>>;
