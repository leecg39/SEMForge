// @TASK P5-S1-T1 - Encrypted password-reset email delivery
// @SPEC docs/planning/06-tasks.md#p2-a1-t1--초대-전용-인증과-세션
// @TEST src/server/auth/password-reset-email.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { createSecretCrypto } from "@/lib/crypto";
import { passwordResetDeliveryAad } from "@/server/auth/postgres-store";
import {
  createPasswordResetEmailJobHandler,
  PASSWORD_RESET_EMAIL_JOB,
  PostgresPasswordResetEmailStore,
  PostgresPasswordResetEmailSuppressionPolicy,
  type PasswordResetEmailScrubInput,
} from "@/server/auth/password-reset-email";
import type { JobExecutionContext, JobHandlerInput } from "@/server/jobs/contracts";
import { ReportEmailSenderError } from "@/server/reports/delivery/service";

const workspaceId = "81000000-0000-4000-8000-000000000001";
const resetId = "81000000-0000-4000-8000-000000000002";
const jobId = "81000000-0000-4000-8000-000000000003";
const now = new Date("2026-08-12T05:00:00.000Z");
const expiresAt = new Date("2026-08-12T05:30:00.000Z");
const crypto = createSecretCrypto({
  currentKeyId: "password-reset-test",
  currentSecret: "password-reset-test-secret-that-is-at-least-32-bytes",
});
const notSuppressed = { async isSuppressed() { return false; } };

function encryptedPayload(expiry = expiresAt) {
  const delivery = {
    email: "owner@example.com",
    resetUrl: "https://app.semforge.test/reset-password/secure-reset-token",
    expiresAt: expiry.toISOString(),
  };
  return {
    kind: "password_reset",
    resetId,
    expiresAt: expiry.toISOString(),
    encryptedDelivery: crypto.encrypt(
      JSON.stringify(delivery),
      passwordResetDeliveryAad(workspaceId, resetId),
    ),
  };
}

function job(
  payload: Record<string, unknown> = encryptedPayload(),
  attempt = 1,
  maxAttempts = 5,
): JobHandlerInput {
  return {
    id: jobId,
    workspaceId,
    type: PASSWORD_RESET_EMAIL_JOB,
    payload,
    idempotencyKey: `outbox:${PASSWORD_RESET_EMAIL_JOB}:password-reset:${resetId}`,
    attempt,
    maxAttempts,
  };
}

function context(clock = now): JobExecutionContext {
  return {
    workspaceId,
    jobId,
    attempt: 1,
    maxAttempts: 5,
    lease: {
      owner: "password-reset-worker",
      token: "81000000-0000-4000-8000-000000000004",
      generation: 1,
      expiresAt: new Date("2026-08-12T05:01:00.000Z"),
    },
    signal: new AbortController().signal,
    providerCalls: {
      async reserve() { throw new Error("not used"); },
      async succeed() { throw new Error("not used"); },
      async fail() { throw new Error("not used"); },
    },
    now: () => clock,
    async audit() {},
  };
}

test("password reset worker는 처리 직전에만 복호화하고 Resend stable idempotency 후 양쪽 payload를 scrub한다", async () => {
  const sent: Record<string, unknown>[] = [];
  const scrubbed: PasswordResetEmailScrubInput[] = [];
  const handler = createPasswordResetEmailJobHandler({
    crypto,
    suppression: notSuppressed,
    sender: {
      async sendTransactional(input) {
        sent.push({ ...input });
        return { providerMessageId: "resend-reset-message-1" };
      },
    },
    store: { async scrub(input) { scrubbed.push(input); } },
  });

  const payload = encryptedPayload();
  assert.equal(JSON.stringify(payload).includes("owner@example.com"), false);
  assert.equal(JSON.stringify(payload).includes("secure-reset-token"), false);
  assert.deepEqual(await handler(job(payload), context()), {
    status: "succeeded",
    metadata: { resetId, deliveryStatus: "delivered" },
  });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {
    recipient: "owner@example.com",
    subject: "SEMForge 비밀번호 재설정",
    html: '<p>요청한 비밀번호 재설정 링크입니다.</p><p><a href="https://app.semforge.test/reset-password/secure-reset-token">비밀번호 재설정</a></p><p>이 링크는 30분 후 만료됩니다.</p>',
    idempotencyKey: `password-reset:${resetId}`,
  });
  assert.deepEqual(scrubbed, [{
    workspaceId,
    jobId,
    resetId,
    state: "delivered",
    scrubbedAt: now,
    providerMessageId: "resend-reset-message-1",
  }]);
});

