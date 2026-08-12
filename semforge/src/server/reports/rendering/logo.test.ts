// @TASK P4-R1-T1 - Safe immutable report logo loading contract
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import assert from "node:assert/strict";
import { test } from "node:test";

import sharp from "sharp";

import { loadReportLogo } from "@/server/reports/rendering/logo";

const resolvePublicHost = async () => ["93.184.216.34"] as const;

test("깨진 로고와 허용량을 넘는 로고는 대체 표시로 안전하게 복구한다", async () => {
  const broken = await loadReportLogo("https://cdn.example.test/broken.png", {
    fetch: async () => new Response("not found", { status: 404 }),
    resolveHostname: resolvePublicHost,
  });
  assert.equal(broken, null);

  const oversized = await loadReportLogo("https://cdn.example.test/huge.png", {
    fetch: async () => new Response(new Uint8Array(1_100_000), {
      headers: { "content-type": "image/png", "content-length": "1100000" },
    }),
    resolveHostname: resolvePublicHost,
  });
  assert.equal(oversized, null);
});

test("큰 픽셀 치수의 정상 로고는 PDF 안전 크기 PNG data URI로 고정한다", async () => {
  const source = await sharp({
    create: { width: 2400, height: 800, channels: 4, background: "#155eef" },
  }).png().toBuffer();
  const resolved = await loadReportLogo("https://cdn.example.test/large-logo.png", {
    fetch: async () => new Response(source, { headers: { "content-type": "image/png" } }),
    resolveHostname: resolvePublicHost,
  });

  assert.ok(resolved?.startsWith("data:image/png;base64,"));
  const output = Buffer.from(resolved!.split(",", 2)[1]!, "base64");
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 600);
  assert.equal(metadata.height, 200);
});

test("DNS가 private 주소로 해석되는 로고 호스트는 네트워크 요청 전에 거부한다", async () => {
  let fetched = false;
  const resolved = await loadReportLogo("https://metadata.attacker.test/logo.png", {
    fetch: async () => {
      fetched = true;
      return new Response("must not fetch");
    },
    resolveHostname: async () => ["169.254.169.254"],
  });

  assert.equal(resolved, null);
  assert.equal(fetched, false);
});

test("압축된 IPv4-mapped IPv6 private 주소는 로고 요청 전에 거부한다", async () => {
  for (const address of [
    "::ffff:7f00:1",
    "::ffff:a00:1",
    "::ffff:a9fe:a9fe",
    "::ffff:c0a8:101",
  ]) {
    let fetched = false;
    const resolved = await loadReportLogo("https://mapped.attacker.test/logo.png", {
      fetch: async () => {
        fetched = true;
        return new Response("must not fetch");
      },
      resolveHostname: async () => [address],
    });

    assert.equal(resolved, null, address);
    assert.equal(fetched, false, address);
  }
});
