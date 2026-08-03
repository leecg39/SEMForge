"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type { ContentWorkspaceItem } from "@/types/content";
import { ContentPageHeader, PrimaryLink, StatusPill, fieldClass } from "@/components/content/ContentUi";

type KindFilter = "all" | "article" | "image" | "video";
type StatusFilter = "all" | "active" | "completed" | "failed" | "archived";

const kindTabs: Array<{ value: KindFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "article", label: "글" },
  { value: "image", label: "이미지" },
  { value: "video", label: "영상" },
];

const statusTabs: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "모든 상태" },
  { value: "active", label: "진행" },
  { value: "completed", label: "완료" },
  { value: "failed", label: "실패" },
  { value: "archived", label: "보관" },
];

function statusGroup(status: string): StatusFilter {
  if (["completed", "ready", "published"].includes(status)) return "completed";
  if (status === "failed") return "failed";
  if (status === "archived") return "archived";
  return "active";
}

function destination(item: ContentWorkspaceItem, folderId: string): string {
  return `${item.href}${folderId ? `?fid=${encodeURIComponent(folderId)}` : ""}`;
}

export function ContentWorkspaces() {
  const searchParams = useSearchParams();
  const folderId = searchParams.get("fid") ?? "";
  const [kind, setKind] = useState<KindFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ContentWorkspaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ type: kind });
    if (folderId) params.set("folderId", folderId);
    if (query.trim()) params.set("q", query.trim());
    const timer = window.setTimeout(() => {
      setLoading(true);
      api.get<ContentWorkspaceItem[]>(`/api/content/workspaces/?${params}`)
        .then(({ data }) => {
          if (!active) return;
          setItems(data);
          setError(null);
        })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "작업판을 불러오지 못했습니다."); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [folderId, kind, query]);

  const filtered = useMemo(() => status === "all" ? items : items.filter((item) => statusGroup(item.status) === status), [items, status]);

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-7 px-5 py-8 sm:px-8 sm:py-10">
      <ContentPageHeader
        eyebrow="Workspaces"
        title="콘텐츠 작업판"
        description="글·이미지·영상의 실제 서버 단계와 실패 원인을 한곳에서 확인하고, 브라우저를 닫은 뒤에도 이어서 진행합니다."
        action={<PrimaryLink href={`/content/${folderId ? `?fid=${encodeURIComponent(folderId)}` : ""}`}>새 콘텐츠 만들기</PrimaryLink>}
      />

      <div className="grid gap-3 rounded-[14px] border border-bebe bg-white p-3 xl:grid-cols-[auto_auto_minmax(220px,1fr)] xl:items-center">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="콘텐츠 유형">
          {kindTabs.map((tab) => (
            <button key={tab.value} type="button" role="tab" aria-selected={kind === tab.value} onClick={() => setKind(tab.value)} className={cn("shrink-0 rounded-full px-3.5 py-2 text-[12px] font-semibold", kind === tab.value ? "bg-hof text-white" : "text-foggy hover:bg-faint")}>{tab.label}</button>
          ))}
        </div>
        <div className="flex gap-1 overflow-x-auto border-t border-bebe pt-3 xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0" role="tablist" aria-label="작업 상태">
          {statusTabs.map((tab) => (
            <button key={tab.value} type="button" role="tab" aria-selected={status === tab.value} onClick={() => setStatus(tab.value)} className={cn("shrink-0 rounded-full px-3 py-2 text-[11px] font-semibold", status === tab.value ? "bg-faint text-hof" : "text-foggy")}>{tab.label}</button>
          ))}
        </div>
        <label className="xl:ml-auto xl:w-[280px]">
          <span className="sr-only">작업판 검색</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목 검색" className={fieldClass} />
        </label>
      </div>

      {error && <div role="alert" className="rounded-[12px] bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>}
      {loading ? (
        <div className="rounded-[16px] border border-bebe bg-white p-12 text-center text-foggy">작업판을 불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-deco bg-white p-12 text-center">
          <p className="text-[16px] font-semibold text-hof">조건에 맞는 작업판이 없습니다.</p>
          <p className="mt-2 text-[13px] text-foggy">Content Home에서 글·이미지·영상 제작을 시작해 보세요.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[16px] border border-bebe bg-white">
          <ul className="divide-y divide-bebe">
            {filtered.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link href={destination(item, folderId)} className="grid gap-3 px-5 py-4 transition hover:bg-faint sm:grid-cols-[88px_minmax(0,1fr)_130px_150px_120px] sm:items-center">
                  <span className={cn("w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold", item.kind === "package" ? "bg-rausch/10 text-rausch" : item.kind === "article" ? "bg-blue-50 text-blue-700" : item.kind === "image" ? "bg-violet-50 text-violet-700" : "bg-orange-50 text-orange-700")}>{item.kind === "package" ? "연계" : item.kind === "article" ? "글" : item.kind === "image" ? "이미지" : "영상"}</span>
                  <div className="min-w-0"><h2 className="truncate text-[14px] font-semibold text-hof">{item.title}</h2><p className="mt-1 truncate text-[11px] text-foggy">{item.folderName ?? "프로젝트 미지정"}</p></div>
                  <div><StatusPill status={item.status} /></div>
                  <span className="truncate text-[12px] text-foggy">{item.stage.replaceAll("_", " ")}</span>
                  <time className="text-[12px] text-foggy" dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
                </Link>
                {item.kind === "package" && item.children && item.children.length > 0 && (
                  <details className="border-t border-bebe bg-faint/60 px-5 py-2">
                    <summary className="cursor-pointer py-1 text-[11px] font-semibold text-foggy">하위 결과 {item.children.length}개</summary>
                    <ul className="grid gap-1 py-2 sm:grid-cols-3">
                      {item.children.map((child) => (
                        <li key={`${child.kind}-${child.id}`}>
                          <Link href={destination(child, folderId)} className="flex items-center gap-2 rounded-[10px] bg-white px-3 py-2 text-[11px] hover:ring-1 hover:ring-deco">
                            <span className="font-semibold text-hof">{child.kind === "article" ? "글" : child.kind === "image" ? "이미지" : "영상"}</span>
                            <span className="min-w-0 flex-1 truncate text-foggy">{child.stage}</span>
                            <StatusPill status={child.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
