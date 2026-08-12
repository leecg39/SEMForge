// @TASK P4-R1-T1 - Resend email adapter contract
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import assert from "node:assert/strict";
import { test } from "node:test";

import { ResendEmailSender, ResendEmailError } from "@/server/reports/delivery/resend";

test("Resend POST는 attachment와 snapshot header를 같은 256자 이하 idempotency key로 보낸다", async () => {
  const requests: Request[] = [];
  const sender = new ResendEmailSender({
    apiKey: "re_test_secret_api_key",
    from: "SEMForge <reports@semforge.example>",
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json({ id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
    },
  });
  const idempotencyKey = "report-email:57000000-0000-4000-8000-000000000003:0123456789abcdef";
  const hash = "a".repeat(64);

  const result = await sender.send({
    recipient: "customer@example.test",
    subject: "주간 검색 성과",
    html: `<html data-snapshot-sha256="${hash}"></html>`,
    idempotencyKey,
    snapshotSha256: hash,
    attachment: {
      filename: "semforge-report-2026-08-06.pdf",
      content: new TextEncoder().encode("%PDF-1.7"),
      contentType: "application/pdf",
    },
  });

  assert.deepEqual(result, { providerMessageId: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
  assert.equal(requests.length, 1);
  const request = requests[0]!;
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(request.method, "POST");
  assert.equal(request.headers.get("authorization"), "Bearer re_test_secret_api_key");
  assert.equal(request.headers.get("idempotency-key"), idempotencyKey);
  const payload = await request.json() as Record<string, unknown>;
  assert.deepEqual(payload, {
    from: "SEMForge <reports@semforge.example>",
    to: ["customer@example.test"],
    subject: "주간 검색 성과",
    html: `<html data-snapshot-sha256="${hash}"></html>`,
    headers: { "X-SEMForge-Snapshot-SHA256": hash },
    attachments: [{
      filename: "semforge-report-2026-08-06.pdf",
      content: Buffer.from("%PDF-1.7").toString("base64"),
    }],
  });
});

test("Resend 오류 본문·API key·수신 PII는 예외에 노출하지 않는다", async () => {
  const sender = new ResendEmailSender({
    apiKey: "re_live_secret_must_not_leak",
    from: "SEMForge <reports@semforge.example>",
    fetch: async () => Response.json({
      name: "rate_limit_exceeded",
      message: "customer@example.test token=re_live_secret_must_not_leak",
    }, { status: 429 }),
  });

  await assert.rejects(
    sender.send({
      recipient: "customer@example.test",
      subject: "주간 검색 성과",
      html: "<p>report</p>",
      idempotencyKey: "report-email:id:hash",
      snapshotSha256: "b".repeat(64),
      attachment: {
        filename: "report.pdf",
        content: new TextEncoder().encode("%PDF"),
        contentType: "application/pdf",
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ResendEmailError);
      assert.equal(error.code, "RETRYABLE");
      assert.equal(error.message, "RESEND_RETRYABLE");
      assert.doesNotMatch(String(error), /customer@|re_live|token=/i);
      return true;
    },
  );
});

test("Resend 409는 idempotency 충돌 종류에 따라 terminal과 retryable을 구분한다", async () => {
  const input = {
    recipient: "customer@example.test",
    subject: "주간 검색 성과",
    html: "<p>report</p>",
    idempotencyKey: "report-email:id:hash",
    snapshotSha256: "c".repeat(64),
    attachment: {
      filename: "report.pdf",
      content: new TextEncoder().encode("%PDF"),
      contentType: "application/pdf" as const,
    },
  };
  for (const [name, expected] of [
    ["invalid_idempotent_request", "REJECTED"],
    ["concurrent_idempotent_requests", "RETRYABLE"],
  ] as const) {
    const sender = new ResendEmailSender({
      apiKey: "re_test_secret",
      from: "reports@example.test",
      fetch: async () => Response.json({ name, message: "hidden provider details" }, { status: 409 }),
    });
    await assert.rejects(sender.send(input), (error: unknown) => {
      assert.ok(error instanceof ResendEmailError);
      assert.equal(error.code, expected);
      assert.equal(error.message, `RESEND_${expected}`);
      return true;
    });
  }
});
