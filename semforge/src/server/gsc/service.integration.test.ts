// @TASK P2-G1-T1 - GSC service OAuth/token contract
// @SPEC user-approved-plan#인증과-GSC
// @TEST src/server/gsc/service.ts
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { createSecretCrypto } from "@/lib/crypto";
import type { GscTokenSet } from "@/server/gsc/oauth";
import { GSC_SCOPE, hashOAuthState } from "@/server/gsc/oauth";
import {
  GscServiceError,
  createGscService,
} from "@/server/gsc/service";

const pg = new PGlite();
const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");

const workspaceId = "31000000-0000-4000-8000-000000000001";
const userId = "31000000-0000-4000-8000-000000000101";
const siteId = "31000000-0000-4000-8000-000000000201";

const crypto = createSecretCrypto({
  currentKeyId: "test-key",
  currentSecret: "x".repeat(32),
});

before(async () => {
  await pg.waitReady;
  await migrate(drizzle(pg), { migrationsFolder });
  await pg.query("insert into workspaces (id, name, slug) values ($1, 'GSC Service', 'gsc-service')", [
    workspaceId,
  ]);
  await pg.query("insert into users (id, email, password_hash) values ($1, 'service@example.com', 'hash')", [
    userId,
  ]);
  await pg.query("insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')", [
    workspaceId,
    userId,
  ]);
  await pg.query("insert into sites (id, workspace_id, name, domain) values ($1, $2, 'Service Site', 'example.com')", [
    siteId,
    workspaceId,
  ]);
});

after(async () => pg.close());

