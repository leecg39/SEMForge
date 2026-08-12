// @TASK P4-R1-T1 - Bounded report logo loader
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP, type LookupFunction } from "node:net";

import sharp from "sharp";

import { isPublicIpAddress } from "@/server/sites/domain";

const MAX_LOGO_BYTES = 1_000_000;
const ALLOWED_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export interface ReportLogoLoadOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly resolveHostname?: (hostname: string) => Promise<readonly string[]>;
  readonly timeoutMs?: number;
}

async function resolveHostname(hostname: string): Promise<readonly string[]> {
  return (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address);
}

function isForbiddenHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "");
  if (isIP(normalized) !== 0) return !isPublicIpAddress(normalized);
  return normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local");
}

function safeLogoUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      isForbiddenHostname(url.hostname)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function readBounded(response: Response): Promise<Buffer | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_LOGO_BYTES) return null;
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_LOGO_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

async function requestPinnedLogo(
  url: URL,
  address: string,
  signal: AbortSignal,
): Promise<{ contentType: string | null; source: Buffer } | null> {
  const family = isIP(address);
  if (family === 0 || !isPublicIpAddress(address)) return null;
  const pinnedLookup: LookupFunction = (_hostname, _options, callback) => {
    callback(null, address, family);
  };
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value: { contentType: string | null; source: Buffer } | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const networkRequest = request(url, {
      method: "GET",
      headers: { accept: "image/png,image/jpeg,image/webp,image/gif" },
      lookup: pinnedLookup,
      signal,
    }, (response) => {
      const status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        response.resume();
        finish(null);
        return;
      }
      const declared = Number(response.headers["content-length"]);
      if (Number.isFinite(declared) && declared > MAX_LOGO_BYTES) {
        response.resume();
        finish(null);
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_LOGO_BYTES) {
          finish(null);
          networkRequest.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => finish({
        contentType: response.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() ?? null,
        source: Buffer.concat(chunks, size),
      }));
      response.on("error", fail);
    });
    networkRequest.on("error", fail);
    networkRequest.end();
  });
}

/** 로고 오류가 리포트 전체 실패로 번지지 않도록 모든 외부/디코딩 오류를 null fallback으로 바꾼다. */
export async function loadReportLogo(
  rawUrl: string | null,
  options: ReportLogoLoadOptions = {},
): Promise<string | null> {
  if (!rawUrl) return null;
  const url = safeLogoUrl(rawUrl);
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 3_000);
  try {
    const addresses = await (options.resolveHostname ?? resolveHostname)(url.hostname);
    if (addresses.length === 0 || addresses.some((address) => !isPublicIpAddress(address))) {
      return null;
    }
    let contentType: string | null;
    let source: Buffer | null;
    if (options.fetch) {
      const response = await options.fetch(url, {
        headers: { accept: "image/png,image/jpeg,image/webp,image/gif" },
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) return null;
      contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
      source = await readBounded(response);
    } else {
      const response = await requestPinnedLogo(url, addresses[0]!, controller.signal);
      if (!response) return null;
      ({ contentType, source } = response);
    }
    if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) return null;
    if (!source?.length) return null;
    const png = await sharp(source, { failOn: "error", limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 600, height: 200, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
