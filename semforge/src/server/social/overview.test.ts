import assert from "node:assert/strict";
import test from "node:test";
import { buildSocialRecommendations } from "./overview";

test("연결 전에는 프로필 연결과 빈 일정 권장사항을 실제 경로로 제공한다", () => {
  const rows = buildSocialRecommendations({
    fid: "f1",
    profiles: 0,
    published: 0,
    previousPublished: 0,
    scheduled: 0,
    failed: 0,
    reconnect: 0,
  });
  assert.equal(rows[0]?.id, "connect");
  assert.equal(rows[0]?.href, "/social-media/?fid=f1#connections");
  assert.equal(
    rows.some((row) => row.title.includes("AI")),
    false,
  );
});

test("발행 실패·인증 만료·활동 감소는 우선 권장사항으로 계산한다", () => {
  const rows = buildSocialRecommendations({
    fid: "f1",
    profiles: 3,
    published: 1,
    previousPublished: 5,
    scheduled: 2,
    failed: 2,
    reconnect: 1,
  });
  assert.deepEqual(
    rows.map((row) => row.id),
    ["reconnect", "retry", "activity"],
  );
  assert.match(
    rows.find((row) => row.id === "retry")?.href ?? "",
    /\/social-media\/poster\/\?fid=f1#failed/u,
  );
});