test("retryable provider 실패는 암호문을 유지하고 마지막 attempt에서만 terminal scrub한다", async () => {
  const scrubbed: PasswordResetEmailScrubInput[] = [];
  const handler = createPasswordResetEmailJobHandler({
    crypto,
    suppression: notSuppressed,
    sender: {
      async sendTransactional() {
        throw new ReportEmailSenderError("retryable", "provider detail must be hidden");
      },
    },
    store: { async scrub(input) { scrubbed.push(input); } },
  });

  assert.deepEqual(await handler(job(encryptedPayload(), 2, 5), context()), {
    status: "retryable",
    error: "PASSWORD_RESET_EMAIL_RETRYABLE",
  });
  assert.deepEqual([...scrubbed], []);
  assert.deepEqual(await handler(job(encryptedPayload(), 5, 5), context()), {
    status: "dead",
    error: "PASSWORD_RESET_EMAIL_RETRY_EXHAUSTED",
  });
  assert.equal(scrubbed.at(-1)?.state, "retry_exhausted");
});

test("provider reject와 만료 delivery는 평문 복호화 결과를 남기지 않고 terminal scrub한다", async () => {
  const scrubbed: PasswordResetEmailScrubInput[] = [];
  let sendCalls = 0;
  const rejected = createPasswordResetEmailJobHandler({
    crypto,
    suppression: notSuppressed,
    sender: {
      async sendTransactional() {
        sendCalls += 1;
        throw new ReportEmailSenderError("rejected", "recipient PII");
      },
    },
    store: { async scrub(input) { scrubbed.push(input); } },
  });
  assert.deepEqual(await rejected(job(), context()), {
    status: "dead",
    error: "PASSWORD_RESET_EMAIL_REJECTED",
  });
  assert.equal(scrubbed.at(-1)?.state, "rejected");

  const expired = createPasswordResetEmailJobHandler({
    crypto,
    suppression: notSuppressed,
    sender: { async sendTransactional() { sendCalls += 1; return { providerMessageId: "must-not-send" }; } },
    store: { async scrub(input) { scrubbed.push(input); } },
  });
  assert.deepEqual(
    await expired(job(encryptedPayload(new Date("2026-08-12T04:59:59.000Z"))), context()),
    { status: "dead", error: "PASSWORD_RESET_EMAIL_EXPIRED" },
  );
  assert.equal(scrubbed.at(-1)?.state, "expired");
  assert.equal(sendCalls, 1);
});

test("전송 후 crash로 scrubbed marker만 남은 재실행은 provider를 호출하지 않고 확정 상태를 재생한다", async () => {
  let sendCalls = 0;
  const handler = createPasswordResetEmailJobHandler({
    crypto,
    suppression: notSuppressed,
    sender: { async sendTransactional() { sendCalls += 1; return { providerMessageId: "duplicate" }; } },
    store: { async scrub() { throw new Error("must not scrub twice"); } },
  });

  assert.deepEqual(await handler(job({
    kind: "password_reset_scrubbed",
    resetId,
    state: "delivered",
    scrubbedAt: now.toISOString(),
  }), context()), {
    status: "succeeded",
    metadata: { resetId, deliveryStatus: "already_delivered" },
  });
  assert.equal(sendCalls, 0);
});

test("provider 성공 뒤 scrub 실패는 같은 Resend idempotency key로 재시도해 중복 발송을 막는다", async () => {
  const keys: string[] = [];
  let scrubCalls = 0;
  const handler = createPasswordResetEmailJobHandler({
    crypto,
    suppression: notSuppressed,
    sender: {
      async sendTransactional(input) {
        keys.push(input.idempotencyKey);
        return { providerMessageId: "resend-stable-message" };
      },
    },
    store: {
      async scrub() {
        scrubCalls += 1;
        if (scrubCalls === 1) throw new Error("transient database outage");
      },
    },
  });

  assert.deepEqual(await handler(job(encryptedPayload(), 1, 5), context()), {
    status: "retryable",
    error: "PASSWORD_RESET_EMAIL_SCRUB_RETRYABLE",
  });
  assert.equal((await handler(job(encryptedPayload(), 2, 5), context())).status, "succeeded");
  assert.deepEqual(keys, [`password-reset:${resetId}`, `password-reset:${resetId}`]);
});

