// @TASK P4-R1-T1 - Private S3-compatible object storage and SigV4 URLs
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import { createHash, createHmac } from "node:crypto";

const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");
const MAX_OBJECT_BYTES = 25 * 1024 * 1024;

export interface PutPrivateObjectInput {
  readonly key: string;
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly checksumSha256: string;
  /** PDF bytes may vary across Chromium runs; this binds the immutable object to its report snapshot. */
  readonly contentIdentitySha256?: string;
}

export interface PutPrivateObjectResult {
  readonly created: boolean;
  readonly checksumSha256: string;
  readonly sizeBytes: number;
  readonly contentIdentitySha256?: string;
}

export interface SignedObjectUrl {
  readonly url: string;
  readonly expiresAt: Date;
}

export interface PrivateObjectStorage {
  putPrivate(input: PutPrivateObjectInput): Promise<PutPrivateObjectResult>;
  getPrivate(key: string): Promise<Uint8Array>;
  createSignedGetUrl(key: string, input: { expiresInSeconds: number }): Promise<SignedObjectUrl>;
}

export class ObjectStorageError extends Error {
  constructor(readonly code: "INVALID_CONFIG" | "INVALID_OBJECT" | "NOT_FOUND" | "OBJECT_CONFLICT" | "PROVIDER_ERROR") {
    super(code);
    this.name = "ObjectStorageError";
  }
}

export interface S3PrivateObjectStorageOptions {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly clock?: () => Date;
  readonly allowInsecureEndpoint?: boolean;
}

type HeaderMap = Readonly<Record<string, string>>;

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

function timestamp(now: Date): { short: string; long: string } {
  const iso = now.toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return { short: iso.slice(0, 8), long: iso };
}

function normalizedHeaderValue(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}

function canonicalHeaders(headers: HeaderMap): { canonical: string; signed: string } {
  const entries = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), normalizedHeaderValue(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right, "en"));
  return {
    canonical: `${entries.map(([key, value]) => `${key}:${value}`).join("\n")}\n`,
    signed: entries.map(([key]) => key).join(";"),
  };
}

function signingKey(secret: string, date: string, region: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), "s3"), "aws4_request");
}

function requireNonBlank(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 512) throw new ObjectStorageError("INVALID_CONFIG");
  return normalized;
}

function requireKey(key: string): string {
  const normalized = key.trim();
  const segments = normalized.split("/");
  if (
    normalized.length < 1 || normalized.length > 1024 || normalized.startsWith("/") ||
    normalized.includes("\\") || segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new ObjectStorageError("INVALID_OBJECT");
  }
  return normalized;
}

function requireChecksum(value: string): string {
  const normalized = value.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new ObjectStorageError("INVALID_OBJECT");
  return normalized;
}

