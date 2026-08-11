// @TASK P4-R1-T1 - Real Chromium Korean PDF contract
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import assert from "node:assert/strict";
import { test } from "node:test";

import { PDFDocument } from "pdf-lib";

import { createChromiumReportRenderer } from "@/server/reports/rendering/pdf";
import type { WeeklyReportSnapshot } from "@/server/reports/types";

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function longPartialSnapshot(): WeeklyReportSnapshot {
  const observations = Array.from({ length: 90 }, (_, index) => ({
    query: `한글 장문 키워드 ${index + 1} — 검색 엔진 최적화 성과를 자세히 확인하는 문장`,
    position: index % 20 + 1,
    resultTitle: `주간 검색 성과 분석 ${index + 1}`,
    resultUrl: `https://example.test/results/${index + 1}`,
  }));
  const unavailable = (key: "aio" | "naver") => ({
    key,
    available: false as const,
    unavailableReason: "provider_data_missing",
    capturedAt: "2026-08-09T23:00:00.000Z",
    data: {},
  });
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
      name: "서울 검색 연구소",
      logoUrl: "https://cdn.example.test/broken-logo.png",
      accentColor: "#155eef",
    },
    sections: {
      rank: {
        key: "rank",
        available: true,
        unavailableReason: null,
        capturedAt: "2026-08-09T09:30:00.000Z",
        data: { observations },
      },
      aio: unavailable("aio"),
      naver: unavailable("naver"),
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

test("실제 Chromium은 Noto Sans KR로 장문·빈·partial·깨진 로고 snapshot을 다중 페이지 PDF로 만든다", async (context) => {
  if (process.platform !== "darwin") return context.skip("macOS Chrome integration evidence");
  const renderer = createChromiumReportRenderer({
    executablePath: chrome,
    fetch: async () => new Response("broken", { status: 404 }),
  });

  const rendered = await renderer.render(longPartialSnapshot());
  assert.equal(Buffer.from(rendered.pdf).subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(rendered.pdf.byteLength > 100_000);
  assert.match(rendered.html, /Noto Sans KR/);
  assert.match(rendered.html, /한글 장문 키워드 90/);
  assert.match(rendered.html, /sf-logo-fallback/);
  assert.equal(rendered.snapshotSha256.length, 64);

  const parsed = await PDFDocument.load(rendered.pdf);
  assert.ok(parsed.getPageCount() >= 5);
});
