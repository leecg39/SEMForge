// @TASK P2-G1-T1 - PostgreSQL GSC store contract
// @SPEC user-approved-plan#인증과-GSC
// @TEST src/server/gsc/store.ts
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import {
  GscStoreError,
  consumeGscOAuthState,
  createGscConnection,
  disconnectGscConnection,
  getGscConnection,
  listGscConnections,
  saveGscOAuthState,
  upsertGscPropertyBinding,
} from "@/server/gsc/store";
import { hashOAuthState } from "@/server/gsc/oauth";

const pg = new PGlite();
const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");

const workspaceA = "30000000-0000-4000-8000-000000000001";
const workspaceB = "30000000-0000-4000-8000-000000000002";
const userA = "30000000-0000-4000-8000-000000000101";
const userB = "30000000-0000-4000-8000-000000000102";
const siteA = "30000000-0000-4000-8000-000000000201";
const siteB = "30000000-0000-4000-8000-000000000202";

before(async () => {
  await pg.waitReady;
  await migrate(drizzle(pg), { migrationsFolder });
  await pg.query(
    `insert into workspaces (id, name, slug) values
       ($1, 'GSC A', 'gsc-a'),
       ($2, 'GSC B', 'gsc-b')`,
    [workspaceA, workspaceB],
  );
  await pg.query(
    `insert into users (id, email, password_hash) values
       ($1, 'gsc-a@example.com', 'hash'),
       ($2, 'gsc-b@example.com', 'hash')`,
    [userA, userB],
  );
  await pg.query(
    `insert into memberships (workspace_id, user_id, role) values
       ($1, $2, 'owner'),
       ($3, $4, 'owner')`,
    [workspaceA, userA, workspaceB, userB],
  );
  await pg.query(
    `insert into sites (id, workspace_id, name, domain) values
       ($1, $2, 'A', 'a.example.com'),
       ($3, $4, 'B', 'b.example.com')`,
    [siteA, workspaceA, siteB, workspaceB],
  );
});

after(async () => pg.close());

test("OAuth state는 SHA-256만 저장하고 user/workspace에 바인딩된 10분 1회용 CAS로 소비된다", async () => {
  const now = new Date("2026-08-11T00:00:00.000Z");
  const rawState = "s".repeat(43);
  const stateHash = hashOAuthState(rawState);

  await saveGscOAuthState(pg, {
    workspaceId: workspaceA,
    userId: userA,
    stateHash,
    connectionLabel: "고객 GSC",
    returnPath: "/app/settings",
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
  });

  const stored = await pg.query<{ state_hash: string; raw_found: boolean }>(
    "select state_hash, state_hash = $2 as raw_found from oauth_states where workspace_id = $1",
    [workspaceA, rawState],
  );
  assert.equal(stored.rows[0]!.state_hash, stateHash);
  assert.equal(stored.rows[0]!.raw_found, false);

  assert.equal(
    await consumeGscOAuthState(pg, {
      workspaceId: workspaceB,
      userId: userB,
      stateHash,
      now,
    }),
    null,
  );

  const consumed = await consumeGscOAuthState(pg, {
    workspaceId: workspaceA,
    userId: userA,
    stateHash,
    now,
  });
  assert.deepEqual(consumed, {
    workspaceId: workspaceA,
    userId: userA,
    connectionLabel: "고객 GSC",
    returnPath: "/app/settings",
  });
  assert.equal(
    await consumeGscOAuthState(pg, {
      workspaceId: workspaceA,
      userId: userA,
      stateHash,
      now,
    }),
    null,
  );
});

test("GSC connection은 workspace별 다중 label을 허용하고 동일 workspace label 중복은 거부한다", async () => {
  const first = await createGscConnection(pg, {
    id: "30000000-0000-4000-8000-000000000301",
    workspaceId: workspaceA,
    label: "운영 계정",
    accessTokenEncrypted: "enc:v1:k:iv:tag:access",
    refreshTokenEncrypted: "enc:v1:k:iv:tag:refresh",
    tokenExpiresAt: new Date("2026-08-11T01:00:00.000Z"),
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
  });
  const second = await createGscConnection(pg, {
    id: "30000000-0000-4000-8000-000000000302",
    workspaceId: workspaceA,
    label: "보조 계정",
    accessTokenEncrypted: "enc:v1:k:iv:tag:access2",
    refreshTokenEncrypted: "enc:v1:k:iv:tag:refresh2",
    tokenExpiresAt: new Date("2026-08-11T01:00:00.000Z"),
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
  });
  await createGscConnection(pg, {
    id: "30000000-0000-4000-8000-000000000303",
    workspaceId: workspaceB,
    label: "운영 계정",
    accessTokenEncrypted: "enc:v1:k:iv:tag:access3",
    refreshTokenEncrypted: "enc:v1:k:iv:tag:refresh3",
    tokenExpiresAt: new Date("2026-08-11T01:00:00.000Z"),
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
  });

  assert.equal(first.label, "운영 계정");
  assert.equal(second.label, "보조 계정");
  assert.deepEqual((await listGscConnections(pg, { workspaceId: workspaceA })).map((row) => row.label), [
    "운영 계정",
    "보조 계정",
  ]);

  await assert.rejects(
    createGscConnection(pg, {
      id: "30000000-0000-4000-8000-000000000304",
      workspaceId: workspaceA,
      label: "운영 계정",
      accessTokenEncrypted: "enc:v1:k:iv:tag:access4",
      refreshTokenEncrypted: "enc:v1:k:iv:tag:refresh4",
      tokenExpiresAt: new Date("2026-08-11T01:00:00.000Z"),
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
    }),
    (error: unknown) => error instanceof GscStoreError && error.code === "DUPLICATE_LABEL",
  );
});

test("property binding은 site와 connection의 workspace 복합 경계를 강제한다", async () => {
  const connection = await getGscConnection(pg, {
    workspaceId: workspaceA,
    connectionId: "30000000-0000-4000-8000-000000000301",
  });
  assert.ok(connection);

  const binding = await upsertGscPropertyBinding(pg, {
    workspaceId: workspaceA,
    siteId: siteA,
    connectionId: connection.id,
    propertyUri: "sc-domain:example.com",
  });
  assert.equal(binding.siteId, siteA);
  assert.equal(binding.connectionId, connection.id);

  await assert.rejects(
    upsertGscPropertyBinding(pg, {
      workspaceId: workspaceB,
      siteId: siteA,
      connectionId: connection.id,
      propertyUri: "sc-domain:example.com",
    }),
    (error: unknown) => error instanceof GscStoreError && error.code === "NOT_FOUND",
  );

  await disconnectGscConnection(pg, {
    workspaceId: workspaceA,
    connectionId: connection.id,
  });
  assert.equal(
    (await listGscConnections(pg, { workspaceId: workspaceA })).some((row) => row.id === connection.id),
    false,
  );
});
