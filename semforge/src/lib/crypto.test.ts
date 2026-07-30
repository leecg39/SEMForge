import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decryptSecret,
  encryptSecret,
  isEncrypted,
  isEncryptionConfigured,
} from "@/lib/crypto";

// crypto.ts 는 키를 첫 호출 시점에 파생하므로, 어떤 함수보다 먼저 설정하면 적용된다.
process.env.APP_SECRET = "test-secret-for-crypto-round-trip";

test("APP_SECRET 설정 시 암호화가 활성화되고 round-trip 이 성립한다", () => {
  assert.equal(isEncryptionConfigured(), true);
  const secret = "ya29.a0AfB_byExampleAccessToken-1234567890";
  const stored = encryptSecret(secret);
  assert.ok(isEncrypted(stored));
  assert.notEqual(stored, secret);
  assert.equal(decryptSecret(stored), secret);
});

test("같은 평문도 IV 가 달라 매번 다른 암호문이 나온다", () => {
  const secret = "refresh-token-sample";
  assert.notEqual(encryptSecret(secret), encryptSecret(secret));
});

test("평문(비암호화 시절 값)은 그대로 통과한다", () => {
  assert.equal(decryptSecret("plain-legacy-token"), "plain-legacy-token");
});

test("손상된 암호문은 null 을 반환한다 (재연결 유도)", () => {
  const stored = encryptSecret("will-corrupt");
  const corrupted = stored.slice(0, -4) + "AAAA";
  assert.equal(decryptSecret(corrupted), null);
});
