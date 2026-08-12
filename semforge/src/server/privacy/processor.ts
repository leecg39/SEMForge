// @TASK P5-PRIVACY - Fail-closed production privacy processor adapters
// @SPEC paid-beta privacy lifecycle blockers
// @TEST src/server/privacy/processor.test.ts
import { createSecretCrypto, type SecretCrypto } from "@/lib/crypto";
import { parsePreviousSecretKeys } from "@/lib/env";
import {
  createGoogleSearchConsoleClient,
  type GoogleSearchConsoleClient,
} from "@/server/gsc/google-client";
import type { PrivacyProcessorClient, PrivacySql } from "@/server/privacy/service";
import {
  S3PrivateObjectStorage,
  type VersionedObjectEraser,
} from "@/server/storage/s3";

const LOWER_HEX_SHA256 = /^[0-9a-f]{64}$/u;

export class PrivacyProcessorError extends Error {
  constructor(readonly code:
    | "PRIVACY_GSC_REVOKE_FAILED"
    | "PRIVACY_OBJECT_DELETE_FAILED"
    | "PRIVACY_EMAIL_SUPPRESSION_FAILED") {
    super(code);
    this.name = "PrivacyProcessorError";
  }
}

export class PrivacyProcessorConfigurationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    const normalized = [...new Set(issues)].sort();
    super(`privacy processor configuration invalid: ${normalized.join(", ")}`);
    this.name = "PrivacyProcessorConfigurationError";
    this.issues = Object.freeze(normalized);
  }
}

export function createPrivacyProcessor(options: {
  db: PrivacySql;
  crypto: Pick<SecretCrypto, "decryptOrThrow">;
  google: Pick<GoogleSearchConsoleClient, "revokeToken">;
  storage: VersionedObjectEraser;
}): PrivacyProcessorClient {
  return {
    async revokeGscConnection(input): Promise<void> {
      try {
        const refreshToken = options.crypto.decryptOrThrow(
          input.refreshTokenEncrypted,
          `workspace:${input.workspaceId}:gsc:${input.connectionId}:refresh-token`,
        );
        if (!refreshToken || refreshToken !== refreshToken.trim()) {
          throw new Error("invalid refresh token");
        }
        await options.google.revokeToken(refreshToken);
      } catch {
        throw new PrivacyProcessorError("PRIVACY_GSC_REVOKE_FAILED");
      }
    },

    async deleteObject(input): Promise<void> {
      try {
        await options.storage.eraseAllVersions(input.storageKey);
      } catch {
        throw new PrivacyProcessorError("PRIVACY_OBJECT_DELETE_FAILED");
      }
    },

    async markEmailSuppressed(input): Promise<void> {
      try {
        if (!LOWER_HEX_SHA256.test(input.emailHash)) throw new Error("invalid recipient hash");
        await options.db.query(
          `insert into email_suppressions
             (workspace_id, recipient_hash, request_id)
           values ($1::uuid, $2::text, $3::uuid)
           on conflict (workspace_id, recipient_hash) do nothing`,
          [input.workspaceId, input.emailHash, input.requestUuid],
        );
      } catch {
        throw new PrivacyProcessorError("PRIVACY_EMAIL_SUPPRESSION_FAILED");
      }
    },
  };
}

const productionKeys = [
  "APP_SECRET",
  "APP_SECRET_CURRENT_KEY_ID",
  "S3_ACCESS_KEY_ID",
  "S3_BUCKET",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_SECRET_ACCESS_KEY",
] as const;

export function createProductionPrivacyProcessor(options: {
  db: PrivacySql;
  env?: Readonly<Record<string, string | undefined>>;
  fetch?: typeof globalThis.fetch;
}): PrivacyProcessorClient {
  const source = options.env ?? process.env;
  const missing = productionKeys.filter((key) => !source[key]?.trim());
  if (missing.length > 0) throw new PrivacyProcessorConfigurationError(missing);

  let crypto: SecretCrypto;
  let storage: S3PrivateObjectStorage;
  try {
    crypto = createSecretCrypto({
      currentKeyId: source.APP_SECRET_CURRENT_KEY_ID!,
      currentSecret: source.APP_SECRET!,
      previousKeys: parsePreviousSecretKeys(source.APP_SECRET_PREVIOUS_KEYS),
    });
  } catch {
    throw new PrivacyProcessorConfigurationError([
      "APP_SECRET",
      "APP_SECRET_CURRENT_KEY_ID",
      "APP_SECRET_PREVIOUS_KEYS",
    ]);
  }
  try {
    storage = new S3PrivateObjectStorage({
      endpoint: source.S3_ENDPOINT!,
      region: source.S3_REGION!,
      bucket: source.S3_BUCKET!,
      accessKeyId: source.S3_ACCESS_KEY_ID!,
      secretAccessKey: source.S3_SECRET_ACCESS_KEY!,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  } catch {
    throw new PrivacyProcessorConfigurationError([
      "S3_ACCESS_KEY_ID",
      "S3_BUCKET",
      "S3_ENDPOINT",
      "S3_REGION",
      "S3_SECRET_ACCESS_KEY",
    ]);
  }

  return createPrivacyProcessor({
    db: options.db,
    crypto,
    google: createGoogleSearchConsoleClient(
      options.fetch ? { fetchImpl: options.fetch } : {},
    ),
    storage,
  });
}
