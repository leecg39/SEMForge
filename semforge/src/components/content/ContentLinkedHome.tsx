"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type { ContentArticleView, ContentImageTitlePosition, ContentPackageView, ContentVisualStyle } from "@/types/content";
import { fieldClass, textareaClass } from "@/components/content/ContentUi";

export function ContentLinkedHome({ articles, folderId, defaultSourceArticleId = "" }: { articles: ContentArticleView[]; folderId: string; defaultSourceArticleId?: string }) {
  const router = useRouter();
  const defaultArticle = articles.find((article) => article.id === defaultSourceArticleId) ?? null;
  const [startMode, setStartMode] = useState<"new_article" | "existing_article">(defaultSourceArticleId ? "existing_article" : "new_article");
  const [targetStage, setTargetStage] = useState<"article" | "image" | "video">("video");
  const [sourceArticleId, setSourceArticleId] = useState(defaultSourceArticleId);
  const [title, setTitle] = useState(defaultArticle?.title ?? "");
  const [brief, setBrief] = useState(defaultArticle ? `${defaultArticle.title}의 핵심 메시지와 브랜드 톤을 유지해 이미지와 영상으로 확장합니다.` : "");
  const [keyword, setKeyword] = useState("");
  const [audience, setAudience] = useState("주제에 관심 있는 일반 독자");
  const [brandVoice, setBrandVoice] = useState("명확하고 신뢰감 있는 전문가");
  const [targetWordCount, setTargetWordCount] = useState(1400);
  const [stylePreset, setStylePreset] = useState<ContentVisualStyle>("editorial_photo");
  const [imagePreset, setImagePreset] = useState<"hero" | "square" | "portrait" | "story">("hero");
  const [imageDisplayTitle, setImageDisplayTitle] = useState("");
  const [showImageTitle, setShowImageTitle] = useState(true);
  const [imageTitlePosition, setImageTitlePosition] = useState<ContentImageTitlePosition>("top_left");
  const [videoDuration, setVideoDuration] = useState<30 | 45 | 60>(45);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedArticle = useMemo(() => articles.find((article) => article.id === sourceArticleId) ?? null, [articles, sourceArticleId]);

  const canSubmit = title.trim().length > 0
    && brief.trim().length >= 3
    && (startMode === "existing_article" ? Boolean(sourceArticleId) : keyword.trim().length > 0);

  const create = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const common = {
        idempotencyKey: crypto.randomUUID(),
        folderId: folderId || null,
        title,
        brief,
        targetStage,
        imageSettings: {
          preset: imagePreset,
          stylePreset,
          ...(imageDisplayTitle.trim() ? { displayTitle: imageDisplayTitle.trim().slice(0, 80) } : {}),
          showTitle: showImageTitle,
          titlePosition: imageTitlePosition,
          showLogo: true,
          focalX: 50,
          focalY: 50,
        },
        videoSettings: { targetDuration: videoDuration, aspectRatio, stylePreset, nativeAudio: true },
      };
      const body = startMode === "new_article"
        ? {
            ...common,
            startMode,
            articleSettings: {
              keyword,
              title: title || null,
              audience,
              brandVoice,
              language: "ko",
              countryCode: "KR",
              targetWordCount,
              sourceUrl: null,
            },
          }
        : { ...common, startMode, sourceArticleId };
      const { data } = await api.post<ContentPackageView & { reused: boolean }>("/api/content/packages/", body);
      router.push(`/content/packages/${data.id}/${folderId ? `?fid=${encodeURIComponent(folderId)}` : ""}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "연계 제작 패키지를 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[20px] border border-bebe bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-rausch">Linked production</p>
          <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-hof">글에서 이미지와 영상까지 연결하세요</h2>
          <p className="mt-2 text-[13px] leading-6 text-foggy">각 결과를 검토하고 승인해야 다음 단계가 시작됩니다. 승인 전에는 다음 공급자 비용이 발생하지 않습니다.</p>
        </div>
        <div className="flex rounded-full bg-faint p-1" role="radiogroup" aria-label="연계 제작 시작점">
          {([['new_article', '새 글'], ['existing_article', '기존 글']] as const).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={startMode === value} onClick={() => setStartMode(value)} className={cn("rounded-full px-4 py-2 text-[12px] font-semibold", startMode === value ? "bg-white text-hof shadow-sm" : "text-foggy")}>{label}에서 시작</button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <label><span className="mb-1.5 block text-[11px] font-semibold text-foggy">패키지 제목</span><input maxLength={150} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: 자사몰 SEO 콘텐츠 캠페인" className={fieldClass} /></label>
          {startMode === "existing_article" ? (
            <label><span className="mb-1.5 block text-[11px] font-semibold text-foggy">Library 기사</span><select value={sourceArticleId} onChange={(event) => { setSourceArticleId(event.target.value); const article = articles.find((candidate) => candidate.id === event.target.value); if (article && !title) setTitle(article.title); }} className={fieldClass}><option value="">기사를 선택하세요</option>{articles.map((article) => <option key={article.id} value={article.id}>{article.title} · v{article.version}</option>)}</select></label>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label><span className="mb-1.5 block text-[11px] font-semibold text-foggy">핵심 키워드</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="예: 자사몰 SEO" className={fieldClass} /></label>
              <label><span className="mb-1.5 block text-[11px] font-semibold text-foggy">목표 독자</span><input value={audience} onChange={(event) => setAudience(event.target.value)} className={fieldClass} /></label>
            </div>
          )}
          <label><span className="mb-1.5 block text-[11px] font-semibold text-foggy">공통 제작 브리프</span><textarea rows={6} value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="글·이미지·영상이 공통으로 전달해야 할 메시지, 분위기, 금지 요소를 적어 주세요." className={textareaClass} /></label>
        </div>

        <div className="rounded-[16px] bg-faint p-4">
          <span className="text-[11px] font-semibold text-foggy">최종 목표</span>
          <div className="mt-2 grid gap-2" role="radiogroup" aria-label="최종 목표 단계">
            {([['article', '글만', '기사 검토에서 완료'], ['image', '글 + 이미지', '대표 이미지 승인에서 완료'], ['video', '글 + 이미지 + 영상', '최종 MP4까지 제작']] as const).map(([value, label, description]) => (
              <button key={value} type="button" role="radio" aria-checked={targetStage === value} onClick={() => setTargetStage(value)} className={cn("rounded-[11px] border p-3 text-left", targetStage === value ? "border-rausch bg-white" : "border-transparent bg-white/65")}><strong className="block text-[12px] text-hof">{label}</strong><span className="mt-1 block text-[10px] text-foggy">{description}</span></button>
            ))}
          </div>
          {targetStage !== "article" && <label className="mt-4 block"><span className="mb-1.5 block text-[11px] font-semibold text-foggy">공통 시각 스타일</span><select value={stylePreset} onChange={(event) => setStylePreset(event.target.value as ContentVisualStyle)} className={fieldClass}><option value="editorial_photo">에디토리얼 사진</option><option value="illustration">일러스트</option><option value="minimal_3d">미니멀 3D</option><option value="abstract_graphic">추상 그래픽</option></select></label>}
          {targetStage !== "article" && <div className="mt-3 rounded-[12px] border border-deco bg-white p-3"><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-foggy">대표 이미지</span><select value={imagePreset} onChange={(event) => setImagePreset(event.target.value as typeof imagePreset)} className={fieldClass}><option value="hero">16:9 Hero</option><option value="square">1:1 Square</option><option value="portrait">4:5 Portrait</option><option value="story">9:16 Story</option></select></label><label className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-hof"><input type="checkbox" checked={showImageTitle} onChange={(event) => setShowImageTitle(event.target.checked)} />이미지에 제목 표시</label><label className="mt-3 block"><span className="mb-1 block text-[10px] text-foggy">이미지 제목</span><input value={imageDisplayTitle} maxLength={80} disabled={!showImageTitle} onChange={(event) => setImageDisplayTitle(event.target.value)} placeholder={(selectedArticle?.title || title || "승인된 기사 제목을 사용합니다").slice(0, 80)} className={fieldClass} /></label><fieldset className="mt-3" disabled={!showImageTitle}><legend className="mb-1.5 text-[10px] text-foggy">제목 위치</legend><div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="대표 이미지 제목 위치">{([['top_left', '좌측 상단'], ['bottom_left', '좌측 하단']] as const).map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={imageTitlePosition === value} onClick={() => setImageTitlePosition(value)} className={cn("rounded-[9px] border px-3 py-2 text-[11px] font-semibold", imageTitlePosition === value ? "border-rausch bg-rausch/5 text-rausch" : "border-deco text-foggy")}>{label}</button>)}</div></fieldset></div>}
          {targetStage === "video" && <div className="mt-3 grid grid-cols-2 gap-2"><label><span className="mb-1.5 block text-[11px] font-semibold text-foggy">영상 길이</span><select value={videoDuration} onChange={(event) => setVideoDuration(Number(event.target.value) as typeof videoDuration)} className={fieldClass}><option value={30}>30초</option><option value={45}>45초</option><option value={60}>60초</option></select></label><label><span className="mb-1.5 block text-[11px] font-semibold text-foggy">화면비</span><select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as typeof aspectRatio)} className={fieldClass}><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option></select></label></div>}
          {startMode === "new_article" && <details className="mt-4"><summary className="cursor-pointer text-[11px] font-semibold text-hof">기사 고급 설정</summary><div className="mt-3 grid gap-3"><label><span className="mb-1 block text-[10px] text-foggy">브랜드 보이스</span><input value={brandVoice} onChange={(event) => setBrandVoice(event.target.value)} className={fieldClass} /></label><label><span className="mb-1 block text-[10px] text-foggy">목표 분량</span><input type="number" min={500} max={5000} step={100} value={targetWordCount} onChange={(event) => setTargetWordCount(Number(event.target.value))} className={fieldClass} /></label></div></details>}
        </div>
      </div>
      {error && <div role="alert" className="mt-4 rounded-[12px] bg-red-50 px-4 py-3 text-[12px] text-red-700">{error}</div>}
      <div className="mt-6 flex justify-end"><button type="button" disabled={!canSubmit || busy} onClick={create} className="rounded-full bg-rausch px-6 py-3 text-[13px] font-semibold text-white disabled:opacity-40">{busy ? "패키지 생성 중…" : "연계 제작 시작"}</button></div>
    </section>
  );
}
