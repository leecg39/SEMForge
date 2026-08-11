// @TASK P3-C2-T1 - Tenant-bound GSC target and token broker
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/collectors/gsc/target.ts
// @TEST src/server/collectors/gsc/token-broker.ts
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { createSecretCrypto } from "@/lib/crypto";
import { GSC_SCOPE } from "@/server/gsc/oauth";
import {
  GscCollectorAccessError,
  loadGscCollectionTarget,
} from "@/server/collectors/gsc/target";
import { createGscTokenBroker } from "@/server/collectors/gsc/token-broker";

const pg = new PGlite();
const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");
const now = new Date("2026-08-10T00:00:00.000Z");

const workspaceA = "51000000-0000-4000-8000-000000000001";
const workspaceB = "51000000-0000-4000-8000-000000000002";
const siteA = "51000000-0000-4000-8000-000000000101";
const siteB = "51000000-0000-4000-8000-000000000102";
const connectionA = "51000000-0000-4000-8000-000000000201";
const connectionB = "51000000-0000-4000-8000-000000000202";
const bindingA = "51000000-0000-4000-8000-000000000301";
const bindingB = "51000000-0000-4000-8000-000000000302";

const crypto = createSecretCrypto({
  currentKeyId: "gsc-collector-test",
  currentSecret: "g".repeat(32),
});

function aad(
  workspaceId: string,
  connectionId: string,
  type: "access-token" | "refresh-token",
): string {
  return `workspace:${workspaceId}:gsc:${connectionId}:${type}`;
}

before(async () => {
  await pg.waitReady;
  await migrate(drizzle(pg), { migrationsFolder });
  await pg.query(
    "insert into workspaces (id, name, slug) values ($1, 'A', 'gsc-a'), ($2, 'B', 'gsc-b')",
    [workspaceA, workspaceB],
  );
  await pg.query(
    `insert into sites (id, workspace_id, name, domain)
     values ($1, $2, 'Site A', 'a.example'), ($3, $4, 'Site B', 'b.example')`,
    [siteA, workspaceA, siteB, workspaceB],
  );
  await pg.query(
    `insert into gsc_connections
       (id, workspace_id, label, access_token_encrypted, refresh_token_encrypted, token_expires_at, scope)
     values ($1, $2, 'A GSC', $3, $4, $5, $6),
            ($7, $8, 'B GSC', $9, $10, $11, $6)`,
    [
      connectionA,
      workspaceA,
      crypto.encrypt("old-access-a", aad(workspaceA, connectionA, "access-token")),
      crypto.encrypt("old-refresh-a", aad(workspaceA, connectionA, "refresh-token")),
      new Date(now.getTime() + 5 * 60 * 1000),
      GSC_SCOPE,
      connectionB,
      workspaceB,
      crypto.encrypt("access-b", aad(workspaceB, connectionB, "access-token")),
      crypto.encrypt("refresh-b", aad(workspaceB, connectionB, "refresh-token")),
      new Date(now.getTime() + 60 * 60 * 1000),
    ],
  );
  await pg.query(
    `insert into gsc_property_bindings
       (id, workspace_id, site_id, connection_id, property_uri)
     values ($1, $2, $3, $4, 'sc-domain:a.example'),
            ($5, $6, $7, $8, 'https://b.example/')`,
    [bindingA, workspaceA, siteA, connectionA, bindingB, workspaceB, siteB, connectionB],
  );
});

after(async () => pg.close());

test("target loader는 workspace/site/binding/connection을 하나로 고정하고 다른 workspace binding을 숨긴다", async () => {
  assert.deepEqual(
    await loadGscCollectionTarget(pg, {
      workspaceId: workspaceA,
      siteId: siteA,
      bindingId: bindingA,
    }),
    {
      workspaceId: workspaceA,
      siteId: siteA,
      bindingId: bindingA,
      connectionId: connectionA,
      propertyUri: "sc-domain:a.example",
    },
  );

  await assert.rejects(
    loadGscCollectionTarget(pg, {
      workspaceId: workspaceA,
      siteId: siteB,
      bindingId: bindingB,
    }),
    (error: unknown) =>
      error instanceof GscCollectorAccessError && error.code === "NOT_FOUND",
  );
});

