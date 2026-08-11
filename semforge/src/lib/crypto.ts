// @TASK P1-D1-T1 - Versioned AES-256-GCM secret envelope and key rotation
// @SPEC docs/planning/06-tasks.md#p1-d1-t1--postgresql-16-핵심-스키마와-암호화-기반
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

import { parsePreviousSecretKeys } from "@/lib/env";

const ENVELOPE_PREFIX = "enc:v1";
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export type SecretKeyring = Readonly<{
  currentKeyId: string;
  currentSecret: string;
  previousKeys?: Readonly<Record<string, string>>;
}>;

export type SecretDecryptionFailure =
  | "invalid_envelope"
  | "unknown_key"
  | "authentication_failed";

export class SecretDecryptionError extends Error {
  constructor(readonly code: SecretDecryptionFailure) {
    super(`비밀값 복호화 실패: ${code}`);
    this.name = "SecretDecryptionError";
  }
}

export type SecretCrypto = Readonly<{
  encrypt(plaintext: string, authenticatedContext: string): string;
  decrypt(stored: string, authenticatedContext: string): string | null;
  decryptOrThrow(stored: string, authenticatedContext: string): string;
}>;

function assertKey(keyId: string, secret: string): void {
  if (!KEY_ID_PATTERN.test(keyId)) throw new Error(`유효하지 않은 encryption key id: ${keyId}`);
  if (secret !== secret.trim() || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error(`encryption key ${keyId}는 공백 없는 32 byte 이상이어야 합니다.`);
  }
}

function deriveKey(keyId: string, secret: string): Buffer {
  assertKey(keyId, secret);
  return scryptSync(secret, `semforge-secret-envelope-v1:${keyId}`, 32);
}

function contextBytes(authenticatedContext: string): Buffer {
  if (!authenticatedContext || Buffer.byteLength(authenticatedContext, "utf8") > 1024) {
    throw new Error("authenticatedContext는 1~1024 byte여야 합니다.");
  }
  return Buffer.from(authenticatedContext, "utf8");
}

function decodeEnvelope(stored: string): {
  keyId: string;
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
} {
  const parts = stored.split(":");
  if (parts.length !== 6 || `${parts[0]}:${parts[1]}` !== ENVELOPE_PREFIX) {
    throw new SecretDecryptionError("invalid_envelope");
  }

  const [, , keyId, ivEncoded, tagEncoded, ciphertextEncoded] = parts;
  if (!KEY_ID_PATTERN.test(keyId) || !ivEncoded || !tagEncoded || !ciphertextEncoded) {
    throw new SecretDecryptionError("invalid_envelope");
  }

  const iv = Buffer.from(ivEncoded, "base64url");
  const tag = Buffer.from(tagEncoded, "base64url");
  const ciphertext = Buffer.from(ciphertextEncoded, "base64url");
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new SecretDecryptionError("invalid_envelope");
  }
  return { keyId, iv, tag, ciphertext };
}

export function createSecretCrypto(keyring: SecretKeyring): SecretCrypto {
  assertKey(keyring.currentKeyId, keyring.currentSecret);
  for (const [keyId, secret] of Object.entries(keyring.previousKeys ?? {})) assertKey(keyId, secret);

  const secrets = new Map<string, string>([
    ...Object.entries(keyring.previousKeys ?? {}),
    [keyring.currentKeyId, keyring.currentSecret],
  ]);
  const derivedKeys = new Map(
    [...secrets].map(([keyId, secret]) => [keyId, deriveKey(keyId, secret)] as const),
  );

  const decryptOrThrow = (stored: string, authenticatedContext: string): string => {
    const envelope = decodeEnvelope(stored);
    const key = derivedKeys.get(envelope.keyId);
    if (!key) throw new SecretDecryptionError("unknown_key");

    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        envelope.iv,
      );
      decipher.setAuthTag(envelope.tag);
      decipher.setAAD(contextBytes(authenticatedContext));
      return Buffer.concat([
        decipher.update(envelope.ciphertext),
        decipher.final(),
      ]).toString("utf8");
    } catch (error) {
      if (error instanceof SecretDecryptionError) throw error;
      throw new SecretDecryptionError("authentication_failed");
    }
  };

  return {
    encrypt(plaintext: string, authenticatedContext: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv(
        "aes-256-gcm",
        derivedKeys.get(keyring.currentKeyId)!,
        iv,
      );
      cipher.setAAD(contextBytes(authenticatedContext));
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [
        ENVELOPE_PREFIX,
        keyring.currentKeyId,
        iv.toString("base64url"),
        tag.toString("base64url"),
        ciphertext.toString("base64url"),
      ].join(":");
    },
    decrypt(stored: string, authenticatedContext: string): string | null {
      try {
        return decryptOrThrow(stored, authenticatedContext);
      } catch {
        return null;
      }
    },
    decryptOrThrow,
  };
}

function keyringFromEnvironment(): SecretKeyring {
  const currentSecret = process.env.APP_SECRET;
  const currentKeyId = process.env.APP_SECRET_CURRENT_KEY_ID;
  if (!currentSecret || !currentKeyId) {
    throw new Error("APP_SECRET과 APP_SECRET_CURRENT_KEY_ID가 설정되지 않았습니다.");
  }
  return {
    currentKeyId,
    currentSecret,
    previousKeys: parsePreviousSecretKeys(process.env.APP_SECRET_PREVIOUS_KEYS),
  };
}

let environmentCryptoCache:
  | { signature: string; crypto: SecretCrypto }
  | undefined;

function environmentCrypto(): SecretCrypto {
  const keyring = keyringFromEnvironment();
  const signature = createHash("sha256")
    .update(JSON.stringify(keyring))
    .digest("base64url");
  if (environmentCryptoCache?.signature !== signature) {
    environmentCryptoCache = { signature, crypto: createSecretCrypto(keyring) };
  }
  return environmentCryptoCache.crypto;
}

export function isEncryptionConfigured(): boolean {
  try {
    environmentCrypto();
    return true;
  } catch {
    return false;
  }
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(`${ENVELOPE_PREFIX}:`);
}

export function encryptSecret(plaintext: string, authenticatedContext: string): string {
  return environmentCrypto().encrypt(plaintext, authenticatedContext);
}

export function decryptSecret(stored: string, authenticatedContext: string): string | null {
  return environmentCrypto().decrypt(stored, authenticatedContext);
}

export function decryptSecretOrThrow(stored: string, authenticatedContext: string): string {
  return environmentCrypto().decryptOrThrow(stored, authenticatedContext);
}
