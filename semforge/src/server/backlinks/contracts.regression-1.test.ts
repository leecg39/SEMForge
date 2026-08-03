import assert from "node:assert/strict";
import { test } from "node:test";
import { backlinkListRequestSchema } from "@/server/backlinks/contracts";

const baseRequest = {
  target: "example.com",
  scope: "root_domain" as const,
  dataset: "links" as const,
  filters: {
    status: "all" as const,
    attribute: "all" as const,
    linkType: "all" as const,
    search: "",
    dateFrom: null as string | null,
    dateTo: null as string | null,
  },
};

// Regression: ISSUE-007 — 존재하지 않거나 역전된 날짜 범위가 공급자 필터까지 통과했음
// Found by /qa on 2026-08-04
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-04.md
test("백링크 목록 요청은 실제 달력 날짜와 올바른 범위만 허용한다", () => {
  for (const [dateFrom, dateTo] of [
    ["2026-02-29", null],
    ["2026-02-31", null],
    ["2026-13-01", null],
    ["2026-08-04", "2026-08-01"],
  ] as const) {
    const parsed = backlinkListRequestSchema.safeParse({
      ...baseRequest,
      filters: { ...baseRequest.filters, dateFrom, dateTo },
    });
    assert.equal(parsed.success, false, `${dateFrom} ~ ${dateTo ?? ""}`);
  }

  for (const [dateFrom, dateTo] of [
    ["2024-02-29", "2024-02-29"],
    ["2026-08-01", "2026-08-04"],
  ] as const) {
    const parsed = backlinkListRequestSchema.safeParse({
      ...baseRequest,
      filters: { ...baseRequest.filters, dateFrom, dateTo },
    });
    assert.equal(parsed.success, true, `${dateFrom} ~ ${dateTo}`);
  }
});
