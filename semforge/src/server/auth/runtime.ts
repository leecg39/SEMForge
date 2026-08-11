// @TASK P2-A1-T1 - Production auth runtime composition
// @SPEC docs/planning/06-tasks.md#p2-a1-t1--초대-전용-인증과-세션
import { getDatabase } from "@/db/client";
import { getServerEnv } from "@/lib/env";
import {
  createRequireAuth,
  type RequireAuth,
} from "@/server/auth/guard";
import {
  createAuthHttpHandlers,
  type AuthHttpService,
} from "@/server/auth/http";
import { PostgresAuthStore } from "@/server/auth/postgres-store";
import { createAuthService } from "@/server/auth/service";

/**
 * 인증 전 경계는 tenant-scoped web role이 아닌 제한된 auth role만 사용한다.
 * 운영자 invite store는 public HTTP runtime에 절대 주입하지 않는다.
 */
export function createRuntimeAuthService(): AuthHttpService {
  const env = getServerEnv();
  return createAuthService({
    store: new PostgresAuthStore(getDatabase("auth")),
    passwordResetBaseUrl: env.APP_PUBLIC_URL,
  });
}

export function createRuntimeAuthHttpHandlers() {
  const env = getServerEnv();
  return createAuthHttpHandlers({
    getService: createRuntimeAuthService,
    trustedProxyHeaders: env.AUTH_TRUST_PROXY_HEADERS,
  });
}

/** 다른 API 모듈이 auth 저장소 구현에 결합되지 않고 주입받아 쓸 guard factory다. */
export function createRuntimeRequireAuth(): RequireAuth {
  return createRequireAuth({
    getService: createRuntimeAuthService,
  });
}
