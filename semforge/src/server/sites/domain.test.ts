// @TASK P2-S1-T1 - Site domain normalization and SSRF-safe registration
// @SPEC docs/planning/06-tasks.md#p2-s1-t1--사이트와-추적-항목-api
// @TEST src/server/sites/domain.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertPublicSiteDomain,
  isPublicIpAddress,
  normalizeSiteDomain,
} from "@/server/sites/domain";

test("사이트 도메인은 URL 또는 bare IDNA domain을 canonical ASCII host로 정규화한다", () => {
  assert.equal(normalizeSiteDomain(" HTTPS://WWW.Example.COM./ "), "www.example.com");
  assert.equal(normalizeSiteDomain("https://예시.한국"), "xn--vv4b11d.xn--3e0b707e");
  assert.equal(normalizeSiteDomain("예시.한국"), "xn--vv4b11d.xn--3e0b707e");
});

test("사이트 도메인은 경로, 자격 증명, 포트, IP와 내부용 host를 거부한다", () => {
  for (const value of [
    "https://example.com/admin",
    "https://user:pass@example.com",
    "https://example.com:8443",
    "http://127.0.0.1",
    "http://[::1]",
    "localhost",
    "metadata.google.internal",
    "service.local",
  ]) {
    assert.throws(() => normalizeSiteDomain(value), /도메인/);
  }
});

test("공개 IP 판정은 private, loopback, link-local, documentation 대역을 차단한다", () => {
  for (const address of [
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "192.0.2.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
  ]) {
    assert.equal(isPublicIpAddress(address), false, address);
  }
  assert.equal(isPublicIpAddress("8.8.8.8"), true);
  assert.equal(isPublicIpAddress("2606:4700:4700::1111"), true);
});

test("등록 안전성 검사는 DNS 결과가 없거나 하나라도 비공개 주소이면 거부한다", async () => {
  await assert.rejects(
    assertPublicSiteDomain("safe.example.co.kr", async () => []),
    /확인할 수 없습니다/,
  );
  await assert.rejects(
    assertPublicSiteDomain("mixed.example.co.kr", async () => [
      "8.8.8.8",
      "10.0.0.1",
    ]),
    /공개 주소/,
  );
  await assert.doesNotReject(
    assertPublicSiteDomain("public.example.co.kr", async () => [
      "8.8.8.8",
      "2606:4700:4700::1111",
    ]),
  );
});
