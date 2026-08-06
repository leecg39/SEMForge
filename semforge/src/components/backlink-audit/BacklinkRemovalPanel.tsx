"use client";

import { useEffect, useState } from "react";
import { OpenInNewWindowIcon } from "@radix-ui/react-icons";
import { api } from "@/lib/client-api";

interface RemovalRow {
  id: string;
  linkId: string;
  sourceUrl: string;
  targetUrl: string;
  sourceDomain: string;
  status: "pending" | "contacted" | "removed" | "failed";
  contact: string | null;
  note: string | null;
  lastContactedAt: string | null;
  followUpAt: string | null;
  updatedAt: string;
}

export function BacklinkRemovalPanel({ projectId, locale, onChanged }: {
  projectId: string; locale: "ko" | "en"; onChanged?: () => void;
}) {
  const ko = locale === "ko";
  const [rows, setRows] = useState<RemovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setLoading(true); setError(null);
    try { setRows((await api.get<RemovalRow[]>(`/api/backlink-audits/projects/${projectId}/removals/`)).data); }
    catch (reason) { setError(reason instanceof Error ? reason.message : (ko ? "삭제 요청을 불러오지 못했습니다." : "Could not load removal requests.")); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = async (row: RemovalRow, status: RemovalRow["status"]) => {
    setError(null);
    try {
      await api.patch(`/api/backlink-audits/projects/${projectId}/removals/`, { id: row.id, status });
      await load(); onChanged?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : (ko ? "삭제 상태를 저장하지 못했습니다." : "Could not save removal status.")); }
  };
  return <section className="overflow-hidden rounded-[9px] border border-app-border bg-white">
    <div className="border-b border-app-border p-5"><h2 className="text-[14px] font-semibold text-app-text">{ko ? "백링크 삭제 요청" : "Backlink removal requests"}</h2><p className="mt-1 text-[10px] leading-5 text-app-text-secondary">{ko ? "자동 이메일은 전송하지 않습니다. 사이트 운영자에게 직접 연락한 뒤 처리 상태를 기록하세요." : "No email is sent automatically. Contact the site owner yourself, then record the outcome."}</p>{error && <p className="mt-3 rounded-[7px] bg-[#fff0f1] px-3 py-2 text-[11px] text-[#a12828]">{error}</p>}</div>
    <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-[11px]"><thead className="bg-[#f8f9fb] text-[10px] text-app-text-secondary"><tr><th className="px-4 py-2.5">{ko ? "출처" : "Source"}</th><th className="px-4 py-2.5">{ko ? "대상" : "Target"}</th><th className="px-4 py-2.5">{ko ? "연락처·메모" : "Contact & note"}</th><th className="px-4 py-2.5">{ko ? "최근 연락" : "Last contact"}</th><th className="px-4 py-2.5">{ko ? "상태" : "Status"}</th></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="px-4 py-14 text-center text-app-text-secondary">{ko ? "불러오는 중…" : "Loading…"}</td></tr> : rows.map((row) => <tr key={row.id} className="border-t border-[#eef0f2]"><td className="max-w-[260px] px-4 py-3"><a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 truncate font-medium text-[#285fca]"><span className="truncate">{row.sourceDomain}</span><OpenInNewWindowIcon /></a><p className="mt-1 truncate text-[9px] text-app-text-secondary">{row.sourceUrl}</p></td><td className="max-w-[260px] truncate px-4 py-3 text-app-text-secondary" title={row.targetUrl}>{row.targetUrl}</td><td className="max-w-[240px] px-4 py-3"><p className="truncate">{row.contact ?? "—"}</p><p className="mt-1 line-clamp-2 text-[9px] text-app-text-secondary">{row.note ?? (ko ? "메모 없음" : "No note")}</p></td><td className="px-4 py-3 text-app-text-secondary">{row.lastContactedAt ? new Intl.DateTimeFormat(ko ? "ko-KR" : "en-US", { dateStyle: "medium" }).format(new Date(row.lastContactedAt)) : "—"}</td><td className="px-4 py-3"><select value={row.status} onChange={(event) => void update(row, event.target.value as RemovalRow["status"])} className="h-8 rounded-[6px] border border-app-border bg-white px-2 text-[10px]"><option value="pending">{ko ? "대기" : "Pending"}</option><option value="contacted">{ko ? "연락 완료" : "Contacted"}</option><option value="removed">{ko ? "제거 확인" : "Removed"}</option><option value="failed">{ko ? "실패" : "Failed"}</option></select></td></tr>)}{!loading && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-14 text-center text-app-text-secondary">{ko ? "진단 탭에서 링크를 ‘삭제 요청’으로 분류하면 여기에 표시됩니다." : "Mark links as Removal in the audit tab to add them here."}</td></tr>}</tbody></table></div>
  </section>;
}
