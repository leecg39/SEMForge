"use client";

import { useMemo, useRef, useState } from "react";
import { CheckCircledIcon, UploadIcon } from "@radix-ui/react-icons";
import type { BacklinkImportMapping, BacklinkImportPreview } from "@/server/backlinks/contracts";

async function responseData<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message ?? "CSV를 처리하지 못했습니다.");
  return body.data as T;
}

export function BacklinkGapCsvImport({ initialSiteUrl, locale, onImported }: {
  initialSiteUrl: string;
  locale: "ko" | "en";
  onImported: (siteUrl: string) => void | Promise<void>;
}) {
  const ko = locale === "ko";
  const fileRef = useRef<HTMLInputElement>(null);
  const [siteUrl, setSiteUrl] = useState(initialSiteUrl);
  const [preview, setPreview] = useState<BacklinkImportPreview | null>(null);
  const [mapping, setMapping] = useState<BacklinkImportMapping>({ sourceUrl: "", targetUrl: "", anchor: null, linkCount: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const optionalHeaders = useMemo(() => ["", ...(preview?.headers ?? [])], [preview]);

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const form = new FormData(); form.set("file", file);
      const data = await responseData<BacklinkImportPreview>(await fetch("/api/analytics/backlinks/import/preview/", { method: "POST", body: form }));
      setPreview(data);
      setMapping({
        sourceUrl: data.detectedMapping.sourceUrl ?? "",
        targetUrl: data.detectedMapping.targetUrl ?? "",
        anchor: data.detectedMapping.anchor ?? null,
        linkCount: data.detectedMapping.linkCount ?? null,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "CSV 미리보기에 실패했습니다.");
    } finally { setBusy(false); }
  };

  const commit = async () => {
    if (!preview || !siteUrl.trim()) return;
    if (!mapping.sourceUrl || !mapping.targetUrl) {
      setError(ko ? "소스 URL과 대상 URL 열을 선택해 주세요." : "Choose source and target URL columns.");
      return;
    }
    setBusy(true); setError(null); setSuccess(null);
    try {
      const data = await responseData<{ importedRows: number; skippedRows: number }>(await fetch("/api/analytics/backlinks/import/commit/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importId: preview.importId, siteUrl, mapping }),
      }));
      setSuccess(ko
        ? `${data.importedRows.toLocaleString("ko-KR")}개 링크를 저장했습니다${data.skippedRows ? ` · ${data.skippedRows.toLocaleString("ko-KR")}개 제외` : ""}.`
        : `Saved ${data.importedRows.toLocaleString("en-US")} links${data.skippedRows ? ` · ${data.skippedRows.toLocaleString("en-US")} skipped` : ""}.`);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      await onImported(siteUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "CSV 가져오기에 실패했습니다.");
    } finally { setBusy(false); }
  };

  return (
    <section className="rounded-[12px] border border-app-border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-[13px] font-semibold text-app-text">{ko ? "CSV 데이터 연결" : "Connect CSV data"}</h2><p className="mt-1 text-[11px] leading-5 text-app-text-secondary">{ko ? "자동 공급자가 없어도 URL 단위 백링크 CSV를 워크스페이스에 안전하게 저장해 비교할 수 있습니다." : "Store a URL-level backlink CSV in this workspace when an automatic provider is unavailable."}</p></div>
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[7px] border border-app-border bg-white px-3 text-[11px] font-semibold text-app-text shadow-sm hover:bg-[#f7f8fa]">
          <UploadIcon />{busy ? (ko ? "처리 중…" : "Processing…") : (ko ? "CSV 선택" : "Choose CSV")}
          <input ref={fileRef} type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => void chooseFile(event.target.files?.[0])} className="sr-only" />
        </label>
      </div>
      {preview && <div className="mt-4 rounded-[9px] border border-[#ddd9fb] bg-[#faf9ff] p-4">
        <div className="grid gap-3 lg:grid-cols-[1.3fr_repeat(4,minmax(120px,1fr))]">
          <label><span className="mb-1 block text-[10px] font-medium text-app-text-secondary">{ko ? "대상 사이트" : "Target site"}</span><input value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} placeholder="example.com" className="h-9 w-full rounded-[6px] border border-app-border bg-white px-2.5 text-[11px] outline-none focus:border-app-blue" /></label>
          {([
            ["sourceUrl", ko ? "소스 URL *" : "Source URL *", preview.headers],
            ["targetUrl", ko ? "대상 URL *" : "Target URL *", preview.headers],
            ["anchor", ko ? "앵커" : "Anchor", optionalHeaders],
            ["linkCount", ko ? "링크 수" : "Link count", optionalHeaders],
          ] as const).map(([key, label, headers]) => <label key={key}><span className="mb-1 block text-[10px] font-medium text-app-text-secondary">{label}</span><select value={mapping[key] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [key]: event.target.value || null }))} className="h-9 w-full rounded-[6px] border border-app-border bg-white px-2 text-[11px]"><option value="">{ko ? "열 선택" : "Select"}</option>{headers.filter(Boolean).map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-[10px] text-app-text-secondary">{preview.fileName} · {preview.rowCount.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")} {ko ? "행 감지" : "rows detected"}</p><button type="button" onClick={() => void commit()} disabled={busy || !siteUrl.trim() || !mapping.sourceUrl || !mapping.targetUrl} className="h-9 rounded-[7px] bg-[#171a26] px-4 text-[11px] font-semibold text-white disabled:opacity-40">{ko ? "데이터 연결" : "Connect data"}</button></div>
      </div>}
      {error && <p role="alert" className="mt-3 rounded-[7px] bg-[#fff1f1] px-3 py-2 text-[11px] text-[#a12828]">{error}</p>}
      {success && <p className="mt-3 inline-flex items-center gap-1.5 rounded-[7px] bg-[#eaf8f0] px-3 py-2 text-[11px] text-[#176b4b]"><CheckCircledIcon />{success}</p>}
    </section>
  );
}
