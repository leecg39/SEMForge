// @TASK P4-R1-T1 - Private S3-compatible storage contract
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  S3PrivateObjectStorage,
  type VersionedObjectEraser,
} from "@/server/storage/s3";

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

test("versioned object eraser는 exact key의 version과 delete marker를 모든 page에서 영구 삭제한다", async () => {
  const requests: Request[] = [];
  const key = "reports/고객 & a+b/report.pdf";
  const deleted = new Set<string>();
  const storage = new S3PrivateObjectStorage({
    ...credentials,
    clock: () => now,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.method === "DELETE") {
        deleted.add(new URL(request.url).searchParams.get("versionId") ?? "");
        return new Response(null, { status: 204 });
      }
      if (deleted.size === 3) {
        return new Response("<ListVersionsResult><IsTruncated>false</IsTruncated></ListVersionsResult>", { status: 200 });
      }
      const url = new URL(request.url);
      if (url.searchParams.get("key-marker")) {
        return new Response(`<?xml version="1.0" encoding="UTF-8"?>
          <ListVersionsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
            <IsTruncated>false</IsTruncated>
            <Version><Key>reports/고객 &amp; a+b/report.pdf</Key><VersionId>v-2</VersionId></Version>
          </ListVersionsResult>`, { status: 200 });
      }
      return new Response(`<?xml version="1.0" encoding="UTF-8"?>
        <ListVersionsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
          <IsTruncated>true</IsTruncated>
          <NextKeyMarker>reports/고객 &amp; a+b/report.pdf</NextKeyMarker>
          <NextVersionIdMarker>v/1+=</NextVersionIdMarker>
          <Version><Key>reports/고객 &amp; a+b/report.pdf</Key><VersionId>v-1</VersionId></Version>
          <Version><Key>reports/another.pdf</Key><VersionId>must-not-delete</VersionId></Version>
          <DeleteMarker><Key>reports/고객 &amp; a+b/report.pdf</Key><VersionId>dm-1</VersionId></DeleteMarker>
        </ListVersionsResult>`, { status: 200 });
    },
  });
  const eraser: VersionedObjectEraser = storage;

  await eraser.eraseAllVersions(key);

  assert.deepEqual(requests.map((request) => request.method), ["GET", "GET", "DELETE", "DELETE", "DELETE", "GET"]);
  const first = new URL(requests[0]!.url);
  assert.equal(first.pathname, "/semforge-private");
  assert.equal(first.searchParams.get("versions"), "");
  assert.equal(first.searchParams.get("prefix"), key);
  assert.equal(first.searchParams.has("key-marker"), false);
  const second = new URL(requests[1]!.url);
  assert.equal(second.searchParams.get("key-marker"), key);
  assert.equal(second.searchParams.get("version-id-marker"), "v/1+=");
  const deletes = requests.filter((request) => request.method === "DELETE");
  assert.deepEqual(
    deletes.map((request) => new URL(request.url).searchParams.get("versionId")),
    ["v-1", "dm-1", "v-2"],
  );
  assert.ok(deletes.every((request) => new URL(request.url).pathname === "/semforge-private/reports/%EA%B3%A0%EA%B0%9D%20%26%20a%2Bb/report.pdf"));
  assert.ok(requests.every((request) => request.headers.get("authorization")?.startsWith("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/")));
});

test("첫 삭제 중 restore로 새 version이 생기면 final empty 확인에서 찾아 같은 호출로 제거한다", async () => {
  const deleted: string[] = [];
  const versions = new Set(["original-version"]);
  const storage = new S3PrivateObjectStorage({
    ...credentials,
    clock: () => now,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (request.method === "DELETE") {
        const versionId = url.searchParams.get("versionId") ?? "";
        deleted.push(versionId);
        versions.delete(versionId);
        if (versionId === "original-version") versions.add("restored-version");
        return new Response(null, { status: 204 });
      }
      const entries = [...versions].map((versionId) => `<Version><Key>reports/workspace/report.pdf</Key><VersionId>${versionId}</VersionId></Version>`).join("");
      return new Response(`<ListVersionsResult><IsTruncated>false</IsTruncated>${entries}</ListVersionsResult>`, { status: 200 });
    },
  });

  await storage.eraseAllVersions("reports/workspace/report.pdf");

  assert.deepEqual(deleted, ["original-version", "restored-version"]);
});