async function boundedBody(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_OBJECT_BYTES) throw new ObjectStorageError("PROVIDER_ERROR");
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_OBJECT_BYTES) {
        await reader.cancel();
        throw new ObjectStorageError("PROVIDER_ERROR");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export class S3PrivateObjectStorage implements PrivateObjectStorage {
  private readonly endpoint: URL;
  private readonly region: string;
  private readonly bucket: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly clock: () => Date;

  constructor(options: S3PrivateObjectStorageOptions) {
    try {
      this.endpoint = new URL(options.endpoint);
    } catch {
      throw new ObjectStorageError("INVALID_CONFIG");
    }
    if (
      (this.endpoint.protocol !== "https:" && !options.allowInsecureEndpoint) ||
      this.endpoint.username || this.endpoint.password || this.endpoint.search || this.endpoint.hash
    ) {
      throw new ObjectStorageError("INVALID_CONFIG");
    }
    this.region = requireNonBlank(options.region);
    this.bucket = requireNonBlank(options.bucket);
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(this.bucket)) {
      throw new ObjectStorageError("INVALID_CONFIG");
    }
    this.accessKeyId = requireNonBlank(options.accessKeyId);
    this.secretAccessKey = requireNonBlank(options.secretAccessKey);
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.clock = options.clock ?? (() => new Date());
  }

  async putPrivate(input: PutPrivateObjectInput): Promise<PutPrivateObjectResult> {
    const key = requireKey(input.key);
    const checksum = requireChecksum(input.checksumSha256);
    const contentIdentity = input.contentIdentitySha256 === undefined
      ? undefined
      : requireChecksum(input.contentIdentitySha256);
    if (sha256(input.body) !== checksum || input.body.byteLength > MAX_OBJECT_BYTES) {
      throw new ObjectStorageError("INVALID_OBJECT");
    }
    const contentType = requireNonBlank(input.contentType);
    const url = this.objectUrl(key);
    const headers: Record<string, string> = {
      "content-type": contentType,
      "if-none-match": "*",
      "x-amz-content-sha256": checksum,
      "x-amz-meta-sha256": checksum,
      "x-amz-server-side-encryption": "AES256",
    };
    if (contentIdentity) headers["x-amz-meta-content-identity-sha256"] = contentIdentity;
    headers.authorization = this.authorization("PUT", url, headers, checksum, this.clock());
    let response: Response;
    try {
      response = await this.fetcher(url, { method: "PUT", headers, body: Buffer.from(input.body) });
    } catch {
      throw new ObjectStorageError("PROVIDER_ERROR");
    }
    if (response.ok) {
      return {
        created: true,
        checksumSha256: checksum,
        sizeBytes: input.body.byteLength,
        ...(contentIdentity ? { contentIdentitySha256: contentIdentity } : {}),
      };
    }
    if (response.status !== 409 && response.status !== 412) {
      throw new ObjectStorageError("PROVIDER_ERROR");
    }
    const existing = await this.head(key);
    const exactBytes = existing.checksumSha256 === checksum && existing.sizeBytes === input.body.byteLength;
    const sameIdentity = contentIdentity !== undefined && existing.contentIdentitySha256 === contentIdentity;
    if (!exactBytes && !sameIdentity) {
      throw new ObjectStorageError("OBJECT_CONFLICT");
    }
    return { created: false, ...existing };
  }

  async getPrivate(rawKey: string): Promise<Uint8Array> {
    const url = this.objectUrl(requireKey(rawKey));
    const payloadHash = EMPTY_SHA256;
    const headers: Record<string, string> = { "x-amz-content-sha256": payloadHash };
    headers.authorization = this.authorization("GET", url, headers, payloadHash, this.clock());
    let response: Response;
    try {
      response = await this.fetcher(url, { method: "GET", headers });
    } catch {
      throw new ObjectStorageError("PROVIDER_ERROR");
    }
    if (response.status === 404) throw new ObjectStorageError("NOT_FOUND");
    if (!response.ok) throw new ObjectStorageError("PROVIDER_ERROR");
    return boundedBody(response);
  }

  async createSignedGetUrl(
    rawKey: string,
    input: { expiresInSeconds: number },
  ): Promise<SignedObjectUrl> {
    if (!Number.isInteger(input.expiresInSeconds) || input.expiresInSeconds < 15 || input.expiresInSeconds > 900) {
      throw new TypeError("expiresInSeconds must be an integer between 15 and 900");
    }
    const now = this.clock();
    const { short, long } = timestamp(now);
    const scope = `${short}/${this.region}/s3/aws4_request`;
    const url = this.objectUrl(requireKey(rawKey));
    const entries: Array<[string, string]> = [
      ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
      ["X-Amz-Content-Sha256", "UNSIGNED-PAYLOAD"],
      ["X-Amz-Credential", `${this.accessKeyId}/${scope}`],
      ["X-Amz-Date", long],
      ["X-Amz-Expires", String(input.expiresInSeconds)],
      ["X-Amz-SignedHeaders", "host"],
    ];
    const canonicalQuery = entries
      .map(([key, value]) => [awsEncode(key), awsEncode(value)] as const)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    const canonicalRequest = [
      "GET",
      url.pathname,
      canonicalQuery,
      `host:${url.host}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");
    const stringToSign = ["AWS4-HMAC-SHA256", long, scope, sha256(canonicalRequest)].join("\n");
    const signature = createHmac("sha256", signingKey(this.secretAccessKey, short, this.region))
      .update(stringToSign, "utf8")
      .digest("hex");
    url.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
    return {
      url: url.toString(),
      expiresAt: new Date(now.getTime() + input.expiresInSeconds * 1000),
    };
  }

  private objectUrl(key: string): URL {
    const url = new URL(this.endpoint);
    const base = url.pathname.replace(/\/$/, "");
    url.pathname = `${base}/${awsEncode(this.bucket)}/${key.split("/").map(awsEncode).join("/")}`;
    return url;
  }

  private authorization(method: string, url: URL, inputHeaders: HeaderMap, payloadHash: string, now: Date): string {
    const { short, long } = timestamp(now);
    const headers = { ...inputHeaders, host: url.host, "x-amz-date": long };
    const { canonical, signed } = canonicalHeaders(headers);
    const canonicalRequest = [method, url.pathname, "", canonical, signed, payloadHash].join("\n");
    const scope = `${short}/${this.region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", long, scope, sha256(canonicalRequest)].join("\n");
    const signature = createHmac("sha256", signingKey(this.secretAccessKey, short, this.region))
      .update(stringToSign, "utf8")
      .digest("hex");
    Object.assign(inputHeaders as Record<string, string>, { "x-amz-date": long });
    return `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
  }

  private async head(rawKey: string): Promise<{
    checksumSha256: string;
    sizeBytes: number;
    contentIdentitySha256?: string;
  }> {
    const url = this.objectUrl(requireKey(rawKey));
    const headers: Record<string, string> = { "x-amz-content-sha256": EMPTY_SHA256 };
    headers.authorization = this.authorization("HEAD", url, headers, EMPTY_SHA256, this.clock());
    let response: Response;
    try {
      response = await this.fetcher(url, { method: "HEAD", headers });
    } catch {
      throw new ObjectStorageError("PROVIDER_ERROR");
    }
    if (response.status === 404) throw new ObjectStorageError("NOT_FOUND");
    if (!response.ok) throw new ObjectStorageError("PROVIDER_ERROR");
    const checksumSha256 = response.headers.get("x-amz-meta-sha256")?.toLowerCase() ?? "";
    const contentIdentitySha256 = response.headers
      .get("x-amz-meta-content-identity-sha256")
      ?.toLowerCase();
    const sizeBytes = Number(response.headers.get("content-length"));
    if (!/^[0-9a-f]{64}$/.test(checksumSha256) || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
      throw new ObjectStorageError("PROVIDER_ERROR");
    }
    if (contentIdentitySha256 !== undefined && !/^[0-9a-f]{64}$/.test(contentIdentitySha256)) {
      throw new ObjectStorageError("PROVIDER_ERROR");
    }
    return {
      checksumSha256,
      sizeBytes,
      ...(contentIdentitySha256 ? { contentIdentitySha256 } : {}),
    };
  }
}
