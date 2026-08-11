// @TASK P1-D1-T1 - Versioned AES-256-GCM secret envelope and key rotation
// @SPEC docs/planning/06-tasks.md#p1-d1-t1--postgresql-16-핵심-스키마와-암호화-기반
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

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
  encrypt(plaintext: string): string;
  decrypt(stored: string): string | null;
  decryptOrThrow(stored: string): string;
}>;

function assertKey(keyId: string, secret: string): void {
  if (!KEY_ID_PATTERN.test(keyId)) throw new Error(`유효하지 않은 encryption key id: ${keyId}`);
  if (secret.length < 32) throw new Error(`encryption key ${keyId}는 32자 이상이어야 합니다.`);
}

function deriveKey(keyId: string, secret: string): Buffer {
  assertKey(keyId, secret);
  return scryptSync(secret, `semforge-secret-envelope-v1:${keyId}`, 32);
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

  const decryptOrThrow = (stored: string): string => {
    const envelope = decodeEnvelope(stored);
    const secret = secrets.get(envelope.keyId);
    if (!secret) throw new SecretDecryptionError("unknown_key");

    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        deriveKey(envelope.keyId, secret),
        envelope.iv,
      );
      decipher.setAuthTag(envelope.tag);
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
    encrypt(plaintext: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv(
        "aes-256-gcm",
        deriveKey(keyring.currentKeyId, keyring.currentSecret),
        iv,
      );
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
    decrypt(stored: string): string | null {
      try {
        return decryptOrThrow(stored);
      } catch {
        return null;
      }
    },
    decryptOrThrow,
  };
}

function keyringFromEnvironment(): SecretKeyring {
  const currentSecret = process.env.APP_SECRET?.trim();
  const currentKeyId = process.env.APP_SECRET_CURRENT_KEY_ID?.trim();
  if (!currentSecret || !currentKeyId) {
    throw new Error("APP_SECRET과 APP_SECRET_CURRENT_KEY_ID가 설정되지 않았습니다.");
  }
  return {
    currentKeyId,
    currentSecret,
    previousKeys: parsePreviousSecretKeys(process.env.APP_SECRET_PREVIOUS_KEYS),
  };
}

export function isEncryptionConfigured(): boolean {
  return Boolean(process.env.APP_SECRET?.trim() && process.env.APP_SECRET_CURRENT_KEY_ID?.trim());
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(`${ENVELOPE_PREFIX}:`);
}

export function encryptSecret(plaintext: string): string {
  return createSecretCrypto(keyringFromEnvironment()).encrypt(plaintext);
}

export function decryptSecret(stored: string): string | null {
  return createSecretCrypto(keyringFromEnvironment()).decrypt(stored);
}

export function decryptSecretOrThrow(stored: string): string {
  return createSecretCrypto(keyringFromEnvironment()).decryptOrThrow(stored);
}
