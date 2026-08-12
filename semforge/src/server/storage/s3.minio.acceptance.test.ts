// @TASK P5-PRIVACY-S3 - Versioned object-store erasure acceptance
// @SPEC docs/ops/privacy-erasure-runbook.md
// @TEST scripts/test-s3-versioning.sh
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { test } from "node:test";

import { createPrivacyProcessor } from "@/server/privacy/processor";
import { S3PrivateObjectStorage } from "@/server/storage/s3";

const endpoint = process.env.SEMFORGE_MINIO_ENDPOINT;
const region = "us-east-1";
const bucket = process.env.SEMFORGE_MINIO_BUCKET ?? "semforge-privacy-acceptance";
const accessKeyId = process.env.SEMFORGE_MINIO_ACCESS_KEY ?? "semforge-minio-root";
const secretAccessKey = process.env.SEMFORGE_MINIO_SECRET_KEY ?? "semforge-minio-secret-acceptance";
const targetWorkspaceId = "51000000-0000-4000-8000-000000000001";
const foreignWorkspaceId = "51000000-0000-4000-8000-000000000002";

type QueryEntry = readonly [string, string];

interface VersionEntry {
  readonly key: string;
  readonly versionId: string;
  readonly kind: "version" | "delete-marker";
}

interface SignedRequestInput {
  readonly method: "DELETE" | "GET" | "PUT";
  readonly path: string;
  readonly query?: readonly QueryEntry[];
  readonly body?: string;
  readonly expectedStatuses: readonly number[];
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Uint8Array, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQuery(entries: readonly QueryEntry[]): string {
  return entries
    .map(([key, value]) => [awsEncode(key), awsEncode(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey, "en") || leftValue.localeCompare(rightValue, "en"))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function signingKey(secret: string, date: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), "s3"), "aws4_request");
}

function encodedPath(...segments: string[]): string {
  return `/${segments.map(awsEncode).join("/")}`;
}

