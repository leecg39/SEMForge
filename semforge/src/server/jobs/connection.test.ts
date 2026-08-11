// @TASK P3-W1-T1 - Dedicated worker PostgreSQL connection contract
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
// @TEST src/server/jobs/connection.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { withDedicatedWorkerConnection } from "@/server/jobs/connection";

test("job callback은 하나의 connected client를 쓰고 성공·실패 모두 release한다", async () => {
  const events: string[] = [];
  const client = {
    query: async () => ({ rows: [] }),
    release: () => {
      events.push("release");
    },
  };
  const pool = {
    connect: async () => {
      events.push("connect");
      return client;
    },
  };

  const value = await withDedicatedWorkerConnection(pool, async (connected) => {
    assert.equal(connected, client);
    events.push("operation");
    return 42;
  });
  assert.equal(value, 42);
  assert.deepEqual(events, ["connect", "operation", "release"]);

  await assert.rejects(
    withDedicatedWorkerConnection(pool, async () => {
      events.push("failure");
      throw new Error("STORE_FAILED");
    }),
    /STORE_FAILED/,
  );
  assert.deepEqual(events.slice(-3), ["connect", "failure", "release"]);
});
