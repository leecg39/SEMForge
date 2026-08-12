// @TASK P2-A1-T1 - Authentication HTTP adapter
// @SPEC docs/planning/06-tasks.md#p2-a1-t1--초대-전용-인증과-세션
// @TEST src/server/auth/http.test.ts
import { createHash } from "node:crypto";
import { isIP } from "node:net";

import { z, ZodError } from "zod";

import {
  ApiError,
  apiSuccess,
  parseJsonBody,
  withApiV1,
} from "@/lib/api-v1";
import {
  readSessionTokenFromRequest,
  sessionCookieHeader,
  sessionDeletionCookieHeader,
} from "@/lib/session";
import {
  AuthServiceError,
  type AuthSessionPrincipal,
} from "@/server/auth/contracts";
import {
  acceptInviteInputSchema,
  loginInputSchema,
  requestPasswordResetInputSchema,
  resetPasswordInputSchema,
} from "@/server/auth/schemas";

type AuthSessionResult = {
  readonly token: string;
  readonly expiresAt: Date;
  readonly principal: AuthSessionPrincipal;
};

type LoginHttpInput = z.output<typeof loginRequestSchema> & {
  readonly currentSessionToken?: string;
  readonly clientAddressHash?: string;
};

type AcceptInviteHttpInput = z.output<typeof acceptInviteRequestSchema> & {
  readonly currentSessionToken?: string;
};

export interface AuthHttpService {
  login(input: LoginHttpInput): Promise<AuthSessionResult>;
  acceptInvite(input: AcceptInviteHttpInput): Promise<AuthSessionResult>;
  logout(sessionToken: string | undefined): Promise<{ readonly revoked: boolean }>;
  getSession(sessionToken: string | undefined): Promise<AuthSessionPrincipal | null>;
  requestPasswordReset(input: {
    readonly email: string;
    readonly clientAddressHash?: string;
  }): Promise<{ readonly accepted: true }>;
  resetPassword(input: {
    readonly token: string;
    readonly password: string;
  }): Promise<{ readonly reset: true }>;
}

export interface AuthHttpDependencies {
  readonly getService: () => AuthHttpService;
  readonly now?: () => Date;
  readonly production?: boolean;
  readonly trustedProxyHeaders?: boolean;
}

const loginRequestSchema = loginInputSchema
  .pick({ email: true, password: true, workspaceId: true })
  .strict();

const acceptInviteRequestSchema = acceptInviteInputSchema
  .pick({
    token: true,
    email: true,
    password: true,
    displayName: true,
  })
  .strict();

const forgotPasswordRequestSchema = requestPasswordResetInputSchema
  .pick({ email: true })
  .strict();

const resetPasswordRequestSchema = resetPasswordInputSchema.strict();

const emptyJsonObjectSchema = z.object({}).strict();

export function authServiceErrorToApiError(error: AuthServiceError): ApiError {
  switch (error.code) {
    case "INVALID_INVITE":
      return new ApiError(
        "BAD_REQUEST",
        "초대 정보가 올바르지 않거나 만료되었습니다.",
      );
    case "INVALID_CREDENTIALS":
      return new ApiError(
        "UNAUTHENTICATED",
        "이메일 또는 비밀번호를 확인해 주세요.",
      );
    case "RATE_LIMITED":
      return new ApiError("RATE_LIMITED", undefined, {
        retryAfterSeconds: error.retryAfterSeconds,
      });
    case "INVALID_PASSWORD_RESET":
      return new ApiError(
        "BAD_REQUEST",
        "비밀번호 재설정 정보가 올바르지 않거나 만료되었습니다.",
      );
    case "INVALID_PASSWORD":
      return new ApiError(
        "VALIDATION_ERROR",
        "비밀번호 정책을 확인해 주세요.",
      );
    case "AUTH_CONFIGURATION":
      return new ApiError("INTERNAL", undefined, { cause: error });
  }
}

function mapAuthError(error: unknown): never {
  if (error instanceof ZodError) {
    throw new ApiError("VALIDATION_ERROR");
  }
  if (error instanceof AuthServiceError) {
    throw authServiceErrorToApiError(error);
  }
  throw error;
}

async function callAuth<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    return mapAuthError(error);
  }
}

function publicSession(result: AuthSessionResult) {
  return {
    principal: result.principal,
    expiresAt: result.expiresAt,
  };
}

