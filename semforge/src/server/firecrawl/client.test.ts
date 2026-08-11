import assert from "node:assert/strict";
import test from "node:test";
import { firecrawlMapUrls } from "@/server/firecrawl/client";

test("Firecrawl v2 map의 객체 링크를 URL 목록으로 정규화한다", async () => {
  let authorization = "";
  const urls = await firecrawlMapUrls(
    "https://example.com",
    10,
    false,
    "test-key",
    {
      fetchImpl: async (_input, init) => {
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        return Response.json({
          success: true,
          links: [
            { url: "https://example.com/", title: "Home" },
            { url: "https://example.com/docs", title: "Docs" },
            { title: "missing URL" },
          ],
        });
      },
    },
  );

  assert.equal(authorization, "Bearer test-key");
  assert.deepEqual(urls, ["https://example.com/", "https://example.com/docs"]);
});

test("Firecrawl v1 호환 string 링크도 계속 수용한다", async () => {
  const urls = await firecrawlMapUrls(
    "https://example.com",
    10,
    false,
    "test-key",
    {
      fetchImpl: async () => Response.json({
        success: true,
        links: ["https://example.com/legacy"],
      }),
    },
  );
  assert.deepEqual(urls, ["https://example.com/legacy"]);
});
