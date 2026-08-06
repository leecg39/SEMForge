import assert from "node:assert/strict";
import test from "node:test";
import { collectLinkEvidence, inspectBacklinkHtml } from "@/server/backlink-audit/enrichment";

test("실제 앵커의 상대 URL과 rel·이미지 유형을 정규화한다", () => {
  const result = inspectBacklinkHtml({
    html: '<html><body><a href="/guide#top" rel="nofollow ugc"><img src="cover.png" alt="Guide"> 링크</a></body></html>',
    sourceUrl: "https://source.example/post/",
    targetUrl: "https://source.example/guide",
  });
  assert.ok(result);
  assert.equal(result.linkType, "image");
  assert.equal(result.isFollow, false);
  assert.equal(result.isNofollow, true);
  assert.equal(result.isUgc, true);
});

test("출처는 열리지만 대상 링크가 없으면 missing이고, 실패는 unavailable이다", async () => {
  const missing = await collectLinkEvidence({
    sourceUrl: "https://source.example/post",
    targetUrl: "https://site.example/page",
    scraper: async () => ({ finalUrl: null, status: 200, html: "<p>No link</p>" }),
  });
  assert.equal(missing.auditStatus, "missing");
  const unavailable = await collectLinkEvidence({
    sourceUrl: "https://source.example/error",
    targetUrl: "https://site.example/page",
    scraper: async () => ({ finalUrl: null, status: 503, html: null, error: "HTTP 503" }),
  });
  assert.equal(unavailable.auditStatus, "unavailable");
  assert.equal(unavailable.isFollow, null);
});
