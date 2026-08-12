// @TASK P2-A1-T1 - API v1 route wrapper
// @SPEC docs/planning/06-tasks.md#api-v1

import { ApiError } from "./error";
import { assertSameOrigin, isStateChangingRequest } from "./origin";
import { resolveRequestId } from "./request-id";
import { errorResponse, successResponse } from "./response";
import { createJsonLogger } from "@/server/observability/logger";
import type {
  ApiRouteHandler,
  ApiRouteOptions,
  ApiSuccess,
} from "./types";

function securityRouteCategory(requestUrl: string): string {
  const segments = new URL(requestUrl).pathname.split("/").filter(Boolean);
  if (segments[0] === "api" && segments[1] === "v1") {
    const namespace = segments[2] ?? "unknown";
    return `/api/v1/${namespace}${segments.length > 3 ? "/*" : ""}`;
  }
  return segments.length > 0 ? `/${segments[0]}/*` : "/";
}

export function withApiV1<T, TRouteContext = undefined>(
  handler: ApiRouteHandler<T, TRouteContext>,
  options: ApiRouteOptions = {}
): (request: Request, context: TRouteContext) => Promise<Response> {
  return async (request, context) => {
    const requestId = resolveRequestId(request);
    const logger = options.logger ?? createJsonLogger({ service: "web" });
    try {
      const originPolicy = options.originPolicy ?? "same-origin";
      switch (originPolicy) {
        case "same-origin":
          assertSameOrigin(request, options.trustedOrigin);
          break;
        case "none":
          if (isStateChangingRequest(request)) {
            throw new ApiError("INTERNAL");
          }
          break;
        case "external-webhook":
          break;
        default:
          throw new ApiError("INTERNAL");
      }
      const result: ApiSuccess<T> = await handler(request, context, {
        requestId,
      });
      return successResponse(result, requestId);
    } catch (error) {
      const safeError =
        error instanceof ApiError ? error : new ApiError("INTERNAL");
      if (
        safeError.code === "INTERNAL" ||
        safeError.code === "UNAUTHENTICATED" ||
        safeError.code === "RATE_LIMITED"
      ) {
        const securityEvent = {
          INTERNAL: "api.internal_error",
          UNAUTHENTICATED: "api.authentication_rejected",
          RATE_LIMITED: "api.rate_limit_rejected",
        } as const;
        const log = safeError.code === "INTERNAL" ? logger.error : logger.warn;
        log(securityEvent[safeError.code], {
          requestId,
          method: request.method.toUpperCase(),
          route: securityRouteCategory(request.url),
          code: safeError.code,
        });
      }
      return errorResponse(safeError, requestId);
    }
  };
}
