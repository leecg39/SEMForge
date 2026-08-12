// @TASK P4-R1-T1 - Private S3-compatible object storage and SigV4 URLs
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import { createHash, createHmac } from "node:crypto";

const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");
const MAX_OBJECT_BYTES = 25 * 1024 * 1024;
const MAX_VERSION_LIST_BYTES = 4 * 1024 * 1024;
const MAX_VERSION_LIST_PAGES = 10_000;
const MAX_VERSION_ENTRIES = 100_000;
const MAX_PURGE_ROUNDS = 8;

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

export interface VersionedObjectEraser {
  eraseAllVersions(key: string): Promise<void>;
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

function canonicalQuery(entries: readonly (readonly [string, string])[]): string {
  return entries
    .map(([key, value]) => [awsEncode(key), awsEncode(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey, "en") || leftValue.localeCompare(rightValue, "en"))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function canonicalUrlQuery(url: URL): string {
  return canonicalQuery([...url.searchParams.entries()]);
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

async function boundedBody(response: Response, maximumBytes = MAX_OBJECT_BYTES): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) throw new ObjectStorageError("PROVIDER_ERROR");
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
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

interface XmlElement {
  readonly qualifiedName: string;
  readonly localName: string;
  readonly children: XmlElement[];
  text: string;
}

function xmlLocalName(qualifiedName: string): string {
  return qualifiedName.slice(qualifiedName.lastIndexOf(":") + 1);
}

function consumeXmlAttributes(raw: string): boolean {
  let remaining = raw.trim();
  const names = new Set<string>();
  while (remaining) {
    const match = /^([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*("[^"]*"|'[^']*')(?:\s+|$)/u.exec(remaining);
    if (!match) return false;
    const name = match[1]!;
    const quotedValue = match[2]!;
    if (names.has(name)) return false;
    names.add(name);
    const value = quotedValue.slice(1, -1);
    if (value.includes("<")) return false;
    try {
      decodeXmlText(value);
    } catch {
      return false;
    }
    remaining = remaining.slice(match[0].length);
  }
  return true;
}

function parseXmlDocument(raw: string): XmlElement {
  if (raw.length === 0 || raw.includes("\u0000")) throw new Error("invalid xml");
  let offset = 0;
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  let declarationSeen = false;
  while (offset < raw.length) {
    if (raw[offset] !== "<") {
      const next = raw.indexOf("<", offset);
      const end = next === -1 ? raw.length : next;
      const text = raw.slice(offset, end);
      const current = stack.at(-1);
      if (current) current.text += text;
      else if (text.trim()) throw new Error("text outside root");
      offset = end;
      continue;
    }
    if (raw.startsWith("<?xml", offset) && !root && stack.length === 0) {
      const end = raw.indexOf("?>", offset + 5);
      if (end === -1) throw new Error("truncated declaration");
      const declaration = raw.slice(offset, end + 2);
      if (
        declarationSeen ||
        !/^<\?xml\s+version=(['"])1\.[01]\1(?:\s+encoding=(['"])UTF-8\2)?(?:\s+standalone=(['"])(?:yes|no)\3)?\s*\?>$/u.test(declaration)
      ) {
        throw new Error("invalid declaration");
      }
      declarationSeen = true;
      offset = end + 2;
      continue;
    }
    if (raw.startsWith("<!", offset) || raw.startsWith("<?", offset)) {
      throw new Error("unsupported xml construct");
    }
    let end = offset + 1;
    let quote: "\"" | "'" | undefined;
    for (; end < raw.length; end += 1) {
      const character = raw[end];
      if (quote) {
        if (character === quote) quote = undefined;
      } else if (character === "\"" || character === "'") {
        quote = character;
      } else if (character === ">") {
        break;
      }
    }
    if (end >= raw.length || quote) throw new Error("truncated tag");
    const tag = raw.slice(offset + 1, end).trim();
    offset = end + 1;
    if (tag.startsWith("/")) {
      const qualifiedName = tag.slice(1).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(qualifiedName)) throw new Error("invalid closing tag");
      const current = stack.pop();
      if (!current || current.qualifiedName !== qualifiedName) throw new Error("unbalanced xml");
      continue;
    }
    const selfClosing = tag.endsWith("/");
    const opening = (selfClosing ? tag.slice(0, -1) : tag).trim();
    const nameMatch = /^([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*)$/u.exec(opening);
    if (!nameMatch || !consumeXmlAttributes(nameMatch[2] ?? "")) throw new Error("invalid opening tag");
    const element: XmlElement = {
      qualifiedName: nameMatch[1]!,
      localName: xmlLocalName(nameMatch[1]!),
      children: [],
      text: "",
    };
    const parent = stack.at(-1);
    if (parent) parent.children.push(element);
    else {
      if (root) throw new Error("multiple roots");
      root = element;
    }
    if (!selfClosing) stack.push(element);
  }
  if (!root || stack.length > 0) throw new Error("truncated xml");
  return root;
}

function decodeXmlText(raw: string): string {
  if (raw.includes("]]>")) throw new Error("invalid character data");
  let result = "";
  for (let offset = 0; offset < raw.length;) {
    if (raw[offset] !== "&") {
      const codePoint = raw.codePointAt(offset);
      if (codePoint === undefined || !isXmlCodePoint(codePoint)) throw new Error("invalid xml character");
      result += String.fromCodePoint(codePoint);
      offset += codePoint > 0xffff ? 2 : 1;
      continue;
    }
    const end = raw.indexOf(";", offset + 1);
    if (end === -1) throw new Error("unterminated entity");
    const entity = raw.slice(offset + 1, end);
    const named: Readonly<Record<string, string>> = {
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      quot: "\"",
    };
    let decoded = named[entity];
    if (decoded === undefined && /^#\d+$/u.test(entity)) {
      decoded = String.fromCodePoint(Number(entity.slice(1)));
    } else if (decoded === undefined && /^#x[0-9a-f]+$/iu.test(entity)) {
      decoded = String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (decoded === undefined || ![...decoded].every((character) => isXmlCodePoint(character.codePointAt(0)!))) {
      throw new Error("invalid entity");
    }
    result += decoded;
    offset = end + 1;
  }
  return result;
}

function isXmlCodePoint(codePoint: number): boolean {
  return codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff);
}

function validateXmlText(element: XmlElement): void {
  const decoded = decodeXmlText(element.text);
  if (element.children.length > 0 && decoded.trim()) throw new Error("unexpected mixed content");
  for (const child of element.children) validateXmlText(child);
}

function elementText(element: XmlElement): string {
  if (element.children.length > 0) throw new Error("expected text");
  return decodeXmlText(element.text);
}

function exactlyOneChild(element: XmlElement, name: string): XmlElement {
  const matches = element.children.filter((child) => child.localName === name);
  if (matches.length !== 1) throw new Error("missing or duplicate xml field");
  return matches[0]!;
}

interface VersionListPage {
  readonly versionIds: readonly string[];
  readonly next?: { readonly keyMarker: string; readonly versionIdMarker: string };
}

function parseVersionListPage(raw: string, exactKey: string): VersionListPage {
  const root = parseXmlDocument(raw);
  if (root.localName !== "ListVersionsResult") throw new Error("unexpected root");
  validateXmlText(root);
  const isTruncated = elementText(exactlyOneChild(root, "IsTruncated"));
  if (isTruncated !== "true" && isTruncated !== "false") throw new Error("invalid truncation flag");
  const versionIds: string[] = [];
  for (const entry of root.children.filter((child) => child.localName === "Version" || child.localName === "DeleteMarker")) {
    const key = elementText(exactlyOneChild(entry, "Key"));
    const versionId = elementText(exactlyOneChild(entry, "VersionId"));
    if (!versionId || versionId.length > 2_048 || /[\u0000-\u001f\u007f]/u.test(versionId)) {
      throw new Error("invalid version id");
    }
    if (key === exactKey) versionIds.push(versionId);
  }
  if (isTruncated === "false") return { versionIds };
  const keyMarker = elementText(exactlyOneChild(root, "NextKeyMarker"));
  const versionIdMarker = elementText(exactlyOneChild(root, "NextVersionIdMarker"));
  if (
    !keyMarker || !versionIdMarker || keyMarker.length > 2_048 || versionIdMarker.length > 2_048 ||
    /[\u0000-\u001f\u007f]/u.test(keyMarker) || /[\u0000-\u001f\u007f]/u.test(versionIdMarker)
  ) {
    throw new Error("invalid pagination marker");
  }
  return { versionIds, next: { keyMarker, versionIdMarker } };
}

export class S3PrivateObjectStorage implements PrivateObjectStorage, VersionedObjectEraser {
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

  async eraseAllVersions(rawKey: string): Promise<void> {
    const key = requireKey(rawKey);
    for (let round = 0; round < MAX_PURGE_ROUNDS; round += 1) {
      const versionIds = await this.listAllVersionIds(key);
      if (versionIds.length === 0) return;
      for (const versionId of versionIds) await this.deleteVersion(key, versionId);
    }
    if ((await this.listAllVersionIds(key)).length !== 0) {
      throw new ObjectStorageError("PROVIDER_ERROR");
    }
  }

  private async listAllVersionIds(key: string): Promise<string[]> {
    const versionIds: string[] = [];
    const seenPages = new Set<string>();
    let markers: { keyMarker: string; versionIdMarker: string } | undefined;
    for (let pageIndex = 0; pageIndex < MAX_VERSION_LIST_PAGES; pageIndex += 1) {
      const pageKey = markers ? `${markers.keyMarker}\u0000${markers.versionIdMarker}` : "<first>";
      if (seenPages.has(pageKey)) throw new ObjectStorageError("PROVIDER_ERROR");
      seenPages.add(pageKey);
      const page = await this.listVersions(key, markers);
      versionIds.push(...page.versionIds);
      if (versionIds.length > MAX_VERSION_ENTRIES) throw new ObjectStorageError("PROVIDER_ERROR");
      if (!page.next) {
        return [...new Set(versionIds)];
      }
      markers = page.next;
    }
    throw new ObjectStorageError("PROVIDER_ERROR");
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
    const canonicalRequest = [method, url.pathname, canonicalUrlQuery(url), canonical, signed, payloadHash].join("\n");
    const scope = `${short}/${this.region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", long, scope, sha256(canonicalRequest)].join("\n");
    const signature = createHmac("sha256", signingKey(this.secretAccessKey, short, this.region))
      .update(stringToSign, "utf8")
      .digest("hex");
    Object.assign(inputHeaders as Record<string, string>, { "x-amz-date": long });
    return `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
  }

  private bucketUrl(queryEntries: readonly (readonly [string, string])[]): URL {
    const url = new URL(this.endpoint);
    const base = url.pathname.replace(/\/$/, "");
    url.pathname = `${base}/${awsEncode(this.bucket)}`;
    url.search = canonicalQuery(queryEntries);
    return url;
  }

  private async listVersions(
    key: string,
    markers?: { readonly keyMarker: string; readonly versionIdMarker: string },
  ): Promise<VersionListPage> {
    const query: Array<readonly [string, string]> = [["prefix", key], ["versions", ""]];
    if (markers) {
      query.push(["key-marker", markers.keyMarker], ["version-id-marker", markers.versionIdMarker]);
    }
    const url = this.bucketUrl(query);
    const headers: Record<string, string> = { "x-amz-content-sha256": EMPTY_SHA256 };
    headers.authorization = this.authorization("GET", url, headers, EMPTY_SHA256, this.clock());
    let response: Response;
    try {
      response = await this.fetcher(url, { method: "GET", headers });
    } catch {
      throw new ObjectStorageError("PROVIDER_ERROR");
    }
    if (response.status === 404) {
      if (markers) throw new ObjectStorageError("PROVIDER_ERROR");
      return { versionIds: [] };
    }
    if (!response.ok) throw new ObjectStorageError("PROVIDER_ERROR");
    try {
      const bytes = await boundedBody(response, MAX_VERSION_LIST_BYTES);
      const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return parseVersionListPage(raw, key);
    } catch {
      throw new ObjectStorageError("PROVIDER_ERROR");
    }
  }

  private async deleteVersion(key: string, versionId: string): Promise<void> {
    const url = this.objectUrl(key);
    url.search = canonicalQuery([["versionId", versionId]]);
    const headers: Record<string, string> = { "x-amz-content-sha256": EMPTY_SHA256 };
    headers.authorization = this.authorization("DELETE", url, headers, EMPTY_SHA256, this.clock());
    let response: Response;
    try {
      response = await this.fetcher(url, { method: "DELETE", headers });
    } catch {
      throw new ObjectStorageError("PROVIDER_ERROR");
    }
    if (response.status !== 404 && !response.ok) throw new ObjectStorageError("PROVIDER_ERROR");
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
