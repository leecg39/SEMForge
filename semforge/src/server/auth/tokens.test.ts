// @TASK P2-A1-T1 - Opaque authentication token contract
// @SPEC user-approved-plan#인증과-GSC
import assert from "node:assert/strict";
import { test } from "node:test";
import { createOpaqueToken, hashOpaqueToken } from "@/server/auth/tokens";

test("기본 불투명 토큰은 32 random bytes의 base64url 문자열이다", () => {
  const first = createOpaqueToken();
  const second = createOpaqueToken();

  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.match(second, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
});

test("요청한 안전한 byte 길이로 토큰을 만들 수 있다", () => {
  assert.match(createOpaqueToken(48), /^[A-Za-z0-9_-]{64}$/);
  assert.throws(() => createOpaqueToken(31), /32/);
  assert.throws(() => createOpaqueToken(129), /128/);
  assert.throws(() => createOpaqueToken(32.5), /integer/);
});

test("토큰 저장용 해시는 결정적인 SHA-256 lower hex이다", () => {
  assert.equal(
    hashOpaqueToken("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.throws(() => hashOpaqueToken(""), /empty/);
});

