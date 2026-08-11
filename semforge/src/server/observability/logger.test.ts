// @TASK P4-O1-T1 - Structured JSON logging and sensitive-data redaction contract
// @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
// @TEST src/server/observability/logger.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { createJsonLogger } from "@/server/observability/logger";

test("JSON 로그는 상관관계 필드를 고정하고 token, billing key, PII, DSN 비밀번호를 마스킹한다", () => {
  const output: string[] = [];
  const logger = createJsonLogger({
    service: "worker",
    now: () => new Date("2026-08-12T09:00:00.000Z"),
    write: (line) => output.push(line),
  });

  logger.error(
    "provider request failed access_token=message-token-must-not-leak for owner@example.com",
    {
    requestId: "req-01234567",
    workspaceId: "53000000-0000-4000-8000-000000000001",
    jobId: "73000000-0000-4000-8000-000000000001",
    provider: "talordata",
    accessToken: "provider-token-must-not-leak",
    authorization: "Bearer bearer-token-must-not-leak",
    databaseUrl: "postgresql://runtime:db-password-must-not-leak@db.example.com/semforge",
    billing: {
      billingKey: "billing-key-must-not-leak",
      customerEmail: "billing-owner@example.com",
      customerName: "홍길동",
      phone: "010-1234-5678",
      ipAddress: "203.0.113.44",
    },
    },
  );

  assert.equal(output.length, 1);
  const record = JSON.parse(output[0]!) as Record<string, unknown>;
  assert.deepEqual(
    {
      timestamp: record.timestamp,
      level: record.level,
      service: record.service,
      requestId: record.requestId,
      workspaceId: record.workspaceId,
      jobId: record.jobId,
      provider: record.provider,
    },
    {
      timestamp: "2026-08-12T09:00:00.000Z",
      level: "error",
      service: "worker",
      requestId: "req-01234567",
      workspaceId: "53000000-0000-4000-8000-000000000001",
      jobId: "73000000-0000-4000-8000-000000000001",
      provider: "talordata",
    },
  );
  const serialized = output[0]!;
  for (const secret of [
    "provider-token-must-not-leak",
    "message-token-must-not-leak",
    "bearer-token-must-not-leak",
    "db-password-must-not-leak",
    "billing-key-must-not-leak",
    "owner@example.com",
    "billing-owner@example.com",
    "홍길동",
    "010-1234-5678",
    "203.0.113.44",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(secret.replaceAll(".", "\\.")));
  }
  assert.match(serialized, /\[REDACTED\]/);
});

test("상관관계가 없는 로그도 requestId, workspaceId, jobId, provider를 null로 직렬화한다", () => {
  const output: string[] = [];
  createJsonLogger({ write: (line) => output.push(line) }).info("started");
  const record = JSON.parse(output[0]!) as Record<string, unknown>;

  assert.equal(record.requestId, null);
  assert.equal(record.workspaceId, null);
  assert.equal(record.jobId, null);
  assert.equal(record.provider, null);
});
