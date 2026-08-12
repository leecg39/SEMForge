import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";
import "@/lib/api"; // z.config(z.locales.ko()) 적용 지점 (사이드 이펙트 import)

// Regression: ISSUE-002 — raw zod messages leaked into form errors
// ("Invalid input: expected string, received undefined" 가 폼 인라인 오류로 노출)
// Found by /qa on 2026-07-29
// Report: .gstack/qa-reports/qa-report-localhost-3000-2026-07-29.md

test("API 헬퍼 로드 후 zod 필드 오류가 한국어 우선 정책을 따른다", () => {
  const result = z.object({ domain: z.string() }).safeParse({});
  assert.equal(result.success, false);
  const message = result.error.issues[0]?.message ?? "";
  assert.match(message, /잘못된 입력/);
  assert.doesNotMatch(message, /Invalid input/);
});

test("production API helper에는 SQLite 고유 오류 분기와 raw console logger가 없다", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "lib", "api.ts"), "utf8");
  assert.doesNotMatch(source, /UNIQUE constraint failed|FOREIGN KEY constraint failed/i);
  assert.doesNotMatch(source, /console\.error\s*\(/u);
});
