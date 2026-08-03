import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "@/lib/api";
import { inferBacklinkScope, parseBacklinkTarget } from "@/server/backlinks/target";

test("도메인 범위는 host를 정규화하고 page 범위는 경로와 쿼리를 보존한다", () => {
  assert.deepEqual(parseBacklinkTarget(" HTTPS://WWW.Example.COM/path?x=1#part ", "root_domain"), {
    canonical: "example.com",
    scope: "root_domain",
  });
  assert.deepEqual(parseBacklinkTarget("blog.Example.com/path", "subdomain"), {
    canonical: "blog.example.com",
    scope: "subdomain",
  });
  assert.deepEqual(parseBacklinkTarget("https://Example.com/path?x=1#part", "page"), {
    canonical: "https://example.com/path?x=1",
    scope: "page",
  });
});

test("경로가 있는 입력은 page 범위로 추론한다", () => {
  assert.equal(inferBacklinkScope("example.com"), "root_domain");
  assert.equal(inferBacklinkScope("example.com/article"), "page");
  assert.equal(inferBacklinkScope("https://example.com/?ref=1"), "page");
});

test("자격 증명·비 HTTP URL·로컬 호스트를 거부한다", () => {
  for (const target of ["https://user:pass@example.com", "ftp://example.com/file", "localhost", "http://example.com:3000"]) {
    assert.throws(
      () => parseBacklinkTarget(target, "page"),
      (error: unknown) => error instanceof ApiError && error.code === "VALIDATION_ERROR",
    );
  }
});

