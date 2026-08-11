// @TASK P2-RUNTIME-FIX - Production site store RLS composition regression
// @SPEC user-approved-plan#데이터와-테넌트-격리
import assert from "node:assert/strict";
import { test } from "node:test";

import { listSites, type SqlQueryable } from "@/server/sites/store";

class RecordingDb implements SqlQueryable {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];

  async query<T = unknown>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<{ rows: T[] }> {
    this.calls.push({ text, values });
    return { rows: [] };
  }
}

test("listSites also runs inside a transaction-local app.workspace_id for semforge_web RLS", async () => {
  const db = new RecordingDb();
  const workspaceId = "30000000-0000-4000-8000-000000000001";

  await listSites(db, { workspaceId, limit: 10 });

  assert.match(db.calls[0]?.text ?? "", /^begin$/i);
  assert.match(db.calls[1]?.text ?? "", /set_config\('app\.workspace_id'/i);
  assert.deepEqual(db.calls[1]?.values, [workspaceId]);
  assert.match(db.calls.at(-1)?.text ?? "", /^commit$/i);
});
