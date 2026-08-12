// @TASK P5-PRIVACY-FENCE - Tenant mutation shared-operation guard contract
// @SPEC docs/ops/privacy-erasure-runbook.md
// @TEST src/server/privacy/operation.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  WorkspacePrivacyFence,
  WorkspacePrivacyFenceSql,
} from "@/server/privacy/fence";
import {
  createRuntimeWorkspacePrivacyOperationGuard,
  createWorkspacePrivacyOperationGuard,
  missingWorkspacePrivacyOperationGuard,
  WorkspacePrivacyOperationBlockedError,
  WorkspacePrivacyOperationConfigurationError,
} from "@/server/privacy/operation";

const database: WorkspacePrivacyFenceSql = {
  async query<T>() {
    return { rows: [] as T[] };
  },
};

function fenceWithShared(
  withShared: WorkspacePrivacyFence["withShared"],
): WorkspacePrivacyFence {
  return {
    withShared,
    async withSharedState() {
      throw new Error("not used");
    },
    async withExclusiveErasure() {
      throw new Error("not used");
    },
  };
}

test("active workspace operation은 fence가 제공한 pinned database에서 실행한다", async () => {
  const workspaceId = "7f000000-0000-4000-8000-000000000001";
  const guard = createWorkspacePrivacyOperationGuard(fenceWithShared(
    async (actualWorkspaceId, operation) => {
      assert.equal(actualWorkspaceId, workspaceId);
      return { disposition: "executed", value: await operation(database) };
    },
  ));

  const value = await guard.withShared(workspaceId, async (actualDatabase) => {
    assert.equal(actualDatabase, database);
    return "committed";
  });
  assert.equal(value, "committed");
});

for (const state of ["blocking", "erased"] as const) {
  test(`${state} workspace operation은 delegate를 실행하지 않고 typed block을 반환한다`, async () => {
    let delegates = 0;
    const guard = createWorkspacePrivacyOperationGuard(fenceWithShared(
      async () => ({ disposition: "skipped", state }),
    ));

    await assert.rejects(
      guard.withShared("7f000000-0000-4000-8000-000000000001", async () => {
        delegates += 1;
        return "must not run";
      }),
      (error: unknown) => {
        assert.equal(error instanceof WorkspacePrivacyOperationBlockedError, true);
        assert.equal((error as WorkspacePrivacyOperationBlockedError).state, state);
        return true;
      },
    );
    assert.equal(delegates, 0);
  });
}

test("guard DI 누락은 identity 실행 없이 fail-closed로 닫힌다", async () => {
  let delegates = 0;
  await assert.rejects(
    missingWorkspacePrivacyOperationGuard.withShared(
      "7f000000-0000-4000-8000-000000000001",
      async () => {
        delegates += 1;
        return "must not run";
      },
    ),
    WorkspacePrivacyOperationConfigurationError,
  );
  assert.equal(delegates, 0);
});

test("runtime operation guard는 dedicated web fence pool의 pinned transaction을 사용한다", async () => {
  const statements: string[] = [];
  let released = false;
  const guard = createRuntimeWorkspacePrivacyOperationGuard({
    async connect() {
      return {
        async query<T>(text: string) {
          statements.push(text.replace(/\s+/gu, " ").trim());
          if (text.includes("workspace_privacy_controls")) {
            return { rows: [{ state: "active" }] as T[] };
          }
          if (text.includes("pg_advisory_unlock_shared")) {
            return { rows: [{ unlocked: true }] as T[] };
          }
          return { rows: [] as T[] };
        },
        release() {
          released = true;
        },
      };
    },
  });

  const value = await guard.withShared(
    "7f000000-0000-4000-8000-000000000001",
    async (connection) => {
      await connection.query("select 'mutation committed under shared lock'");
      return "done";
    },
  );

  assert.equal(value, "done");
  assert.deepEqual(statements, [
    "select pg_advisory_lock_shared(privacy_workspace_lock_key($1::uuid))",
    "begin",
    "select set_config('app.workspace_id', $1, true)",
    "select state::text as state from workspace_privacy_controls where workspace_id = $1::uuid and ($2::uuid is null or deletion_request_id = $2::uuid)",
    "select 'mutation committed under shared lock'",
    "commit",
    "select pg_advisory_unlock_shared(privacy_workspace_lock_key($1::uuid)) as unlocked",
  ]);
  assert.equal(released, true);
});

test("runtime operation guard 생성은 첫 mutation 전까지 database 환경을 요구하지 않는다", () => {
  assert.doesNotThrow(() => createRuntimeWorkspacePrivacyOperationGuard());
});
