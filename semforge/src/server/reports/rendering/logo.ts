// @TASK P4-R1-T1 - Bounded report logo loader
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import { isIP } from "node:net";

import sharp from "sharp";

const MAX_LOGO_BYTES = 1_000_000;
const ALLOWED_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export interface ReportLogoLoadOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

function isPrivateIp(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "");
  if (isIP(normalized) === 4) {
    const octets = normalized.split(".").map(Number);
    return octets[0] === 10 || octets[0] === 127 || octets[0] === 0 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31) ||
      (octets[0] === 192 && octets[1] === 168);
  }
  if (isIP(normalized) === 6) {
    const lower = normalized.toLowerCase();
    return lower === "::1" || lower === "::" || lower.startsWith("fc") ||
      lower.startsWith("fd") || lower.startsWith("fe8") || lower.startsWith("fe9") ||
      lower.startsWith("fea") || lower.startsWith("feb");
  }
  return normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local");
}

function safeLogoUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port || isPrivateIp(url.hostname)) {
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
    const response = await (options.fetch ?? globalThis.fetch)(url, {
      headers: { accept: "image/png,image/jpeg,image/webp,image/gif" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) return null;
    const source = await readBounded(response);
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