test("AAD가 다른 workspace로 이동하거나 암호문이 변조되면 provider 호출 없이 invalid scrub한다", async () => {
  const scrubbed: PasswordResetEmailScrubInput[] = [];
  let sendCalls = 0;
  const handler = createPasswordResetEmailJobHandler({
    crypto,
    suppression: notSuppressed,
    sender: { async sendTransactional() { sendCalls += 1; return { providerMessageId: "must-not-send" }; } },
    store: { async scrub(input) { scrubbed.push(input); } },
  });
  const payload = encryptedPayload();
  const encrypted = String(payload.encryptedDelivery);
  payload.encryptedDelivery = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;

  assert.deepEqual(await handler(job(payload), context()), {
    status: "dead",
    error: "PASSWORD_RESET_EMAIL_INVALID_PAYLOAD",
  });
  assert.equal(sendCalls, 0);
  assert.equal(scrubbed[0]?.state, "invalid");
});

test("형식이 손상된 reset payload도 식별자가 있으면 scrub하고 DB 장애 시 dead 전에 재시도한다", async () => {
  const invalidPayload = {
    kind: "password_reset",
    resetId,
    encryptedDelivery: "plaintext-must-not-survive",
    expiresAt: expiresAt.toISOString(),
  };
  const scrubbed: PasswordResetEmailScrubInput[] = [];
  const scrubbedHandler = createPasswordResetEmailJobHandler({
    crypto,
    suppression: notSuppressed,
    sender: { async sendTransactional() { throw new Error("must not send"); } },
    store: { async scrub(input) { scrubbed.push(input); } },
  });
  assert.deepEqual(await scrubbedHandler(job(invalidPayload, 5, 5), context()), {
    status: "dead",
    error: "PASSWORD_RESET_EMAIL_INVALID_PAYLOAD",
  });
  assert.equal(scrubbed[0]?.state, "invalid");

  const unavailableStoreHandler = createPasswordResetEmailJobHandler({
    crypto,
    suppression: notSuppressed,
    sender: { async sendTransactional() { throw new Error("must not send"); } },
    store: { async scrub() { throw new Error("temporary database outage"); } },
  });
  assert.deepEqual(await unavailableStoreHandler(job(invalidPayload, 5, 5), context()), {
    status: "retryable",
    error: "PASSWORD_RESET_EMAIL_SCRUB_RETRYABLE",
  });
});

test("이미 queue에 있던 password reset도 수신자가 suppression되면 provider 호출 전 terminal scrub한다", async () => {
  const scrubbed: PasswordResetEmailScrubInput[] = [];
  let sendCalls = 0;
  const handler = createPasswordResetEmailJobHandler({
    crypto,
    suppression: {
      async isSuppressed(input) {
        assert.deepEqual(input, {
          workspaceId,
          recipient: "owner@example.com",
        });
        return true;
      },
    },
    sender: {
      async sendTransactional() {
        sendCalls += 1;
        return { providerMessageId: "must-not-send" };
      },
    },
    store: { async scrub(input) { scrubbed.push(input); } },
  });

  assert.deepEqual(await handler(job(encryptedPayload()), context()), {
    status: "dead",
    error: "PASSWORD_RESET_EMAIL_SUPPRESSED",
  });
  assert.equal(sendCalls, 0);
  assert.equal(scrubbed.length, 1);
  assert.equal(scrubbed[0]?.state, "rejected");
});

