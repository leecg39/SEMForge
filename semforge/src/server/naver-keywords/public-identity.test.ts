import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PublicPreviewSecurityError,
  resolveAnonymousIdentity,
  resolvePublicRateLimitSecret,
} from "@/server/naver-keywords/public-identity";

test("서명된 익명 쿠키는 재사용하고 변조된 쿠키는 새 식별자로 교체한다", () => {
  const secret = "test-only-public-preview-secret-material";
  const first = resolveAnonymousIdentity(null, secret);
  assert.equal(first.isNew, true);

  const repeated = resolveAnonymousIdentity(`other=1; ${first.name}=${first.value}`, secret);
  assert.equal(repeated.id, first.id);
  assert.equal(repeated.isNew, false);

  const tampered = resolveAnonymousIdentity(
    `${first.name}=${first.value.slice(0, -1)}x`,
    secret,
  );
  assert.notEqual(tampered.id, first.id);
  assert.equal(tampered.isNew, true);
});

test("production은 명시적 rate-limit secret이 없으면 fail closed한다", () => {
  assert.throws(
    () => resolvePublicRateLimitSecret({}, "production", "/tmp/app.db"),
    PublicPreviewSecurityError,
  );
  assert.match(
    resolvePublicRateLimitSecret({}, "development", "/tmp/app.db"),
    /^[a-f0-9]{64}$/,
  );
});
