"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type {
  ContentProductionAssetView,
  ContentProductionStatus,
  ContentProductionView,
  ContentVideoSceneView,
} from "@/types/content";
import { StatusPill, fieldClass, textareaClass } from "@/components/content/ContentUi";

const ACTIVE_STATUSES: ContentProductionStatus[] = [
  "draft",
  "planning",
  "generating_keyframes",
  "generating",
  "assembling",
];

const stageLabels: Record<ContentProductionView["stage"], string> = {
  validate: "설정 검증",
  plan: "콘티 작성",
  generate: "이미지 명세 작성",
  render: "이미지 렌더링",
  keyframes: "키프레임 제작",
  submit_scenes: "장면 생성 요청",
  poll_scenes: "장면 생성 확인",
  assemble: "최종 영상 조립",
  persist: "결과 저장",
};

const assetLabels: Record<ContentProductionAssetView["kind"], string> = {
  image_source: "원본",
  image_result: "대표 이미지",
  thumbnail: "기사 썸네일",
  open_graph: "OG 이미지",
  keyframe: "키프레임",
  scene_video: "장면 영상",
  final_video: "최종 MP4",
  poster: "영상 포스터",
};

function dateLabel(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SceneEditor({
  scene,
  editable,
  busy,
  onSaved,
  onRegenerate,
}: {
  scene: ContentVideoSceneView;
  editable: boolean;
  busy: boolean;
  onSaved: (production: ContentProductionView) => void;
  onRegenerate: (scene: ContentVideoSceneView) => Promise<void>;
}) {
  const [title, setTitle] = useState(scene.title);
  const [duration, setDuration] = useState(scene.duration);
  const [prompt, setPrompt] = useState(scene.prompt);
  const [audioPrompt, setAudioPrompt] = useState(scene.audioPrompt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = title !== scene.title
    || duration !== scene.duration
    || prompt !== scene.prompt
    || audioPrompt !== scene.audioPrompt;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.patch<ContentProductionView>(`/api/content/video-scenes/${scene.id}/`, {
        title,
        duration,
        prompt,
        audioPrompt,
        version: scene.version,
      });
      onSaved(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "장면을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-[16px] border border-bebe bg-white">
      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full bg-hof text-[11px] font-bold text-white">{scene.ordinal}</span>
            <StatusPill status={scene.status} />
            <span className="ml-auto text-[11px] text-foggy">{scene.duration}초</span>
          </div>
          {scene.keyframe ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={scene.keyframe.url} alt={scene.keyframe.altText ?? `${scene.title} 키프레임`} className="aspect-video w-full rounded-[12px] bg-faint object-cover" />
          ) : (
            <div className="grid aspect-video place-items-center rounded-[12px] bg-faint px-5 text-center text-[12px] text-foggy">키프레임 준비 전</div>
          )}
          {scene.video && (
            <video className="mt-3 aspect-video w-full rounded-[12px] bg-black" controls preload="metadata" poster={scene.keyframe?.url}>
              <source src={scene.video.url} type="video/mp4" />
            </video>
          )}
          {scene.providerTaskId && <p className="mt-2 break-all text-[10px] text-foggy">Task {scene.providerTaskId}</p>}
        </div>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px]">
            <label>
              <span className="mb-1.5 block text-[11px] font-semibold text-foggy">장면 제목</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} disabled={!editable} className={fieldClass} />
            </label>
            <label>
              <span className="mb-1.5 block text-[11px] font-semibold text-foggy">길이</span>
              <input type="number" min={3} max={15} value={duration} onChange={(event) => setDuration(Number(event.target.value))} disabled={!editable} className={fieldClass} />
            </label>
          </div>
          <label>
            <span className="mb-1.5 block text-[11px] font-semibold text-foggy">영상 프롬프트</span>
            <textarea rows={3} value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={!editable} className={textareaClass} />
          </label>
          <label>
            <span className="mb-1.5 block text-[11px] font-semibold text-foggy">오디오 프롬프트</span>
            <textarea rows={2} value={audioPrompt} onChange={(event) => setAudioPrompt(event.target.value)} disabled={!editable} className={textareaClass} />
          </label>
          {scene.error.message && <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-[12px] text-red-700">{scene.error.message}</p>}
          <div className="flex flex-wrap gap-2">
            {editable && (
              <button type="button" disabled={!dirty || saving || busy} onClick={save} className="rounded-full bg-hof px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40">
                {saving ? "저장 중…" : "장면 저장"}
              </button>
            )}
            {scene.keyframe && (
              <a href={scene.keyframe.downloadUrl} className="rounded-full border border-deco px-4 py-2 text-[12px] font-semibold text-hof">키프레임 다운로드</a>
            )}
            {(scene.status === "failed" || scene.status === "unknown" || (scene.keyframe && !editable)) && (
              <button type="button" disabled={busy} onClick={() => onRegenerate(scene)} className="rounded-full border border-deco px-4 py-2 text-[12px] font-semibold text-hof disabled:opacity-40">
                이 장면 다시 만들기
              </button>
            )}
          </div>
          {error && <p role="alert" className="text-[12px] text-red-700">{error}</p>}
        </div>
      </div>
    </article>
  );
}