function canonicalIp(value: string): string | undefined {
  const candidate = value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  const version = isIP(candidate);
  if (version === 4) return candidate.split(".").map(Number).join(".");
  if (version === 6) {
    try {
      return new URL(`http://[${candidate}]`).hostname.slice(1, -1);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * nginx가 client-provided XFF를 append하더라도 오른쪽 hop은 proxy가 관측한 주소다.
 * 두 proxy header가 충돌하거나 trust opt-in이 없으면 IP bucket을 사용하지 않는다.
 */
function trustedClientAddress(
  request: Request,
  trustedProxyHeaders: boolean,
): string | undefined {
  if (!trustedProxyHeaders) return undefined;
  const realIpHeader = request.headers.get("x-real-ip")?.slice(0, 128) ?? "";
  const realAddress = realIpHeader ? canonicalIp(realIpHeader) : undefined;
  if (!realAddress) return undefined;

  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const rightmostForwarded = forwarded
    ? forwarded.slice(forwarded.lastIndexOf(",") + 1).trim().slice(0, 128)
    : "";
  const forwardedAddress = rightmostForwarded
    ? canonicalIp(rightmostForwarded)
    : undefined;
  if ((forwarded && !forwardedAddress) || (realIpHeader && !realAddress)) return undefined;
  if (forwardedAddress && realAddress && forwardedAddress !== realAddress) return undefined;
  return realAddress;
}

function clientAddressHash(
  request: Request,
  trustedProxyHeaders: boolean,
): string | undefined {
  const address = trustedClientAddress(request, trustedProxyHeaders);
  if (!address) return undefined;
  return createHash("sha256")
    .update(`semforge-auth-client-address-v1:${address}`)
    .digest("hex");
}

/**
 * DB를 모르는 public HTTP seam이다. Route modules는 runtime service factory만
 * 주입하며, 테스트는 이 factory에 fake service를 주입해 실제 Request/Response를 검증한다.
 */
export function createAuthHttpHandlers(dependencies: AuthHttpDependencies) {
  const now = dependencies.now ?? (() => new Date());

  return {
    login: withApiV1(async (request) => {
      const body = await parseJsonBody(request, loginRequestSchema);
      const currentSessionToken = readSessionTokenFromRequest(request) ?? undefined;
      const addressHash = clientAddressHash(
        request,
        dependencies.trustedProxyHeaders ?? false,
      );
      const result = await callAuth(() =>
        dependencies.getService().login({
          ...body,
          ...(addressHash ? { clientAddressHash: addressHash } : {}),
          ...(currentSessionToken ? { currentSessionToken } : {}),
        }),
      );
      return apiSuccess(publicSession(result), {
        headers: {
          "set-cookie": sessionCookieHeader(
            result.token,
            now(),
            dependencies.production,
          ),
        },
      });
    }),

    logout: withApiV1(async (request) => {
      await parseJsonBody(request, emptyJsonObjectSchema);
      const token = readSessionTokenFromRequest(request) ?? undefined;
      const result = await callAuth(() => dependencies.getService().logout(token));
      return apiSuccess(result, {
        headers: {
          "set-cookie": sessionDeletionCookieHeader(dependencies.production),
        },
      });
    }),

    session: withApiV1(
      async (request) => {
        const token = readSessionTokenFromRequest(request) ?? undefined;
        const principal = await callAuth(() =>
          dependencies.getService().getSession(token),
        );
        if (!principal) throw new ApiError("UNAUTHENTICATED");
        return apiSuccess({ principal });
      },
      { originPolicy: "none" },
    ),

    acceptInvite: withApiV1(async (request) => {
      const body = await parseJsonBody(request, acceptInviteRequestSchema);
      const currentSessionToken = readSessionTokenFromRequest(request) ?? undefined;
      const result = await callAuth(() =>
        dependencies.getService().acceptInvite({
          ...body,
          ...(currentSessionToken ? { currentSessionToken } : {}),
        }),
      );
      return apiSuccess(publicSession(result), {
        status: 201,
        headers: {
          "set-cookie": sessionCookieHeader(
            result.token,
            now(),
            dependencies.production,
          ),
        },
      });
    }),

    forgotPassword: withApiV1(async (request) => {
      const body = await parseJsonBody(request, forgotPasswordRequestSchema);
      const addressHash = clientAddressHash(
        request,
        dependencies.trustedProxyHeaders ?? false,
      );
      const result = await callAuth(() =>
        dependencies.getService().requestPasswordReset({
          ...body,
          ...(addressHash ? { clientAddressHash: addressHash } : {}),
        }),
      );
      return apiSuccess(result, { status: 202 });
    }),

    resetPassword: withApiV1(async (request) => {
      const body = await parseJsonBody(request, resetPasswordRequestSchema);
      const result = await callAuth(() =>
        dependencies.getService().resetPassword(body),
      );
      return apiSuccess(result, {
        headers: {
          "set-cookie": sessionDeletionCookieHeader(dependencies.production),
        },
      });
    }),
  };
}
