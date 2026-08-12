// @TASK P2-A1-T1 - Versioned scrypt password hashing contract
// @SPEC user-approved-plan#인증과-GSC
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashPassword,
  verifyPassword,
  verifyPasswordWithPolicy,
} from "@/server/auth/password";

test("비밀번호 해시는 파라미터와 salt를 포함한 단일 versioned 문자열이다", async () => {
  const encoded = await hashPassword("correct horse battery staple");

  assert.match(
    encoded,
    /^scrypt\$v2\$N=131072,r=8,p=1,keylen=64\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/,
  );
  assert.equal(await verifyPassword("correct horse battery staple", encoded), true);
  assert.equal(await verifyPassword("wrong password", encoded), false);
  assert.deepEqual(
    await verifyPasswordWithPolicy("correct horse battery staple", encoded),
    { verified: true, needsRehash: false },
  );
});

test("레거시 2^14 해시는 검증하되 성공 결과에 재해시 필요를 표시한다", async () => {
  const legacyHash =
    "scrypt$v1$N=16384,r=8,p=1,keylen=64$WlpaWlpaWlpaWlpaWlpaWg$-ri1vm9V4Re1Xf1SNzvP_8ht3Zsz7NH3Yuc_nUOKabyPnE-oYhphNku8tDZz7Yp59wWU7BwbDw6P2kVbxAr3NQ";

  assert.deepEqual(
    await verifyPasswordWithPolicy("legacy-password-2026", legacyHash),
    { verified: true, needsRehash: true },
  );
  assert.deepEqual(
    await verifyPasswordWithPolicy("wrong-password", legacyHash),
    { verified: false, needsRehash: false },
  );
});

test("같은 비밀번호도 무작위 salt 때문에 서로 다른 해시를 만든다", async () => {
  const first = await hashPassword("same password");
  const second = await hashPassword("same password");

  assert.notEqual(first, second);
  assert.equal(await verifyPassword("same password", first), true);
  assert.equal(await verifyPassword("same password", second), true);
});

test("알 수 없는 버전·파라미터·비정규 인코딩은 검증하지 않는다", async () => {
  const valid = await hashPassword("password");
  const malformed = [
    "",
    "scrypt$v3$N=131072,r=8,p=1,keylen=64$AA$AA",
    valid.replace("N=131072", "N=2147483648"),
    valid.replace("r=8", "r=2147483648"),
    valid.replace("p=1", "p=2147483648"),
    valid.replace("keylen=64", "keylen=2147483648"),
    valid.replace("N=131072,r=8,p=1", "r=8,N=131072,p=1"),
    `${valid}$extra`,
    valid.replace(/\$[A-Za-z0-9_-]{22}\$/, "$not+base64url$"),
    valid.slice(0, -1),
    `${valid}${"A".repeat(1_000_000)}`,
  ];

  for (const encoded of malformed) {
    assert.equal(await verifyPassword("password", encoded), false, encoded);
  }
});
