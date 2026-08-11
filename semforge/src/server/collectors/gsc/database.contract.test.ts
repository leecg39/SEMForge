// @TASK P3-C2-T1 - Pool-safe transaction connection pinning
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/collectors/gsc/database.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type { GscObservation } from "@/server/collectors/gsc/collector";
import { createPostgresGscObservationStore } from "@/server/collectors/gsc/observation-store";
import { loadGscCollectionTarget } from "@/server/collectors/gsc/target";

const workspaceId = "55000000-0000-4000-8000-000000000001";
const siteId = "55000000-0000-4000-8000-000000000101";
const bindingId = "55000000-0000-4000-8000-000000000201";
const connectionId = "55000000-0000-4000-8000-000000000301";

function fakePool(options: { targetRow?: boolean; failTarget?: boolean } = {}) {
  const calls: string[] = [];
  let directPoolQueries = 0;
  const client = {
    async query<T = unknown>(text: string): Promise<{ rows: T[] }> {
      const operation = /^begin$/iu.test(text)
        ? "begin"
        : /^commit$/iu.test(text)
          ? "commit"
          : /^rollback$/iu.test(text)
            ? "rollback"
            : /set_config/iu.test(text)
              ? "set_config"
              : /from gsc_property_bindings/iu.test(text)
                ? "select_target"
                : /insert into gsc_observations/iu.test(text)
                  ? "upsert_observation"
                  : "unexpected";
      calls.push(operation);
      if (operation === "select_target" && options.failTarget) {
        throw new Error("target lookup private database failure");
      }
      const rows =
        operation === "select_target" && options.targetRow
          ? [{
              workspace_id: workspaceId,
              site_id: siteId,
              binding_id: bindingId,
              connection_id: connectionId,
              property_uri: "sc-domain:example.com",
            }]
          : [];
      return { rows: rows as T[] };
    },
    release() {
      calls.push("release");
    },
  };
  const pool = {
    async query<T = unknown>(): Promise<{ rows: T[] }> {
      directPoolQueries += 1;
      throw new Error("pool.query must not be used for transaction-local workspace");
    },
    async connect() {
      calls.push("connect");
      return client;
    },
  };
  return {
    pool,
    calls,
    directPoolQueries: () => directPoolQueries,
  };
}

test("target loader는 Pool에서 client를 acquire해 BEGIN/SET LOCAL/SELECT/COMMIT을 같은 연결에서 수행한다", async () => {
  const state = fakePool({ targetRow: true });

  const target = await loadGscCollectionTarget(state.pool, {
    workspaceId,
    siteId,
    bindingId,
  });

  assert.equal(target.connectionId, connectionId);
  assert.equal(state.directPoolQueries(), 0);
  assert.deepEqual(state.calls, [
    "connect",
    "begin",
    "set_config",
    "select_target",
    "commit",
    "release",
  ]);
});

test("target loader는 DB 장애를 UPSTREAM으로 정규화하고 rollback 후 release한다", async () => {
  const state = fakePool({ failTarget: true });

  await assert.rejects(
    loadGscCollectionTarget(state.pool, { workspaceId, siteId, bindingId }),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "GscCollectorAccessError" &&
      error.message === "UPSTREAM",
  );

  assert.equal(state.directPoolQueries(), 0);
  assert.deepEqual(state.calls, [
    "connect",
    "begin",
    "set_config",
    "select_target",
    "rollback",
    "release",
  ]);
});

test("observation store도 PoolClient 하나에 tenant context와 upsert를 고정하고 release한다", async () => {
  const state = fakePool();
  const observation: GscObservation = {
    observationKey: "stable-key",
    workspaceId,
    siteId,
    bindingId,
    providerCallId: "55000000-0000-4000-8000-000000000401",
    collectedAt: "2026-08-09T23:01:00.000Z",
    dataDate: "2026-08-06",
    dimensionHash: "b".repeat(64),
    dimensions: { date: "2026-08-06" },
    clicks: 1,
    impressions: 2,
    ctr: 0.5,
    position: 1,
  };

  await createPostgresGscObservationStore(state.pool).upsertMany([observation]);

  assert.equal(state.directPoolQueries(), 0);
  assert.deepEqual(state.calls, [
    "connect",
    "begin",
    "set_config",
    "upsert_observation",
    "commit",
    "release",
  ]);
});
