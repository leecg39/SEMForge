import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "@/lib/api";
import { compileBacklinkFilter, listQueryKey, resolveBacklinkSort } from "@/server/backlinks/filters";

const base = {
  status: "all" as const,
  attribute: "all" as const,
  linkType: "all" as const,
  search: "",
  dateFrom: null,
  dateTo: null,
};

test("허용된 필터만 Semrush 표현식으로 컴파일하고 따옴표를 이스케이프한다", () => {
  const filter = compileBacklinkFilter("links", {
    ...base,
    status: "new",
    attribute: "nofollow",
    linkType: "image",
    search: "author's guide",
    dateFrom: "2026-01-01",
    dateTo: "2026-01-31",
  });
  assert.equal(
    filter,
    "is_new = true AND is_nofollow = true AND is_image = true AND (source_url LIKE '%author\\'s guide%' OR target_url LIKE '%author\\'s guide%' OR anchor LIKE '%author\\'s guide%') AND first_seen_at >= '2026-01-01' AND first_seen_at <= '2026-01-31T23:59:59'",
  );
});

test("데이터셋별 정렬 화이트리스트를 강제한다", () => {
  assert.equal(resolveBacklinkSort("links"), "page_score");
  assert.equal(resolveBacklinkSort("anchors", "backlinks_count"), "backlinks_count");
  assert.throws(
    () => resolveBacklinkSort("pages", "drop_table"),
    (error: unknown) => error instanceof ApiError && error.code === "VALIDATION_ERROR",
  );
});

test("쿼리 키는 같은 조건에서 결정적으로 생성된다", () => {
  const input = { dataset: "links" as const, page: 1, pageSize: 25, sort: "page_score", direction: "desc" as const, filters: base };
  assert.equal(listQueryKey(input), listQueryKey({ ...input }));
});

