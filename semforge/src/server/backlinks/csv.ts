import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api";
import {
  BACKLINK_IMPORT_TTL_MS,
  BACKLINK_MAX_IMPORT_BYTES,
  BACKLINK_MAX_IMPORT_ROWS,
  type BacklinkImportMapping,
  type BacklinkImportPreview,
  type BacklinkInboundLinkRow,
} from "@/server/backlinks/contracts";
import { normalizeBacklinkPageUrl, normalizeBacklinkSiteUrl, targetBelongsToSite } from "@/server/backlinks/target";

const HEADER_ALIASES: Record<keyof BacklinkImportMapping, string[]> = {
  sourceUrl: ["sourceurl", "source", "referringpage", "referringurl", "fromurl", "출처url", "출처주소", "링크url", "링크주소"],
  targetUrl: ["targeturl", "target", "targetpage", "destinationurl", "tourl", "대상url", "대상주소", "타겟url", "타겟주소"],
  anchor: ["anchor", "anchortext", "linktext", "앵커", "앵커텍스트", "링크텍스트"],
  linkCount: ["linkcount", "links", "backlinks", "count", "링크수", "백링크", "백링크수"],
};

export interface ParsedBacklinkCsv {
  headers: string[];
  rows: string[][];
  detectedMapping: Partial<BacklinkImportMapping>;
  sha256: string;
}

function headerKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_\-().:[\]]/g, "");
}

export function detectBacklinkCsvMapping(headers: string[]): Partial<BacklinkImportMapping> {
  const result: Partial<BacklinkImportMapping> = {};
  const keyed = headers.map((header) => ({ header, key: headerKey(header) }));
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof BacklinkImportMapping, string[]][]) {
    const found = keyed.find((item) => aliases.includes(item.key));
    if (found) result[field] = found.header;
  }
  return result;
}

/** RFC 4180의 인용부호·필드 내 줄바꿈을 처리하는 작은 상태 머신. */
export function parseBacklinkCsv(text: string): ParsedBacklinkCsv {
  if (Buffer.byteLength(text, "utf8") > BACKLINK_MAX_IMPORT_BYTES) {
    throw new ApiError("VALIDATION_ERROR", "CSV 파일은 10MB 이하여야 합니다.");
  }
  if (text.includes("\0")) throw new ApiError("VALIDATION_ERROR", "CSV에 허용되지 않는 문자가 포함되어 있습니다.");
  const input = text.replace(/^\uFEFF/, "");
  const table: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"' && cell.length === 0) { quoted = true; continue; }
    if (char === ",") { row.push(cell); cell = ""; continue; }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim() !== "")) table.push(row);
      row = [];
      if (table.length > BACKLINK_MAX_IMPORT_ROWS + 1) {
        throw new ApiError("VALIDATION_ERROR", "CSV는 헤더를 제외하고 최대 100,000행까지 가져올 수 있습니다.");
      }
      continue;
    }
    cell += char;
  }
  if (quoted) throw new ApiError("VALIDATION_ERROR", "CSV 인용부호가 닫히지 않았습니다.");
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) table.push(row);
  if (table.length < 2) throw new ApiError("VALIDATION_ERROR", "헤더와 데이터가 포함된 CSV 파일을 선택해 주세요.");
  const headers = table[0].map((value, index) => value.trim() || `열 ${index + 1}`);
  if (new Set(headers).size !== headers.length) throw new ApiError("VALIDATION_ERROR", "CSV 헤더 이름은 중복될 수 없습니다.");
  const rows = table.slice(1).map((values) => headers.map((_, index) => values[index] ?? ""));
  return {
    headers,
    rows,
    detectedMapping: detectBacklinkCsvMapping(headers),
    sha256: createHash("sha256").update(input).digest("hex"),
  };
}

export function previewFromParsed(input: {
  id: string;
  fileName: string;
  parsed: ParsedBacklinkCsv;
  expiresAt?: Date;
}): BacklinkImportPreview {
  return {
    importId: input.id,
    fileName: input.fileName,
    headers: input.parsed.headers,
    sampleRows: input.parsed.rows.slice(0, 5),
    rowCount: input.parsed.rows.length,
    detectedMapping: input.parsed.detectedMapping,
    expiresAt: (input.expiresAt ?? new Date(Date.now() + BACKLINK_IMPORT_TTL_MS)).toISOString(),
  };
}

function positiveCount(value: string | undefined): number {
  if (!value?.trim()) return 1;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(2_147_483_647, Math.trunc(parsed)) : 1;
}

export function normalizeImportedBacklinks(input: {
  headers: string[];
  rows: string[][];
  mapping: BacklinkImportMapping;
  siteUrl: string;
}): { siteUrl: string; rows: BacklinkInboundLinkRow[]; skipped: number } {
  const siteUrl = normalizeBacklinkSiteUrl(input.siteUrl);
  const indexOf = (header: string | null | undefined) => header ? input.headers.indexOf(header) : -1;
  const sourceIndex = indexOf(input.mapping.sourceUrl);
  const targetIndex = indexOf(input.mapping.targetUrl);
  const anchorIndex = indexOf(input.mapping.anchor);
  const countIndex = indexOf(input.mapping.linkCount);
  if (sourceIndex < 0 || targetIndex < 0) {
    throw new ApiError("VALIDATION_ERROR", "출처 URL과 대상 URL 열을 확인해 주세요.");
  }
  const deduped = new Map<string, BacklinkInboundLinkRow>();
  let skipped = 0;
  for (const values of input.rows) {
    try {
      const sourceUrl = normalizeBacklinkPageUrl(values[sourceIndex] ?? "");
      const targetUrl = normalizeBacklinkPageUrl(values[targetIndex] ?? "");
      if (!targetBelongsToSite(siteUrl, targetUrl)) { skipped += 1; continue; }
      const anchor = anchorIndex >= 0 ? (values[anchorIndex]?.trim() || null) : null;
      const linkCount = positiveCount(countIndex >= 0 ? values[countIndex] : undefined);
      const key = `${sourceUrl}\u0000${targetUrl}\u0000${anchor ?? ""}`;
      const current = deduped.get(key);
      if (!current || linkCount > current.linkCount) {
        deduped.set(key, { kind: "inbound_links", sourceUrl, targetUrl, sourceDomain: new URL(sourceUrl).hostname, anchor, linkCount });
      }
    } catch { skipped += 1; }
  }
  if (deduped.size === 0) throw new ApiError("VALIDATION_ERROR", "선택한 사이트에 속하는 유효한 백링크 행이 없습니다.");
  return { siteUrl, rows: [...deduped.values()], skipped };
}
