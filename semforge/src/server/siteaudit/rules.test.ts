import assert from "node:assert/strict";
import test from "node:test";
import {
  applyQueryRules,
  isPathAllowed,
  parseCrawlRules,
  resolveCrawlerUserAgent,
} from "@/server/siteaudit/rules";

test("crawl rules normalize paths and invalid JSON safely", () => {
  assert.deepEqual(
    parseCrawlRules({
      allowPaths: JSON.stringify(["blog/", "/docs", "/docs"]),
      disallowPaths: "not-json",
      ignoreQueryParameters: JSON.stringify(["utm_source", "bad key", "utm_source"]),
    }),
    {
      allowPaths: ["/blog", "/docs"],
      disallowPaths: [],
      ignoreQueryParameters: ["utm_source"],
    }
  );
});

test("disallow rules win and allow rules limit the crawl", () => {
  const rules = {
    allowPaths: ["/blog"],
    disallowPaths: ["/blog/private"],
    ignoreQueryParameters: [],
  };
  assert.equal(isPathAllowed("/blog/article", rules), true);
  assert.equal(isPathAllowed("/blog/private/item", rules), false);
  assert.equal(isPathAllowed("/products", rules), false);
});

test("ignored query parameters are removed and remaining keys are sorted", () => {
  const url = new URL("https://example.com/a?z=1&utm_source=x&a=2");
  applyQueryRules(url, {
    allowPaths: [],
    disallowPaths: [],
    ignoreQueryParameters: ["utm_source"],
  });
  assert.equal(url.toString(), "https://example.com/a?a=2&z=1");
});

test("crawler user agent is restricted to known presets", () => {
  assert.match(resolveCrawlerUserAgent("googlebot"), /Googlebot/);
  assert.throws(() => resolveCrawlerUserAgent("custom"), /지원하지 않는/);
});
