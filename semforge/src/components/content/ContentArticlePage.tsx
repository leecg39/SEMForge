"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client-api";
import type { ContentArticleView } from "@/types/content";
import { MarkdownArticleEditor } from "@/components/content/MarkdownArticleEditor";
import { ContentVisualStudio } from "@/components/content/ContentVisualStudio";
import { ContentArticleMedia } from "@/components/content/ContentArticleMedia";
import { cn } from "@/lib/utils";

export function ContentArticlePage({ articleId }: { articleId: string }) {
  const searchParams = useSearchParams();
  const folderId = searchParams.get("fid") ?? "";
  const [article, setArticle] = useState<ContentArticleView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"write" | "preview" | "image" | "video">("write");

  useEffect(() => {
    let active = true;
    api.get<ContentArticleView>(`/api/content/${articleId}/`)
      .then(({ data }) => { if (active) setArticle(data); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "문서를 불러오지 못했습니다."); });
    return () => { active = false; };
  }, [articleId]);

  if (error) return <div role="alert" className="p-8 text-red-700">{error}</div>;
  if (!article) return <div className="p-8 text-foggy">문서를 불러오는 중…</div>;
  return (
    <div className="mx-auto w-full max-w-[1180px] p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href={`/content/library/${folderId ? `?fid=${encodeURIComponent(folderId)}` : ""}`} className="text-[12px] font-semibold text-foggy">← 라이브러리</Link>
        <Link href={`/content/?mode=linked&sourceArticleId=${encodeURIComponent(article.id)}${folderId ? `&fid=${encodeURIComponent(folderId)}` : ""}`} className="ml-auto rounded-full bg-rausch px-4 py-2 text-[11px] font-semibold text-white">연계 제작으로 확장</Link>
        <span className="text-[12px] text-foggy">Markdown</span>
      </div>
      <div className="mb-4 flex w-fit rounded-full bg-faint p-1" role="tablist" aria-label="콘텐츠 문서 작업 영역">
        {([
          ["write", "글 작성"],
          ["preview", "미리보기"],
          ["image", "이미지"],
          ["video", "영상"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "rounded-full px-4 py-2 text-[12px] font-semibold",
              tab === value ? "bg-white text-hof shadow-sm" : "text-foggy",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "image" ? (
        <div className="grid gap-6">
          <ContentArticleMedia article={article} kind="image" />
          <ContentVisualStudio article={article} />
        </div>
      ) : tab === "video" ? (
        <ContentArticleMedia article={article} kind="video" />
      ) : (
        <MarkdownArticleEditor
          key={article.id}
          article={article}
          onSaved={setArticle}
          controlledTab={tab}
          onTabChange={(nextTab) => setTab(nextTab)}
          showTabs={false}
        />
      )}
    </div>
  );
}
