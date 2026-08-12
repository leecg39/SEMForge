// @TASK P5-PRIVACY-DIRECT-API - Shared-operation access port contract
// @SPEC docs/ops/privacy-erasure-runbook.md
// @TEST src/server/privacy/access.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WorkspacePrivacyOperationBlockedError,
  createRuntimeWorkspacePrivacyFence,
  runWorkspaceSharedOperation,
  type WorkspaceSharedOperationPort,
} from "@/server/privacy/access";

const workspaceId = "8f100000-0000-4000-8000-000000000001";

test("active workspace는 shared-operation 결과를 반환한다", async () => {
  const access: WorkspaceSharedOperationPort = {
    async withShared(_workspaceId, operation) {
      return { disposition: "executed", value: await operation() };
    },
  };

  assert.equal(
    await runWorkspaceSharedOperation(access, workspaceId, async () => "executed"),
    "executed",
  );
});

for (const state of ["blocking", "erased"] as const) {
  test(`${state} workspace는 operation을 실행하지 않고 typed conflict를 반환한다`, async () => {
    let called = 0;
    const access: WorkspaceSharedOperationPort = {
      async withShared() {
        return { disposition: "skipped", state };
      },
    };

    await assert.rejects(
      runWorkspaceSharedOperation(access, workspaceId, async () => {
        called += 1;
      }),
      (error: unknown) =>
        error instanceof WorkspacePrivacyOperationBlockedError &&
        error.workspaceState === state,
    );
    assert.equal(called, 0);
  });
}

test("production adapter는 주입된 전용 pool의 PostgreSQL fence를 사용한다", async () => {
  const statements: string[] = [];
  const access = createRuntimeWorkspacePrivacyFence({
    async connect() {
      return {
        async query<T>(text: string) {
          statements.push(text);
          if (text.includes("select state::text")) {
            return { rows: [{ state: "active" }] as T[] };
          }
          if (text.includes("pg_advisory_unlock_shared")) {
            return { rows: [{ unlocked: true }] as T[] };
          }
          return { rows: [] as T[] };
        },
        release() {},
      };
    },
  });

  assert.equal(
    await runWorkspaceSharedOperation(access, workspaceId, async () => "runtime"),
    "runtime",
  );
  assert.ok(statements.some((statement) => statement.includes("pg_advisory_lock_shared")));
  assert.ok(statements.some((statement) => statement.includes("workspace_privacy_controls")));
});
