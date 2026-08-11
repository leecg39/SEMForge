// @TASK P4-R1-T1 - Immutable snapshot report HTML renderer
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import { createHash } from "node:crypto";

import {
  REPORT_SECTION_KEYS,
  type ReportSectionKey,
  type WeeklyReportSnapshot,
} from "@/server/reports/types";

const SECTION_LABELS = {
  rank: "검색 순위",
  aio: "AI Overview",
  naver: "NAVER 수요",
  gsc: "Google Search Console",
} as const satisfies Record<ReportSectionKey, string>;

const SENSITIVE_KEY = /(access.?token|refresh.?token|api.?key|secret|password|authorization|cookie|email)/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

export interface RenderReportHtmlOptions {
  readonly fontDataUri: string;
  readonly logoDataUri: string | null;
}

export interface RenderedReportHtml {
  readonly html: string;
  readonly snapshotSha256: string;
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function canonicalize(value: unknown): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return null;
}

export function canonicalSnapshotJson(snapshot: WeeklyReportSnapshot): string {
  return JSON.stringify(canonicalize(snapshot));
}

export function snapshotSha256(snapshot: WeeklyReportSnapshot): string {
  return createHash("sha256").update(canonicalSnapshotJson(snapshot), "utf8").digest("hex");
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function redactText(value: string): string {
  return value.replace(EMAIL, "[이메일 보호됨]").replace(BEARER, "Bearer [보호됨]");
}

function redact(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "[보호됨]";
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((entry) => redact(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entry]) => [
        entryKey,
        redact(entry, entryKey),
      ]),
    );
  }
  return value;
}

function humanizeKey(key: string): string {
  return key
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .trim();
}

function meaningful(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.some(meaningful);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).some(meaningful);
  return true;
}

function renderScalar(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "예" : "아니요";
  if (typeof value === "number") return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);
  return escapeHtml(redactText(String(value)));
}

function renderObject(value: Record<string, unknown>, depth = 0): string {
  const entries = Object.entries(redact(value) as Record<string, unknown>);
  if (entries.length === 0 || !meaningful(value)) return '<p class="sf-empty">데이터가 없습니다.</p>';
  return `<dl class="sf-data ${depth > 0 ? "sf-data--nested" : ""}">${entries
    .map(([key, entry]) => {
      const content = Array.isArray(entry)
        ? renderArray(entry, depth + 1)
        : entry && typeof entry === "object"
          ? renderObject(entry as Record<string, unknown>, depth + 1)
          : `<span>${renderScalar(entry)}</span>`;
      return `<div class="sf-data__row"><dt>${escapeHtml(humanizeKey(key))}</dt><dd>${content}</dd></div>`;
    })
    .join("")}</dl>`;
}

function renderArray(values: readonly unknown[], depth = 0): string {
  if (values.length === 0) return '<p class="sf-empty">데이터가 없습니다.</p>';
  const limited = values.slice(0, 500);
  return `<ol class="sf-items">${limited
    .map((entry) => `<li>${entry && typeof entry === "object"
      ? renderObject(entry as Record<string, unknown>, depth + 1)
      : renderScalar(entry)}</li>`)
    .join("")}</ol>${values.length > limited.length
      ? `<p class="sf-note">총 ${values.length.toLocaleString("ko-KR")}건 중 ${limited.length.toLocaleString("ko-KR")}건 표시</p>`
      : ""}`;
}

function sectionHtml(snapshot: WeeklyReportSnapshot, key: ReportSectionKey): string {
  const section = snapshot.sections[key];
  const status = section.available
    ? '<span class="sf-status sf-status--ok">수집 완료</span>'
    : '<span class="sf-status sf-status--partial">확인 불가</span>';
  const body = section.available
    ? renderObject(section.data as Record<string, unknown>)
    : `<div class="sf-unavailable"><strong>확인 불가</strong><p>${escapeHtml(section.unavailableReason ?? "provider_data_missing")}</p></div>`;
  return `<section class="sf-section">
    <header><div><p class="sf-kicker">${escapeHtml(key.toUpperCase())}</p><h2>${escapeHtml(SECTION_LABELS[key])}</h2></div>${status}</header>
    <p class="sf-captured">기준 시각 ${escapeHtml(section.capturedAt)}</p>
    ${body}
  </section>`;
}

function validAccentColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#155eef";
}

function logoHtml(snapshot: WeeklyReportSnapshot, logoDataUri: string | null): string {
  if (logoDataUri?.startsWith("data:image/")) {
    return `<img class="sf-logo" src="${escapeHtml(logoDataUri)}" alt="${escapeHtml(snapshot.brand.name)} 로고" />`;
  }
  const initial = Array.from(snapshot.brand.name.trim())[0] ?? "S";
  return `<div class="sf-logo-fallback" aria-label="로고 대체 표시">${escapeHtml(initial.toUpperCase())}</div>`;
}

