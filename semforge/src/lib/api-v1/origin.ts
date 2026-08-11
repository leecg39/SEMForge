// @TASK P2-A1-T1 - 상태 변경 요청 same-origin 검증
// @SPEC docs/planning/06-tasks.md#api-v1

import { ApiError } from "./error";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isStateChangingRequest(request: Request): boolean {
  return !SAFE_METHODS.has(request.method.toUpperCase());
}

function trustedPublicOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function expectedOrigin(
  request: Request,
  explicitTrustedOrigin?: string
): string | null {
  try {
    const requestUrl = new URL(request.url);
    if (
      (requestUrl.protocol !== "http:" && requestUrl.protocol !== "https:") ||
      requestUrl.username ||
      requestUrl.password
    ) {
      return null;
    }

    const rawConfiguredOrigin =
      explicitTrustedOrigin ?? process.env.APP_PUBLIC_URL;
    const configuredOrigin =
      rawConfiguredOrigin === undefined
        ? null
        : trustedPublicOrigin(rawConfiguredOrigin.trim());
    if (
      (rawConfiguredOrigin !== undefined && !configuredOrigin) ||
      (process.env.NODE_ENV === "production" && !configuredOrigin) ||
      (configuredOrigin && requestUrl.origin !== configuredOrigin)
    ) {
      return null;
    }

    // x-forwarded-* 는 클라이언트가 직접 위조할 수 있으므로 여기서 신뢰하지 않는다.
    // 배포 프록시가 canonical URL을 구성한 뒤 애플리케이션에 전달해야 한다.
    const hostHeader = request.headers.get("host")?.trim();
    if (hostHeader) {
      const hostUrl = new URL(`${requestUrl.protocol}//${hostHeader}`);
      if (
        hostUrl.username ||
        hostUrl.password ||
        hostUrl.pathname !== "/" ||
        hostUrl.search ||
        hostUrl.hash ||
        hostUrl.host.toLowerCase() !== requestUrl.host.toLowerCase()
      ) {
        return null;
      }
    }
    return configuredOrigin ?? requestUrl.origin;
  } catch {
    return null;
  }
}

export function assertSameOrigin(
  request: Request,
  trustedOrigin?: string
): void {
  if (!isStateChangingRequest(request)) return;

  const originHeader = request.headers.get("origin")?.trim();
  const expected = expectedOrigin(request, trustedOrigin);
  if (!originHeader || originHeader === "null" || !expected) {
    throw new ApiError("FORBIDDEN", "요청 출처를 확인할 수 없습니다.");
  }

  try {
    const origin = new URL(originHeader);
    const isBareOrigin =
      !origin.username &&
      !origin.password &&
      origin.pathname === "/" &&
      !origin.search &&
      !origin.hash;
    if (!isBareOrigin || origin.origin !== expected) {
      throw new ApiError("FORBIDDEN", "요청 출처를 확인할 수 없습니다.");
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("FORBIDDEN", "요청 출처를 확인할 수 없습니다.");
  }
}
