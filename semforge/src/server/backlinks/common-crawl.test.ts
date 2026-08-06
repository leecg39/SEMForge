import assert from "node:assert/strict";
import test from "node:test";
import { CommonCrawlBacklinkProvider } from "@/server/backlinks/common-crawl";

test("Common Crawl 게이트웨이 결과를 사이트 범위의 실제 URL만 정규화한다", async () => {
  let authorization = "";
  let requestBody = "";
  const provider = new CommonCrawlBacklinkProvider({
    endpoint: "https://common-crawl.test/backlinks",
    token: "server-only-secret",
    fetchImpl: async (_input, init) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      requestBody = String(init?.body);
      return Response.json({
        release: "cc-main-2026-may-jun-jul",
        partial: false,
        rows: [
          { sourceUrl: "https://source.example/post#section", targetUrl: "https://site.example/guide#top", anchor: " Guide ", linkCount: 3 },
          { sourceUrl: "https://site.example/internal", targetUrl: "https://site.example/guide", linkCount: 1 },
          { sourceUrl: "https://other.example/post", targetUrl: "https://outside.example/", linkCount: 1 },
          { sourceUrl: "http://127.0.0.1/private", targetUrl: "https://site.example/guide", linkCount: 1 },
        ],
      });
    },
  });
  const result = await provider.discover({
    siteUrl: "https://site.example/",
    targetUrl: null,
    scope: "site",
    limit: 100,
  });
  assert.equal(authorization, "Bearer server-only-secret");
  assert.equal((JSON.parse(requestBody) as Record<string, unknown>).recentCrawls, 3);
  assert.equal(result.release, "cc-main-2026-may-jun-jul");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.sourceUrl, "https://source.example/post");
  assert.equal(result.rows[0]?.targetUrl, "https://site.example/guide");
  assert.equal(result.rows[0]?.anchor, "Guide");
});

test("Common Crawl 설정 오류에 토큰을 노출하지 않는다", async () => {
  const provider = new CommonCrawlBacklinkProvider({ endpoint: null, token: "never-print-this" });
  await assert.rejects(
    () => provider.discover({ siteUrl: "https://site.example/", targetUrl: null, scope: "site", limit: 100 }),
    (error: unknown) => error instanceof Error && !error.message.includes("never-print-this") && /설정되지 않았습니다/.test(error.message),
  );
});