test("password reset suppression policy는 auth에서 active membership만 찾고 worker를 workspace별로 pin한다", async () => {
  const secondWorkspaceId = "81000000-0000-4000-8000-000000000005";
  const unrelatedWorkspaceId = "81000000-0000-4000-8000-000000000006";
  const identityQueries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const tenantQueries: Array<{ workspaceId: string; text: string; values?: readonly unknown[] }> = [];
  let activeWorkspace = "";
  const policy = new PostgresPasswordResetEmailSuppressionPolicy({
    identityDatabase: {
      async query<T = unknown>(text: string, values?: readonly unknown[]) {
        identityQueries.push({ text, values });
        return { rows: [
          { workspace_id: workspaceId },
          { workspace_id: secondWorkspaceId },
        ] as T[] };
      },
    },
    tenantDatabase: {
      async connect() {
        return {
          async query<T = unknown>(text: string, values?: readonly unknown[]) {
            if (text === "begin" || text === "commit" || text === "rollback") {
              return { rows: [] as T[] };
            }
            if (text.includes("set_config")) {
              activeWorkspace = String(values?.[0]);
              return { rows: [] as T[] };
            }
            tenantQueries.push({ workspaceId: activeWorkspace, text, values });
            return {
              rows: [{ suppressed: activeWorkspace === secondWorkspaceId }] as T[],
            };
          },
          release() {},
        };
      },
    },
  });

  assert.equal(await policy.isSuppressed({
    workspaceId,
    recipient: "  OWNER@EXAMPLE.COM ",
  }), true);
  assert.equal(identityQueries.length, 1);
  assert.deepEqual(identityQueries[0]?.values, ["owner@example.com"]);
  assert.deepEqual(tenantQueries.map((query) => query.workspaceId), [
    workspaceId,
    secondWorkspaceId,
  ]);
  assert.equal(tenantQueries.some((query) => query.workspaceId === unrelatedWorkspaceId), false);
  for (const query of tenantQueries) {
    assert.deepEqual(query.values, [
      query.workspaceId,
      "c8cd3c6427301eaf6665bccacd65ddb614527acc843a15463e3faba57124c351",
    ]);
  }
});

test("suppression 조회 장애는 fail-open 발송 없이 retryable로 남긴다", async () => {
  let sendCalls = 0;
  const handler = createPasswordResetEmailJobHandler({
    crypto,
    suppression: { async isSuppressed() { throw new Error("tenant database unavailable"); } },
    sender: {
      async sendTransactional() {
        sendCalls += 1;
        return { providerMessageId: "must-not-send" };
      },
    },
    store: { async scrub() { throw new Error("must not scrub uncertain policy"); } },
  });

  assert.deepEqual(await handler(job(encryptedPayload()), context()), {
    status: "retryable",
    error: "PASSWORD_RESET_EMAIL_SUPPRESSION_RETRYABLE",
  });
  assert.equal(sendCalls, 0);
});

test("password reset delivery fence는 shared recipient lock부터 suppression 재확인·Resend·scrub commit까지 같은 connection에 고정한다", async () => {
  const secondWorkspaceId = "81000000-0000-4000-8000-000000000005";
  const events: string[] = [];
  let activeWorkspace = "";
  const fenceConnection = {
    async query<T = unknown>(text: string, values?: readonly unknown[]) {
      if (text === "begin" || text === "commit" || text === "rollback") {
        events.push(text);
        return { rows: [] as T[] };
      }
      if (text.includes("set_config")) {
        activeWorkspace = String(values?.[0]);
        events.push(`tenant:${activeWorkspace}`);
        return { rows: [] as T[] };
      }
      if (text.includes("privacy_lock_recipient_email_shared")) {
        events.push(`lock:${activeWorkspace}:${values?.[1]}`);
        return { rows: [] as T[] };
      }
      if (text.includes("from email_suppressions")) {
        events.push(`suppression:${activeWorkspace}:${values?.[1]}`);
        return { rows: [{ suppressed: false }] as T[] };
      }
      if (text.includes("scrub_password_reset_delivery")) {
        events.push(`scrub:${activeWorkspace}:${values?.[3]}:${values?.[5]}`);
        return { rows: [{ scrubbed: true }] as T[] };
      }
      throw new Error(`unexpected query: ${text}`);
    },
    release(error?: Error) {
      events.push(error ? `release:${error.message}` : "release");
    },
  };
  const policy = new PostgresPasswordResetEmailSuppressionPolicy({
    identityDatabase: {
      async query<T = unknown>() {
        return { rows: [{ workspace_id: secondWorkspaceId }] as T[] };
      },
    },
    tenantDatabase: {
      async connect() { throw new Error("non-fenced suppression pool must not be used"); },
    },
    deliveryFenceDatabase: {
      async connect() { return fenceConnection; },
    },
  });
  const handler = createPasswordResetEmailJobHandler({
    crypto,
    suppression: policy,
    sender: {
      async sendTransactional(input) {
        events.push(`send:${input.recipient}:${input.idempotencyKey}`);
        return { providerMessageId: "resend-fenced-message" };
      },
    },
    store: new PostgresPasswordResetEmailStore({
      async query() { throw new Error("default scrub pool must not be used"); },
    }),
  });

  assert.deepEqual(await handler(job(encryptedPayload()), context()), {
    status: "succeeded",
    metadata: { resetId, deliveryStatus: "delivered" },
  });
  const expectedHash = "c8cd3c6427301eaf6665bccacd65ddb614527acc843a15463e3faba57124c351";
  assert.deepEqual(events, [
    "begin",
    `tenant:${workspaceId}`,
    `lock:${workspaceId}:${expectedHash}`,
    `tenant:${secondWorkspaceId}`,
    `lock:${secondWorkspaceId}:${expectedHash}`,
    `tenant:${workspaceId}`,
    `suppression:${workspaceId}:${expectedHash}`,
    `tenant:${secondWorkspaceId}`,
    `suppression:${secondWorkspaceId}:${expectedHash}`,
    `tenant:${workspaceId}`,
    `send:owner@example.com:password-reset:${resetId}`,
    `scrub:${workspaceId}:delivered:resend-fenced-message`,
    "commit",
    "release",
  ]);
});

