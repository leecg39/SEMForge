// @TASK P5-PRIVACY-FENCE - Workspace erasure vs tenant side-effect fencing
// @SPEC docs/ops/privacy-erasure-runbook.md
// @TEST src/server/privacy/fence.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PostgresWorkspacePrivacyFence,
  type WorkspacePrivacyFenceConnection,
} from "@/server/privacy/fence";

type QueryResult = { readonly rows: readonly Record<string, unknown>[] };
class ScriptedConnection implements WorkspacePrivacyFenceConnection {
  readonly statements: string[] = [];
  readonly releases: boolean[] = [];
  constructor(private readonly replies: QueryResult[]) {}
  async query<T = unknown>(text: string) {
    this.statements.push(text.replaceAll(/\s+/gu, " ").trim());
    const reply = this.replies.shift();
    if (!reply) throw new Error(`unexpected query: ${text}`);
    return reply as { rows: T[] };
  }
  release(destroy = false): void { this.releases.push(Boolean(destroy)); }
}

const empty = { rows: [] } as const;
const active = { rows: [{ state: "active" }] } as const;
const blocking = { rows: [{ state: "blocking" }] } as const;
const erased = { rows: [{ state: "erased" }] } as const;
const unlocked = { rows: [{ unlocked: true }] } as const;
const workspaceId = "8f000000-0000-4000-8000-000000000001";

function pool(connection: ScriptedConnection) { return { connect: async () => connection }; }

