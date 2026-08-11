// @TASK P4-R1-T1 - Safe immutable report logo loading contract
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import assert from "node:assert/strict";
import { test } from "node:test";

import sharp from "sharp";

import { loadReportLogo } from "@/server/reports/rendering/logo";

test("깨진 로고와 허용량을 넘는 로고는 대체 표시로 안전하게 복구한다", async () => {
  const broken = await loadReportLogo("https://cdn.example.test/broken.png", {
    fetch: async () => new Response("not found", { status: 404 }),
  });
  assert.equal(broken, null);

  const oversized = await loadReportLogo("https://cdn.example.test/huge.png", {
    fetch: async () => new Response(new Uint8Array(1_100_000), {
      headers: { "content-type": "image/png", "content-length": "1100000" },
    }),
  });
  assert.equal(oversized, null);
});

test("큰 픽셀 치수의 정상 로고는 PDF 안전 크기 PNG data URI로 고정한다", async () => {
  const source = await sharp({
    create: { width: 2400, height: 800, channels: 4, background: "#155eef" },
  }).png().toBuffer();
  const resolved = await loadReportLogo("https://cdn.example.test/large-logo.png", {
    fetch: async () => new Response(source, { headers: { "content-type": "image/png" } }),
  });

  assert.ok(resolved?.startsWith("data:image/png;base64,"));
  const output = Buffer.from(resolved!.split(",", 2)[1]!, "base64");
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 600);
  assert.equal(metadata.height, 200);
});
