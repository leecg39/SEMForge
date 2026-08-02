import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_TAB_SLUG,
  POSITION_TRACKING_TABS,
  isValidTabSlug,
  resolveTab,
  toDashboardSection,
} from "@/components/position-tracking/tabs";

test("영상 기준 9개 탭이 순서대로 정의된다", () => {
  assert.equal(POSITION_TRACKING_TABS.length, 9);
  assert.equal(POSITION_TRACKING_TABS[0].slug, DEFAULT_TAB_SLUG);
  assert.equal(POSITION_TRACKING_TABS[0].label, "현황");
});

test("탭 slug 는 중복되지 않는다", () => {
  const slugs = POSITION_TRACKING_TABS.map((tab) => tab.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test("slug 는 URL 에 쓸 수 있는 형태다", () => {
  for (const tab of POSITION_TRACKING_TABS) {
    assert.match(tab.slug, /^[a-z][a-z0-9-]*$/, `${tab.slug} 는 URL 안전하지 않다`);
  }
});

test("이미 구현된 위젯이 있는 탭은 available 이다", () => {
  // 순위 분포와 경쟁자 발견은 독립 컴포넌트가 이미 존재한다.
  for (const slug of ["landscape", "rank-distribution", "tags", "competitors"]) {
    assert.equal(resolveTab(slug).status, "available", `${slug} 는 available 이어야 한다`);
  }
});

test("데이터 소스가 없는 탭은 pending 이며 사유를 반드시 갖는다", () => {
  const pending = POSITION_TRACKING_TABS.filter((tab) => tab.status === "pending");
  assert.ok(pending.length > 0, "준비 중 탭이 있어야 한다");
  for (const tab of pending) {
    assert.ok(
      typeof tab.reason === "string" && tab.reason.trim().length > 0,
      `${tab.slug} 는 준비 중 사유가 있어야 한다`,
    );
  }
});

test("available 탭에는 사유를 붙이지 않는다", () => {
  for (const tab of POSITION_TRACKING_TABS) {
    if (tab.status === "available") {
      assert.equal(tab.reason, undefined, `${tab.slug} 에 불필요한 사유가 붙어 있다`);
    }
  }
});

test("알 수 없는 slug 는 기본 탭으로 되돌린다", () => {
  // 404 로 떨어뜨리지 않고 현황으로 보낸다. 탭은 화면 내 이동이지 별도 페이지가 아니다.
  assert.equal(resolveTab("nope").slug, DEFAULT_TAB_SLUG);
  assert.equal(resolveTab(undefined).slug, DEFAULT_TAB_SLUG);
  assert.equal(resolveTab("").slug, DEFAULT_TAB_SLUG);
});

test("available 탭은 대시보드 내부 섹션으로 매핑된다", () => {
  // 대시보드가 이미 갖고 있던 3개 섹션과 1:1 로 연결한다. 탭 내비게이션을 두 벌 두지 않는다.
  assert.equal(toDashboardSection("landscape"), "overview");
  assert.equal(toDashboardSection("rank-distribution"), "distribution");
  assert.equal(toDashboardSection("tags"), "tags");
  assert.equal(toDashboardSection("competitors"), "discovery");
});

test("준비 중 탭은 대시보드 섹션이 없다", () => {
  for (const slug of ["devices"]) {
    assert.equal(toDashboardSection(slug), null, `${slug} 는 매핑 대상이 아니다`);
  }
});

test("저장된 SERP 스냅샷으로 제공하는 페이지 인사이트 탭은 사용 가능하다", () => {
  for (const slug of ["pages", "cannibalization", "featured-snippets"]) {
    const tab = resolveTab(slug);
    assert.equal(tab.status, "available");
    assert.equal(tab.reason, undefined);
  }
});

test("isValidTabSlug 는 정의된 slug 만 통과시킨다", () => {
  assert.equal(isValidTabSlug("landscape"), true);
  assert.equal(isValidTabSlug("cannibalization"), true);
  assert.equal(isValidTabSlug("nope"), false);
});
