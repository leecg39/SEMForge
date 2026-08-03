"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type { ContentLibraryItem } from "@/types/content";
import { ContentPageHeader, StatusPill, fieldClass } from "@/components/content/ContentUi";

type KindFilter = "all" | "article" | "image" | "video";

const kindTabs: Array<{ value: KindFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "article", label: "글" },
  { value: "image", label: "이미지" },
  { value: "video", label: "영상" },
];

function destination(item: ContentLibraryItem, folderId: string): string {
  return `${item.href}${folderId ? `?fid=${encodeURIComponent(folderId)}` : ""}`;
}

export function ContentLibrary() {
  const searchParams = useSearchParams();
  const folderId = searchParams.get("fid") ?? "";
  const [kind, setKind] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ContentLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ type: kind });
    if (folderId) params.set("folderId", folderId);
    if (query.trim()) params.set("q", query.trim());
    const timer = window.setTimeout(() => {
      setLoading(true);
      api.get<ContentLibraryItem[]>(`/api/content/library/?${params}`)
        .then(({ data }) => {
          if (!active) return;
          setItems(data);
          setError(null);
        })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "라이브러리를 불러오지 못했습니다."); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [folderId, kind, query]);

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-7 px-5 py-8 sm:px-8 sm:py-10">
      <ContentPageHeader eyebrow="Library" title="콘텐츠 라이브러리" description="완성된 글·이미지·영상을 검색하고 원래 작업판에서 결과와 제작 이력을 확인합니다." />

      <section aria-label="라이브러리 필터" className="flex flex-col gap-3 rounded-[14px] border border-bebe bg-white p-3 sm:flex-row sm:items-center">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="결과 유형">
          {kindTabs.map((tab) => (
            <button key={tab.value} type="button" role="tab" aria-selected={kind === tab.value} onClick={() => setKind(tab.value)} className={cn("shrink-0 rounded-full px-3.5 py-2 text-[12px] font-semibold", kind === tab.value ? "bg-hof text-white" : "text-foggy hover:bg-faint")}>{tab.label}</button>
          ))}
        </div>
        <label className="sm:ml-auto sm:w-[300px]"><span className="sr-only">제목 검색</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목 검색" className={fieldClass} /></label>
      </section>

      <div className="flex items-center gap-2 text-[12px] text-foggy"><span>결과 {items.length.toLocaleString()}개</span>{folderId && <span className="rounded-full bg-faint px-2.5 py-1">현재 프로젝트만</span>}</div>
      {error && <div role="alert" className="rounded-[12px] bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>}

      {loading ? (
        <div className="rounded-[16px] border border-bebe bg-white p-12 text-center text-foggy">라이브러리를 불러오는 중…</div>
      ) : items.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-deco bg-white p-12 text-center"><p className="text-[16px] font-semibold text-hof">저장된 결과가 없습니다.</p><p className="mt-2 text-[13px] text-foggy">제작이 완료되면 글·이미지·영상 결과가 여기에 모입니다.</p></div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <article className="h-full overflow-hidden rounded-[18px] border border-bebe bg-white transition hover:-translate-y-0.5 hover:shadow-lg">
                <Link href={destination(item, folderId)} className="group block">
                  <div className="relative aspect-[16/9] overflow-hidden bg-faint">
                    {item.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.thumbnailUrl} alt="" className="size-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                    ) : (
                      <div className="grid size-full place-items-center text-[32px]" aria-hidden="true">{item.kind === "article" ? "✎" : item.kind === "image" ? "◇" : "▶"}</div>
                    )}
                    <span className={cn("absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-semibold", item.kind === "article" ? "bg-blue-50 text-blue-700" : item.kind === "image" ? "bg-violet-50 text-violet-700" : "bg-orange-50 text-orange-700")}>{item.kind === "article" ? "글" : item.kind === "image" ? "이미지" : "영상"}</span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start gap-3"><h2 className="min-w-0 flex-1 text-[14px] font-semibold leading-5 text-hof">{item.title}</h2><StatusPill status={item.status} /></div>
                    <p className="mt-2 truncate text-[12px] text-foggy">{item.subtitle}</p>
                    <time dateTime={item.updatedAt} className="mt-4 block text-[11px] text-foggy">{new Date(item.updatedAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
                  </div>
                </Link>
                {item.packageId && item.packageTitle && (
                  <div className="border-t border-bebe px-4 py-3">
                    <Link href={`/content/packages/${item.packageId}/${folderId ? `?fid=${encodeURIComponent(folderId)}` : ""}`} className="block max-w-full truncate rounded-full bg-rausch/10 px-3 py-1.5 text-[10px] font-semibold text-rausch">연계 패키지 · {item.packageTitle}</Link>
                  </div>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
