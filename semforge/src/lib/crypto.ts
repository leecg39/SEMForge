import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * OAuth 토큰 등 비밀값의 at-rest 암호화 (AES-256-GCM).
 *
 * - 키 재료: env APP_SECRET (임의의 긴 문자열). scrypt 로 256bit 키를 파생한다.
 * - 저장 형식: `enc:v1:<iv b64>:<tag b64>:<ciphertext b64>` — 접두어로 평문과 구분한다.
 * - APP_SECRET 미설정 시 애플리케이션 시작을 실패시킨다.
 * - 복호화 실패(키 변경 등)는 null 을 반환해 호출부가 "재연결 필요" 로 처리한다.
 */

const PREFIX = "enc:v1:";
const KEY_SALT = "semforge-token-encryption-v1";

let cachedKey: Buffer | null | undefined;

function getKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const secret = process.env.APP_SECRET?.trim();
  if (!secret) {
    throw new Error("APP_SECRET 이 설정되지 않았습니다.");
  }
  cachedKey = scryptSync(secret, KEY_SALT, 32);
  return cachedKey;
}

export function isEncryptionConfigured(): boolean {
  return getKey() !== null;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** 비밀값을 암호화한다. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/**
 * 저장된 비밀값을 복호화한다.
 * - 평문(비암호화 시절 값)은 그대로 반환한다.
 * - 암호문 복호화 실패(키 변경/손상)는 null — 호출부는 재연결을 안내한다.
 */
export function decryptSecret(stored: string): string | null {
  if (!isEncrypted(stored)) return stored;
  const key = getKey();
  try {
    const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(":");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
