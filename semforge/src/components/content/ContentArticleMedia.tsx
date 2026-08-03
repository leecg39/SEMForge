"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type { ContentArticleView, ContentProductionView, ContentVisualStyle } from "@/types/content";
import { fieldClass, textareaClass } from "@/components/content/ContentUi";

type MediaKind = "image" | "video";

const styles: Array<{ value: ContentVisualStyle; label: string }> = [
  { value: "editorial_photo", label: "에디토리얼 사진" },
  { value: "illustration", label: "일러스트" },
  { value: "minimal_3d", label: "미니멀 3D" },
  { value: "abstract_graphic", label: "추상 그래픽" },
];

export function ContentArticleMedia({ article, kind }: { article: ContentArticleView; kind: MediaKind }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderId = searchParams.get("fid") ?? article.folderId ?? "";
  const [title, setTitle] = useState(article.title);
  const [prompt, setPrompt] = useState(kind === "image"
    ? `${article.title}의 핵심 메시지를 한눈에 전달하는 대표 이미지`
    : `${article.title}의 내용을 4~10개 장면으로 명확하게 설명하는 브랜드 영상`);
  const [stylePreset, setStylePreset] = useState<ContentVisualStyle>("editorial_photo");
  const [preset, setPreset] = useState<"hero" | "square" | "portrait" | "story">("hero");
  const [duration, setDuration] = useState<30 | 45 | 60>(45);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const settings = kind === "image"
        ? { preset, stylePreset, displayTitle: title.slice(0, 80), showTitle: true, showLogo: true, focalX: 50, focalY: 50 }
        : { targetDuration: duration, aspectRatio, stylePreset, nativeAudio: true };
      const { data } = await api.post<ContentProductionView & { reused: boolean }>("/api/content/productions/", {
        kind,
        title,
        prompt,
        folderId: folderId || undefined,
        sourceArticleId: article.id,
        settings,
        idempotencyKey: `${kind}-${article.id}-${article.version}-${crypto.randomUUID()}`,
      });
      router.push(`/content/productions/${data.id}/${folderId ? `?fid=${encodeURIComponent(folderId)}` : ""}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "미디어 작업을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[18px] border border-bebe bg-white p-5 sm:p-7">
      <div className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-rausch">Article source · v{article.version}</p>
        <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-hof">{kind === "image" ? "기사 기반 이미지 제작" : "기사 기반 영상 제작"}</h2>
        <p className="mt-2 text-[13px] leading-6 text-foggy">
          제목·메타 설명·키워드·주요 헤딩과 제한된 본문 발췌를 제작 문맥으로 전달합니다. 이후 기사가 바뀌면 오래된 버전 경고만 표시하고 자동 재생성하지 않습니다.
        </p>
      </div>

      <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <label><span className="mb-1.5 block text-[11px] font-semibold text-foggy">작업 제목</span><input maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} /></label>
          <label><span className="mb-1.5 block text-[11px] font-semibold text-foggy">제작 지시</span><textarea rows={6} value={prompt} onChange={(event) => setPrompt(event.target.value)} className={textareaClass} /></label>
        </div>
        <div className="rounded-[14px] bg-faint p-4">
          <span className="mb-2 block text-[11px] font-semibold text-foggy">스타일</span>
          <div className="grid grid-cols-2 gap-2">
            {styles.map((style) => <button key={style.value} type="button" onClick={() => setStylePreset(style.value)} className={cn("rounded-[10px] border px-3 py-2.5 text-left text-[11px] font-semibold", stylePreset === style.value ? "border-rausch bg-white text-rausch" : "border-transparent bg-white/70 text-foggy")}>{style.label}</button>)}
          </div>

          {kind === "image" ? (
            <label className="mt-4 block"><span className="mb-1.5 block text-[11px] font-semibold text-foggy">결과 비율</span><select value={preset} onChange={(event) => setPreset(event.target.value as typeof preset)} className={fieldClass}><option value="hero">16:9 Hero</option><option value="square">1:1 Square</option><option value="portrait">4:5 Portrait</option><option value="story">9:16 Story</option></select></label>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label><span className="mb-1.5 block text-[11px] font-semibold text-foggy">길이</span><select value={duration} onChange={(event) => setDuration(Number(event.target.value) as typeof duration)} className={fieldClass}><option value={30}>30초</option><option value={45}>45초</option><option value={60}>60초</option></select></label>
              <label><span className="mb-1.5 block text-[11px] font-semibold text-foggy">화면비</span><select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as typeof aspectRatio)} className={fieldClass}><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option></select></label>
            </div>
          )}
          {kind === "video" && <p className="mt-3 text-[11px] leading-5 text-foggy">콘티 승인 전에는 xAI 영상 비용이 발생하지 않습니다. 키프레임 검토 후 두 번째 승인에서 Grok Imagine 장면 렌더링을 시작합니다.</p>}
        </div>
      </div>
      {error && <div role="alert" className="mt-4 rounded-[12px] bg-red-50 px-4 py-3 text-[12px] text-red-700">{error}</div>}
      <div className="mt-6 flex justify-end"><button type="button" disabled={busy || !title.trim() || !prompt.trim()} onClick={create} className="rounded-full bg-rausch px-6 py-3 text-[13px] font-semibold text-white disabled:opacity-40">{busy ? "작업판 생성 중…" : kind === "image" ? "이미지 제작 시작" : "영상 콘티 만들기"}</button></div>
    </section>
  );
}