export function renderReportHtml(
  snapshot: WeeklyReportSnapshot,
  options: RenderReportHtmlOptions,
): RenderedReportHtml {
  const hash = snapshotSha256(snapshot);
  const accent = validAccentColor(snapshot.brand.accentColor);
  const font = options.fontDataUri.startsWith("data:font/woff2;base64,")
    ? options.fontDataUri
    : "";
  const html = `<!doctype html>
<html lang="ko" data-snapshot-sha256="${hash}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="semforge-snapshot-sha256" content="${hash}" />
  <title>${escapeHtml(snapshot.brand.name)} 주간 검색 리포트</title>
  <style>
    @font-face { font-family: "Noto Sans KR"; src: url("${font}") format("woff2"); font-weight: 100 900; font-style: normal; font-display: block; }
    :root { --accent: ${accent}; --ink: #162033; --muted: #667085; --line: #e4e7ec; --paper: #fff; --soft: #f8fafc; }
    * { box-sizing: border-box; }
    @page { size: A4; margin: 15mm 13mm 17mm; }
    html { font-family: "Noto Sans KR", sans-serif; color: var(--ink); font-size: 10.5px; line-height: 1.55; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    body { margin: 0; background: var(--paper); }
    h1, h2, p { margin: 0; }
    h1 { margin-top: 7mm; font-size: 28px; line-height: 1.25; letter-spacing: -.04em; }
    h2 { font-size: 17px; letter-spacing: -.02em; }
    .sf-cover { border-top: 5px solid var(--accent); padding-top: 10mm; min-height: 248mm; page-break-after: always; }
    .sf-brand { display: flex; align-items: center; gap: 12px; }
    .sf-logo { width: 112px; height: 44px; object-fit: contain; object-position: left center; }
    .sf-logo-fallback { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 11px; color: #fff; background: var(--accent); font-weight: 800; font-size: 19px; }
    .sf-brand-name { font-weight: 700; font-size: 13px; overflow-wrap: anywhere; }
    .sf-eyebrow, .sf-kicker { color: var(--accent); font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .sf-cover-copy { margin-top: 6mm; max-width: 125mm; color: var(--muted); font-size: 13px; }
    .sf-period { margin-top: 22mm; padding: 10mm; border-radius: 14px; background: var(--soft); border: 1px solid var(--line); }
    .sf-period strong { display: block; margin-top: 2mm; font-size: 18px; }
    .sf-period p + p { margin-top: 5mm; }
    .sf-hash { margin-top: 13mm; color: var(--muted); font-size: 8px; overflow-wrap: anywhere; }
    .sf-section { padding-top: 3mm; break-before: page; }
    .sf-section > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10mm; padding-bottom: 4mm; border-bottom: 2px solid var(--accent); }
    .sf-captured { margin: 2mm 0 5mm; color: var(--muted); font-size: 8.5px; }
    .sf-status { flex: none; padding: 1.4mm 3mm; border-radius: 999px; font-size: 8.5px; font-weight: 800; }
    .sf-status--ok { color: #067647; background: #ecfdf3; }
    .sf-status--partial { color: #b54708; background: #fffaeb; }
    .sf-unavailable, .sf-empty { padding: 6mm; border: 1px dashed #fdb022; border-radius: 10px; background: #fffcf5; }
    .sf-unavailable p { margin-top: 1mm; color: var(--muted); }
    .sf-data, .sf-items { margin: 0; padding: 0; }
    .sf-data__row { display: grid; grid-template-columns: minmax(33mm, .7fr) minmax(0, 2fr); gap: 5mm; padding: 3mm 0; border-bottom: 1px solid var(--line); break-inside: avoid; }
    .sf-data dt { color: var(--muted); font-weight: 700; text-transform: capitalize; }
    .sf-data dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
    .sf-data--nested .sf-data__row { grid-template-columns: minmax(25mm, .65fr) minmax(0, 2fr); padding: 2mm 0; }
    .sf-items { list-style: none; counter-reset: item; }
    .sf-items > li { position: relative; padding: 4mm 3mm 4mm 10mm; border: 1px solid var(--line); border-radius: 8px; margin-bottom: 3mm; break-inside: avoid; }
    .sf-items > li::before { counter-increment: item; content: counter(item); position: absolute; left: 3mm; top: 4mm; color: var(--accent); font-weight: 800; }
    .sf-note { color: var(--muted); margin-top: 3mm; }
    .sf-footer { position: fixed; bottom: -11mm; left: 0; right: 0; color: var(--muted); text-align: center; font-size: 7px; }
  </style>
</head>
<body>
  <main>
    <section class="sf-cover">
      <div class="sf-brand">${logoHtml(snapshot, options.logoDataUri)}<span class="sf-brand-name">${escapeHtml(snapshot.brand.name)}</span></div>
      <p class="sf-eyebrow">SEMFORGE WEEKLY REPORT</p>
      <h1>주간 검색 성과 리포트</h1>
      <p class="sf-cover-copy">웹·PDF·이메일이 공유하는 발행 시점의 불변 스냅샷입니다.</p>
      <div class="sf-period">
        <p>이번 기간<strong>${escapeHtml(snapshot.period.current.start)} — ${escapeHtml(snapshot.period.current.end)}</strong></p>
        <p>비교 기간<strong>${escapeHtml(snapshot.period.comparison.start)} — ${escapeHtml(snapshot.period.comparison.end)}</strong></p>
      </div>
      <p class="sf-hash">Snapshot SHA-256 ${hash}</p>
    </section>
    ${REPORT_SECTION_KEYS.map((key) => sectionHtml(snapshot, key)).join("\n")}
  </main>
  <footer class="sf-footer">${escapeHtml(snapshot.brand.name)} · 발행 스냅샷 ${hash.slice(0, 12)}</footer>
</body>
</html>`;
  return { html, snapshotSha256: hash };
}
