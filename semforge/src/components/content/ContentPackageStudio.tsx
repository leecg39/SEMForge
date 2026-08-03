"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type {
  ContentImageTitlePosition,
  ContentPackageItemView,
  ContentPackageView,
  ContentProductionStatus,
  ContentProductionView,
  ContentRunView,
} from "@/types/content";
import { MarkdownArticleEditor } from "@/components/content/MarkdownArticleEditor";
import { StatusPill } from "@/components/content/ContentUi";

const ACTIVE_PRODUCTION_STATUSES: ContentProductionStatus[] = ["draft", "planning", "generating_keyframes", "generating", "assembling"];
const kindLabels = { article: "글", image: "이미지", video: "영상" } as const;
const stepLabels: Record<ContentPackageView["currentStep"], string> = {
  article: "기사 생성",
  article_review: "기사 승인",
  image: "대표 이미지 생성",
  image_review: "대표 이미지 승인",
  video: "영상 제작",
  complete: "제작 완료",
};

function activeKind(contentPackage: ContentPackageView): ContentPackageItemView["kind"] {
  if (contentPackage.currentStep.startsWith("article")) return "article";
  if (contentPackage.currentStep.startsWith("image")) return "image";
  return "video";
}

function latestRun(item: ContentPackageItemView | null): ContentRunView | null {
  return item?.board?.runs[0] ?? null;
}

