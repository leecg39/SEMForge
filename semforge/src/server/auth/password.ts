// @TASK P2-A1-T1 - Versioned scrypt password hashing
// @SPEC user-approved-plan#인증과-GSC
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

const SCRYPT_VERSION = "v1";
const SCRYPT_PARAMETERS = {
  N: 16_384,
  r: 8,
  p: 1,
  keylen: 64,
} as const;
const SCRYPT_PARAMETER_STRING = "N=16384,r=8,p=1,keylen=64";
const SCRYPT_OPTIONS: ScryptOptions = {
  N: SCRYPT_PARAMETERS.N,
  r: SCRYPT_PARAMETERS.r,
  p: SCRYPT_PARAMETERS.p,
  maxmem: 32 * 1024 * 1024,
};
const SALT_BYTES = 16;

interface ParsedPasswordHash {
  readonly salt: Buffer;
  readonly derivedKey: Buffer;
}

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      SCRYPT_PARAMETERS.keylen,
      SCRYPT_OPTIONS,
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

function decodeCanonicalBase64Url(value: string, byteLength: number): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;

  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== byteLength) return null;
  if (decoded.toString("base64url") !== value) return null;
  return decoded;
}

function parsePasswordHash(encodedHash: string): ParsedPasswordHash | null {
  const parts = encodedHash.split("$");
  if (parts.length !== 5) return null;

  const [algorithm, version, parameters, saltText, derivedKeyText] = parts;
  if (algorithm !== "scrypt") return null;
  if (version !== SCRYPT_VERSION) return null;
  if (parameters !== SCRYPT_PARAMETER_STRING) return null;
  if (!saltText || !derivedKeyText) return null;

  const salt = decodeCanonicalBase64Url(saltText, SALT_BYTES);
  const derivedKey = decodeCanonicalBase64Url(
    derivedKeyText,
    SCRYPT_PARAMETERS.keylen,
  );
  if (!salt || !derivedKey) return null;

  return { salt, derivedKey };
}

/**
 * 비밀번호를 자체 설명형 단일 문자열로 인코딩한다.
 * 비밀번호 길이와 복잡도 정책은 호출하는 인증 서비스가 담당한다.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await derivePassword(password, salt);

  return [
    "scrypt",
    SCRYPT_VERSION,
    SCRYPT_PARAMETER_STRING,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

/** 외부 저장소에서 읽은 해시는 엄격히 파싱하며 손상된 값은 false로 처리한다. */
export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) return false;

  const actual = await derivePassword(password, parsed.salt);
  return timingSafeEqual(actual, parsed.derivedKey);
}