test("password reset delivery fence는 lock 내부 suppression 발견 시 Resend 0회로 terminal scrub을 같은 transaction에서 commit한다", async () => {
  const secondWorkspaceId = "81000000-0000-4000-8000-000000000005";
  const events: string[] = [];
  let activeWorkspace = "";
  const fenceConnection = {
    async query<T = unknown>(text: string, values?: readonly unknown[]) {
      if (text === "begin" || text === "commit" || text === "rollback") {
        events.push(text);
        return { rows: [] as T[] };
      }
      if (text.includes("set_config")) {
        activeWorkspace = String(values?.[0]);
        events.push(`tenant:${activeWorkspace}`);
        return { rows: [] as T[] };
      }
      if (text.includes("privacy_lock_recipient_email_shared")) {
        events.push(`lock:${activeWorkspace}`);
        return { rows: [] as T[] };
      }
      if (text.includes("from email_suppressions")) {
        events.push(`suppression:${activeWorkspace}`);
        return { rows: [{ suppressed: activeWorkspace === secondWorkspaceId }] as T[] };
      }
      if (text.includes("scrub_password_reset_delivery")) {
        events.push(`scrub:${activeWorkspace}:${values?.[3]}`);
        return { rows: [{ scrubbed: true }] as T[] };
      }
      throw new Error(`unexpected query: ${text}`);
    },
    release(error?: Error) {
      events.push(error ? `release:${error.message}` : "release");
    },
  };
  const policy = new PostgresPasswordResetEmailSuppressionPolicy({
    identityDatabase: {
      async query<T = unknown>() {
        return { rows: [{ workspace_id: secondWorkspaceId }] as T[] };
      },
    },
    tenantDatabase: {
      async connect() { throw new Error("non-fenced suppression pool must not be used"); },
    },
    deliveryFenceDatabase: {
      async connect() { return fenceConnection; },
    },
  });
  let sendCalls = 0;
  const handler = createPasswordResetEmailJobHandler({
    crypto,
    suppression: policy,
    sender: {
      async sendTransactional() {
        sendCalls += 1;
        return { providerMessageId: "must-not-send" };
      },
    },
    store: new PostgresPasswordResetEmailStore({
      async query() { throw new Error("default scrub pool must not be used"); },
    }),
  });

  assert.deepEqual(await handler(job(encryptedPayload()), context()), {
    status: "dead",
    error: "PASSWORD_RESET_EMAIL_SUPPRESSED",
  });
  assert.equal(sendCalls, 0);
  assert.deepEqual(events, [
    "begin",
    `tenant:${workspaceId}`,
    `lock:${workspaceId}`,
    `tenant:${secondWorkspaceId}`,
    `lock:${secondWorkspaceId}`,
    `tenant:${workspaceId}`,
    `suppression:${workspaceId}`,
    `tenant:${secondWorkspaceId}`,
    `suppression:${secondWorkspaceId}`,
    `tenant:${workspaceId}`,
    `scrub:${workspaceId}:rejected`,
    "commit",
    "release",
  ]);
});
