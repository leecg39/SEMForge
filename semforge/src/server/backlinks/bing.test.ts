import assert from "node:assert/strict";
import { test } from "node:test";
import { BingWebmasterProvider } from "@/server/backlinks/bing";

test("Bing 링크 응답을 실제 제공 필드로 정규화하고 Bearer 토큰을 노출하지 않는다", async () => {
  let authorization = "";
  const provider = new BingWebmasterProvider("private-token", async (input, init) => {
    authorization = String((init?.headers as Record<string, string>).Authorization);
    const url = String(input);
    if (url.includes("GetUserSites")) return Response.json({ d: { Sites: [{ Url: "https://site.example/", IsVerified: true }] } });
    if (url.includes("GetLinkCounts")) return Response.json({ d: { Links: [{ Url: "https://site.example/a", Count: 4 }], TotalPages: 1 } });
    return Response.json({ d: { Details: [{ Url: "https://source.example/a", AnchorText: "Guide" }], TotalPages: 1 } });
  });
  assert.equal((await provider.listSites())[0].siteUrl, "https://site.example/");
  assert.equal((await provider.getLinkCounts("https://site.example/", 0)).rows[0].linkCount, 4);
  assert.equal((await provider.getUrlLinks("https://site.example/", "https://site.example/a", 0)).rows[0].anchor, "Guide");
  assert.equal(authorization, "Bearer private-token");
});