test("active shared fence는 RLS transaction의 DB를 callback에 전달하고 unlock 뒤 session을 반환한다", async () => {
  const connection = new ScriptedConnection([empty, empty, empty, active, empty, unlocked]);
  const fence = new PostgresWorkspacePrivacyFence(pool(connection));
  const result = await fence.withShared(workspaceId, async (db) => {
    assert.equal(db, connection);
    return "executed";
  });
  assert.deepEqual(result, { disposition: "executed", value: "executed" });
  assert.match(connection.statements[0]!, /pg_advisory_lock_shared/u);
  assert.equal(connection.statements[1], "begin");
  assert.match(connection.statements[2]!, /set_config\('app\.workspace_id'/u);
  assert.match(connection.statements[3]!, /workspace_privacy_controls/u);
  assert.equal(connection.statements[4], "commit");
  assert.match(connection.statements[5]!, /pg_advisory_unlock_shared/u);
  assert.deepEqual(connection.releases, [false]);
});

for (const state of ["blocking", "erased"] as const) {
  test(`${state} job은 delegate/provider를 0회 호출하고 terminal-success다`, async () => {
    const connection = new ScriptedConnection([
      empty, empty, empty, state === "blocking" ? blocking : erased, empty, unlocked,
    ]);
    let delegates = 0;
    const result = await new PostgresWorkspacePrivacyFence(pool(connection)).withShared(
      workspaceId,
      async () => { delegates += 1; return "called"; },
    );
    assert.deepEqual(result, { disposition: "skipped", state });
    assert.equal(delegates, 0);
  });
}

test("control row missing은 blocking-equivalent terminal skip으로 fail-closed다", async () => {
  const connection = new ScriptedConnection([empty, empty, empty, { rows: [] }, empty, unlocked]);
  let delegates = 0;
  const result = await new PostgresWorkspacePrivacyFence(pool(connection)).withShared(
    workspaceId,
    async () => { delegates += 1; return "called"; },
  );
  assert.deepEqual(result, { disposition: "skipped", state: "blocking" });
  assert.equal(delegates, 0);
});

test("unlock 검증 실패는 connection을 폐기해 advisory lock을 pool에 누출하지 않는다", async () => {
  const connection = new ScriptedConnection([
    empty, empty, empty, active, empty, { rows: [{ unlocked: false }] },
  ]);
  await assert.rejects(
    new PostgresWorkspacePrivacyFence(pool(connection)).withShared(workspaceId, async () => "done"),
    /WORKSPACE_PRIVACY_FENCE_UNLOCK_FAILED/u,
  );
  assert.deepEqual(connection.releases, [true]);
});

test("multi-workspace shared fence는 한 session에서 정렬 잠금하고 blocking이면 identity delegate 0회다", async () => {
  const workspaceB = "8f000000-0000-4000-8000-000000000009";
  const connection = new ScriptedConnection([
    empty, empty, empty,
    empty, active,
    empty, blocking,
    empty,
    unlocked, unlocked,
  ]);
  let delegates = 0;
  const result = await new PostgresWorkspacePrivacyFence(pool(connection)).withSharedMany(
    [workspaceB, workspaceId, workspaceB],
    async () => { delegates += 1; return "called"; },
  );
  assert.deepEqual(result, { disposition: "skipped", state: "blocking" });
  assert.equal(delegates, 0);
  assert.equal(connection.statements.filter((value) => /pg_advisory_lock_shared/u.test(value)).length, 2);
  assert.equal(connection.statements.filter((value) => /pg_advisory_unlock_shared/u.test(value)).length, 2);
  assert.deepEqual(connection.releases, [false]);
});

test("erasure는 block commit→exclusive wait→external→local erase+erased+completed 단일 commit 순서다", async () => {
  const marker = { rows: [{ marker: "external-finished" }] } as const;
  const connection = new ScriptedConnection([
    empty, empty, blocking, empty, empty,
    empty, empty, marker, empty,
    empty, empty, empty, empty, erased, empty, empty, unlocked,
  ]);
  const fence = new PostgresWorkspacePrivacyFence(pool(connection));
  const result = await fence.withExclusiveErasure({
    workspaceId,
    requestUuid: "8f000000-0000-4000-8000-000000000004",
    operatorId: "operator:test",
    now: new Date("2026-08-12T11:00:00.000Z"),
  }, async (db) => (await db.query<{ marker: string }>(
    "select 'external-finished' as marker",
  )).rows[0]!.marker);

  assert.equal(result, "external-finished");
  const statements = connection.statements;
  const blockCommit = statements.indexOf("commit");
  const lock = statements.findIndex((value) => /pg_advisory_lock\(/u.test(value));
  const external = statements.findIndex((value) => /external-finished/u.test(value));
  const erase = statements.findIndex((value) => /privacy_erase_workspace/u.test(value));
  const localStep = statements.findIndex((value) => /privacy_record_request_step/u.test(value));
  const marked = statements.findIndex((value) => /privacy_mark_workspace_erased/u.test(value));
  const finished = statements.findIndex((value) => /privacy_finish_request/u.test(value));
  const finalCommit = statements.lastIndexOf("commit");
  assert.ok(blockCommit < lock && lock < external && external < erase);
  assert.ok(erase < localStep && localStep < marked && marked < finished && finished < finalCommit);
  assert.match(statements.at(-1)!, /pg_advisory_unlock/u);
  assert.deepEqual(connection.releases, [false]);
});

test("external 실패는 local erase/erased/completed를 호출하지 않고 durable blocking을 유지한다", async () => {
  const connection = new ScriptedConnection([empty, empty, blocking, empty, empty, unlocked]);
  await assert.rejects(
    new PostgresWorkspacePrivacyFence(pool(connection)).withExclusiveErasure({
      workspaceId,
      requestUuid: "8f000000-0000-4000-8000-000000000005",
      operatorId: "operator:test",
      now: new Date("2026-08-12T11:00:00.000Z"),
    }, async () => { throw new Error("provider failed"); }),
    /provider failed/u,
  );
  assert.equal(connection.statements.some((value) => /privacy_erase_workspace/u.test(value)), false);
  assert.equal(connection.statements.some((value) => /privacy_mark_workspace_erased/u.test(value)), false);
  assert.equal(connection.statements.some((value) => /privacy_finish_request/u.test(value)), false);
  assert.match(connection.statements.at(-1)!, /pg_advisory_unlock/u);
});
