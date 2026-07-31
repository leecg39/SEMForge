import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { hasValidCronSecret, verifyCronSecret } from "@/lib/cron-auth";

function requestWith(secret?: string): Request {
  return new Request("http://localhost/api/cron/run-due/", {
    headers: secret === undefined ? {} : { "x-cron-secret": secret },
  });
}

afterEach(() => {
  delete process.env.CRON_SECRET;
});

test("CRON_SECRET 미설정이면 헤더가 있어도 거부한다 (fail-closed)", () => {
  const withHeader = verifyCronSecret(requestWith("anything"));
  assert.equal(withHeader.ok, false);
  assert.equal(withHeader.ok === false && withHeader.code, "not-configured");

  const withoutHeader = verifyCronSecret(requestWith());
  assert.equal(withoutHeader.ok, false);
});

test("시크릿이 일치하면 통과한다", () => {
  process.env.CRON_SECRET = "s3cret-value";
  assert.equal(verifyCronSecret(requestWith("s3cret-value")).ok, true);
  assert.equal(hasValidCronSecret(requestWith("s3cret-value")), true);
});

test("시크릿이 틀리거나 없으면 invalid 로 거부한다", () => {
  process.env.CRON_SECRET = "s3cret-value";
  const wrong = verifyCronSecret(requestWith("wrong-value"));
  assert.equal(wrong.ok, false);
  assert.equal(wrong.ok === false && wrong.code, "invalid");

  // 길이가 다른 값도 예외 없이 거부해야 한다 (timingSafeEqual 길이 가드).
  assert.equal(verifyCronSecret(requestWith("short")).ok, false);
  assert.equal(verifyCronSecret(requestWith()).ok, false);
});
