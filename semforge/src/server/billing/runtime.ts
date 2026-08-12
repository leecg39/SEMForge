// @TASK P2-B1-T1 - Billing HTTP runtime wiring
// @SPEC docs/planning/06-tasks.md#p2-b1-t1--toss-자동결제-상태-머신과-ledger
import { createHash } from "node:crypto";

import type { Pool } from "pg";

import { getPool } from "@/db/client";
import { ApiError, assertSameOrigin } from "@/lib/api-v1";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getServerEnv } from "@/lib/env";
import { createBillingKeyVault } from "@/server/billing/domain";
import { createBillingHttpHandlers, type RequireAuth } from "@/server/billing/http";
import {
  billingKeyFingerprint,
  createPostgresBillingStore,
} from "@/server/billing/postgres-store";
import { createBillingService } from "@/server/billing/service";
import { createTossBillingClient } from "@/server/billing/toss-client";

const SESSION_COOKIE = "semforge_session";

function cookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createSessionRequireAuth(
  pool: Pool = getPool("auth"),
  trustedOrigin?: string,
): RequireAuth {
  return async (request, options) => {
    if (options.csrf) {
      assertSameOrigin(request, trustedOrigin);
    }

    const sessionToken = cookie(request, SESSION_COOKIE);
    if (!sessionToken || sessionToken !== sessionToken.trim()) {
      throw new ApiError("UNAUTHENTICATED");
    }
    const result = await pool.query<{
      user_id: string;
      workspace_id: string;
      role: "owner" | "admin" | "member";
    }>(
      `select s.user_id::text, s.workspace_id::text, m.role::text
       from sessions s
       join memberships m on m.workspace_id = s.workspace_id and m.user_id = s.user_id
       where s.token_hash = $1
         and s.expires_at > now()
         and s.revoked_at is null
       limit 1`,
      [sha256(sessionToken)],
    );
    const principal = result.rows[0];
    if (!principal) throw new ApiError("UNAUTHENTICATED");
    if (!options.roles.includes(principal.role)) throw new ApiError("FORBIDDEN");
    return {
      userId: principal.user_id,
      workspaceId: principal.workspace_id,
      role: principal.role,
      requestId: request.headers.get("x-request-id") ?? "",
    };
  };
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
    checkout: {
      clientKey: env.TOSS_CLIENT_KEY,
      appPublicUrl: env.APP_PUBLIC_URL,
    },
  });
}
