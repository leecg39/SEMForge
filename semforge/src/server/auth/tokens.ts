// @TASK P2-A1-T1 - Opaque authentication tokens
// @SPEC user-approved-plan#인증과-GSC
import { createHash, randomBytes } from "node:crypto";

const DEFAULT_TOKEN_BYTES = 32;
const MAX_TOKEN_BYTES = 128;

/** 쿠키·URL에 안전한 base64url 불투명 토큰을 만든다. */
export function createOpaqueToken(byteLength = DEFAULT_TOKEN_BYTES): string {
  if (!Number.isInteger(byteLength)) {
    throw new TypeError("Opaque token byte length must be an integer.");
  }
  if (byteLength < DEFAULT_TOKEN_BYTES || byteLength > MAX_TOKEN_BYTES) {
    throw new RangeError(
      `Opaque token byte length must be between ${DEFAULT_TOKEN_BYTES} and ${MAX_TOKEN_BYTES}.`,
    );
  }

  return randomBytes(byteLength).toString("base64url");
}

/** 원문 토큰 대신 저장할 SHA-256 lower-hex digest를 만든다. */
export function hashOpaqueToken(token: string): string {
  if (token.length === 0) {
    throw new TypeError("Opaque token cannot be empty.");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

