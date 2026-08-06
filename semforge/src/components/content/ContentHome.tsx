"use client";

// @TASK NAVER-P0-CONTENT-HANDOFF - NAVER 키워드 탐색→콘텐츠 브리프 연결
// @SPEC user-approved-plan#3-d-authenticated-features
// @TEST src/components/content/naver-handoff.test.ts

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client-api";
import {
  CONTENT_AI_PROFILES,
  DEFAULT_CONTENT_AI_PROFILE,
  isContentAiProfileId,
  type ContentAiProfileId,
} from "@/lib/content-ai";
import { cn } from "@/lib/utils";
import type {
  ContentArticleView,
  ContentBoardListItem,
  ContentCapabilitiesView,
  ContentPackageView,
  ContentProductionView,
} from "@/types/content";
import { ContentPageHeader, StatusPill, fieldClass, textareaClass } from "@/components/content/ContentUi";
import { ContentLinkedHome } from "@/components/content/ContentLinkedHome";
import { parseNaverContentHandoff } from "@/components/content/naver-handoff";
import { useLocale } from "@/i18n/LocaleProvider";
import { translateContentText } from "@/i18n/content";

type Category = "article" | "image" | "video";
type ArticleIntent = "create" | "optimize" | "repurpose" | "brief";

function withFolder(path: string, folderId: string): string {
  if (!folderId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}fid=${encodeURIComponent(folderId)}`;
}

const categories: Array<{ id: Category; label: string; description: string }> = [
  { id: "article", label: "글쓰기", description: "TalorData 연구와 Markdown 기사" },
  { id: "image", label: "이미지 제작", description: "ChatMock 명세와 Sharp 브랜드 이미지" },
  { id: "video", label: "영상 제작", description: "Grok 콘티와 Grok Imagine 30~60초 영상" },
];

function ContentHomeContent({ searchParams }: { searchParams: ReturnType<typeof useSearchParams> }) {
  const router = useRouter();
  const { locale } = useLocale();
  const tx = (text: string) => translateContentText(locale, text);
  const folderId = searchParams.get("fid") ?? "";
  const defaultSourceArticleId = searchParams.get("sourceArticleId") ?? "";
  const requestedIntent = searchParams.get("intent");
  const naverHandoff = parseNaverContentHandoff(searchParams, locale);
  const isArticleIntent = requestedIntent === "optimize" || requestedIntent === "repurpose" || requestedIntent === "brief" || requestedIntent === "topic";
  const [mode, setMode] = useState<"linked" | "individual">(searchParams.get("mode") === "individual" || isArticleIntent ? "individual" : "linked");
  const [category, setCategory] = useState<Category>("article");
  const [articleIntent, setArticleIntent] = useState<ArticleIntent>(requestedIntent === "optimize" ? "optimize" : requestedIntent === "repurpose" ? "repurpose" : requestedIntent === "brief" || requestedIntent === "topic" ? "brief" : "create");
  // URL handoff is initial input only. User edits must not be reset by an effect.
  const [prompt, setPrompt] = useState(() => naverHandoff?.prefill ?? "");
  const [mediaTitle, setMediaTitle] = useState("");
  const [sourceArticleId, setSourceArticleId] = useState("");
  const [stylePreset, setStylePreset] = useState<"editorial_photo" | "illustration" | "minimal_3d" | "abstract_graphic">("editorial_photo");
  const [imagePreset, setImagePreset] = useState<"hero" | "square" | "portrait" | "story">("hero");
  const [showTitle, setShowTitle] = useState(true);
  const [showLogo, setShowLogo] = useState(true);
  const [videoDuration, setVideoDuration] = useState<30 | 45 | 60>(45);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [boards, setBoards] = useState<ContentBoardListItem[]>([]);
  const [productions, setProductions] = useState<ContentProductionView[]>([]);
  const [packages, setPackages] = useState<ContentPackageView[]>([]);
  const [articles, setArticles] = useState<ContentArticleView[]>([]);
  const [capabilities, setCapabilities] = useState<ContentCapabilitiesView | null>(null);
  const [aiProfile, setAiProfile] = useState<ContentAiProfileId>(DEFAULT_CONTENT_AI_PROFILE);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const savedProfile = window.localStorage.getItem("semforge-content-ai-profile");
    Promise.all([
      api.get<ContentBoardListItem[]>("/api/content/boards/?limit=6"),
      api.get<ContentProductionView[]>("/api/content/productions/?limit=6"),
      api.get<ContentArticleView[]>("/api/content/?pageSize=100&sort=updatedAt:desc"),
      api.get<ContentCapabilitiesView>("/api/content/capabilities/"),
      api.get<ContentPackageView[]>("/api/content/packages/"),
    ])
      .then(([boardResult, productionResult, articleResult, capabilityResult, packageResult]) => {
        if (!active) return;
        if (isContentAiProfileId(savedProfile)) setAiProfile(savedProfile);
        setBoards(boardResult.data);
        setProductions(productionResult.data);
        setArticles(articleResult.data);
        setCapabilities(capabilityResult.data);
        setPackages(packageResult.data);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : translateContentText(locale, "콘텐츠 홈을 불러오지 못했습니다."));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [locale]);

  const mediaCapability = category === "image" ? capabilities?.imageCreation : capabilities?.videoCreation;
  const canSubmit = prompt.trim().length >= 3
    && (category === "article" || mediaTitle.trim().length > 0);

  const selectedArticle = useMemo(
    () => articles.find((article) => article.id === sourceArticleId) ?? null,
    [articles, sourceArticleId],
  );

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (category === "article") {
        const { data } = await api.post<{ id: string }>("/api/content/boards/", {
          prompt,
          folderId: folderId || null,
          intent: articleIntent,
          aiProfile,
          sourceArticleId: articleIntent === "repurpose" ? defaultSourceArticleId || null : null,
        });
        router.push(withFolder(`/content/workspaces/${data.id}/`, folderId));
        return;
      }
      const common = {
        kind: category,
        idempotencyKey: crypto.randomUUID(),
        folderId: folderId || null,
        sourceArticleId: sourceArticleId || null,
        title: mediaTitle,
        prompt,
      };
      const body = category === "image"
        ? {
            ...common,
            settings: {
              preset: imagePreset,
              stylePreset,
              displayTitle: mediaTitle.slice(0, 80),
              showTitle,
              showLogo,
              focalX: 50,
              focalY: 50,
            },
          }
        : {
            ...common,
            settings: {
              targetDuration: videoDuration,
              aspectRatio,
              stylePreset,
              nativeAudio: true,
            },
          };
      const { data } = await api.post<ContentProductionView>("/api/content/productions/", body);
      router.push(withFolder(`/content/productions/${data.id}/`, folderId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tx("콘텐츠 작업판을 만들지 못했습니다."));
      setSubmitting(false);
    }
  };

  const linkedBoardIds = new Set(packages.flatMap((contentPackage) => contentPackage.items.flatMap((item) => item.board ? [item.board.id] : [])));
  const linkedProductionIds = new Set(packages.flatMap((contentPackage) => contentPackage.items.flatMap((item) => item.production ? [item.production.id] : [])));
  const recent = [
    ...packages.map((contentPackage) => ({
      id: contentPackage.id,
      kind: "package" as const,
      title: contentPackage.title,
      status: contentPackage.status,
      updatedAt: contentPackage.updatedAt,
      href: `/content/packages/${contentPackage.id}/`,
      subtitle: `${tx("연계 제작")} · ${tx(contentPackage.targetStage === "article" ? "글" : contentPackage.targetStage === "image" ? "글+이미지" : "글+이미지+영상")}`,
    })),
    ...boards.filter((board) => !linkedBoardIds.has(board.id)).map((board) => ({
      id: board.id,
      kind: "article" as const,
      title: board.title,
      status: board.status,
      updatedAt: board.updatedAt,
      href: `/content/workspaces/${board.id}/`,
      subtitle: board.folderName ?? tx("프로젝트 미지정"),
    })),
    ...productions.filter((production) => !linkedProductionIds.has(production.id)).map((production) => ({
      id: production.id,
      kind: production.kind,
      title: production.title,
      status: production.status,
      updatedAt: production.updatedAt,
      href: `/content/productions/${production.id}/`,
      subtitle: tx(production.kind === "image" ? "이미지 제작" : "영상 제작"),
    })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-8 px-5 py-8 sm:px-8 sm:py-10">
      <ContentPageHeader
        eyebrow="Content workspace"
        title={tx("글·이미지·영상을 한곳에서 제작하세요")}
        description={tx("기사에서 브랜드 이미지와 장편 영상까지, 실제 실행 상태와 결과를 저장하고 언제든 이어서 작업합니다.")}
      />

      <div className="grid grid-cols-2 rounded-[16px] border border-bebe bg-white p-1.5" role="tablist" aria-label={tx("콘텐츠 제작 방식")}>
        <button type="button" role="tab" aria-selected={mode === "linked"} onClick={() => { setMode("linked"); setError(null); }} className={cn("rounded-[12px] px-4 py-3 text-left transition", mode === "linked" ? "bg-hof text-white" : "text-foggy hover:bg-faint")}><strong className="block text-[14px]">{tx("연계 제작")}</strong><span className={cn("mt-1 block text-[10px]", mode === "linked" ? "text-white/65" : "text-grey-500")}>{tx("글 → 이미지 → 영상을 승인 단계로 연결")}</span></button>
        <button type="button" role="tab" aria-selected={mode === "individual"} onClick={() => { setMode("individual"); setError(null); }} className={cn("rounded-[12px] px-4 py-3 text-left transition", mode === "individual" ? "bg-hof text-white" : "text-foggy hover:bg-faint")}><strong className="block text-[14px]">{tx("개별 제작")}</strong><span className={cn("mt-1 block text-[10px]", mode === "individual" ? "text-white/65" : "text-grey-500")}>{tx("글·이미지·영상을 서로 독립적으로 제작")}</span></button>
      </div>

      {mode === "linked" ? (
        <ContentLinkedHome key={defaultSourceArticleId && articles.some((article) => article.id === defaultSourceArticleId) ? defaultSourceArticleId : "linked-home"} articles={articles} folderId={folderId} defaultSourceArticleId={defaultSourceArticleId} />
      ) : (
        <>
      <div className="grid gap-3 md:grid-cols-3" role="tablist" aria-label={tx("콘텐츠 제작 유형")}>
        {categories.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={category === item.id}
            onClick={() => { setCategory(item.id); setError(null); }}
            className={cn(
              "rounded-[16px] border p-4 text-left transition",
              category === item.id ? "border-rausch bg-rausch/5 ring-1 ring-rausch" : "border-bebe bg-white hover:border-deco",
            )}
          >
            <span className="block text-[15px] font-semibold text-hof">{tx(item.label)}</span>
            <span className="mt-1 block text-[11px] leading-5 text-foggy">{tx(item.description)}</span>
          </button>
        ))}
      </div>

      <section className="rounded-[20px] border border-bebe bg-white p-5 shadow-sm sm:p-7">
        {category === "article" && <div className="mb-5 grid grid-cols-2 rounded-[11px] bg-faint p-1 sm:grid-cols-4" role="radiogroup" aria-label="글 작업 유형">{(["create", "optimize", "repurpose", "brief"] as const).map((intent) => <button key={intent} type="button" role="radio" aria-checked={articleIntent === intent} onClick={() => setArticleIntent(intent)} className={`rounded-[9px] px-2 py-2.5 text-[11px] font-semibold ${articleIntent === intent ? "bg-white text-hof shadow-sm" : "text-foggy"}`}>{intent === "create" ? "새 글 작성" : intent === "optimize" ? "기존 글 개선" : intent === "repurpose" ? "문서 재활용" : "주제·SEO 브리프"}</button>)}</div>}
        <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-hof">
          {tx(
            category === "article"
              ? articleIntent === "optimize"
                ? "어떤 글을 개선할까요?"
                : articleIntent === "repurpose"
                  ? "어떤 문서를 재활용할까요?"
                  : articleIntent === "brief"
                    ? "어떤 주제를 조사할까요?"
                    : "무엇을 작성할까요?"
              : category === "image"
                ? "어떤 이미지를 만들까요?"
                : "어떤 영상을 만들까요?",
          )}
        </h2>
        <p className="mt-1 text-[13px] text-foggy">
          {category === "article"
            ? articleIntent === "optimize"
              ? tx("개선 목표를 적고 작업판에서 URL 가져오기 또는 직접 입력을 선택하세요.")
              : articleIntent === "repurpose"
                ? tx("재활용 목표를 적고 작업판에서 Library 문서 또는 직접 입력 원문과 대상 형식을 선택하세요.")
                : articleIntent === "brief"
                  ? tx("TalorData 검색 결과에서 주제 기회와 검색 의도를 찾고 SEO 브리프로 정리합니다.")
                  : tx("주제, 목표 독자, 꼭 다룰 내용을 자연스럽게 적어 주세요.")
            : tx("독립 프롬프트로 시작하거나 저장된 기사를 제작 문맥으로 연결할 수 있습니다.")}
        </p>

        {category === "article" && naverHandoff && (
          <aside
            className="mt-5 rounded-[12px] border border-[#9fd8c8] bg-[#f3fbf8] p-4 sm:p-5"
            aria-labelledby="naver-content-handoff-title"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full bg-[#08765c] px-2.5 py-1 text-[11px] font-semibold text-white">
                {tx("NAVER 공식 데이터에서 전달됨")}
              </span>
              <strong id="naver-content-handoff-title" className="text-[13px] text-hof">
                {tx("대표 키워드")} · {naverHandoff.primaryKeyword}
              </strong>
              {naverHandoff.keywords.length > 1 && (
                <span className="text-[11px] text-foggy">
                  {tx("함께 선택")} {naverHandoff.keywords.length - 1}{locale === "ko" ? "개" : ""}
                </span>
              )}
            </div>

            <dl className="mt-3 grid gap-x-5 gap-y-2 text-[11px] leading-5 sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-foggy">{tx("출처")}</dt>
                <dd className="text-hof">{naverHandoff.naverSourceLabel}</dd>
              </div>
              <div>
                <dt className="font-semibold text-foggy">{tx("측정 방식")}</dt>
                <dd className="text-hof">{tx("공식 응답 · 추정값 임의 생성 안 함")}</dd>
              </div>
              {naverHandoff.inferredIntentLabel && (
                <div>
                  <dt className="font-semibold text-foggy">{tx("검색 의도")}</dt>
                  <dd className="text-hof">{naverHandoff.inferredIntentLabel} · clone-intent-v1 {tx("추론")}</dd>
                </div>
              )}
              {naverHandoff.naverFetchedAt && (
                <div>
                  <dt className="font-semibold text-foggy">{tx("수집 시각")}</dt>
                  <dd className="font-mono text-hof">{naverHandoff.naverFetchedAt.replace("T", " ").replace(".000Z", " UTC")}</dd>
                </div>
              )}
            </dl>

            {naverHandoff.keywords.length > 1 && (
              <p className="mt-3 break-words text-[11px] leading-5 text-foggy">
                <strong className="text-hof">{tx("함께 선택")}:</strong> {naverHandoff.keywords.slice(1).join(" · ")}
                {naverHandoff.omittedKeywordCount > 0
                  ? locale === "ko"
                    ? ` · 외 ${naverHandoff.omittedKeywordCount}개 미포함`
                    : ` · ${naverHandoff.omittedKeywordCount} more omitted`
                  : ""}
              </p>
            )}
            {naverHandoff.naverTrend && (
              <p className="mt-2 break-words text-[11px] leading-5 text-foggy">
                <strong className="text-hof">{tx("상대 검색 추이")}:</strong> {naverHandoff.naverTrend}
              </p>
            )}
            {naverHandoff.naverBlogTitles.length > 0 && (
              <div className="mt-2 text-[11px] leading-5 text-foggy">
                <strong className="text-hof">{tx("블로그 검색 API 응답 제목 · 통합검색 순위 아님")}</strong>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {naverHandoff.naverBlogTitles.map((title) => <li key={title}>{title}</li>)}
                </ul>
              </div>
            )}
            <p className="mt-3 border-t border-[#cbe9e0] pt-3 text-[11px] leading-5 text-[#35665a]">
              {tx("아래 브리프 입력에 복사했습니다. 자유롭게 수정한 뒤 버튼을 눌러야 작업판이 생성되며, 자동 게시는 하지 않습니다.")}
            </p>
          </aside>
        )}

        {category !== "article" && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-[11px] font-semibold text-foggy">
              {tx("작업 제목")}
              <input value={mediaTitle} maxLength={150} onChange={(event) => setMediaTitle(event.target.value)} placeholder={tx(category === "image" ? "브랜드 캠페인 Hero" : "제품 소개 영상")} className={`${fieldClass} mt-1.5`} />
            </label>
            <label className="text-[11px] font-semibold text-foggy">
              {tx("연결 기사 · 선택")}
              <select value={sourceArticleId} onChange={(event) => {
                setSourceArticleId(event.target.value);
                const article = articles.find((candidate) => candidate.id === event.target.value);
                if (article && !mediaTitle) setMediaTitle(article.title.slice(0, 150));
              }} className={`${fieldClass} mt-1.5`}>
                <option value="">{tx("독립 제작")}</option>
                {articles.map((article) => <option key={article.id} value={article.id}>{article.title}</option>)}
              </select>
            </label>
          </div>
        )}

        <textarea
          value={prompt}
          aria-label={category === "article" && articleIntent === "brief" ? "콘텐츠 브리프 입력" : "콘텐츠 제작 요청"}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void submit(); }}
          rows={5}
          placeholder={category === "article"
            ? articleIntent === "optimize"
              ? tx("예: 검색 의도에 맞게 구조와 메타 설명을 개선해 줘")
              : articleIntent === "repurpose"
                ? tx("예: 기존 가이드의 핵심 내용을 주간 뉴스레터로 바꿔 줘")
                : articleIntent === "brief"
                  ? tx("예: 소상공인 자사몰 SEO에서 경쟁이 낮은 실전 주제를 찾아 줘")
                  : tx("예: 처음 자사몰을 여는 소상공인을 위한 SEO 체크리스트 기사")
            : category === "image"
              ? tx("예: 신뢰감 있는 에디토리얼 그래픽, 중앙에 핵심 오브젝트, 차분한 분위기")
              : tx("예: 소상공인이 검색 유입을 성장시키는 과정을 역동적인 장면으로 구성")}
          className={`${textareaClass} mt-5 min-h-[138px] resize-y`}
        />

        {category !== "article" && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-[11px] font-semibold text-foggy">
              {tx("스타일")}
              <select value={stylePreset} onChange={(event) => setStylePreset(event.target.value as typeof stylePreset)} className={`${fieldClass} mt-1.5`}>
                <option value="editorial_photo">{tx("에디토리얼")}</option>
                <option value="illustration">{tx("일러스트")}</option>
                <option value="minimal_3d">{tx("미니멀 3D")}</option>
                <option value="abstract_graphic">{tx("추상 그래픽")}</option>
              </select>
            </label>
            {category === "image" ? (
              <>
                <label className="text-[11px] font-semibold text-foggy">
                  {tx("출력 프리셋")}
                  <select value={imagePreset} onChange={(event) => setImagePreset(event.target.value as typeof imagePreset)} className={`${fieldClass} mt-1.5`}>
                    <option value="hero">16:9 Hero</option>
                    <option value="square">1:1 Square</option>
                    <option value="portrait">4:5 Portrait</option>
                    <option value="story">9:16 Story</option>
                  </select>
                </label>
                <div className="flex items-end gap-4 pb-3 text-[12px] font-medium">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={showTitle} onChange={(event) => setShowTitle(event.target.checked)} />{tx("제목")}</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={showLogo} onChange={(event) => setShowLogo(event.target.checked)} />{tx("브랜드")}</label>
                </div>
              </>
            ) : (
              <>
                <label className="text-[11px] font-semibold text-foggy">
                  {tx("목표 길이")}
                  <select value={videoDuration} onChange={(event) => setVideoDuration(Number(event.target.value) as typeof videoDuration)} className={`${fieldClass} mt-1.5`}>
                    <option value={30}>{tx("30초")}</option><option value={45}>{tx("45초")}</option><option value={60}>{tx("60초")}</option>
                  </select>
                </label>
                <label className="text-[11px] font-semibold text-foggy">
                  {tx("화면비")}
                  <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as typeof aspectRatio)} className={`${fieldClass} mt-1.5`}>
                    <option value="16:9">{tx("16:9 가로")}</option><option value="9:16">{tx("9:16 세로")}</option><option value="1:1">{tx("1:1 정사각")}</option>
                  </select>
                </label>
              </>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void submit()} disabled={!canSubmit || submitting} className="inline-flex h-11 items-center rounded-full bg-rausch px-5 text-[14px] font-semibold text-white transition hover:bg-rausch-600 disabled:cursor-not-allowed disabled:opacity-40">
            {tx(
              submitting
                ? "작업판 만드는 중…"
                : category === "article"
                  ? articleIntent === "optimize"
                    ? "개선 작업 시작"
                    : articleIntent === "repurpose"
                      ? "재활용 작업 시작"
                      : articleIntent === "brief"
                        ? "주제 조사 시작"
                        : "새 글 작성"
                  : category === "image"
                    ? "이미지 작업 시작"
                    : "영상 콘티 시작",
            )}
          </button>
          <span className="text-[11px] text-grey-500">⌘/Ctrl + Enter</span>
          {category === "article" && (
            <label className="ml-auto flex min-w-[260px] items-center gap-2 text-[11px] font-semibold text-foggy">
              {tx("생성 모델")}
              <select value={aiProfile} onChange={(event) => {
                const next = event.target.value;
                if (!isContentAiProfileId(next)) return;
                setAiProfile(next);
                window.localStorage.setItem("semforge-content-ai-profile", next);
              }} className="h-10 min-w-0 flex-1 rounded-[10px] border border-deco bg-white px-3 text-[12px] font-semibold text-hof">
                {CONTENT_AI_PROFILES.map((profile) => {
                  const capability = capabilities?.contentModels.find((model) => model.id === profile.id);
                  return <option key={profile.id} value={profile.id} disabled={capability ? !capability.enabled : false}>{profile.providerLabel} · {profile.label}{capability && !capability.enabled ? ` (${tx("설정 필요")})` : ""}</option>;
                })}
              </select>
            </label>
          )}
        </div>
        {category !== "article" && mediaCapability && (
          <p className={`mt-2 text-[11px] ${mediaCapability.enabled ? "text-emerald-700" : "text-amber-700"}`}>
            {mediaCapability.enabled
              ? category === "image" ? `ChatMock ${capabilities?.imageCreation.model} · Sharp ${tx("준비됨")}` : `Grok ${capabilities?.videoCreation.plannerModel} · Grok Imagine ${capabilities?.videoCreation.rendererModel} ${tx("준비됨")}`
              : mediaCapability.reason}
          </p>
        )}
        {selectedArticle && <p className="mt-2 text-[11px] text-foggy">{tx("연결 문서")} v{selectedArticle.version}{tx("이 입력 스냅샷으로 저장됩니다.")}</p>}
        {error && <p role="alert" className="mt-4 rounded-[10px] bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>}
      </section>
        </>
      )}

      <section>
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-[18px] font-semibold text-hof">{tx("최근 작업")}</h2>
          <Link href={withFolder("/content/workspaces/", folderId)} className="ml-auto text-[13px] font-semibold text-hof underline decoration-deco underline-offset-4">{tx("모두 보기")}</Link>
        </div>
        {loading ? (
          <div className="rounded-[16px] border border-bebe bg-white p-8 text-center text-[13px] text-foggy">{tx("최근 작업을 불러오는 중…")}</div>
        ) : recent.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-deco bg-white p-8 text-center text-[13px] text-foggy">{tx("첫 제작 요청을 입력하면 작업판이 여기에 저장됩니다.")}</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {recent.map((item) => (
              <Link key={`${item.kind}-${item.id}`} href={withFolder(item.href, folderId)} className="group rounded-[16px] border border-bebe bg-white p-5 transition hover:-translate-y-0.5 hover:border-deco hover:shadow-sm">
                <div className="flex items-start gap-3"><span className="rounded-full bg-faint px-2 py-1 text-[10px] font-semibold text-foggy">{tx(item.kind === "package" ? "연계" : item.kind === "article" ? "글" : item.kind === "image" ? "이미지" : "영상")}</span><StatusPill status={item.status} /><span className="ml-auto text-[11px] text-grey-500">{new Date(item.updatedAt).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US")}</span></div>
                <h3 className="mt-4 line-clamp-2 text-[15px] font-semibold leading-6 text-hof group-hover:text-rausch-600">{item.title}</h3>
                <p className="mt-2 truncate text-[12px] text-foggy">{item.subtitle}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function ContentHome() {
  const searchParams = useSearchParams();
  return <ContentHomeContent key={searchParams.toString()} searchParams={searchParams} />;
}
