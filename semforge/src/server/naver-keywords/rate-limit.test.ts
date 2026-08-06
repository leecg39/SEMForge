import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PublicKeywordRateLimiter,
  PublicKeywordRateLimitError,
  normalizeIpPrefix,
  type PublicKeywordUsageRepository,
  type PublicKeywordUsageRow,
} from "@/server/naver-keywords/rate-limit";

class MemoryUsageRepository implements PublicKeywordUsageRepository {
  rows: PublicKeywordUsageRow[] = [];

  async cleanup(expiredBefore: Date) {
    this.rows = this.rows.filter((row) => row.expiresAt >= expiredBefore);
  }

  async list(identityHash: string, since: Date) {
    return this.rows.filter(
      (row) => row.identityHash === identityHash && row.firstSeenAt >= since,
    );
  }

  async record(row: PublicKeywordUsageRow) {
    this.rows.push(row);
  }
}

const base = new Date("2026-08-04T00:00:00.000Z");

test("같은 쿠키의 동일 키워드 재조회는 고유 키워드 한도를 추가 소모하지 않는다", async () => {
  const repository = new MemoryUsageRepository();
  const limiter = new PublicKeywordRateLimiter(repository, {
    secret: "test-only-rate-limit-secret-with-enough-length",
  });

  const request = { cookieId: "anon-a", ip: "203.0.113.41", keyword: "네이버 광고" };
  const first = await limiter.consume({ ...request, now: base });
  const second = await limiter.consume({ ...request, now: new Date(base.getTime() + 1_000) });

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.cookieRemaining, 2);
  assert.equal(repository.rows.length, 2);
});

test("쿠키별 네 번째 고유 키워드는 429용 retryAfter와 함께 차단한다", async () => {
  const repository = new MemoryUsageRepository();
  const limiter = new PublicKeywordRateLimiter(repository, {
    secret: "test-only-rate-limit-secret-with-enough-length",
  });

  for (const [index, keyword] of ["하나", "둘", "셋"].entries()) {
    await limiter.consume({
      cookieId: "anon-a",
      ip: "203.0.113.41",
      keyword,
      now: new Date(base.getTime() + index * 1_000),
    });
  }

  await assert.rejects(
    () => limiter.consume({
      cookieId: "anon-a",
      ip: "203.0.113.41",
      keyword: "넷",
      now: new Date(base.getTime() + 4_000),
    }),
    (error: unknown) => {
      assert.ok(error instanceof PublicKeywordRateLimitError);
      assert.equal(error.scope, "cookie");
      assert.equal(error.retryAfterSeconds, 86_396);
      return true;
    },
  );
});

test("원본 IP와 키워드는 사용량 저장소에 기록하지 않고 HMAC만 기록한다", async () => {
  const repository = new MemoryUsageRepository();
  const limiter = new PublicKeywordRateLimiter(repository, {
    secret: "test-only-rate-limit-secret-with-enough-length",
  });

  await limiter.consume({
    cookieId: "anon-a",
    ip: "203.0.113.41",
    keyword: "민감 키워드",
    now: base,
  });

  assert.equal(repository.rows.length, 2);
  const serialized = JSON.stringify(repository.rows);
  assert.equal(serialized.includes("203.0.113.41"), false);
  assert.equal(serialized.includes("민감 키워드"), false);
  assert.ok(repository.rows.every((row) => /^[a-f0-9]{64}$/.test(row.identityHash)));
  assert.ok(repository.rows.every((row) => /^[a-f0-9]{64}$/.test(row.keywordHash)));
});

test("IPv6 압축 표기는 같은 /64로 정규화하고 IPv4-mapped 주소는 /24를 사용한다", () => {
  assert.equal(
    normalizeIpPrefix("2001:db8::1"),
    "2001:0db8:0000:0000::/64",
  );
  assert.equal(
    normalizeIpPrefix("2001:0db8:0:0:abcd::2"),
    "2001:0db8:0000:0000::/64",
  );
  assert.notEqual(
    normalizeIpPrefix("2001:db8:0:1::1"),
    normalizeIpPrefix("2001:db8:0:2::1"),
  );
  assert.equal(normalizeIpPrefix("::ffff:203.0.113.41"), "203.0.113.0/24");
  assert.equal(normalizeIpPrefix("not-an-ip"), "unknown");
});
