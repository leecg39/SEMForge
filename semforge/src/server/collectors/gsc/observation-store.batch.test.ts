// @TASK P3-C2-T1 - Bounded PostgreSQL GSC observation batches
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/collectors/gsc/observation-store.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type { GscObservation } from "@/server/collectors/gsc/collector";
import { createPostgresGscObservationStore } from "@/server/collectors/gsc/observation-store";

const workspaceId = "56000000-0000-4000-8000-000000000001";

test("501개 관측값은 한 tenant transaction에서 250개 이하 3개 bind-parameter batch로 upsert한다", async () => {
  const events: string[] = [];
  const statements: Array<{ text: string; values: readonly unknown[] }> = [];
  let directPoolQueries = 0;
  const client = {
    async query<T = unknown>(
      text: string,
      values: readonly unknown[] = [],
    ): Promise<{ rows: T[] }> {
      if (/insert into gsc_observations/iu.test(text)) {
        events.push("upsert");
        statements.push({ text, values });
      } else if (/^begin$/iu.test(text)) {
        events.push("begin");
      } else if (/set_config/iu.test(text)) {
        events.push("set_config");
      } else if (/^commit$/iu.test(text)) {
        events.push("commit");
      }
      return { rows: [] };
    },
    release() {
      events.push("release");
    },
  };
  const pool = {
    async query<T = unknown>(): Promise<{ rows: T[] }> {
      directPoolQueries += 1;
      throw new Error("direct pool query forbidden");
    },
    async connect() {
      events.push("connect");
      return client;
    },
  };
  const observations: GscObservation[] = Array.from({ length: 501 }, (_, index) => ({
    observationKey: `key-${index}`,
    workspaceId,
    siteId: "56000000-0000-4000-8000-000000000101",
    bindingId: "56000000-0000-4000-8000-000000000201",
    providerCallId: "56000000-0000-4000-8000-000000000301",
    collectedAt: "2026-08-09T23:01:00.000Z",
    dataDate: "2026-08-06",
    dimensionHash: index.toString(16).padStart(64, "0"),
    dimensions: { query: `sensitive-query-${index}` },
    clicks: index,
    impressions: index + 1,
    ctr: index / (index + 1),
    position: 1,
  }));

  await createPostgresGscObservationStore(pool).upsertMany(observations);

  assert.equal(directPoolQueries, 0);
  assert.deepEqual(events, [
    "connect",
    "begin",
    "set_config",
    "upsert",
    "upsert",
    "upsert",
    "commit",
    "release",
  ]);
  assert.deepEqual(statements.map((statement) => statement.values.length), [3_000, 3_000, 12]);
  assert.ok(statements.every((statement) => !statement.text.includes("sensitive-query-")));
  assert.ok(statements.every((statement) => /\$1/u.test(statement.text)));
});
