// @TASK NAVER-KI-DB-01 - 네이버 키워드 인텔리전스 저장 계약
// @SPEC docs/DB_SCHEMA.md#네이버-키워드-인텔리전스-schemanaver-keywordsts
import assert from "node:assert/strict";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { keywordListItems } from "./domain";
import {
  naverKeywordInsights,
  naverKeywordSnapshots,
  providerCallBudgets,
  publicKeywordUsage,
} from "./naver-keywords";

function columnNames(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).columns.map((column) => column.name);
}

test("NAVER 원천 테이블은 공급자 수치와 provenance를 분리 보관한다", () => {
  const snapshot = getTableConfig(naverKeywordSnapshots);
  const insight = getTableConfig(naverKeywordInsights);

  assert.equal(snapshot.name, "naver_keyword_snapshots");
  assert.equal(insight.name, "naver_keyword_insights");
  assert.ok(columnNames(naverKeywordSnapshots).includes("pc_search_count_max_exclusive"));
  assert.ok(columnNames(naverKeywordSnapshots).includes("mobile_search_count_display"));
  assert.ok(columnNames(naverKeywordSnapshots).includes("captured_at"));
  assert.ok(columnNames(naverKeywordInsights).includes("schema_version"));
  assert.ok(columnNames(naverKeywordInsights).includes("payload"));
  assert.ok(snapshot.indexes.some((entry) => entry.config.name === "naver_keyword_snapshots_latest_idx"));
  assert.ok(insight.indexes.some((entry) => entry.config.name === "naver_keyword_insights_latest_idx"));
});

test("공개 사용량은 원문 없이 해시만 저장하고 동일 키워드를 중복 계산하지 않는다", () => {
  const usage = getTableConfig(publicKeywordUsage);
  const columns = columnNames(publicKeywordUsage);

  assert.equal(usage.name, "public_keyword_usage");
  assert.ok(columns.includes("identity_hash"));
  assert.ok(columns.includes("keyword_hash"));
  assert.ok(!columns.includes("ip"));
  assert.ok(!columns.includes("keyword"));
  assert.ok(usage.indexes.some((entry) => entry.config.name === "public_keyword_usage_identity_keyword_unique"));
});

test("공급자 예산과 저장 키워드 provenance 계약을 노출한다", () => {
  const budget = getTableConfig(providerCallBudgets);
  const keywordColumns = columnNames(keywordListItems);

  assert.equal(budget.name, "provider_call_budgets");
  assert.ok(budget.indexes.some((entry) => entry.config.name === "provider_call_budgets_provider_date_unique"));
  assert.ok(keywordColumns.includes("provider"));
  assert.ok(keywordColumns.includes("source_snapshot_id"));
  assert.ok(keywordColumns.includes("measurement"));
});
