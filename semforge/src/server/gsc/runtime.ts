// @TASK P2-G1-T1 - GSC HTTP runtime wiring
// @SPEC user-approved-plan#인증과-GSC
import { getPool, withWorkspacePoolTransaction } from "@/db/client";
import { type SecretCrypto, decryptSecret, encryptSecret } from "@/lib/crypto";
import { getServerEnv } from "@/lib/env";
import { createRuntimeRequireAuth } from "@/server/auth/runtime";
import { createRuntimeBillingAccessAuthorizer } from "@/server/billing/access";
import { createGscRouteHandlers } from "@/server/gsc/routes";
import {
  createGscService,
  resolveGscCallbackWorkspace,
} from "@/server/gsc/service";
import { createRuntimeWorkspacePrivacyFence } from "@/server/privacy/access";

function runtimeCrypto(): SecretCrypto {
  return {
    encrypt: encryptSecret,
    decrypt: decryptSecret,
    decryptOrThrow(stored, aad) {
      const decrypted = decryptSecret(stored, aad);
      if (decrypted === null) throw new Error("비밀값을 복호화할 수 없습니다.");
      return decrypted;
    },
  };
}

export function createRuntimeGscHandlers() {
  const env = getServerEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID와 GOOGLE_CLIENT_SECRET이 필요합니다.");
  }
  const redirectUri =
    env.GSC_REDIRECT_URI ??
    `${env.APP_PUBLIC_URL ?? "http://localhost:3000"}/api/v1/integrations/gsc/callback`;
  const pool = getPool("web");
  const service = createGscService({
    db: pool,
    crypto: runtimeCrypto(),
    oauthConfig: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri,
    },
    resolveCallbackWorkspace: (input) => withWorkspacePoolTransaction(
      pool,
      input.workspaceId,
      (database) => resolveGscCallbackWorkspace(database, input),
    ),
  });

  return createGscRouteHandlers({
    requireAuth: createRuntimeRequireAuth(),
    authorizeBilling: createRuntimeBillingAccessAuthorizer(),
    workspaceOperations: createRuntimeWorkspacePrivacyFence(),
    getService: () => service,
  });
}