export function ContentPackageStudio({ packageId }: { packageId: string }) {
  const searchParams = useSearchParams();
  const folderId = searchParams.get("fid") ?? "";
  const [contentPackage, setContentPackage] = useState<ContentPackageView | null>(null);
  const [selectedKind, setSelectedKind] = useState<ContentPackageItemView["kind"]>("article");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageDisplayTitle, setImageDisplayTitle] = useState("");
  const [showImageTitle, setShowImageTitle] = useState(true);
  const [imageTitlePosition, setImageTitlePosition] = useState<ContentImageTitlePosition>("bottom_left");
  const inFlight = useRef(false);
  const imageOptionsScope = useRef("");

  const refresh = async () => {
    const { data } = await api.get<ContentPackageView>(`/api/content/packages/${packageId}/`);
    setContentPackage(data);
    setSelectedKind((current) => data.activeItems[current] ? current : activeKind(data));
    setError(null);
    return data;
  };

  useEffect(() => {
    let active = true;
    api.get<ContentPackageView>(`/api/content/packages/${packageId}/`)
      .then(({ data }) => {
        if (!active) return;
        setContentPackage(data);
        setSelectedKind(activeKind(data));
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "연계 제작 패키지를 불러오지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [packageId]);

  useEffect(() => {
    const article = contentPackage?.activeItems.article?.article;
    if (!contentPackage || !article || !["article_review", "image_review"].includes(contentPackage.currentStep)) return;
    const scope = `${contentPackage.id}:${article.id}:${article.version}`;
    if (imageOptionsScope.current === scope) return;
    imageOptionsScope.current = scope;
    const settings = contentPackage.settings.image;
    setImageDisplayTitle(settings.displayTitle?.trim() || article.title.slice(0, 80));
    setShowImageTitle(settings.showTitle ?? true);
    setImageTitlePosition(settings.titlePosition === "top_left" ? "top_left" : "bottom_left");
  }, [contentPackage]);

  useEffect(() => {
    if (!contentPackage || contentPackage.status !== "active" || inFlight.current) return;
    const item = contentPackage.activeItems[activeKind(contentPackage)];
    const run = latestRun(item);
    const production = item?.production;
    if (contentPackage.currentStep === "article" && run?.processing) {
      let cancelled = false;
      const timer = window.setTimeout(() => {
        refresh().catch((cause) => {
          if (!cancelled) setError(cause instanceof Error ? cause.message : "기사 생성 상태를 확인하지 못했습니다.");
        });
      }, 2_000);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }
    const processPath = contentPackage.currentStep === "article" && run && ["queued", "running"].includes(run.status)
      ? `/api/content/runs/${run.id}/process/`
      : production && ACTIVE_PRODUCTION_STATUSES.includes(production.status)
        ? `/api/content/productions/${production.id}/process/`
        : null;
    if (!processPath) return;
    const delay = production?.stage === "poll_scenes" ? 15_000 : 450;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      inFlight.current = true;
      try {
        await api.post(processPath);
        if (!cancelled) await refresh();
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "다음 제작 단계를 처리하지 못했습니다.");
      } finally {
        inFlight.current = false;
      }
    }, delay);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // 패키지 응답이 바뀔 때마다 정확히 한 단계만 예약한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentPackage]);

  const action = async (path: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<ContentPackageView>(path, body);
      setContentPackage(data);
      setSelectedKind(activeKind(data));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "요청을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const approvePackage = async (gate: "article" | "image", item: ContentPackageItemView) => {
    if (!contentPackage) return;
    const nextSettings = gate === "article" && contentPackage.targetStage !== "article"
      ? {
          image: {
            ...contentPackage.settings.image,
            displayTitle: imageDisplayTitle.trim() || item.article?.title.slice(0, 80) || contentPackage.title.slice(0, 80),
            showTitle: showImageTitle,
            titlePosition: imageTitlePosition,
          },
        }
      : undefined;
    await action(`/api/content/packages/${contentPackage.id}/approve/`, {
      gate,
      itemId: item.id,
      itemVersion: item.version,
      packageVersion: contentPackage.version,
      ...(nextSettings ? { nextSettings } : {}),
    });
  };

  const approveVideoGate = async (production: ContentProductionView, gate: "storyboard" | "keyframes") => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/content/productions/${production.id}/approve/`, { gate, version: production.version });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "영상 승인 단계를 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    if (!contentPackage) return;
    const item = contentPackage.activeItems[activeKind(contentPackage)];
    const run = latestRun(item);
    setBusy(true);
    setError(null);
    try {
      if (run?.status === "failed") await api.post(`/api/content/runs/${run.id}/retry/`);
      else if (item?.production?.status === "failed") await api.post(`/api/content/productions/${item.production.id}/retry/`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "실패 단계를 재시도하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async (kind: ContentPackageItemView["kind"]) => {
    if (!contentPackage) return;
    const nextSettings = kind === "image"
      ? {
          image: {
            ...contentPackage.settings.image,
            displayTitle: imageDisplayTitle.trim() || contentPackage.activeItems.article?.article?.title.slice(0, 80) || contentPackage.title.slice(0, 80),
            showTitle: showImageTitle,
            titlePosition: imageTitlePosition,
          },
        }
      : undefined;
    await action(`/api/content/packages/${contentPackage.id}/regenerate/`, {
      kind,
      fromLatestSource: true,
      packageVersion: contentPackage.version,
      ...(nextSettings ? { nextSettings } : {}),
    });
  };

  const activeItems = contentPackage?.activeItems ?? { article: null, image: null, video: null };
  const selectedItem = activeItems?.[selectedKind] ?? null;
  const needsXaiApiKey = contentPackage?.error.message?.includes("XAI_API_KEY") ?? false;
  const hasLegacyVideoDependencyError = Boolean(
    contentPackage?.currentStep === "video"
    && (contentPackage.error.message?.includes("DASHSCOPE_") || contentPackage.error.message?.includes("chatmock")),
  );
  const stages = useMemo(() => {
    if (!contentPackage) return [];
    return (["article", "image", "video"] as const).filter((kind) => {
      if (kind === "article") return true;
      if (kind === "image") return contentPackage.targetStage !== "article";
      return contentPackage.targetStage === "video";
    });
  }, [contentPackage]);

  if (loading) return <div className="grid min-h-[70vh] place-items-center text-[13px] text-foggy">연계 제작을 복원하는 중…</div>;
  if (!contentPackage) return <div role="alert" className="p-8 text-red-700">{error ?? "패키지를 찾을 수 없습니다."}</div>;

  return (
    <div className="min-h-[calc(100dvh-64px)] bg-faint">
      <header className="border-b border-bebe bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-3">
          <Link href={`/content/workspaces/${folderId ? `?fid=${encodeURIComponent(folderId)}` : ""}`} className="text-[12px] font-semibold text-foggy">← 작업판</Link>
          <span className="h-4 w-px bg-deco" />
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-hof">{contentPackage.title}</h1>
          <span className="rounded-full bg-rausch/10 px-3 py-1.5 text-[11px] font-semibold text-rausch">연계 제작</span>
          <StatusPill status={contentPackage.status} />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1680px] lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="border-b border-bebe bg-white p-5 lg:sticky lg:top-0 lg:h-[calc(100dvh-65px)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-rausch">Content package</p>
          <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.03em] text-hof">{stepLabels[contentPackage.currentStep]}</h2>
          <p className="mt-3 text-[12px] leading-5 text-foggy">{contentPackage.brief}</p>

          <ol className="mt-6 grid gap-2" aria-label="연계 제작 단계">
            {stages.map((kind, index) => {
              const item = activeItems[kind];
              const ready = kind === "article" ? Boolean(item?.article) : item?.production?.status === "ready";
              const selected = selectedKind === kind;
              return (
                <li key={kind}>
                  <button type="button" disabled={!item} onClick={() => setSelectedKind(kind)} className={cn("flex w-full items-center gap-3 rounded-[12px] border p-3 text-left", selected ? "border-rausch bg-rausch/5" : "border-transparent bg-faint", !item && "opacity-45")}>
                    <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border text-[11px] font-bold", ready ? "border-emerald-600 bg-emerald-600 text-white" : selected ? "border-rausch bg-rausch text-white" : "border-deco text-foggy")}>{ready ? "✓" : index + 1}</span>
                    <span className="min-w-0 flex-1"><strong className="block text-[12px] text-hof">{kindLabels[kind]}</strong><span className="mt-0.5 block truncate text-[10px] text-foggy">{item ? `revision ${item.revision}${item.stale ? " · 원본 변경됨" : ""}` : "이전 단계 승인 후 시작"}</span></span>
                  </button>
                </li>
              );
            })}
          </ol>

          <dl className="mt-6 grid gap-2 rounded-[12px] bg-faint p-3 text-[11px]">
            <div className="flex justify-between gap-2"><dt className="text-foggy">목표</dt><dd className="font-semibold text-hof">{contentPackage.targetStage === "article" ? "글" : contentPackage.targetStage === "image" ? "글 + 이미지" : "글 + 이미지 + 영상"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-foggy">시작점</dt><dd className="font-semibold text-hof">{contentPackage.startMode === "new_article" ? "새 글" : "기존 글"}</dd></div>
          </dl>

          {selectedItem?.stale && <div className="mt-4 rounded-[12px] bg-amber-50 p-3 text-[11px] leading-5 text-amber-800">이 결과는 이전 원본 버전으로 제작되었습니다. 기존 결과는 유지되며, 최신 원본으로 새 revision을 만들 수 있습니다.</div>}
          {contentPackage.error.message && (
            <div role="alert" className="mt-4 rounded-[12px] bg-red-50 p-3 text-[11px] leading-5 text-red-700">
              <p>{hasLegacyVideoDependencyError ? "기존 영상 공급자 의존성 오류입니다. 영상 제작이 xAI Grok 전용 경로로 변경되었으므로 아래 버튼으로 다시 생성할 수 있습니다." : contentPackage.error.message}</p>
              {needsXaiApiKey && (
                <div className="mt-2 rounded-[10px] border border-red-200 bg-white/70 p-2.5 text-[10px] text-hof">
                  <p><code className="font-semibold">semforge/.env.local</code>에 아래 값을 직접 입력하고 서버를 다시 시작하세요.</p>
                  <code className="mt-2 block overflow-x-auto rounded bg-hof px-2 py-1.5 font-mono text-white">XAI_API_KEY=xai-발급받은-키</code>
                  <p className="mt-2 text-foggy">키는 브라우저나 DB에 저장되지 않으며 서버에서만 사용됩니다.</p>
                  {contentPackage.targetStage === "video" && <p className="mt-1 text-foggy">같은 키로 Grok 4.5 콘티와 Grok Imagine 영상 장면을 모두 인증합니다.</p>}
                </div>
              )}
            </div>
          )}
          {error && <div role="alert" className="mt-4 rounded-[12px] bg-red-50 p-3 text-[11px] text-red-700">{error}</div>}

          {contentPackage.status === "failed" && <button type="button" disabled={busy} onClick={retry} className="mt-4 w-full rounded-full bg-hof px-4 py-2.5 text-[12px] font-semibold text-white disabled:opacity-40">{hasLegacyVideoDependencyError ? "xAI로 다시 생성" : needsXaiApiKey ? "환경 설정 후 다시 생성" : "실패 단계 재시도"}</button>}
          {!['cancelled', 'archived'].includes(contentPackage.status) && selectedItem && <button type="button" disabled={busy || contentPackage.status === "active"} onClick={() => regenerate(selectedKind)} className="mt-2 w-full rounded-full border border-deco px-4 py-2.5 text-[11px] font-semibold text-hof disabled:opacity-40">최신 원본으로 새 revision</button>}
          {['active', 'awaiting_approval', 'failed'].includes(contentPackage.status) && <button type="button" disabled={busy} onClick={() => action(`/api/content/packages/${contentPackage.id}/cancel/`, { version: contentPackage.version })} className="mt-2 w-full rounded-full border border-deco px-4 py-2.5 text-[11px] font-semibold text-foggy disabled:opacity-40">패키지 취소</button>}
          <p aria-live="polite" className="mt-4 text-[10px] text-foggy">{stepLabels[contentPackage.currentStep]} · {contentPackage.status}</p>
        </aside>

        <section className="min-w-0 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1180px]">
            {selectedKind === "article" && selectedItem?.article ? (
              <div className="grid gap-4">
                {contentPackage.currentStep === "article_review" && selectedItem.status === "active" && (
                  <ArticleApprovalCard
                    createsImage={contentPackage.targetStage !== "article"}
                    displayTitle={imageDisplayTitle}
                    showTitle={showImageTitle}
                    titlePosition={imageTitlePosition}
                    busy={busy}
                    onDisplayTitleChange={setImageDisplayTitle}
                    onShowTitleChange={setShowImageTitle}
                    onTitlePositionChange={setImageTitlePosition}
                    onApprove={() => approvePackage("article", selectedItem)}
                  />
                )}
                <MarkdownArticleEditor article={selectedItem.article} onSaved={() => refresh()} />
              </div>
            ) : selectedKind === "article" ? (
              <WaitingCard title="기사를 생성하고 있습니다" detail={latestRun(selectedItem)?.stage ?? "입력 검증"} />
            ) : selectedKind === "image" && selectedItem?.production ? (
              <ImageResult
                production={selectedItem.production}
                reviewing={contentPackage.currentStep === "image_review"}
                busy={busy}
                displayTitle={imageDisplayTitle}
                showTitle={showImageTitle}
                titlePosition={imageTitlePosition}
                onDisplayTitleChange={setImageDisplayTitle}
                onShowTitleChange={setShowImageTitle}
                onTitlePositionChange={setImageTitlePosition}
                onRegenerate={() => regenerate("image")}
                onApprove={() => approvePackage("image", selectedItem)}
              />
            ) : selectedKind === "video" && selectedItem?.production ? (
              <VideoResult production={selectedItem.production} busy={busy} onApprove={approveVideoGate} folderId={folderId} />
            ) : (
              <WaitingCard title={`${kindLabels[selectedKind]} 단계가 아직 시작되지 않았습니다`} detail="이전 결과를 승인하면 자동으로 준비됩니다." />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function ArticleApprovalCard({
  createsImage,
  displayTitle,
  showTitle,
  titlePosition,
  busy,
  onDisplayTitleChange,
  onShowTitleChange,
  onTitlePositionChange,
  onApprove,
}: {
  createsImage: boolean;
  displayTitle: string;
  showTitle: boolean;
  titlePosition: ContentImageTitlePosition;
  busy: boolean;
  onDisplayTitleChange: (value: string) => void;
  onShowTitleChange: (value: boolean) => void;
  onTitlePositionChange: (value: ContentImageTitlePosition) => void;
  onApprove: () => void;
}) {
  const invalidTitle = createsImage && showTitle && displayTitle.trim().length === 0;
  return (
    <div className="rounded-[14px] border border-emerald-200 bg-emerald-50 p-4">
      <div>
        <p className="text-[13px] font-semibold text-emerald-900">기사 검토가 준비됐습니다</p>
        <p className="mt-1 text-[11px] text-emerald-800">내용을 수정한 뒤 승인하면 다음 단계가 시작됩니다.</p>
      </div>
      {createsImage && (
        <div className="mt-4 grid gap-3 border-t border-emerald-200 pt-4 sm:grid-cols-[minmax(0,1fr)_260px]">
          <div>
            <label className="flex items-center gap-2 text-[11px] font-semibold text-emerald-950">
              <input type="checkbox" checked={showTitle} onChange={(event) => onShowTitleChange(event.target.checked)} />
              대표 이미지에 제목 표시
            </label>
            <label className="mt-3 block text-[10px] font-semibold text-emerald-900">
              이미지 제목
              <input
                value={displayTitle}
                maxLength={80}
                disabled={!showTitle}
                onChange={(event) => onDisplayTitleChange(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-[10px] border border-emerald-200 bg-white px-3 text-[12px] text-hof outline-none focus:border-emerald-600 disabled:opacity-50"
              />
            </label>
          </div>
          <fieldset disabled={!showTitle}>
            <legend className="text-[10px] font-semibold text-emerald-900">제목 위치</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="대표 이미지 제목 위치">
              {([['top_left', '좌측 상단'], ['bottom_left', '좌측 하단']] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={titlePosition === value}
                  onClick={() => onTitlePositionChange(value)}
                  className={cn(
                    "rounded-[10px] border px-3 py-2.5 text-[11px] font-semibold",
                    titlePosition === value ? "border-emerald-700 bg-white text-emerald-800" : "border-emerald-200 bg-white/60 text-emerald-800",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-4 text-emerald-800">승인 후 선택한 위치로 제목을 합성해 이미지를 생성합니다.</p>
          </fieldset>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button type="button" disabled={busy || invalidTitle} onClick={onApprove} className="rounded-full bg-emerald-700 px-5 py-2.5 text-[12px] font-semibold text-white disabled:opacity-40">
          {createsImage ? "기사 승인 후 이미지 생성" : "기사 승인"}
        </button>
      </div>
    </div>
  );
}

function WaitingCard({ title, detail }: { title: string; detail: string }) {
  return <div className="grid min-h-[560px] place-items-center rounded-[20px] border border-dashed border-deco bg-white p-8 text-center"><div><div className="mx-auto grid size-12 place-items-center rounded-full bg-faint text-[20px]">✦</div><h2 className="mt-4 text-[18px] font-semibold text-hof">{title}</h2><p className="mt-2 text-[12px] text-foggy">{detail}</p></div></div>;
}

function ImageResult({ production, reviewing, busy, displayTitle, showTitle, titlePosition, onDisplayTitleChange, onShowTitleChange, onTitlePositionChange, onRegenerate, onApprove }: {
  production: ContentProductionView;
  reviewing: boolean;
  busy: boolean;
  displayTitle: string;
  showTitle: boolean;
  titlePosition: ContentImageTitlePosition;
  onDisplayTitleChange: (value: string) => void;
  onShowTitleChange: (value: boolean) => void;
  onTitlePositionChange: (value: ContentImageTitlePosition) => void;
  onRegenerate: () => void;
  onApprove: () => void;
}) {
  const assets = production.assets.filter((asset) => ["image_result", "thumbnail", "open_graph"].includes(asset.kind));
  const invalidTitle = showTitle && displayTitle.trim().length === 0;
  if (assets.length === 0) return <WaitingCard title="대표 이미지를 제작하고 있습니다" detail={`${production.stage} · ${production.status}`} />;
  return (
    <div className="grid gap-5">
      {reviewing && <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-emerald-200 bg-emerald-50 p-4"><div className="min-w-0 flex-1"><p className="text-[13px] font-semibold text-emerald-900">대표 이미지 검토가 준비됐습니다</p><p className="mt-1 text-[11px] text-emerald-800">승인한 이미지의 시각 명세가 영상 전체의 Visual Bible로 고정됩니다.</p></div><button type="button" disabled={busy} onClick={onApprove} className="rounded-full bg-emerald-700 px-5 py-2.5 text-[12px] font-semibold text-white disabled:opacity-40">대표 이미지 승인</button></div>}
      {reviewing && <div className="rounded-[14px] border border-bebe bg-white p-4"><div><p className="text-[12px] font-semibold text-hof">제목 설정으로 새 이미지 만들기</p><p className="mt-1 text-[10px] leading-4 text-foggy">현재 결과는 보존하고 선택한 제목 위치로 새 revision을 생성합니다.</p></div><div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_250px_auto]"><div><label className="flex items-center gap-2 text-[11px] font-semibold text-hof"><input type="checkbox" checked={showTitle} onChange={(event) => onShowTitleChange(event.target.checked)} />이미지에 제목 표시</label><input value={displayTitle} maxLength={80} disabled={!showTitle} onChange={(event) => onDisplayTitleChange(event.target.value)} aria-label="새 이미지 제목" className="mt-2 h-10 w-full rounded-[10px] border border-deco px-3 text-[12px] outline-none focus:border-rausch disabled:opacity-50" /></div><fieldset disabled={!showTitle}><legend className="text-[10px] font-semibold text-foggy">제목 위치</legend><div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="새 이미지 제목 위치">{([['top_left', '좌측 상단'], ['bottom_left', '좌측 하단']] as const).map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={titlePosition === value} onClick={() => onTitlePositionChange(value)} className={cn("rounded-[9px] border px-3 py-2 text-[11px] font-semibold", titlePosition === value ? "border-rausch bg-rausch/5 text-rausch" : "border-deco text-foggy")}>{label}</button>)}</div></fieldset><button type="button" disabled={busy || invalidTitle} onClick={onRegenerate} className="self-end rounded-full bg-hof px-5 py-2.5 text-[11px] font-semibold text-white disabled:opacity-40">새 revision 생성</button></div></div>}
      <div className="grid gap-5 xl:grid-cols-2">{assets.map((asset) => <article key={asset.id} className={cn("overflow-hidden rounded-[18px] border border-bebe bg-white", asset.kind === "image_result" && "xl:col-span-2")}><div className="bg-faint p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.url} alt={asset.altText ?? production.title} className="max-h-[650px] w-full rounded-[12px] object-contain" />
      </div><div className="flex items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="text-[12px] font-semibold text-hof">{asset.kind === "image_result" ? "대표 이미지" : asset.kind === "thumbnail" ? "썸네일" : "OG 이미지"}</p><p className="mt-1 text-[10px] text-foggy">{asset.mimeType === "image/svg+xml" ? "SVG · " : ""}{asset.width}×{asset.height}</p></div><a href={asset.downloadUrl} className="rounded-full bg-hof px-4 py-2 text-[11px] font-semibold text-white">{asset.mimeType === "image/svg+xml" ? "SVG 다운로드" : "다운로드"}</a></div></article>)}</div>
    </div>
  );
}

function VideoResult({ production, busy, onApprove, folderId }: { production: ContentProductionView; busy: boolean; onApprove: (production: ContentProductionView, gate: "storyboard" | "keyframes") => void; folderId: string }) {
  const finalVideo = production.assets.find((asset) => asset.kind === "final_video");
  const poster = production.assets.find((asset) => asset.kind === "poster");
  return (
    <div className="grid gap-5">
      {production.status === "awaiting_storyboard_approval" && <ApprovalCard title="콘티 검토가 필요합니다" description="장면 순서·길이·프롬프트를 확인한 뒤 키프레임 제작을 승인하세요." label="콘티 승인" disabled={busy} onClick={() => onApprove(production, "storyboard")} />}
      {production.status === "awaiting_keyframe_approval" && <ApprovalCard title="키프레임과 영상 비용을 확인하세요" description="승인하면 xAI Grok Imagine 장면 생성이 시작됩니다." label="전체 영상 생성" disabled={busy} onClick={() => onApprove(production, "keyframes")} />}
      {finalVideo && <article className="overflow-hidden rounded-[20px] border border-bebe bg-white"><video controls preload="metadata" poster={poster?.url} className="aspect-video w-full bg-black"><source src={finalVideo.url} type="video/mp4" /></video><div className="flex items-center gap-3 p-5"><div className="min-w-0 flex-1"><h2 className="text-[14px] font-semibold text-hof">최종 영상</h2><p className="mt-1 text-[11px] text-foggy">{finalVideo.width}×{finalVideo.height}</p></div><a href={finalVideo.downloadUrl} className="rounded-full bg-rausch px-5 py-2.5 text-[12px] font-semibold text-white">MP4 다운로드</a></div></article>}
      {production.storyboard ? <div className="grid gap-4"><div className="rounded-[14px] border border-bebe bg-white p-4"><p className="text-[11px] font-semibold text-foggy">콘티 요약</p><p className="mt-2 text-[13px] leading-6 text-hof">{production.storyboard.summary}</p></div><div className="grid gap-4 sm:grid-cols-2">{production.storyboard.scenes.map((scene) => <article key={scene.id} className="overflow-hidden rounded-[14px] border border-bebe bg-white">{scene.keyframe ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={scene.keyframe.url} alt={scene.keyframe.altText ?? scene.title} className="aspect-video w-full bg-faint object-cover" />
      </> : <div className="grid aspect-video place-items-center bg-faint text-[11px] text-foggy">키프레임 준비 중</div>}<div className="p-4"><div className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-hof text-[10px] font-bold text-white">{scene.ordinal}</span><h3 className="min-w-0 flex-1 truncate text-[12px] font-semibold text-hof">{scene.title}</h3><StatusPill status={scene.status} /></div><p className="mt-2 line-clamp-2 text-[10px] leading-5 text-foggy">{scene.prompt}</p></div></article>)}</div></div> : !finalVideo ? <WaitingCard title="영상 콘티를 준비하고 있습니다" detail={`${production.stage} · ${production.status}`} /> : null}
      <div className="flex justify-end"><Link href={`/content/productions/${production.id}/${folderId ? `?fid=${encodeURIComponent(folderId)}` : ""}`} className="rounded-full border border-deco bg-white px-5 py-2.5 text-[11px] font-semibold text-hof">장면 상세 편집</Link></div>
    </div>
  );
}

function ApprovalCard({ title, description, label, disabled, onClick }: { title: string; description: string; label: string; disabled: boolean; onClick: () => void }) {
  return <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-amber-200 bg-amber-50 p-4"><div className="min-w-0 flex-1"><p className="text-[13px] font-semibold text-amber-900">{title}</p><p className="mt-1 text-[11px] text-amber-800">{description}</p></div><button type="button" disabled={disabled} onClick={onClick} className="rounded-full bg-amber-700 px-5 py-2.5 text-[12px] font-semibold text-white disabled:opacity-40">{label}</button></div>;
}
