import assert from "node:assert/strict";
import test from "node:test";
import { extractDomainKeywordCandidates } from "@/server/domain-analysis/discovery";
import type { ScrapedPage } from "@/server/firecrawl/scrape";

function page(url: string, html: string): ScrapedPage {
  return {
    requestedUrl: url,
    finalUrl: url,
    status: 200,
    html,
    engine: "firecrawl",
  };
}

test("실제 페이지 메타와 헤딩에서 도메인 분석 키워드 후보를 만든다", () => {
  const candidates = extractDomainKeywordCandidates(
    [
      page(
        "https://acme-tools.com/seo-platform",
        `<html><head><title>SEO Analytics Platform | Acme Tools</title>
          <meta name="keywords" content="rank tracking, competitor analysis" /></head>
          <body><h1>Enterprise SEO analytics</h1><h2>Live rank tracking</h2></body></html>`,
      ),
    ],
    "acme-tools.com",
  );

  assert.equal(candidates[0], "acme tools");
  assert.ok(candidates.includes("rank tracking"));
  assert.ok(candidates.some((candidate) => candidate.includes("seo analytics")));
  assert.ok(candidates.length <= 5);
});
