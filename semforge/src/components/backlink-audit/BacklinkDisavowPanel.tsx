"use client";

import { FormEvent, useEffect, useState } from "react";
import { DownloadIcon, TrashIcon } from "@radix-ui/react-icons";
import { api } from "@/lib/client-api";

interface DisavowEntry { id: string; linkId: string | null; kind: "url" | "domain"; value: string; reason: string | null; createdAt: string }
interface Preview { projectId: string; siteUrl: string; entryCount: number; content: string; warnings: string[] }

export function BacklinkDisavowPanel({ projectId, locale, onChanged }: {
  projectId: string; locale: "ko" | "en"; onChanged?: () => void;
}) {
  const ko = locale === "ko";
  const [entries, setEntries] = useState<DisavowEntry[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [kind, setKind] = useState<"url" | "domain">("domain");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setError(null);
    try {
      const [list, nextPreview] = await Promise.all([
        api.get<DisavowEntry[]>(`/api/backlink-audits/projects/${projectId}/disavow/`),
        api.get<Preview>(`/api/backlink-audits/projects/${projectId}/disavow/preview/`),
      ]);
      setEntries(list.data); setPreview(nextPreview.data);
    } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : (ko ? "거부 목록을 불러오지 못했습니다." : "Could not load disavow entries.")); }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async (event: FormEvent) => {
    event.preventDefault(); if (!value.trim()) return;
    setBusy(true); setError(null);
    try { await api.post(`/api/backlink-audits/projects/${projectId}/disavow/`, { kind, value, reason: reason.trim() || null }); setValue(""); setReason(""); await load(); onChanged?.(); }
    catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : (ko ? "거부 항목을 추가하지 못했습니다." : "Could not add the entry.")); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/backlink-audits/projects/${projectId}/disavow/?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error?.message ?? "삭제하지 못했습니다."); }
      await load(); onChanged?.();
    } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : (ko ? "거부 항목을 삭제하지 못했습니다." : "Could not delete the entry.")); }
    finally { setBusy(false); }
  };
  const download = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/backlink-audits/projects/${projectId}/disavow/export/`, { method: "POST" });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error?.message ?? "내보내지 못했습니다."); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `semforge-disavow-${new Date().toISOString().slice(0, 10)}.txt`; anchor.click(); URL.revokeObjectURL(url);
    } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : (ko ? "거부 파일을 내보내지 못했습니다." : "Could not export the file.")); }
    finally { setBusy(false); }
  };
  return <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
    <section className="overflow-hidden rounded-[9px] border border-app-border bg-white"><div className="border-b border-app-border p-5"><h2 className="text-[14px] font-semibold text-app-text">{ko ? "거부 목록" : "Disavow list"}</h2><p className="mt-1 text-[10px] leading-5 text-app-text-secondary">{ko ? "이 목록은 자동으로 Google에 제출되지 않습니다. 반드시 최종 내용을 직접 검토하세요." : "This list is never uploaded to Google automatically. Review the final content yourself."}</p></div><form onSubmit={add} className="grid gap-2 border-b border-app-border bg-[#fbfbfd] p-4 sm:grid-cols-[120px_1fr_1fr_auto]"><select value={kind} onChange={(event) => setKind(event.target.value as "url" | "domain")} className="h-9 rounded-[7px] border border-app-border bg-white px-2 text-[10px]"><option value="domain">Domain</option><option value="url">URL</option></select><input value={value} onChange={(event) => setValue(event.target.value)} placeholder={kind === "domain" ? "spam.example.com" : "https://spam.example/page"} className="h-9 rounded-[7px] border border-app-border px-3 text-[10px]" /><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={ko ? "선택 사유" : "Optional reason"} className="h-9 rounded-[7px] border border-app-border px-3 text-[10px]" /><button disabled={busy || !value.trim()} className="h-9 rounded-[7px] bg-[#171a26] px-4 text-[10px] font-semibold text-white disabled:opacity-40">{ko ? "추가" : "Add"}</button></form>{error && <p className="m-4 rounded-[7px] bg-[#fff0f1] px-3 py-2 text-[11px] text-[#a12828]">{error}</p>}<div className="max-h-[460px] overflow-auto"><table className="w-full min-w-[620px] text-left text-[11px]"><thead className="sticky top-0 bg-[#f8f9fb] text-[10px] text-app-text-secondary"><tr><th className="px-4 py-2.5">{ko ? "유형" : "Type"}</th><th className="px-4 py-2.5">{ko ? "값" : "Value"}</th><th className="px-4 py-2.5">{ko ? "사유" : "Reason"}</th><th className="w-12 px-4 py-2.5" /></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className="border-t border-[#eef0f2]"><td className="px-4 py-3"><span className="rounded bg-[#eeeefe] px-2 py-1 text-[9px] font-semibold text-[#5547c8]">{entry.kind}</span></td><td className="max-w-[330px] truncate px-4 py-3 font-mono text-[10px]" title={entry.value}>{entry.kind === "domain" ? `domain:${entry.value}` : entry.value}</td><td className="max-w-[220px] truncate px-4 py-3 text-app-text-secondary">{entry.reason ?? "—"}</td><td className="px-4 py-3"><button type="button" disabled={busy} onClick={() => void remove(entry.id)} aria-label={ko ? "삭제" : "Delete"} className="text-app-text-secondary hover:text-[#b42332]"><TrashIcon /></button></td></tr>)}{entries.length === 0 && <tr><td colSpan={4} className="px-4 py-14 text-center text-app-text-secondary">{ko ? "진단 탭에서 ‘거부 후보’로 분류하거나 위에서 직접 추가하세요." : "Mark links as Disavow in the audit tab or add one above."}</td></tr>}</tbody></table></div></section>
    <section className="rounded-[9px] border border-[#efd59b] bg-[#fffdf7] p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-[14px] font-semibold text-app-text">{ko ? "Google 거부 파일 미리보기" : "Google disavow preview"}</h2><p className="mt-1 text-[10px] text-app-text-secondary">{preview?.entryCount ?? 0}{ko ? "개 항목" : " entries"}</p></div><button type="button" disabled={busy || !preview?.entryCount} onClick={() => void download()} className="inline-flex h-9 items-center gap-1.5 rounded-[7px] bg-[#171a26] px-3 text-[10px] font-semibold text-white disabled:opacity-40"><DownloadIcon />{ko ? ".txt 내보내기" : "Export .txt"}</button></div><div className="mt-4 space-y-2">{preview?.warnings.map((warning) => <p key={warning} className="rounded-[6px] bg-[#fff4d8] px-3 py-2 text-[10px] leading-5 text-[#73551b]">⚠ {warning}</p>)}</div><pre className="mt-4 max-h-[350px] overflow-auto whitespace-pre-wrap rounded-[8px] border border-app-border bg-white p-4 font-mono text-[9px] leading-5 text-app-text">{preview?.content ?? ""}</pre></section>
  </div>;
}
