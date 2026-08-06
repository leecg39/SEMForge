import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "@/lib/api";
import { normalizeBacklinkSiteUrl, parseBacklinkTarget, targetBelongsToSite } from "@/server/backlinks/target";

test("Bing 사이트 URL과 페이지 범위를 정규화한다", () => {
  assert.equal(normalizeBacklinkSiteUrl(" HTTPS://WWW.Example.COM/docs "), "https://www.example.com/docs/");
  assert.deepEqual(parseBacklinkTarget({ siteUrl: "example.com", scope: "site" }), {
    siteUrl: "https://example.com/", targetUrl: null, scope: "site", cacheTarget: "https://example.com/",
  });
  const page = parseBacklinkTarget({ siteUrl: "https://example.com/docs/", targetUrl: "https://example.com/docs/a?q=1#x", scope: "page" });
  assert.equal(page.targetUrl, "https://example.com/docs/a?q=1");
  assert.equal(targetBelongsToSite(page.siteUrl, page.targetUrl!), true);
});

test("외부 페이지·IP·자격 증명·포트를 거부한다", () => {
  for (const input of [
    { siteUrl: "127.0.0.1", scope: "site" as const },
    { siteUrl: "https://user:pass@example.com", scope: "site" as const },
    { siteUrl: "http://example.com:3000", scope: "site" as const },
    { siteUrl: "https://example.com/", targetUrl: "https://other.example/page", scope: "page" as const },
  ]) assert.throws(() => parseBacklinkTarget(input), (error: unknown) => error instanceof ApiError && error.code === "VALIDATION_ERROR");
});
