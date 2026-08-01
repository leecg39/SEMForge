import assert from "node:assert/strict";
import test from "node:test";
import { isPublicAddress, normalizeDomainInput } from "@/server/siteaudit/domain";

test("domain input is normalized to a hostname", () => {
  assert.equal(normalizeDomainInput(" HTTPS://Example.COM/ "), "example.com");
  assert.equal(normalizeDomainInput("blog.example.co.kr"), "blog.example.co.kr");
});

test("domain input rejects paths, credentials, IP literals, and ports", () => {
  assert.throws(() => normalizeDomainInput("example.com/private"), /하위 폴더/);
  assert.throws(() => normalizeDomainInput("https://user:pass@example.com"), /HTTP/);
  assert.throws(() => normalizeDomainInput("127.0.0.1"), /공개 도메인/);
  assert.throws(() => normalizeDomainInput("example.com:8080"), /포트/);
});

test("private and reserved addresses are blocked", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "::1", "fd00::1"]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});
