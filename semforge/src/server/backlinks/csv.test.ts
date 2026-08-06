import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeImportedBacklinks, parseBacklinkCsv } from "@/server/backlinks/csv";
import { backlinkRowsCsv } from "@/server/backlinks/service";

test("BOM·따옴표·필드 내 줄바꿈과 한영 헤더를 처리한다", () => {
  const parsed = parseBacklinkCsv('\uFEFF출처 URL,대상 URL,앵커 텍스트,링크 수\r\n"https://a.example/x","https://site.example/","두 줄\n앵커",2\r\n');
  assert.equal(parsed.rows[0][2], "두 줄\n앵커");
  assert.equal(parsed.detectedMapping.sourceUrl, "출처 URL");
  assert.equal(parsed.detectedMapping.targetUrl, "대상 URL");
});

test("사이트 밖 행을 제외하고 정규화 URL 기준 중복을 제거한다", () => {
  const parsed = parseBacklinkCsv("source url,target url,anchor,links\nhttps://a.example/x,https://site.example/page,Guide,2\nhttps://a.example/x,https://site.example/page#x,Guide,3\nhttps://b.example/x,https://other.example/,Other,1");
  const result = normalizeImportedBacklinks({ headers: parsed.headers, rows: parsed.rows,
    mapping: { sourceUrl: "source url", targetUrl: "target url", anchor: "anchor", linkCount: "links" }, siteUrl: "https://site.example/" });
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].linkCount, 3); assert.equal(result.skipped, 1);
});

test("CSV 내보내기는 스프레드시트 수식 삽입을 차단한다", () => {
  const csv = backlinkRowsCsv([{ kind: "inbound_links", sourceUrl: "https://a.example/", targetUrl: "https://site.example/", sourceDomain: "a.example", anchor: "=HYPERLINK(\"https://evil.example\")", linkCount: 1 }]);
  assert.match(csv, /'\=HYPERLINK/);
});
