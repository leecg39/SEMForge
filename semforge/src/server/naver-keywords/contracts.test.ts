import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allSectionsFailed,
  liveSection,
  unavailableSection,
} from "@/server/naver-keywords/contracts";

const now = new Date("2026-08-04T00:00:00.000Z");
const expiresAt = new Date("2026-08-11T00:00:00.000Z");

test("live 봉투는 출처·측정 방식·캐시·시간을 모두 보존한다", () => {
  const section = liveSection({
    data: { ratio: 73 },
    source: "naver-api-hub-search-trend",
    measurement: "relative",
    cache: "fresh",
    fetchedAt: now,
    expiresAt,
  });

  assert.deepEqual(section, {
    status: "live",
    cache: "fresh",
    measurement: "relative",
    source: "naver-api-hub-search-trend",
    fetchedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    data: { ratio: 73 },
  });
});

test("사용 불가 봉투는 가짜 데이터를 넣지 않는다", () => {
  const section = unavailableSection({
    source: "naver-search-ads",
    measurement: "absolute",
    reason: "Search Ads 자격증명이 설정되지 않았습니다.",
    now,
  });

  assert.equal(section.status, "unavailable");
  assert.equal("data" in section, false);
  assert.equal(section.reason, "Search Ads 자격증명이 설정되지 않았습니다.");
});

test("일부 섹션이 live면 부분 성공이고 전부 실패한 경우만 전체 실패다", () => {
  const unavailable = unavailableSection({
    source: "naver-search-ads",
    measurement: "absolute",
    reason: "연결 필요",
    now,
  });
  const live = liveSection({
    data: [],
    source: "naver-api-hub-blog-search",
    measurement: "absolute",
    cache: "fresh",
    fetchedAt: now,
    expiresAt,
  });

  assert.equal(allSectionsFailed([unavailable, live]), false);
  assert.equal(allSectionsFailed([unavailable]), true);
});
