// @TASK P3-W1-T1 - Collector-facing job handler contract
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
// @TEST src/server/jobs/contracts.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defineJobHandler,
  jobDead,
  jobRetryable,
  jobSucceeded,
  type JobExecutionContext,
} from "@/server/jobs/contracts";

test("collector handler는 workspace/lease/provider-call 경계를 하나의 실행 context로 받는다", async () => {
  const invocations: string[] = [];
  const handler = defineJobHandler<{ siteId: string }>(async (job, context) => {
    assert.equal(job.workspaceId, context.workspaceId);
    assert.equal(job.payload.siteId, "site-1");
    assert.equal(context.lease.generation, 3);
    const reservation = await context.providerCalls.reserve({
      provider: "talordata",
      operation: "google.serp",
      idempotencyKey: `${job.idempotencyKey}:serp`,
      requestHash: "sha256:request",
      resource: "serp",
      units: 1,
      periodStart: new Date("2026-08-01T00:00:00.000Z"),
      periodEnd: new Date("2026-09-01T00:00:00.000Z"),
      reservationExpiresAt: new Date("2026-08-12T01:00:00.000Z"),
    });
    invocations.push(reservation.disposition);
    await context.audit("collector.finished", { siteId: job.payload.siteId });
    return jobSucceeded({ providerCallId: reservation.providerCallId });
  });

  const context: JobExecutionContext = {
    workspaceId: "workspace-1",
    jobId: "job-1",
    attempt: 1,
    maxAttempts: 5,
    lease: {
      owner: "worker-1",
      token: "lease-1",
      generation: 3,
      expiresAt: new Date("2026-08-12T00:01:00.000Z"),
    },
    signal: new AbortController().signal,
    now: () => new Date("2026-08-12T00:00:00.000Z"),
    audit: async (action) => {
      invocations.push(action);
    },
    providerCalls: {
      reserve: async () => ({
        disposition: "execute",
        providerCallId: "provider-call-1",
        usageReservationId: "usage-1",
        responseMetadata: null,
      }),
      succeed: async () => undefined,
      fail: async () => undefined,
    },
  };

  const result = await handler(
    {
      id: "job-1",
      workspaceId: "workspace-1",
      type: "collect.google",
      payload: { siteId: "site-1" },
      idempotencyKey: "weekly:site-1:2026-08-10",
      attempt: 1,
      maxAttempts: 5,
    },
    context,
  );

  assert.deepEqual(result, {
    status: "succeeded",
    metadata: { providerCallId: "provider-call-1" },
  });
  assert.deepEqual(invocations, ["execute", "collector.finished"]);
});

test("handler 결과 helper는 retry 시각과 DLQ 사유를 손실 없이 보존한다", () => {
  const retryAt = new Date("2026-08-12T00:05:00.000Z");
  assert.deepEqual(jobRetryable("RATE_LIMITED", retryAt), {
    status: "retryable",
    error: "RATE_LIMITED",
    retryAt,
  });
  assert.deepEqual(jobDead("INVALID_PAYLOAD"), {
    status: "dead",
    error: "INVALID_PAYLOAD",
  });
});
