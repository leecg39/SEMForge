// @TASK P3-C2-T1 - GSC Search Analytics HTTP fixture contract
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/collectors/gsc/client.ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import {
  GscSearchAnalyticsError,
  createGscSearchAnalyticsClient,
} from "@/server/collectors/gsc/client";

const fixturePath = path.join(
  process.cwd(),
  "src/server/collectors/gsc/fixtures/search-analytics-top-queries.json",
);

test("query는 property를 URL 인코딩하고 bearer 인증과 기간·dimension·rowLimit을 전송해 엄격한 행으로 정규화한다", async () => {
  const fixture = await readFile(fixturePath, "utf8");
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = createGscSearchAnalyticsClient({
    fetchImpl: async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(fixture, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const rows = await client.query("access-secret", "sc-domain:example.com", {
    startDate: "2026-07-31",
    endDate: "2026-08-06",
    dimensions: ["query"],
    rowLimit: 10,
  });

  assert.equal(
    requests[0]?.url,
    "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aexample.com/searchAnalytics/query",
  );
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-secret");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    startDate: "2026-07-31",
    endDate: "2026-08-06",
    dimensions: ["query"],
    rowLimit: 10,
  });
  assert.deepEqual(rows, [
    {
      dimensions: { query: "semforge" },
      clicks: 21,
      impressions: 105,
      ctr: 0.2,
      position: 3.75,
    },
    {
      dimensions: { query: "주간 검색 리포트" },
      clicks: 8,
      impressions: 80,
      ctr: 0.1,
      position: 6.5,
    },
  ]);
});

test("query는 잘못된 date dimension fixture를 거부하고 provider 원문을 오류에 포함하지 않는다", async () => {
  const fixture = await readFile(
    path.join(
      process.cwd(),
      "src/server/collectors/gsc/fixtures/search-analytics-invalid-date.json",
    ),
    "utf8",
  );
  const client = createGscSearchAnalyticsClient({
    fetchImpl: async () => new Response(fixture, { status: 200 }),
  });

  await assert.rejects(
    client.query("never-log-this-token", "https://example.com/", {
      startDate: "2026-07-31",
      endDate: "2026-08-06",
      dimensions: ["date"],
      rowLimit: 1_000,
    }),
    (error: unknown) => {
      assert.ok(error instanceof GscSearchAnalyticsError);
      assert.equal(error.code, "INVALID_RESPONSE");
      assert.doesNotMatch(error.message, /provider-raw|never-log-this-token|example\.com/u);
      return true;
    },
  );
});