test("startConnection은 raw 32-byte state를 반환하지만 DB에는 SHA-256 state와 label/returnPath만 저장한다", async () => {
  const service = createGscService({
    db: pg,
    crypto,
    oauthConfig: {
      clientId: "google-client",
      clientSecret: "google-secret",
      redirectUri: "https://semforge.example/api/v1/integrations/gsc/callback",
    },
    now: () => new Date("2026-08-11T00:00:00.000Z"),
  });

  const result = await service.startConnection({
    workspaceId,
    userId,
    label: "  고객   GSC  ",
    returnPath: "/app/settings",
  });

  assert.match(result.state, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(new URL(result.authorizationUrl).searchParams.get("state"), result.state);
  assert.equal(new URL(result.authorizationUrl).searchParams.get("scope"), GSC_SCOPE);
  assert.equal(result.expiresAt, "2026-08-11T00:10:00.000Z");

  const stored = await pg.query<{ state_hash: string; connection_label: string; return_path: string }>(
    "select state_hash, connection_label, return_path from oauth_states where workspace_id = $1",
    [workspaceId],
  );
  assert.equal(stored.rows[0]!.state_hash, hashOAuthState(result.state));
  assert.equal(stored.rows[0]!.connection_label, "고객 GSC");
  assert.equal(stored.rows[0]!.return_path, "/app/settings");
});

test("callback은 state를 1회 소비하고 단일 readonly scope·refresh token을 암호화해 connection을 만든다", async () => {
  const exchangedCodes: string[] = [];
  const service = createGscService({
    db: pg,
    crypto,
    oauthConfig: {
      clientId: "google-client",
      clientSecret: "google-secret",
      redirectUri: "https://semforge.example/api/v1/integrations/gsc/callback",
    },
    oauthClient: {
      async exchangeCode(code) {
        exchangedCodes.push(code);
        return {
          accessToken: "access-token-secret",
          refreshToken: "refresh-token-secret",
          expiryMs: Date.parse("2026-08-11T01:00:00.000Z"),
          scope: GSC_SCOPE,
          tokenType: "Bearer",
        };
      },
      async refreshAccessToken() {
        throw new Error("not used");
      },
    },
    now: () => new Date("2026-08-11T00:01:00.000Z"),
    idFactory: () => "31000000-0000-4000-8000-000000000301",
  });
  const started = await service.startConnection({
    workspaceId,
    userId,
    label: "운영 GSC",
    returnPath: "/app/settings",
  });

  const completed = await service.completeCallback({
    workspaceId,
    userId,
    code: "google-auth-code",
    state: started.state,
  });

  assert.equal(completed.connection.label, "운영 GSC");
  assert.equal(completed.returnPath, "/app/settings");
  assert.deepEqual(exchangedCodes, ["google-auth-code"]);
  const row = await pg.query<{
    access_token_encrypted: string;
    refresh_token_encrypted: string;
    scope: string;
  }>("select access_token_encrypted, refresh_token_encrypted, scope from gsc_connections where id = $1", [
    completed.connection.id,
  ]);
  assert.match(row.rows[0]!.access_token_encrypted, /^enc:v1:test-key:/);
  assert.match(row.rows[0]!.refresh_token_encrypted, /^enc:v1:test-key:/);
  assert.equal(row.rows[0]!.scope, GSC_SCOPE);
  assert.notEqual(row.rows[0]!.access_token_encrypted, "access-token-secret");
  assert.equal(
    crypto.decrypt(row.rows[0]!.access_token_encrypted, `workspace:${workspaceId}:gsc:${completed.connection.id}:access-token`),
    "access-token-secret",
  );

  await assert.rejects(
    service.completeCallback({
      workspaceId,
      userId,
      code: "replay-code",
      state: started.state,
    }),
    (error: unknown) => error instanceof GscServiceError && error.code === "INVALID_STATE",
  );
});

test("callback은 변조·만료 state와 추가 OAuth scope를 거부한다", async () => {
  const startedAt = new Date("2026-08-11T04:00:00.000Z");
  const service = createGscService({
    db: pg,
    crypto,
    oauthConfig: {
      clientId: "google-client",
      clientSecret: "google-secret",
      redirectUri: "https://semforge.example/api/v1/integrations/gsc/callback",
    },
    oauthClient: {
      async exchangeCode() {
        return {
          accessToken: "access-token-extra-scope",
          refreshToken: "refresh-token-extra-scope",
          expiryMs: Date.parse("2026-08-11T05:00:00.000Z"),
          scope: `${GSC_SCOPE} https://www.googleapis.com/auth/userinfo.email`,
        };
      },
      async refreshAccessToken() {
        throw new Error("not used");
      },
    },
    now: () => startedAt,
    idFactory: () => "31000000-0000-4000-8000-000000000302",
  });
  const started = await service.startConnection({
    workspaceId,
    userId,
    label: "추가 scope 테스트",
    returnPath: "/app/settings",
  });

  await assert.rejects(
    service.completeCallback({
      workspaceId,
      userId,
      code: "code",
      state: `${started.state.slice(0, -1)}x`,
    }),
    (error: unknown) => error instanceof GscServiceError && error.code === "INVALID_STATE",
  );
  await assert.rejects(
    createGscService({
      db: pg,
      crypto,
      oauthConfig: {
        clientId: "google-client",
        clientSecret: "google-secret",
        redirectUri: "https://semforge.example/api/v1/integrations/gsc/callback",
      },
      now: () => new Date(startedAt.getTime() + 11 * 60 * 1000),
    }).completeCallback({
      workspaceId,
      userId,
      code: "code",
      state: started.state,
    }),
    (error: unknown) => error instanceof GscServiceError && error.code === "INVALID_STATE",
  );

  const fresh = await service.startConnection({
    workspaceId,
    userId,
    label: "추가 scope fresh",
    returnPath: "/app/settings",
  });
  await assert.rejects(
    service.completeCallback({
      workspaceId,
      userId,
      code: "code",
      state: fresh.state,
    }),
    (error: unknown) => error instanceof GscServiceError && error.code === "INVALID_SCOPE",
  );
});

test("refresh는 Google이 새 refresh_token을 반환하지 않으면 기존 refresh token을 보존하고 반환하면 rotation한다", async () => {
  const connectionId = "31000000-0000-4000-8000-000000000301";
  let refreshResponse: GscTokenSet = {
    accessToken: "access-token-2",
    expiryMs: Date.parse("2026-08-11T02:00:00.000Z"),
    scope: GSC_SCOPE,
  };
  const service = createGscService({
    db: pg,
    crypto,
    oauthConfig: {
      clientId: "google-client",
      clientSecret: "google-secret",
      redirectUri: "https://semforge.example/api/v1/integrations/gsc/callback",
    },
    oauthClient: {
      async exchangeCode() {
        throw new Error("not used");
      },
      async refreshAccessToken(refreshToken) {
        assert.equal(refreshToken, "refresh-token-secret");
        return refreshResponse;
      },
    },
  });

  const refreshed = await service.refreshConnection({
    workspaceId,
    connectionId,
  });
  assert.equal(
    crypto.decrypt(refreshed.refreshTokenEncrypted, `workspace:${workspaceId}:gsc:${connectionId}:refresh-token`),
    "refresh-token-secret",
  );

  refreshResponse = {
    accessToken: "access-token-3",
    refreshToken: "refresh-token-rotated",
    expiryMs: Date.parse("2026-08-11T03:00:00.000Z"),
    scope: GSC_SCOPE,
  };
  const rotated = await service.refreshConnection({
    workspaceId,
    connectionId,
  });
  assert.equal(
    crypto.decrypt(rotated.refreshTokenEncrypted, `workspace:${workspaceId}:gsc:${connectionId}:refresh-token`),
    "refresh-token-rotated",
  );
});

test("properties 조회와 binding은 다른 workspace/site IDOR를 거부한다", async () => {
  const service = createGscService({
    db: pg,
    crypto,
    oauthConfig: {
      clientId: "google-client",
      clientSecret: "google-secret",
      redirectUri: "https://semforge.example/api/v1/integrations/gsc/callback",
    },
    searchConsoleClient: {
      async listSites(accessToken) {
        assert.equal(accessToken, "access-token-3");
        return [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }];
      },
      async revokeToken() {},
    },
    now: () => new Date("2026-08-11T02:30:00.000Z"),
  });

  assert.deepEqual(await service.listProperties({
    workspaceId,
    connectionId: "31000000-0000-4000-8000-000000000301",
  }), [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }]);

  const binding = await service.bindProperty({
    workspaceId,
    siteId,
    connectionId: "31000000-0000-4000-8000-000000000301",
    propertyUri: "sc-domain:example.com",
  });
  assert.equal(binding.siteId, siteId);

  await assert.rejects(
    service.bindProperty({
      workspaceId: "31000000-0000-4000-8000-000000000099",
      siteId,
      connectionId: "31000000-0000-4000-8000-000000000301",
      propertyUri: "sc-domain:example.com",
    }),
    (error: unknown) => error instanceof GscServiceError && error.code === "NOT_FOUND",
  );
});

test("disconnect는 복호화한 refresh token을 Google revoke에 전달한 뒤 connection을 숨긴다", async () => {
  const revoked: string[] = [];
  const service = createGscService({
    db: pg,
    crypto,
    oauthConfig: {
      clientId: "google-client",
      clientSecret: "google-secret",
      redirectUri: "https://semforge.example/api/v1/integrations/gsc/callback",
    },
    searchConsoleClient: {
      async listSites() {
        throw new Error("not used");
      },
      async revokeToken(token) {
        revoked.push(token);
      },
    },
  });

  await service.disconnect({
    workspaceId,
    connectionId: "31000000-0000-4000-8000-000000000301",
  });

  assert.deepEqual(revoked, ["refresh-token-rotated"]);
  assert.deepEqual(await service.listConnections({ workspaceId }), []);
});