export function ContentProductionStudio({ productionId }: { productionId: string }) {
  const searchParams = useSearchParams();
  const folderId = searchParams.get("fid") ?? "";
  const [production, setProduction] = useState<ContentProductionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    api.get<ContentProductionView>(`/api/content/productions/${productionId}/`)
      .then(({ data }) => {
        if (!active) return;
        setProduction(data);
        setError(null);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "미디어 작업판을 불러오지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [productionId]);

  useEffect(() => {
    if (!production || !ACTIVE_STATUSES.includes(production.status)) return;
    let cancelled = false;
    const pollDelay = production.stage === "poll_scenes" ? 15_000 : 400;
    const timer = window.setTimeout(async () => {
      if (cancelled || processInFlight.current) return;
      processInFlight.current = true;
      try {
        const { data } = await api.post<ContentProductionView>(`/api/content/productions/${production.id}/process/`);
        if (!cancelled) {
          setProduction(data);
          setError(null);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "다음 제작 단계를 처리하지 못했습니다.");
      } finally {
        processInFlight.current = false;
      }
    }, pollDelay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [production]);

  const action = async (path: string, body?: unknown) => {
    if (!production) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<ContentProductionView>(path, body);
      setProduction(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "요청을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const approve = (gate: "storyboard" | "keyframes") => {
    if (!production) return;
    return action(`/api/content/productions/${production.id}/approve/`, { gate, version: production.version });
  };

  const regenerate = async (scene: ContentVideoSceneView) => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<ContentProductionView>(`/api/content/video-scenes/${scene.id}/regenerate/`);
      setProduction(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "장면을 다시 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const imageAssets = useMemo(() => production?.assets.filter((asset) => ["image_result", "thumbnail", "open_graph"].includes(asset.kind)) ?? [], [production]);
  const finalVideo = production?.assets.find((asset) => asset.kind === "final_video");
  const poster = production?.assets.find((asset) => asset.kind === "poster");
  const hasLegacyVideoDependencyError = Boolean(
    production?.kind === "video"
    && (production.error.message?.includes("DASHSCOPE_") || production.error.message?.includes("chatmock")),
  );
  const progressText = production ? `${stageLabels[production.stage]} · ${production.status}` : "작업판 불러오는 중";

  if (loading) return <div className="grid min-h-[70vh] place-items-center text-[13px] text-foggy">미디어 작업판을 불러오는 중…</div>;
  if (!production) return <div role="alert" className="p-8 text-red-700">{error ?? "미디어 작업판을 찾을 수 없습니다."}</div>;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#f7f7f8]">
      <div className="border-b border-bebe bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-3">
          <Link href={`/content/workspaces/${folderId ? `?fid=${encodeURIComponent(folderId)}` : ""}`} className="text-[12px] font-semibold text-foggy">← 작업판</Link>
          <span className="h-4 w-px bg-deco" />
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-hof">{production.title}</h1>
          <span className="rounded-full bg-faint px-3 py-1.5 text-[11px] font-semibold text-foggy">{production.kind === "image" ? "이미지" : "영상"}</span>
          <StatusPill status={production.status} />
        </div>
      </div>

      <main className="mx-auto grid w-full max-w-[1680px] gap-0 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="border-b border-bebe bg-white p-5 lg:sticky lg:top-0 lg:h-[calc(100vh-65px)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-rausch">Production</p>
          <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.02em] text-hof">{production.kind === "image" ? "이미지 제작" : "영상 제작"}</h2>
          <p className="mt-3 text-[13px] leading-6 text-foggy">{production.prompt}</p>

          <dl className="mt-6 grid gap-3 rounded-[14px] bg-faint p-4 text-[12px]">
            <div className="flex justify-between gap-3"><dt className="text-foggy">현재 단계</dt><dd className="font-semibold text-hof">{stageLabels[production.stage]}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-foggy">연결 콘텐츠</dt><dd className="max-w-[160px] truncate font-semibold text-hof">{production.articleId ? "연결됨" : "독립 제작"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-foggy">수정</dt><dd className="font-semibold text-hof">{dateLabel(production.updatedAt)}</dd></div>
          </dl>

          {production.stale && (
            <div className="mt-4 rounded-[12px] bg-amber-50 p-3 text-[12px] leading-5 text-amber-800">
              이 콘텐츠는 이전 기사 버전으로 제작되었습니다. 자동으로 다시 생성하지 않습니다.
            </div>
          )}
          {production.status === "awaiting_storyboard_approval" && (
            <div className="mt-5 rounded-[14px] border border-deco p-4">
              <p className="text-[13px] font-semibold text-hof">콘티 검토가 필요합니다</p>
              <p className="mt-1 text-[12px] leading-5 text-foggy">장면과 길이를 수정한 뒤 승인하면 Grok 키프레임 제작을 시작합니다.</p>
              <button type="button" disabled={busy} onClick={() => approve("storyboard")} className="mt-3 w-full rounded-full bg-rausch px-4 py-2.5 text-[12px] font-semibold text-white disabled:opacity-40">콘티 승인</button>
            </div>
          )}
          {production.status === "awaiting_keyframe_approval" && (
            <div className="mt-5 rounded-[14px] border border-deco p-4">
              <p className="text-[13px] font-semibold text-hof">영상 비용 확정</p>
              <p className="mt-1 text-[12px] leading-5 text-foggy">키프레임을 확인한 뒤 승인하면 xAI Grok Imagine 장면 생성을 시작합니다.</p>
              <button type="button" disabled={busy} onClick={() => approve("keyframes")} className="mt-3 w-full rounded-full bg-rausch px-4 py-2.5 text-[12px] font-semibold text-white disabled:opacity-40">전체 영상 생성</button>
            </div>
          )}
          {production.status === "failed" && (
            <button type="button" disabled={busy || production.error.retryable === false} onClick={() => action(`/api/content/productions/${production.id}/retry/`)} className="mt-5 w-full rounded-full bg-hof px-4 py-2.5 text-[12px] font-semibold text-white disabled:opacity-40">실패 단계 재시도</button>
          )}
          {ACTIVE_STATUSES.includes(production.status) && (
            <button type="button" disabled={busy} onClick={() => action(`/api/content/productions/${production.id}/cancel/`)} className="mt-3 w-full rounded-full border border-deco px-4 py-2.5 text-[12px] font-semibold text-hof disabled:opacity-40">작업 취소</button>
          )}
          {production.error.message && (
            <div role="alert" className="mt-4 rounded-[12px] bg-red-50 p-3 text-[12px] leading-5 text-red-700">
              <strong className="block">{production.error.stage ? `${stageLabels[production.error.stage as ContentProductionView["stage"]] ?? production.error.stage} 실패` : "제작 실패"}</strong>
              {hasLegacyVideoDependencyError
                ? "기존 영상 공급자 의존성 오류입니다. 영상 제작이 xAI Grok 전용 경로로 변경되었으므로 다시 시도할 수 있습니다."
                : production.error.message}
              {production.error.retryable === false && <span className="mt-1 block">중복 비용 가능성 때문에 자동 재시도하지 않습니다.</span>}
            </div>
          )}
          {error && <div role="alert" className="mt-4 rounded-[12px] bg-red-50 p-3 text-[12px] text-red-700">{error}</div>}
          <p aria-live="polite" className="mt-5 text-[11px] text-foggy">{progressText}</p>
        </aside>

        <section className="min-w-0 p-4 sm:p-6 lg:p-8">
          {production.kind === "image" ? (
            <div className="mx-auto max-w-[1200px]">
              <div className="mb-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-rausch">Result</p>
                <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-hof">이미지 결과</h2>
                <p className="mt-2 text-[13px] text-foggy">ChatMock 시각 명세와 Sharp의 결정적 렌더링 결과입니다.</p>
              </div>
              {imageAssets.length === 0 ? (
                <div className="grid min-h-[420px] place-items-center rounded-[20px] border border-dashed border-deco bg-white p-8 text-center">
                  <div><p className="text-[15px] font-semibold text-hof">이미지를 제작하고 있습니다</p><p className="mt-2 text-[13px] text-foggy">{stageLabels[production.stage]}</p></div>
                </div>
              ) : (
                <div className="grid gap-6 xl:grid-cols-2">
                  {imageAssets.map((asset) => (
                    <article key={asset.id} className={cn("overflow-hidden rounded-[18px] border border-bebe bg-white", asset.kind === "image_result" && "xl:col-span-2")}>
                      <div className="bg-faint p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={asset.url} alt={asset.altText ?? assetLabels[asset.kind]} className="max-h-[650px] w-full rounded-[12px] object-contain" />
                      </div>
                      <div className="flex flex-wrap items-center gap-3 p-4">
                        <div className="min-w-0 flex-1"><h3 className="text-[13px] font-semibold text-hof">{assetLabels[asset.kind]}</h3><p className="mt-1 text-[11px] text-foggy">{asset.width}×{asset.height} · {(asset.byteSize / 1024).toFixed(0)}KB</p></div>
                        <a href={asset.downloadUrl} className="rounded-full bg-hof px-4 py-2 text-[12px] font-semibold text-white">다운로드</a>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-[1200px]">
              <div className="mb-6 flex flex-wrap items-end gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-rausch">Storyboard & timeline</p>
                  <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-hof">영상 콘티</h2>
                  <p className="mt-2 text-[13px] text-foggy">Grok 4.5 콘티·키프레임 명세 · Grok Imagine 장면 렌더링</p>
                </div>
                {production.storyboard && <span className="rounded-full bg-white px-3 py-2 text-[12px] font-semibold text-hof">총 {production.storyboard.totalDuration}초 · {production.storyboard.aspectRatio}</span>}
              </div>

              {finalVideo ? (
                <article className="mb-8 overflow-hidden rounded-[20px] border border-bebe bg-white">
                  <video className="aspect-video w-full bg-black" controls preload="metadata" poster={poster?.url}>
                    <source src={finalVideo.url} type="video/mp4" />
                  </video>
                  <div className="flex flex-wrap items-center gap-3 p-5">
                    <div className="min-w-0 flex-1"><h3 className="text-[15px] font-semibold text-hof">최종 영상</h3><p className="mt-1 text-[12px] text-foggy">{finalVideo.width}×{finalVideo.height} · {finalVideo.durationMs ? `${Math.round(finalVideo.durationMs / 1000)}초` : "길이 확인 중"}</p></div>
                    <a href={finalVideo.downloadUrl} className="rounded-full bg-rausch px-5 py-2.5 text-[12px] font-semibold text-white">MP4 다운로드</a>
                  </div>
                </article>
              ) : null}

              {production.storyboard ? (
                <>
                  <div className="mb-5 rounded-[16px] border border-bebe bg-white p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foggy">콘티 요약</p>
                    <p className="mt-2 text-[14px] leading-6 text-hof">{production.storyboard.summary}</p>
                  </div>
                  <div className="grid gap-5">
                    {production.storyboard.scenes.map((scene) => (
                      <SceneEditor
                        key={`${scene.id}-${scene.version}`}
                        scene={scene}
                        editable={production.status === "awaiting_storyboard_approval"}
                        busy={busy}
                        onSaved={setProduction}
                        onRegenerate={regenerate}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="grid min-h-[420px] place-items-center rounded-[20px] border border-dashed border-deco bg-white p-8 text-center">
                  <div><p className="text-[15px] font-semibold text-hof">콘티를 준비하고 있습니다</p><p className="mt-2 text-[13px] text-foggy">{stageLabels[production.stage]}</p></div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
