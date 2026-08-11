// @TASK P3-C2-GSC-PIN - Pin GSC web-store transactions to one PostgreSQL connection
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/gsc/store.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { type SqlQueryable, saveGscOAuthState } from "@/server/gsc/store";

const workspaceId = "30000000-0000-4000-8000-000000000001";

function oauthStateInput() {
  return {
    workspaceId,
    userId: "30000000-0000-4000-8000-000000000101",
    stateHash: "a".repeat(64),
    connectionLabel: "운영 GSC",
    returnPath: "/app/settings",
    expiresAt: new Date("2026-08-12T01:00:00.000Z"),
  };
}

class FakePoolClient implements SqlQueryable {
  constructor(
    private readonly events: string[],
    private readonly failOperation = false,
  ) {}

  async query<T = unknown>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }> {
    const sql = text.replace(/\s+/gu, " ").trim().toLowerCase();
    if (sql === "begin" || sql === "commit" || sql === "rollback") {
      this.events.push(sql);
    } else if (sql.startsWith("select set_config")) {
      this.events.push(`set-workspace:${String(values?.[0])}`);
    } else if (sql.startsWith("insert into oauth_states")) {
      this.events.push("insert-oauth-state");
      if (this.failOperation) throw new Error("STORE_FAILED");
    } else {
      throw new Error(`UNEXPECTED_SQL:${sql}`);
    }
    return { rows: [] as T[] };
  }

  release(): void {
    this.events.push("release");
  }
}

class FakePool implements SqlQueryable {
  constructor(
    private readonly events: string[],
    private readonly client: FakePoolClient,
  ) {}

  async query<T = unknown>(): Promise<{ rows: T[] }> {
    throw new Error("TOP_LEVEL_POOL_QUERY_MUST_NOT_RUN");
  }

  async connect(): Promise<FakePoolClient> {
    this.events.push("connect");
    return this.client;
  }
}

test("GSC store는 Pool transaction을 하나의 client에 고정하고 성공·실패 후 release한다", async () => {
  const successEvents: string[] = [];
  const successPool = new FakePool(successEvents, new FakePoolClient(successEvents));

  await saveGscOAuthState(successPool, oauthStateInput());

  assert.deepEqual(successEvents, [
    "connect",
    "begin",
    `set-workspace:${workspaceId}`,
    "insert-oauth-state",
    "commit",
    "release",
  ]);

  const failureEvents: string[] = [];
  const failurePool = new FakePool(failureEvents, new FakePoolClient(failureEvents, true));

  await assert.rejects(saveGscOAuthState(failurePool, oauthStateInput()), /STORE_FAILED/u);
  assert.deepEqual(failureEvents, [
    "connect",
    "begin",
    `set-workspace:${workspaceId}`,
    "insert-oauth-state",
    "rollback",
    "release",
  ]);
});
