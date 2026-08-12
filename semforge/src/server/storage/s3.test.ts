// @TASK P4-R1-T1 - Private S3-compatible storage contract
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { S3PrivateObjectStorage } from "@/server/storage/s3";

const now = new Date("2026-08-12T00:00:00.000Z");
const credentials = {
  endpoint: "https://objects.example.test",
  region: "ap-northeast-2",
  bucket: "semforge-private",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
} as const;

test("private PUT은 checksum·서버 암호화·If-None-Match를 서명하고 public ACL을 만들지 않는다", async () => {
  const requests: Request[] = [];
  const storage = new S3PrivateObjectStorage({
    ...credentials,
    clock: () => now,
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      return new Response(null, { status: 200 });
    },
  });
  const body = new TextEncoder().encode("immutable-pdf");
  const checksumSha256 = createHash("sha256").update(body).digest("hex");
  const contentIdentitySha256 = "b".repeat(64);

  const result = await storage.putPrivate({
    key: "reports/51000000-0000-4000-8000-000000000001/report/snapshot.pdf",
    body,
    contentType: "application/pdf",
    checksumSha256,
    contentIdentitySha256,
  });

  assert.deepEqual(result, { created: true, checksumSha256, sizeBytes: 13, contentIdentitySha256 });
  assert.equal(requests.length, 1);
  const request = requests[0]!;
  assert.equal(request.method, "PUT");
  assert.equal(request.url, "https://objects.example.test/semforge-private/reports/51000000-0000-4000-8000-000000000001/report/snapshot.pdf");
  assert.equal(request.headers.get("if-none-match"), "*");
  assert.equal(request.headers.get("x-amz-server-side-encryption"), "AES256");
  assert.equal(request.headers.get("x-amz-meta-sha256"), checksumSha256);
  assert.equal(request.headers.get("x-amz-meta-content-identity-sha256"), contentIdentitySha256);
  assert.equal(request.headers.get("x-amz-acl"), null);
  assert.match(request.headers.get("authorization") ?? "", /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//);
  assert.doesNotMatch(request.headers.get("authorization") ?? "", /wJalrXUtnFEMI/);
});

test("동일 key가 이미 있으면 metadata checksum을 검증하고 덮어쓰지 않는다", async () => {
  const body = new TextEncoder().encode("immutable-pdf");
  const checksumSha256 = createHash("sha256").update(body).digest("hex");
  const methods: string[] = [];
  const storage = new S3PrivateObjectStorage({
    ...credentials,
    clock: () => now,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      methods.push(request.method);
      if (request.method === "PUT") return new Response(null, { status: 412 });
      return new Response(null, {
        status: 200,
        headers: {
          "content-length": String(body.byteLength),
          "x-amz-meta-sha256": checksumSha256,
        },
      });
    },
  });

  const result = await storage.putPrivate({
    key: "reports/workspace/report/snapshot.pdf",
    body,
    contentType: "application/pdf",
    checksumSha256,
  });
  assert.deepEqual(methods, ["PUT", "HEAD"]);
  assert.deepEqual(result, { created: false, checksumSha256, sizeBytes: 13 });
});

test("signed GET URL은 최대 15분의 짧은 TTL과 고정 만료 시각을 갖고 secret을 노출하지 않는다", async () => {
  const storage = new S3PrivateObjectStorage({ ...credentials, clock: () => now });
  const signed = await storage.createSignedGetUrl(
    "reports/workspace/report/snapshot.pdf",
    { expiresInSeconds: 60 },
  );
  const url = new URL(signed.url);

  assert.equal(signed.expiresAt.toISOString(), "2026-08-12T00:01:00.000Z");
  assert.equal(url.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.equal(url.searchParams.get("X-Amz-Content-Sha256"), "UNSIGNED-PAYLOAD");
  assert.equal(url.searchParams.get("X-Amz-Date"), "20260812T000000Z");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "60");
  assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "host");
  assert.equal(url.searchParams.get("X-Amz-Signature"), "aea9f3d3a68df8fc53b1eebc833a8854fc85245f2e6daa3017b8cff5af97f28e");
  assert.doesNotMatch(signed.url, /wJalrXUtnFEMI|secretAccessKey/i);

  await assert.rejects(
    storage.createSignedGetUrl("reports/workspace/report/snapshot.pdf", { expiresInSeconds: 901 }),
    /expiresInSeconds/,
  );
});

test("privacy delete는 private object key를 DELETE로 서명하고 404를 멱등 성공으로 처리한다", async () => {
  const requests: Request[] = [];
  const storage = new S3PrivateObjectStorage({
    ...credentials,
    clock: () => now,
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      return new Response(null, { status: 404 });
    },
  });

  await storage.deletePrivate("reports/workspace/report/snapshot.pdf");

  assert.equal(requests.length, 1);
  const request = requests[0]!;
  assert.equal(request.method, "DELETE");
  assert.equal(request.url, "https://objects.example.test/semforge-private/reports/workspace/report/snapshot.pdf");
  assert.match(request.headers.get("authorization") ?? "", /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//);
  assert.doesNotMatch(request.headers.get("authorization") ?? "", /wJalrXUtnFEMI/);
});
