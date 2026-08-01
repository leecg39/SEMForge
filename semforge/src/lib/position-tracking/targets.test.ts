import assert from "node:assert/strict";
import { test } from "node:test";
import {
  matchesTrackingTarget,
  normalizeHostname,
  normalizeTrackingTarget,
  registrableDomain,
} from "@/lib/position-tracking/targets";

test("루트 도메인은 모든 서브도메인을 포함한다", () => {
  assert.equal(registrableDomain("www.uinus.co.kr"), "uinus.co.kr");
  assert.equal(matchesTrackingTarget("https://www.uinus.co.kr/a", "root_domain", "uinus.co.kr"), true);
  assert.equal(matchesTrackingTarget("https://shop.uinus.co.kr/a", "root_domain", "uinus.co.kr"), true);
  assert.equal(matchesTrackingTarget("https://notuinus.co.kr/a", "root_domain", "uinus.co.kr"), false);
});

test("서브도메인은 www와 루트 도메인을 구분하고 하위 호스트만 포함한다", () => {
  assert.equal(matchesTrackingTarget("https://www.uinus.co.kr", "subdomain", "www.uinus.co.kr"), true);
  assert.equal(matchesTrackingTarget("https://deep.www.uinus.co.kr", "subdomain", "www.uinus.co.kr"), true);
  assert.equal(matchesTrackingTarget("https://uinus.co.kr", "subdomain", "www.uinus.co.kr"), false);
});

test("정확한 URL은 쿼리·fragment·후행 슬래시를 제외하고 비교한다", () => {
  const target = normalizeTrackingTarget("exact_url", "https://www.uinus.co.kr/service/?utm=x#top");
  assert.equal(target, "https://www.uinus.co.kr/service");
  assert.equal(matchesTrackingTarget("https://www.uinus.co.kr/service/?a=1#x", "exact_url", target), true);
  assert.equal(matchesTrackingTarget("https://www.uinus.co.kr/service/child", "exact_url", target), false);
});

test("하위 폴더는 경로 세그먼트 경계를 지킨다", () => {
  assert.equal(matchesTrackingTarget("https://example.com/blog/post", "subfolder", "https://example.com/blog"), true);
  assert.equal(matchesTrackingTarget("https://example.com/blog", "subfolder", "https://example.com/blog"), true);
  assert.equal(matchesTrackingTarget("https://example.com/blogger", "subfolder", "https://example.com/blog"), false);
  assert.equal(matchesTrackingTarget("https://m.example.com/blog", "subfolder", "https://example.com/blog"), false);
});

test("IDN 호스트는 URL 표준 punycode로 안정적으로 정규화한다", () => {
  assert.equal(normalizeHostname("https://예시.한국/경로"), "xn--vv4b11d.xn--3e0b707e");
});
