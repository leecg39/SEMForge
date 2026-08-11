// @TASK P4-R1-T1 - Immutable snapshot report HTML contract
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import assert from "node:assert/strict";
import { test } from "node:test";

import { renderReportHtml } from "@/server/reports/rendering/html";
import type { WeeklyReportSnapshot } from "@/server/reports/types";

function snapshot(): WeeklyReportSnapshot {
  return {
    version: 1,
    capturedAt: "2026-08-09T23:00:00.000Z",
    schedule: {
      timezone: "Asia/Seoul",
      collectionAt: "2026-08-09T09:00:00.000Z",
      retryCutoffAt: "2026-08-09T22:00:00.000Z",
      snapshotAt: "2026-08-09T23:00:00.000Z",
    },
    period: {
      timezone: "America/Los_Angeles",
      current: { start: "2026-07-31", end: "2026-08-06" },
      comparison: { start: "2026-07-24", end: "2026-07-30" },
    },
    brand: {
      name: "서울 검색 연구소 <script>alert(1)</script>",
      logoUrl: "https://cdn.example.test/logo.png",
      accentColor: "#155eef",
    },
    sections: {
      rank: {
        key: "rank",
        available: true,
        unavailableReason: null,
        capturedAt: "2026-08-09T09:30:00.000Z",
        data: {
          observations: [{
            query: "한글 검색 순위",
            position: 3,
            resultTitle: "주간 성과",
            resultUrl: "https://example.test/result?token=secret-url-token",
            accessToken: "secret-token-must-never-render",
          }],
        },
      },
      aio: {
        key: "aio",
        available: false,
        unavailableReason: "provider_data_missing",
        capturedAt: "2026-08-09T23:00:00.000Z",
        data: {},
      },
      naver: {
        key: "naver",
        available: false,
        unavailableReason: "provider_data_missing",
        capturedAt: "2026-08-09T23:00:00.000Z",
        data: {},
      },
      gsc: {
        key: "gsc",
        available: true,
        unavailableReason: null,
        capturedAt: "2026-08-09T21:00:00.000Z",
        data: { current: [], comparison: [] },
      },
    },
  };
}

test("동일 snapshot HTML은 한글·partial·빈 데이터를 표현하고 비밀값과 HTML을 안전하게 처리한다", () => {
  const rendered = renderReportHtml(snapshot(), {
    fontDataUri: "data:font/woff2;base64,Zm9udA==",
    logoDataUri: null,
  });

  assert.equal(rendered.snapshotSha256, "2a56b64470a9b6aab1ee297a566d083e1a9b0369ec4c2189e0c985f4a64e380f");
  assert.match(rendered.html, /lang="ko"/);
  assert.match(rendered.html, /서울 검색 연구소 &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(rendered.html, /한글 검색 순위/);
  assert.match(rendered.html, /확인 불가/);
  assert.match(rendered.html, /데이터가 없습니다/);
  assert.match(rendered.html, /data-snapshot-sha256="2a56b644/);
  assert.match(rendered.html, /Noto Sans KR/);
  assert.match(rendered.html, /sf-logo-fallback/);
  assert.doesNotMatch(rendered.html, /secret-token-must-never-render/);
  assert.doesNotMatch(rendered.html, /secret-url-token/);
  assert.doesNotMatch(rendered.html, /<script>alert/);
});