test("매 삭제 후 새 version이 계속 생기면 bounded purge 한도 뒤 fail closed 한다", async () => {
  let generation = 0;
  const deleted: string[] = [];
  let currentVersion = `continual-${generation}`;
  const storage = new S3PrivateObjectStorage({
    ...credentials,
    clock: () => now,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.method === "DELETE") {
        deleted.push(new URL(request.url).searchParams.get("versionId") ?? "");
        generation += 1;
        currentVersion = `continual-${generation}`;
        return new Response(null, { status: 204 });
      }
      return new Response(`<ListVersionsResult><IsTruncated>false</IsTruncated><Version><Key>reports/workspace/report.pdf</Key><VersionId>${currentVersion}</VersionId></Version></ListVersionsResult>`, { status: 200 });
    },
  });

  await assert.rejects(
    storage.eraseAllVersions("reports/workspace/report.pdf"),
    (error: unknown) => error instanceof Error && error.message === "PROVIDER_ERROR",
  );
  assert.equal(deleted.length, 8);
});

test("version 목록 404와 빈 목록 및 version DELETE 404는 멱등 성공이다", async () => {
  let mode: "list-404" | "empty" | "delete-404" = "list-404";
  let deleteAttempted = false;
  const storage = new S3PrivateObjectStorage({
    ...credentials,
    clock: () => now,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      if (mode === "list-404") return new Response(null, { status: 404 });
      if (mode === "empty") {
        return new Response("<ListVersionsResult><IsTruncated>false</IsTruncated></ListVersionsResult>", { status: 200 });
      }
      if (request.method === "DELETE") {
        deleteAttempted = true;
        return new Response(null, { status: 404 });
      }
      if (deleteAttempted) {
        return new Response("<ListVersionsResult><IsTruncated>false</IsTruncated></ListVersionsResult>", { status: 200 });
      }
      return new Response("<ListVersionsResult><IsTruncated>false</IsTruncated><Version><Key>reports/workspace/report.pdf</Key><VersionId>already-gone</VersionId></Version></ListVersionsResult>", { status: 200 });
    },
  });

  await storage.eraseAllVersions("reports/workspace/report.pdf");
  mode = "empty";
  await storage.eraseAllVersions("reports/workspace/report.pdf");
  mode = "delete-404";
  await storage.eraseAllVersions("reports/workspace/report.pdf");
});

test("신뢰할 수 없는 version 목록은 어떤 version도 삭제하지 않고 fail closed 한다", async () => {
  const unsafeLists = [
    "<ListVersionsResult><IsTruncated>false</IsTruncated><Version><Key>reports/workspace/report.pdf</Key><VersionId>v-1</VersionId></Version>",
    "<ListVersionsResult><IsTruncated>true</IsTruncated><Version><Key>reports/workspace/report.pdf</Key><VersionId>v-1</VersionId></Version></ListVersionsResult>",
    "<ListVersionsResult><IsTruncated>true</IsTruncated><NextKeyMarker>k</NextKeyMarker><Version><Key>reports/workspace/report.pdf</Key><VersionId>v-1</VersionId></Version></ListVersionsResult>",
    "<!DOCTYPE x [<!ENTITY leak SYSTEM 'file:///private/secret'>]><ListVersionsResult><IsTruncated>false</IsTruncated></ListVersionsResult>",
    "<ListVersionsResult><IsTruncated>false</IsTruncated><Version><Key>reports/workspace/report.pdf</Key><VersionId></VersionId></Version></ListVersionsResult>",
    "<ListVersionsResult>&unterminated<IsTruncated>false</IsTruncated></ListVersionsResult>",
    "<ListVersionsResult><IsTruncated>false</IsTruncated>illegal ]]> literal</ListVersionsResult>",
    "<?xml version=\"1.0\"?><?xml version=\"1.0\"?><ListVersionsResult><IsTruncated>false</IsTruncated></ListVersionsResult>",
    "<ListVersionsResult xmlns=\"&unterminated\"><IsTruncated>false</IsTruncated></ListVersionsResult>",
  ];

  for (const body of unsafeLists) {
    let deleteCalls = 0;
    const storage = new S3PrivateObjectStorage({
      ...credentials,
      clock: () => now,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        if (request.method === "DELETE") deleteCalls += 1;
        return new Response(body, { status: 200 });
      },
    });
    await assert.rejects(
      storage.eraseAllVersions("reports/workspace/report.pdf"),
      (error: unknown) => error instanceof Error && error.message === "PROVIDER_ERROR",
    );
    assert.equal(deleteCalls, 0);
  }
});

