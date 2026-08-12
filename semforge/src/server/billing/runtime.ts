// @TASK P2-B1-T1 - Billing HTTP runtime wiring
// @SPEC docs/planning/06-tasks.md#p2-b1-t1--toss-자동결제-상태-머신과-ledger
import type { Pool } from "pg";

import { getPool } from "@/db/client";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getServerEnv } from "@/lib/env";
import { createRequireAuth } from "@/server/auth/guard";
import { hashOpaqueToken } from "@/server/auth/tokens";
import { createBillingKeyVault } from "@/server/billing/domain";
import { createBillingHttpHandlers, type RequireAuth } from "@/server/billing/http";
import {
  billingKeyFingerprint,
  createPostgresBillingStore,
} from "@/server/billing/postgres-store";
import { createBillingService } from "@/server/billing/service";
import { createTossBillingClient } from "@/server/billing/toss-client";
import { createRuntimeWorkspacePrivacyFence } from "@/server/privacy/access";

export function createSessionRequireAuth(
  pool: Pool = getPool("auth"),
  trustedOrigin?: string,
): RequireAuth {
  const requireAuth = createRequireAuth({
    trustedOrigin,
    getService: () => ({
      async getSession(sessionToken) {
        if (!sessionToken) return null;
        const result = await pool.query<{
          session_id: string;
          user_id: string;
          workspace_id: string;
          email: string;
          display_name: string | null;
          role: "owner" | "admin" | "member";
          expires_at: Date;
          disabled_at: Date | null;
        }>(
          `select s.id::text as session_id,
                  s.user_id::text,
                  s.workspace_id::text,
                  u.email,
                  u.display_name,
                  m.role::text,
                  s.expires_at,
                  u.disabled_at
       from sessions s
       join users u on u.id = s.user_id
       join memberships m on m.workspace_id = s.workspace_id and m.user_id = s.user_id
       where s.token_hash = $1
         and s.expires_at > now()
         and s.revoked_at is null
         and u.disabled_at is null
       limit 1`,
          [hashOpaqueToken(sessionToken)],
        );
        const principal = result.rows[0];
        if (!principal || principal.disabled_at) return null;
        return {
          sessionId: principal.session_id,
          userId: principal.user_id,
          workspaceId: principal.workspace_id,
          email: principal.email,
          displayName: principal.display_name,
          role: principal.role,
          expiresAt: principal.expires_at,
        };
      },
    }),
  });

  return async (request, options) =>
    requireAuth(request, {
      csrf: options.csrf,
      roles: options.roles,
    });
}

export function createBillingHandlers() {
  const env = getServerEnv();
  if (!env.TOSS_CLIENT_KEY) throw new Error("TOSS_CLIENT_KEY가 필요합니다.");
  if (!env.TOSS_SECRET_KEY) throw new Error("TOSS_SECRET_KEY가 필요합니다.");
  if (!env.APP_PUBLIC_URL) throw new Error("APP_PUBLIC_URL이 필요합니다.");
  if (!env.BILLING_FINGERPRINT_SECRET) {
    throw new Error("BILLING_FINGERPRINT_SECRET이 필요합니다.");
  }

  const toss = createTossBillingClient({ secretKey: env.TOSS_SECRET_KEY });
  const billingKeyVault = createBillingKeyVault({
    encrypt: encryptSecret,
    decrypt: decryptSecret,
    decryptOrThrow(stored, aad) {
      const decrypted = decryptSecret(stored, aad);
      if (decrypted === null) throw new Error("비밀값을 복호화할 수 없습니다.");
      return decrypted;
    },
  });
  const service = (scope: "tenant" | "global") => createBillingService({
    store: createPostgresBillingStore({
      fingerprintSecret: env.BILLING_FINGERPRINT_SECRET!,
      scope,
    }),
    toss,
    billingKeyVault,
    billingKeyFingerprint: (billingKey) =>
      billingKeyFingerprint(billingKey, env.BILLING_FINGERPRINT_SECRET!),
  });
  const tenantService = service("tenant");
  const globalService = service("global");

  return createBillingHttpHandlers({
    requireAuth: createSessionRequireAuth(undefined, env.APP_PUBLIC_URL),
    getService: (scope) => scope === "tenant" ? tenantService : globalService,
    workspaceOperations: createRuntimeWorkspacePrivacyFence(getPool("billingFence")),
    checkout: {
      clientKey: env.TOSS_CLIENT_KEY,
      appPublicUrl: env.APP_PUBLIC_URL,
    },
  });
}
