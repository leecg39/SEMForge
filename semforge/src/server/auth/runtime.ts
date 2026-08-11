// @TASK P2-A1-T1 - Production auth runtime composition
// @SPEC docs/planning/06-tasks.md#p2-a1-t1--초대-전용-인증과-세션
import { getDatabase } from "@/db/client";
import type { PasswordResetNotifier } from "@/server/auth/contracts";
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
 * @TASK P4-F1-T1 - Email delivery handoff boundary
 * Phase 4 email/outbox adapter가 연결되기 전까지 raw reset token을 로그·응답에
 * 노출하지 않고 폐기한다. 서비스의 account-enumeration-safe 202 계약은 유지한다.
 */
export function createPhaseFourPasswordResetNotifierBoundary(): PasswordResetNotifier {
  return {
    async enqueuePasswordReset(notification) {
      // 이메일 주소와 만료 시각도 이 단계에서는 기록하지 않는다.
      void notification;
    },
  };
}

/**
 * 인증 전 경계는 tenant-scoped web role이 아닌 제한된 auth role만 사용한다.
 * 운영자 invite store는 public HTTP runtime에 절대 주입하지 않는다.
 */
export function createRuntimeAuthService(): AuthHttpService {
  return createAuthService({
    store: new PostgresAuthStore(getDatabase("auth")),
    notifier: createPhaseFourPasswordResetNotifierBoundary(),
  });
}

export function createRuntimeAuthHttpHandlers() {
  return createAuthHttpHandlers({
    getService: createRuntimeAuthService,
  });
}

/** 다른 API 모듈이 auth 저장소 구현에 결합되지 않고 주입받아 쓸 guard factory다. */
export function createRuntimeRequireAuth(): RequireAuth {
  return createRequireAuth({
    getService: createRuntimeAuthService,
  });
}
