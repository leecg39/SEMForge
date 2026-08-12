import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defineJobHandler,
  jobSucceeded,
  type JobExecutionContext,
  type JobHandlerInput,
} from "@/server/jobs/contracts";
import { createBillingAccessGuardedJobHandler } from "@/worker/billing-gate";

function job(type: "collect.google" | "report.snapshot"): JobHandlerInput {
  return {
    id: "59000000-0000-4000-8000-000000000001",
    workspaceId: "59000000-0000-4000-8000-000000000002",
    type,
    payload: {},
    idempotencyKey: "billing-gate",
    attempt: 1,
    maxAttempts: 5,
  };
}

function context(audits: string[]): JobExecutionContext {
  return {
    workspaceId: "59000000-0000-4000-8000-000000000002",
    jobId: "59000000-0000-4000-8000-000000000001",
    attempt: 1,
    maxAttempts: 5,
    lease: { owner: "worker", token: "token", generation: 1, expiresAt: new Date("2026-08-17T00:10:00.000Z") },
    signal: new AbortController().signal,
    providerCalls: {} as JobExecutionContext["providerCalls"],
    now: () => new Date("2026-08-17T00:00:00.000Z"),
    audit: async (action) => { audits.push(action); },
  };
}

function database(status: string, currentPeriodEnd: Date | string = new Date("2026-09-01T00:00:00.000Z")) {
  let transaction = false;
  return {
    async query<T>() { return { rows: [] as T[] }; },
    async connect() {
      return {
        async query<T>(sql: string) {
          if (sql === "begin") transaction = true;
          if (sql === "commit" || sql === "rollback") transaction = false;
          if (sql.includes("from subscriptions")) {
            return { rows: [{ status, current_period_start: new Date("2026-08-01T00:00:00.000Z"), current_period_end: currentPeriodEnd, grace_ends_at: new Date("2026-08-30T00:00:00.000Z") }] as T[] };
          }
          return { rows: [] as T[] };
        },
        release() { assert.equal(transaction, false); },
      };
    },
  };
}

test("billing gate는 허용된 collection만 provider handler로 전달한다", async () => {
  let providerCalls = 0;
  const audits: string[] = [];
  const handler = createBillingAccessGuardedJobHandler({
    database: database("active"),
    delegate: defineJobHandler(async () => { providerCalls += 1; return jobSucceeded({ collected: true }); }),
  });

  assert.deepEqual(await handler(job("collect.google"), context(audits)), { status: "succeeded", metadata: { collected: true } });
  assert.equal(providerCalls, 1);
  assert.deepEqual(audits, []);
});

test("billing gate는 past_due collection과 report.snapshot을 provider/generator 호출 없이 terminal-success skip한다", async () => {
  let providerCalls = 0;
  const audits: string[] = [];
  const handler = createBillingAccessGuardedJobHandler({
    database: database("past_due"),
    delegate: defineJobHandler(async () => { providerCalls += 1; return jobSucceeded(); }),
  });

  for (const type of ["collect.google", "report.snapshot"] as const) {
    const result = await handler(job(type), context(audits));
    assert.equal(result.status, "succeeded");
    if (result.status === "succeeded") assert.deepEqual(result.metadata, { skipped: true, skipReason: "past_due_grace" });
  }
  assert.equal(providerCalls, 0);
  assert.deepEqual(audits, ["job.billing_access.skipped", "job.billing_access.skipped"]);
});

test("billing gate는 손상된 날짜와 알 수 없는 subscription status를 fail-closed skip한다", async () => {
  for (const source of [database("unknown"), database("active", "not-a-date")]) {
    let delegateCalls = 0;
    const handler = createBillingAccessGuardedJobHandler({
      database: source,
      delegate: defineJobHandler(async () => { delegateCalls += 1; return jobSucceeded(); }),
    });
    const result = await handler(job("collect.google"), context([]));
    assert.deepEqual(result, {
      status: "succeeded",
      metadata: { skipped: true, skipReason: "invalid_subscription" },
    });
    assert.equal(delegateCalls, 0);
  }
});
