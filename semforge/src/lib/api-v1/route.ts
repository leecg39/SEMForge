// @TASK P2-A1-T1 - API v1 route wrapper
// @SPEC docs/planning/06-tasks.md#api-v1

import { ApiError } from "./error";
import { assertSameOrigin, isStateChangingRequest } from "./origin";
import { resolveRequestId } from "./request-id";
import { errorResponse, successResponse } from "./response";
import type {
  ApiRouteHandler,
  ApiRouteOptions,
  ApiSuccess,
} from "./types";

export function withApiV1<T, TRouteContext = undefined>(
  handler: ApiRouteHandler<T, TRouteContext>,
  options: ApiRouteOptions = {}
): (request: Request, context: TRouteContext) => Promise<Response> {
  return async (request, context) => {
    const requestId = resolveRequestId(request);
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
      return errorResponse(safeError, requestId);
    }
  };
}