test("token broker는 5분 이내 만료 token을 refresh하고 access/refresh rotation을 암호화 저장한다", async () => {
  const refreshInputs: string[] = [];
  const broker = createGscTokenBroker({
    db: pg,
    crypto,
    oauthConfig: {
      clientId: "google-client",
      clientSecret: "google-secret",
      redirectUri: "https://semforge.example/api/v1/integrations/gsc/callback",
    },
    now: () => now,
    refreshAccessToken: async (refreshToken) => {
      refreshInputs.push(refreshToken);
      return {
        accessToken: "rotated-access-a",
        refreshToken: "rotated-refresh-a",
        expiryMs: Date.parse("2026-08-10T01:00:00.000Z"),
        scope: GSC_SCOPE,
      };
    },
  });

  assert.equal(
    await broker.getAccessToken({ workspaceId: workspaceA, connectionId: connectionA }),
    "rotated-access-a",
  );
  assert.deepEqual(refreshInputs, ["old-refresh-a"]);

  const stored = await pg.query<{
    access_token_encrypted: string;
    refresh_token_encrypted: string;
    token_expires_at: Date | string;
  }>(
    `select access_token_encrypted, refresh_token_encrypted, token_expires_at
       from gsc_connections where workspace_id = $1 and id = $2`,
    [workspaceA, connectionA],
  );
  assert.equal(
    crypto.decrypt(
      stored.rows[0]!.access_token_encrypted,
      aad(workspaceA, connectionA, "access-token"),
    ),
    "rotated-access-a",
  );
  assert.equal(
    crypto.decrypt(
      stored.rows[0]!.refresh_token_encrypted,
      aad(workspaceA, connectionA, "refresh-token"),
    ),
    "rotated-refresh-a",
  );
  assert.equal(
    new Date(stored.rows[0]!.token_expires_at).toISOString(),
    "2026-08-10T01:00:00.000Z",
  );
});

test("token broker는 다른 workspace connection을 NOT_FOUND로 처리하고 refresh하지 않는다", async () => {
  let refreshed = false;
  const broker = createGscTokenBroker({
    db: pg,
    crypto,
    oauthConfig: {
      clientId: "google-client",
      clientSecret: "google-secret",
      redirectUri: "https://semforge.example/api/v1/integrations/gsc/callback",
    },
    now: () => now,
    refreshAccessToken: async () => {
      refreshed = true;
      throw new Error("must not refresh");
    },
  });

  await assert.rejects(
    broker.getAccessToken({ workspaceId: workspaceA, connectionId: connectionB }),
    (error: unknown) =>
      error instanceof GscCollectorAccessError && error.code === "NOT_FOUND",
  );
  assert.equal(refreshed, false);
});

test("token broker는 token 저장소 장애를 안전한 UPSTREAM 오류로 정규화한다", async () => {
  const broker = createGscTokenBroker({
    db: {
      query: async () => {
        throw new Error("database secret detail must not escape");
      },
    },
    crypto,
    oauthConfig: {
      clientId: "google-client",
      clientSecret: "google-secret",
      redirectUri: "https://semforge.example/api/v1/integrations/gsc/callback",
    },
    now: () => now,
  });

  await assert.rejects(
    broker.getAccessToken({ workspaceId: workspaceA, connectionId: connectionA }),
    (error: unknown) => {
      assert.ok(error instanceof GscCollectorAccessError);
      assert.equal(error.code, "UPSTREAM");
      assert.doesNotMatch(error.message, /database secret detail/u);
      return true;
    },
  );
});

test("token refresh 성공 뒤 rotation 저장 실패도 UPSTREAM으로 분류한다", async () => {
  const encryptedAccess = crypto.encrypt(
    "expiring-access",
    aad(workspaceA, connectionA, "access-token"),
  );
  const encryptedRefresh = crypto.encrypt(
    "refresh-before-rotation",
    aad(workspaceA, connectionA, "refresh-token"),
  );
  let refreshCalls = 0;
  const db = {
    async query<T = unknown>(text: string): Promise<{ rows: T[] }> {
      const normalized = text.replace(/\s+/gu, " ").trim().toLowerCase();
      if (
        normalized === "begin" ||
        normalized === "commit" ||
        normalized === "rollback" ||
        normalized.startsWith("select set_config")
      ) {
        return { rows: [] };
      }
      if (normalized.includes("from gsc_connections")) {
        return {
          rows: [{
            id: connectionA,
            workspace_id: workspaceA,
            label: "A GSC",
            access_token_encrypted: encryptedAccess,
            refresh_token_encrypted: encryptedRefresh,
            token_expires_at: now.toISOString(),
            scope: GSC_SCOPE,
            created_at: "2026-08-01T00:00:00.000Z",
            updated_at: "2026-08-01T00:00:00.000Z",
          }] as T[],
        };
      }
      if (normalized.startsWith("update gsc_connections")) {
        throw new Error("rotation persistence unavailable");
      }
      throw new Error(`UNEXPECTED_SQL:${normalized}`);
    },
  };
  const broker = createGscTokenBroker({
    db,
    crypto,
    oauthConfig: {
      clientId: "google-client",
      clientSecret: "google-secret",
      redirectUri: "https://semforge.example/api/v1/integrations/gsc/callback",
    },
    now: () => now,
    refreshAccessToken: async () => {
      refreshCalls += 1;
      return {
        accessToken: "rotated-access",
        refreshToken: "rotated-refresh",
        expiryMs: Date.parse("2026-08-10T01:00:00.000Z"),
        scope: GSC_SCOPE,
      };
    },
  });

  await assert.rejects(
    broker.getAccessToken({ workspaceId: workspaceA, connectionId: connectionA }),
    (error: unknown) =>
      error instanceof GscCollectorAccessError && error.code === "UPSTREAM",
  );
  assert.equal(refreshCalls, 1);
});
