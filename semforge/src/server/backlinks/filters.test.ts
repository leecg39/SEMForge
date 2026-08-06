import assert from "node:assert/strict";
import { test } from "node:test";
import { filterBacklinkRows, listQueryKey, resolveBacklinkSort, sortBacklinkRows } from "@/server/backlinks/filters";

test("목록 정렬은 데이터셋 화이트리스트로 제한한다", () => {
  assert.equal(resolveBacklinkSort("target_pages", "drop_table"), "link_count");
  assert.equal(resolveBacklinkSort("inbound_links", "anchor"), "anchor");
});

test("URL·도메인·앵커 검색과 결정적 캐시 키를 제공한다", () => {
  const rows = [{ kind: "inbound_links" as const, sourceUrl: "https://news.example/a", targetUrl: "https://site.example/", sourceDomain: "news.example", anchor: "Useful guide", linkCount: 1 }];
  assert.equal(filterBacklinkRows(rows, { search: "GUIDE" }).length, 1);
  const sorted = sortBacklinkRows(rows, "inbound_links", "source_domain", "asc")[0];
  assert.equal(sorted.kind === "inbound_links" ? sorted.sourceDomain : null, "news.example");
  const input = { dataset: "inbound_links" as const, targetPage: "https://site.example/", page: 1, pageSize: 25, sort: "source_url", direction: "desc" as const, filters: { search: "" } };
  assert.equal(listQueryKey(input), listQueryKey({ ...input }));
});
