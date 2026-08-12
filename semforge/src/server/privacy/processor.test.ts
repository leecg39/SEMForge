// @TASK P5-PRIVACY - Production privacy processor contract
// @SPEC docs/ops/privacy-erasure-runbook.md
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { createSecretCrypto } from "@/lib/crypto";
import { createPrivacyProcessor } from "@/server/privacy/processor";

test("privacy processor는 GSC refresh token revoke, S3 delete, hashed email suppression을 실제 adapter seam으로 수행한다", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  await migrate(drizzle(pg), {
    migrationsFolder: path.join(process.cwd(), "src", "db", "migrations"),
  });
  try {
    const workspaceId = "69000000-0000-4000-8000-000000000001";
    const requestUuid = "69000000-0000-4000-8000-000000000002";
    const connectionId = "69000000-0000-4000-8000-000000000003";
    await pg.query(
      "insert into workspaces (id, name, slug) values ($1, 'Privacy Processor', 'privacy-processor')",
      [workspaceId],
    );
    await pg.query(
      "insert into privacy_requests (id, workspace_id, request_id, type, status, operator_id, requested_at) values ($1, $2, 'processor-req', 'deletion', 'running', 'operator', now())",
      [requestUuid, workspaceId],
    );
    const crypto = createSecretCrypto({
      currentKeyId: "test-key",
      currentSecret: "privacy-processor-secret-at-least-32-bytes",
    });
    const refreshTokenEncrypted = crypto.encrypt(
      "refresh-token-secret",
      `workspace:${workspaceId}:gsc:${connectionId}:refresh-token`,
    );
    const revoked: string[] = [];
    const deleted: string[] = [];
    const processor = createPrivacyProcessor({
      db: pg,
      crypto,
      gscClient: {
        async revokeToken(token) {
          revoked.push(token);
        },
      },
      storage: {
        async deletePrivate(key) {
          deleted.push(key);
        },
      },
    });

    await processor.revokeGscConnection({
      workspaceId,
      connectionId,
      refreshTokenEncrypted,
    });
    await processor.deleteObject({
      workspaceId,
      storageKey: "reports/workspace/report.pdf",
    });
    await processor.markEmailSuppressed({
      workspaceId,
      emailHash: "a".repeat(64),
      requestUuid,
    });

    assert.deepEqual(revoked, ["refresh-token-secret"]);
    assert.deepEqual(deleted, ["reports/workspace/report.pdf"]);
    const suppression = await pg.query<{ workspace_id: string; email_hash: string; request_id: string }>(
      "select workspace_id::text, email_hash, request_id::text from email_suppressions where workspace_id = $1",
      [workspaceId],
    );
    assert.deepEqual(suppression.rows, [{
      workspace_id: workspaceId,
      email_hash: "a".repeat(64),
      request_id: requestUuid,
    }]);
  } finally {
    await pg.close();
  }
});