test("opaque version id의 공백은 보존하고 trailing-space 이웃 key는 삭제하지 않는다", async () => {
  const deleted: string[] = [];
  let purged = false;
  const storage = new S3PrivateObjectStorage({
    ...credentials,
    clock: () => now,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.method === "DELETE") {
        deleted.push(new URL(request.url).searchParams.get("versionId") ?? "");
        purged = true;
        return new Response(null, { status: 204 });
      }
      if (purged) return new Response("<ListVersionsResult><IsTruncated>false</IsTruncated></ListVersionsResult>", { status: 200 });
      return new Response(`<ListVersionsResult><IsTruncated>false</IsTruncated>
        <Version><Key>reports/workspace/report.pdf</Key><VersionId> opaque + id </VersionId></Version>
        <Version><Key>reports/workspace/report.pdf </Key><VersionId>must-not-delete</VersionId></Version>
      </ListVersionsResult>`, { status: 200 });
    },
  });

  await storage.eraseAllVersions("reports/workspace/report.pdf");

  assert.deepEqual(deleted, [" opaque + id "]);
});

test("pagination continuation 404는 불완전 열거로 fail closed 하고 앞 page도 삭제하지 않는다", async () => {
  let deletes = 0;
  let listCalls = 0;
  const storage = new S3PrivateObjectStorage({
    ...credentials,
    clock: () => now,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.method === "DELETE") {
        deletes += 1;
        return new Response(null, { status: 204 });
      }
      listCalls += 1;
      if (listCalls === 2) return new Response(null, { status: 404 });
      return new Response(`<ListVersionsResult><IsTruncated>true</IsTruncated>
        <NextKeyMarker>reports/workspace/report.pdf</NextKeyMarker><NextVersionIdMarker>v-1</NextVersionIdMarker>
        <Version><Key>reports/workspace/report.pdf</Key><VersionId>v-1</VersionId></Version>
      </ListVersionsResult>`, { status: 200 });
    },
  });

  await assert.rejects(
    storage.eraseAllVersions("reports/workspace/report.pdf"),
    (error: unknown) => error instanceof Error && error.message === "PROVIDER_ERROR",
  );
  assert.equal(deletes, 0);
});

test("version 목록·삭제 provider 오류는 비밀값과 object key를 예외에 노출하지 않는다", async () => {
  const secretKey = "reports/private-customer-id/report.pdf";
  for (const failurePoint of ["list", "delete"] as const) {
    const storage = new S3PrivateObjectStorage({
      ...credentials,
      clock: () => now,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        if (failurePoint === "list") throw new Error(`upstream leaked ${credentials.secretAccessKey} ${secretKey}`);
        if (request.method === "DELETE") {
          return new Response(`provider leaked ${credentials.secretAccessKey} ${secretKey}`, { status: 503 });
        }
        return new Response(`<ListVersionsResult><IsTruncated>false</IsTruncated><Version><Key>${secretKey}</Key><VersionId>v-1</VersionId></Version></ListVersionsResult>`, { status: 200 });
      },
    });
    await assert.rejects(storage.eraseAllVersions(secretKey), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "PROVIDER_ERROR");
      assert.doesNotMatch(error.message, /private-customer|wJalrXUtnFEMI/u);
      return true;
    });
  }
});

test("version list와 version DELETE의 percent encoding 및 SigV4는 고정 fixture와 일치한다", async () => {
  const requests: Request[] = [];
  let deleted = false;
  const storage = new S3PrivateObjectStorage({
    ...credentials,
    clock: () => now,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.method === "DELETE") {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      if (deleted) {
        return new Response("<ListVersionsResult><IsTruncated>false</IsTruncated></ListVersionsResult>", { status: 200 });
      }
      return new Response("<ListVersionsResult><IsTruncated>false</IsTruncated><Version><Key>reports/고객 &amp; a+b/report.pdf</Key><VersionId>v/1+=</VersionId></Version></ListVersionsResult>", { status: 200 });
    },
  });

  await storage.eraseAllVersions("reports/고객 & a+b/report.pdf");

  assert.equal(requests[0]!.url, "https://objects.example.test/semforge-private?prefix=reports%2F%EA%B3%A0%EA%B0%9D%20%26%20a%2Bb%2Freport.pdf&versions=");
  assert.equal(
    requests[0]!.headers.get("authorization"),
    "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20260812/ap-northeast-2/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=baf1b0d1ce9cdc2b3eb56999fd41ecc01e47000f73c258859927835a4a693dc5",
  );
  assert.equal(requests[1]!.url, "https://objects.example.test/semforge-private/reports/%EA%B3%A0%EA%B0%9D%20%26%20a%2Bb/report.pdf?versionId=v%2F1%2B%3D");
  assert.equal(
    requests[1]!.headers.get("authorization"),
    "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20260812/ap-northeast-2/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=6122ff0c152c2835d92223219c700573c2e7383ce393e8b545e6f7175d531417",
  );
});
