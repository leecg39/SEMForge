// @TASK P1-FINAL-PRIVACY - Separate operator approval from DSAR execution
// @SPEC final_privacy_roles#operator-approval-boundary
// @TEST scripts/ops/privacy-request.ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { parsePrivacyRequestArgs, runPrivacyRequest } from "./privacy-request";

test("privacy request CLI는 operator DSN으로 SECURITY DEFINER 승인 함수만 호출한다", async () => {
  const source = await readFile(
    path.join(process.cwd(), "scripts/ops/privacy-request.ts"),
    "utf8",
  );

  assert.match(source, /getPool\("operator"\)/u);
  assert.match(
    source,
    /select id::text,\s*status\s+from privacy_open_request\(\$1::uuid,\s*\$2::text,\s*\$3::text,\s*\$4::text,\s*\$5::timestamptz,\s*\$6::uuid\)/u,
  );
  assert.match(source, /"export", "correction", "erasure", "workspace_deletion"/u);
  assert.doesNotMatch(source, /insert\s+into\s+privacy_requests/u);
  assert.doesNotMatch(source, /getPool\("privacy"\)|getPool\("retention"\)/u);
});

test("privacy request CLI는 요청 identity를 그대로 승인하고 오류 세부사항을 숨긴다", async () => {
  const argv = [
    "--workspace", "10000000-0000-4000-8000-000000000001",
    "--request", "ticket-2026-0812",
    "--operator", "privacy-operator",
    "--type", "export",
    "--subject-user", "10000000-0000-4000-8000-000000000002",
  ];
  assert.deepEqual(parsePrivacyRequestArgs(argv), {
    workspaceId: "10000000-0000-4000-8000-000000000001",
    requestId: "ticket-2026-0812",
    operatorId: "privacy-operator",
    type: "export",
    subjectUserId: "10000000-0000-4000-8000-000000000002",
  });

  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runPrivacyRequest(argv, {
    now: () => new Date("2026-08-12T00:00:00.000Z"),
    openRequest: async (input) => {
      assert.equal(input.type, "export");
      assert.equal(input.subjectUserId, "10000000-0000-4000-8000-000000000002");
      return { id: "20000000-0000-4000-8000-000000000002", status: "queued" };
    },
    stdout: (value) => stdout.push(value),
    stderr: (value) => stderr.push(value),
  });
  assert.equal(exitCode, 0);
  assert.deepEqual(stderr, []);
  assert.deepEqual(stdout, [
    '{"id":"20000000-0000-4000-8000-000000000002","status":"queued"}\n',
  ]);

  stdout.length = 0;
  const failureStderr: string[] = [];
  const failed = await runPrivacyRequest(argv, {
    openRequest: async () => {
      throw new Error("postgresql://operator:secret@db/private-customer");
    },
    stdout: (value) => stdout.push(value),
    stderr: (value) => failureStderr.push(value),
  });
  assert.equal(failed, 1);
  assert.deepEqual(stdout, []);
  assert.deepEqual(failureStderr, ["privacy request approval failed\n"]);
});

test("privacy request CLI는 workspace closure 요청에는 subject를 허용하지 않는다", () => {
  assert.deepEqual(parsePrivacyRequestArgs([
    "--workspace", "10000000-0000-4000-8000-000000000001",
    "--request", "subject-erasure-2026-0812",
    "--operator", "privacy-operator",
    "--type", "erasure",
    "--subject-user", "10000000-0000-4000-8000-000000000002",
  ]), {
    workspaceId: "10000000-0000-4000-8000-000000000001",
    requestId: "subject-erasure-2026-0812",
    operatorId: "privacy-operator",
    type: "erasure",
    subjectUserId: "10000000-0000-4000-8000-000000000002",
  });
  assert.deepEqual(parsePrivacyRequestArgs([
    "--workspace", "10000000-0000-4000-8000-000000000001",
    "--request", "workspace-close-2026-0812",
    "--operator", "privacy-operator",
    "--type", "workspace_deletion",
  ]), {
    workspaceId: "10000000-0000-4000-8000-000000000001",
    requestId: "workspace-close-2026-0812",
    operatorId: "privacy-operator",
    type: "workspace_deletion",
    subjectUserId: null,
  });
  assert.throws(
    () => parsePrivacyRequestArgs([
      "--workspace", "10000000-0000-4000-8000-000000000001",
      "--request", "workspace-close-2026-0812",
      "--operator", "privacy-operator",
      "--type", "workspace_deletion",
      "--subject-user", "10000000-0000-4000-8000-000000000002",
    ]),
    /Usage: privacy-request/u,
  );
});
