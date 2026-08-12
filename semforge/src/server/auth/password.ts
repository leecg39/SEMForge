// @TASK P2-A1-T1 - Versioned scrypt password hashing
// @SPEC user-approved-plan#인증과-GSC
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

interface PasswordHashPolicy {
  readonly version: "v1" | "v2";
  readonly parameterString: string;
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly keylen: number;
  readonly maxmem: number;
  readonly needsRehash: boolean;
}

const CURRENT_POLICY: PasswordHashPolicy = {
  version: "v2",
  parameterString: "N=131072,r=8,p=1,keylen=64",
  N: 131_072,
  r: 8,
  p: 1,
  keylen: 64,
  maxmem: 256 * 1024 * 1024,
  needsRehash: false,
};
const LEGACY_POLICY: PasswordHashPolicy = {
  version: "v1",
  parameterString: "N=16384,r=8,p=1,keylen=64",
  N: 16_384,
  r: 8,
  p: 1,
  keylen: 64,
  maxmem: 32 * 1024 * 1024,
  needsRehash: true,
};
const SALT_BYTES = 16;
const MAX_ENCODED_HASH_CHARS = 180;

interface ParsedPasswordHash {
  readonly salt: Buffer;
  readonly derivedKey: Buffer;
  readonly policy: PasswordHashPolicy;
}

export interface PasswordVerificationResult {
  readonly verified: boolean;
  readonly needsRehash: boolean;
}

function derivePassword(
  password: string,
  salt: Buffer,
  policy: PasswordHashPolicy,
): Promise<Buffer> {
  const options: ScryptOptions = {
    N: policy.N,
    r: policy.r,
    p: policy.p,
    maxmem: policy.maxmem,
  };
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      policy.keylen,
      options,
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
  if (encodedHash.length > MAX_ENCODED_HASH_CHARS) return null;
  const parts = encodedHash.split("$");
  if (parts.length !== 5) return null;

  const [algorithm, version, parameters, saltText, derivedKeyText] = parts;
  if (algorithm !== "scrypt") return null;
  const policy = [CURRENT_POLICY, LEGACY_POLICY].find(
    (candidate) =>
      candidate.version === version && candidate.parameterString === parameters,
  );
  if (!policy) return null;
  if (!saltText || !derivedKeyText) return null;

  const salt = decodeCanonicalBase64Url(saltText, SALT_BYTES);
  const derivedKey = decodeCanonicalBase64Url(derivedKeyText, policy.keylen);
  if (!salt || !derivedKey) return null;

  return { salt, derivedKey, policy };
}

/**
 * 비밀번호를 자체 설명형 단일 문자열로 인코딩한다.
 * 비밀번호 길이와 복잡도 정책은 호출하는 인증 서비스가 담당한다.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await derivePassword(password, salt, CURRENT_POLICY);

  return [
    "scrypt",
    CURRENT_POLICY.version,
    CURRENT_POLICY.parameterString,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

/** 외부 저장소에서 읽은 해시는 엄격히 파싱하며 손상된 값은 false로 처리한다. */
export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  return (await verifyPasswordWithPolicy(password, encodedHash)).verified;
}

/** 검증 성공 후 현재 정책으로 교체해야 하는지 함께 반환한다. */
export async function verifyPasswordWithPolicy(
  password: string,
  encodedHash: string,
): Promise<PasswordVerificationResult> {
  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) return { verified: false, needsRehash: false };

  const actual = await derivePassword(password, parsed.salt, parsed.policy);
  const verified = timingSafeEqual(actual, parsed.derivedKey);
  return {
    verified,
    needsRehash: verified && parsed.policy.needsRehash,
  };
}
