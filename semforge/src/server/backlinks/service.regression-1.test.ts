import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import type { BacklinkAnchorRow } from "@/server/backlinks/contracts";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "backlinks-csv-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

// Regression: ISSUE-004 — 백링크 CSV의 URL·앵커가 스프레드시트 수식으로 실행될 수 있었음
// Found by /qa on 2026-08-04
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-04.md
test("백링크 CSV는 스프레드시트 수식 시작 문자를 모두 비활성화한다", async () => {
  const { backlinkRowsCsv } = await import("@/server/backlinks/service");
  const dangerous = ["=HYPERLINK(\"https://evil.example\")", "+SUM(A:A)", "-1+2", "@cmd"];
  const rows: BacklinkAnchorRow[] = dangerous.map((anchor) => ({
    kind: "anchors",
    anchor,
    backlinks: 1,
    referringDomains: 1,
    firstSeenAt: null,
    lastSeenAt: null,
  }));

  const csv = backlinkRowsCsv(rows);
  assert.match(csv, /'\=HYPERLINK\(""https:\/\/evil\.example""\)/);
  assert.match(csv, /'\+SUM\(A:A\)/);
  assert.match(csv, /'-1\+2/);
  assert.match(csv, /'@cmd/);
});
