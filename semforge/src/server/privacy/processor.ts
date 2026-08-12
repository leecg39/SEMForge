// @TASK P5-PRIVACY - Production privacy deletion processor wiring
// @SPEC docs/ops/privacy-erasure-runbook.md
import { decryptSecretOrThrow, type SecretCrypto } from "@/lib/crypto";
import { getServerEnv, type ServerEnv } from "@/lib/env";
import {
  createGoogleSearchConsoleClient,
  type GoogleSearchConsoleClient,
} from "@/server/gsc/google-client";
import type {
  PrivacyProcessorClient,
  PrivacySql,
} from "@/server/privacy/service";
import {
  S3PrivateObjectStorage,
  type PrivateObjectStorage,
} from "@/server/storage/s3";

function tokenAad(
  workspaceId: string,
  connectionId: string,
  type: "refresh-token",
): string {
  return `workspace:${workspaceId}:gsc:${connectionId}:${type}`;
}

function required(env: ServerEnv, key: keyof ServerEnv): string {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${String(key)}이 필요합니다.`);
  }
  return value;
}

function assertHash(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("INVALID_EMAIL_SUPPRESSION_HASH");
  }
  return normalized;
}

export function createPrivacyProcessor(options: {
  readonly db: PrivacySql;
  readonly crypto?: Pick<SecretCrypto, "decryptOrThrow">;
  readonly gscClient?: Pick<GoogleSearchConsoleClient, "revokeToken">;
  readonly storage?: Pick<PrivateObjectStorage, "deletePrivate">;
}): PrivacyProcessorClient {
  const crypto = options.crypto ?? { decryptOrThrow: decryptSecretOrThrow };
  const gscClient = options.gscClient ?? createGoogleSearchConsoleClient();

  return {
    async revokeGscConnection(input) {
      const refreshToken = crypto.decryptOrThrow(
        input.refreshTokenEncrypted,
        tokenAad(input.workspaceId, input.connectionId, "refresh-token"),
      );
      await gscClient.revokeToken(refreshToken);
    },

    async deleteObject(input) {
      if (!options.storage) throw new Error("PRIVACY_OBJECT_STORAGE_NOT_CONFIGURED");
      await options.storage.deletePrivate(input.storageKey);
    },

    async markEmailSuppressed(input) {
      await options.db.query(
        `insert into email_suppressions (workspace_id, email_hash, reason, request_id)
         values ($1, $2, 'privacy_erasure', $3::uuid)
         on conflict (workspace_id, email_hash) do update
           set request_id = coalesce(email_suppressions.request_id, excluded.request_id),
               reason = 'privacy_erasure'`,
        [input.workspaceId, assertHash(input.emailHash), input.requestUuid],
      );
    },
  };
}

export function createRuntimePrivacyProcessor(options: {
  readonly db: PrivacySql;
  readonly env?: ServerEnv;
  readonly fetch?: typeof globalThis.fetch;
}): PrivacyProcessorClient {
  const env = options.env ?? getServerEnv();
  const storage = new S3PrivateObjectStorage({
    endpoint: required(env, "S3_ENDPOINT"),
    region: required(env, "S3_REGION"),
    bucket: required(env, "S3_BUCKET"),
    accessKeyId: required(env, "S3_ACCESS_KEY_ID"),
    secretAccessKey: required(env, "S3_SECRET_ACCESS_KEY"),
    fetch: options.fetch,
    allowInsecureEndpoint: env.NODE_ENV !== "production",
  });
  return createPrivacyProcessor({
    db: options.db,
    storage,
    gscClient: createGoogleSearchConsoleClient(
      options.fetch ? { fetchImpl: options.fetch } : {},
    ),
  });
}
