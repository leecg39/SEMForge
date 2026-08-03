import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTopGscPages,
  pendingSeoGscState,
  summarizeGscRows,
  type SeoGscRow,
} from "@/components/seo-dash/use-seo-gsc";

test("GSC 상태는 프로젝트 도메인이 바뀌면 이전 실데이터 대신 확인 상태로 초기화한다", () => {
  assert.deepEqual(pendingSeoGscState("example.com"), { kind: "checking" });
  assert.deepEqual(pendingSeoGscState("  "), { kind: "disconnected" });
});

const rows: SeoGscRow[] = [
  { keys: ["https://example.com/b"], clicks: 3, impressions: 100, ctr: 0.03, position: 8 },
  { keys: ["https://example.com/a"], clicks: 9, impressions: 120, ctr: 0.075, position: 2 },
  { keys: ["https://example.com/c"], clicks: 9, impressions: 80, ctr: 0.1125, position: 4 },
];

test("summarizeGscRows는 노출 가중 평균 순위와 실제 CTR을 계산한다", () => {
  const totals = summarizeGscRows(rows);
  assert.equal(totals.clicks, 21);
  assert.equal(totals.impressions, 300);
  assert.ok(Math.abs(totals.ctr - 7) < 0.000001);
  assert.ok(Math.abs(totals.position - 4.533333333333333) < 0.000001);
});

test("buildTopGscPages는 클릭, 노출 순으로 정렬하고 CTR을 퍼센트로 변환한다", () => {
  const pages = buildTopGscPages(rows, 2);
  assert.deepEqual(pages.map((page) => page.page), ["https://example.com/a", "https://example.com/c"]);
  assert.equal(pages[0].ctr, 7.5);
  assert.equal(pages.length, 2);
});