async function signedRequest(input: SignedRequestInput): Promise<Response> {
  assert.ok(endpoint, "SEMFORGE_MINIO_ENDPOINT is required");
  const url = new URL(endpoint);
  url.pathname = input.path;
  url.search = canonicalQuery(input.query ?? []);
  const body = input.body ?? "";
  const payloadHash = sha256(body);
  const now = new Date();
  const longDate = now.toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/u, "Z");
  const shortDate = longDate.slice(0, 8);
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${longDate}\n`;
  const canonicalRequest = [
    input.method,
    url.pathname,
    canonicalQuery(input.query ?? []),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${shortDate}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", longDate, scope, sha256(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(secretAccessKey, shortDate))
    .update(stringToSign, "utf8")
    .digest("hex");
  const response = await fetch(url, {
    method: input.method,
    headers: {
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": longDate,
    },
    ...(body ? { body } : {}),
  });
  if (!input.expectedStatuses.includes(response.status)) {
    assert.fail(`${input.method} ${url} returned ${response.status}: ${await response.text()}`);
  }
  return response;
}

async function initializeVersionedBucket(): Promise<void> {
  await signedRequest({
    method: "PUT",
    path: encodedPath(bucket),
    expectedStatuses: [200, 409],
  });
  await signedRequest({
    method: "PUT",
    path: encodedPath(bucket),
    query: [["versioning", ""]],
    body: "<VersioningConfiguration xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><Status>Enabled</Status></VersioningConfiguration>",
    expectedStatuses: [200],
  });
}

async function putVersion(key: string, body: string): Promise<string> {
  const response = await signedRequest({
    method: "PUT",
    path: encodedPath(bucket, ...key.split("/")),
    body,
    expectedStatuses: [200],
  });
  const versionId = response.headers.get("x-amz-version-id");
  assert.ok(versionId, `PUT ${key} did not return a version id`);
  return versionId;
}

async function putDeleteMarker(key: string): Promise<string> {
  const response = await signedRequest({
    method: "DELETE",
    path: encodedPath(bucket, ...key.split("/")),
    expectedStatuses: [204],
  });
  assert.equal(response.headers.get("x-amz-delete-marker"), "true");
  const versionId = response.headers.get("x-amz-version-id");
  assert.ok(versionId, `DELETE ${key} did not return a delete-marker version id`);
  return versionId;
}

function xmlValue(xml: string, name: string): string | undefined {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "u").exec(xml);
  return match?.[1]
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}

async function listVersions(prefix: string): Promise<{
  entries: VersionEntry[];
  pages: number;
}> {
  const entries: VersionEntry[] = [];
  let pages = 0;
  let markers: readonly QueryEntry[] = [];
  while (true) {
    const response = await signedRequest({
      method: "GET",
      path: encodedPath(bucket),
      query: [["max-keys", "1000"], ["prefix", prefix], ["versions", ""], ...markers],
      expectedStatuses: [200],
    });
    const xml = await response.text();
    pages += 1;
    for (const match of xml.matchAll(/<(Version|DeleteMarker)>([\s\S]*?)<\/\1>/gu)) {
      const key = xmlValue(match[2]!, "Key");
      const versionId = xmlValue(match[2]!, "VersionId");
      assert.ok(key && versionId, "MinIO version response omitted Key or VersionId");
      entries.push({
        key,
        versionId,
        kind: match[1] === "Version" ? "version" : "delete-marker",
      });
    }
    if (xmlValue(xml, "IsTruncated") !== "true") return { entries, pages };
    const keyMarker = xmlValue(xml, "NextKeyMarker");
    const versionIdMarker = xmlValue(xml, "NextVersionIdMarker");
    assert.ok(keyMarker && versionIdMarker, "MinIO truncated response omitted continuation markers");
    markers = [["key-marker", keyMarker], ["version-id-marker", versionIdMarker]];
  }
}

async function seedMany(prefix: string, count: number): Promise<void> {
  const concurrency = 40;
  for (let offset = 0; offset < count; offset += concurrency) {
    await Promise.all(Array.from(
      { length: Math.min(concurrency, count - offset) },
      (_, index) => {
        const sequence = String(offset + index).padStart(4, "0");
        return putVersion(`${prefix}bulk/${sequence}.pdf`, `bulk-${sequence}`);
      },
    ));
  }
}

function stableEntries(entries: readonly VersionEntry[]): string[] {
  return entries.map((entry) => `${entry.kind}:${entry.key}:${entry.versionId}`).sort();
}

test("versioned MinIO에서 workspace 전체 version/delete-marker를 crash-safe하게 영구 삭제한다", {
  skip: endpoint ? false : "scripts/test-s3-versioning.sh로 로컬 MinIO를 시작해야 합니다",
}, async () => {
  assert.ok(endpoint, "SEMFORGE_MINIO_ENDPOINT is required");
  await initializeVersionedBucket();
  const targetPrefix = `reports/${targetWorkspaceId}/`;
  const foreignPrefix = `reports/${foreignWorkspaceId}/`;
  const dbKnownKey = `${targetPrefix}db-known/report.pdf`;
  const orphanKey = `${targetPrefix}orphan/put-succeeded-db-failed.pdf`;

  await putVersion(dbKnownKey, "db-known-v1");
  await putVersion(dbKnownKey, "db-known-v2");
  await putDeleteMarker(dbKnownKey);
  await putVersion(orphanKey, "orphan-v1");
  await putVersion(orphanKey, "orphan-v2");
  await putDeleteMarker(orphanKey);
  await seedMany(targetPrefix, 1_001);

  const foreignKey = `${foreignPrefix}must-survive/report.pdf`;
  await putVersion(foreignKey, "foreign-v1");
  await putVersion(foreignKey, "foreign-v2");
  await putDeleteMarker(foreignKey);

  const seededTarget = await listVersions(targetPrefix);
  const seededForeign = await listVersions(foreignPrefix);
  assert.equal(seededTarget.entries.length, 1_007);
  assert.ok(seededTarget.pages > 1, "target fixture must exercise ListObjectVersions pagination");
  assert.deepEqual(
    seededTarget.entries.filter((entry) => entry.key === dbKnownKey).map((entry) => entry.kind).sort(),
    ["delete-marker", "version", "version"],
  );
  assert.deepEqual(
    seededTarget.entries.filter((entry) => entry.key === orphanKey).map((entry) => entry.kind).sort(),
    ["delete-marker", "version", "version"],
  );

  let crashArmed = true;
  let observedVersionDeletes = 0;
  let observedPaginatedLists = 0;
  const observedFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (request.method === "GET" && url.searchParams.has("versions") && url.searchParams.has("key-marker")) {
      observedPaginatedLists += 1;
    }
    if (request.method === "DELETE" && url.searchParams.has("versionId")) {
      observedVersionDeletes += 1;
      if (crashArmed && observedVersionDeletes === 37) {
        crashArmed = false;
        throw new Error("simulated process crash during permanent version purge");
      }
    }
    return fetch(request);
  };
  const storage = new S3PrivateObjectStorage({
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    allowInsecureEndpoint: true,
    fetch: observedFetch,
  });
  const processor = createPrivacyProcessor({
    db: { async query() { return { rows: [] }; } },
    crypto: { decryptOrThrow() { return "unused"; } },
    google: { async revokeToken() {} },
    storage,
  });

  await assert.rejects(
    processor.deleteWorkspaceObjects({ workspaceId: targetWorkspaceId }),
    (error: unknown) => error instanceof Error && error.message === "PRIVACY_OBJECT_DELETE_FAILED",
  );
  const afterCrash = await listVersions(targetPrefix);
  assert.equal(afterCrash.entries.length, 971);

  await processor.deleteWorkspaceObjects({ workspaceId: targetWorkspaceId });
  assert.ok(observedPaginatedLists > 0, "production eraser must follow ListObjectVersions continuation markers");
  assert.deepEqual((await listVersions(targetPrefix)).entries, []);
  assert.deepEqual((await listVersions(targetPrefix)).entries, []);
  assert.deepEqual(stableEntries((await listVersions(foreignPrefix)).entries), stableEntries(seededForeign.entries));

  const restoredKey = `${targetPrefix}restored-after-backup/report.pdf`;
  await putVersion(restoredKey, "restored-v1");
  await putDeleteMarker(restoredKey);
  assert.equal((await listVersions(targetPrefix)).entries.length, 2);
  await processor.deleteWorkspaceObjects({ workspaceId: targetWorkspaceId });
  await processor.deleteWorkspaceObjects({ workspaceId: targetWorkspaceId });
  assert.deepEqual((await listVersions(targetPrefix)).entries, []);
  assert.deepEqual((await listVersions(targetPrefix)).entries, []);

  console.log(JSON.stringify({
    acceptance: "privacy-s3-versioned-erasure",
    seededTargetEntries: seededTarget.entries.length,
    targetListPages: seededTarget.pages,
    crashAfterPermanentDeletes: 36,
    retryFinalTargetEntries: 0,
    foreignEntriesPreserved: seededForeign.entries.length,
    restoredEntriesRepurged: 2,
  }));
});
