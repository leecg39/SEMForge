// @TASK P1-D1-T1 - Versioned AES-256-GCM key rotation contract
// @SPEC docs/planning/06-tasks.md#p1-d1-t1--postgresql-16-핵심-스키마와-암호화-기반
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SecretDecryptionError,
  createSecretCrypto,
  decryptSecret,
  encryptSecret,
} from "@/lib/crypto";

const current = "current-secret-material-that-is-at-least-32-bytes";
const previous = "previous-secret-material-that-is-at-least-32-bytes";

test("암호문은 현재 key id를 포함하고 같은 keyring에서 round-trip 된다", () => {
  const crypto = createSecretCrypto({ currentKeyId: "key-2026-08", currentSecret: current });
  const stored = crypto.encrypt("refresh-token", "workspace-1:gsc-connection-1:refresh-token");

  assert.match(stored, /^enc:v1:key-2026-08:/);
  assert.equal(crypto.decrypt(stored, "workspace-1:gsc-connection-1:refresh-token"), "refresh-token");
});

test("이전 key id의 암호문은 회전 후 previous key map으로 복호화된다", () => {
  const oldCrypto = createSecretCrypto({ currentKeyId: "key-old", currentSecret: previous });
  const context = "workspace-1:payment-method-1:billing-key";
  const stored = oldCrypto.encrypt("billing-key", context);
  const rotatedCrypto = createSecretCrypto({
    currentKeyId: "key-new",
    currentSecret: current,
    previousKeys: { "key-old": previous },
  });

  assert.equal(rotatedCrypto.decrypt(stored, context), "billing-key");
  assert.match(rotatedCrypto.encrypt("next", context), /^enc:v1:key-new:/);
});

test("변조·알 수 없는 key id·평문은 안전하게 null을 반환한다", () => {
  const crypto = createSecretCrypto({ currentKeyId: "key-current", currentSecret: current });
  const context = "workspace-1:gsc-connection-1:access-token";
  const stored = crypto.encrypt("sensitive", context);
  const tampered = `${stored.slice(0, -1)}${stored.endsWith("A") ? "B" : "A"}`;

  assert.equal(crypto.decrypt(tampered, context), null);
  assert.equal(crypto.decrypt(stored.replace("key-current", "key-missing"), context), null);
  assert.equal(crypto.decrypt("plain-legacy-token", context), null);
  assert.throws(() => crypto.decryptOrThrow("plain-legacy-token", context), SecretDecryptionError);
});

test("AAD가 다른 workspace나 record로 바뀌면 암호문 이동을 거부한다", () => {
  const crypto = createSecretCrypto({ currentKeyId: "key-current", currentSecret: current });
  const stored = crypto.encrypt("sensitive", "workspace-1:gsc-connection-1:access-token");

  assert.equal(crypto.decrypt(stored, "workspace-2:gsc-connection-1:access-token"), null);
  assert.equal(crypto.decrypt(stored, "workspace-1:gsc-connection-2:access-token"), null);
});

test("환경 keyring wrapper도 key id와 previous key map을 사용한다", () => {
  const previousEnv = {
    APP_SECRET: process.env.APP_SECRET,
    APP_SECRET_CURRENT_KEY_ID: process.env.APP_SECRET_CURRENT_KEY_ID,
    APP_SECRET_PREVIOUS_KEYS: process.env.APP_SECRET_PREVIOUS_KEYS,
  };

  try {
    process.env.APP_SECRET = current;
    process.env.APP_SECRET_CURRENT_KEY_ID = "env-current";
    process.env.APP_SECRET_PREVIOUS_KEYS = JSON.stringify({ "env-old": previous });

    const context = "workspace-1:gsc-connection-1:access-token";
    const stored = encryptSecret("oauth-token", context);
    assert.match(stored, /^enc:v1:env-current:/);
    assert.equal(decryptSecret(stored, context), "oauth-token");
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
