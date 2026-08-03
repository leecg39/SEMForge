"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type {
  ContentArticleView,
  ContentAssetView,
  ContentBrandKitView,
  ContentCapabilitiesView,
  ContentVisualStyle,
  ContentVisualView,
} from "@/types/content";
import { fieldClass, StatusPill, textareaClass } from "@/components/content/ContentUi";

const styles: Array<{ id: ContentVisualStyle; label: string; description: string }> = [
  { id: "editorial_photo", label: "에디토리얼", description: "깊이 있는 프레임과 곡선" },
  { id: "illustration", label: "일러스트", description: "부드러운 도형과 밝은 색" },
  { id: "minimal_3d", label: "미니멀 3D", description: "입체적인 빛과 오브젝트" },
  { id: "abstract_graphic", label: "추상 그래픽", description: "대담한 기하학 구성" },
];

const stageLabels: Record<ContentVisualView["stage"], string> = {
  validate: "기사와 ChatMock 실행 환경을 확인하고 있습니다.",
  generate: "ChatMock이 기사 기반 비주얼 명세를 만들고 있습니다.",
  render: "정확한 제목과 브랜드로 썸네일·OG를 렌더링하고 있습니다.",
};

function assetOf(visual: ContentVisualView | null, kind: ContentAssetView["kind"]): ContentAssetView | null {
  return visual?.assets.find((asset) => asset.kind === kind) ?? null;
}

function mergeVisual(rows: ContentVisualView[], next: ContentVisualView): ContentVisualView[] {
  const without = rows.filter((row) => row.id !== next.id);
  return [next, ...without].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function uploadLogo(file: File): Promise<ContentBrandKitView> {
  const form = new FormData();
  form.set("file", file);
  const response = await fetch("/api/content/brand-kit/logo/", { method: "POST", body: form });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message ?? "브랜드 로고를 업로드하지 못했습니다.");
  return body.data as ContentBrandKitView;
}

export function ContentVisualStudio({ article }: { article: ContentArticleView }) {
  const [brand, setBrand] = useState<ContentBrandKitView | null>(null);
  const [capabilities, setCapabilities] = useState<ContentCapabilitiesView | null>(null);
  const [visuals, setVisuals] = useState<ContentVisualView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stylePreset, setStylePreset] = useState<ContentVisualStyle>("editorial_photo");
  const [displayTitle, setDisplayTitle] = useState(article.title.slice(0, 80));
  const [showTitle, setShowTitle] = useState(true);
  const [showLogo, setShowLogo] = useState(true);
  const [visualDirection, setVisualDirection] = useState("");
  const [focalX, setFocalX] = useState(50);
  const [focalY, setFocalY] = useState(50);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [brandBusy, setBrandBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const selectVisual = useCallback((visual: ContentVisualView) => {
    setSelectedId(visual.id);
    setStylePreset(visual.stylePreset);
    setDisplayTitle(visual.displayTitle);
    setShowTitle(visual.showTitle);
    setShowLogo(visual.showLogo);
    setVisualDirection(visual.visualDirection ?? "");
    setFocalX(visual.focalX);
    setFocalY(visual.focalY);
  }, []);

  const driveVisual = useCallback(async (start: ContentVisualView) => {
    let current = start;
    setBusy(true);
    try {
      for (let count = 0; count < 5 && ["queued", "running"].includes(current.status); count += 1) {
        const result = await api.post<ContentVisualView>(`/api/content/visuals/${current.id}/process/`);
        current = result.data;
        if (!mounted.current) return current;
        setVisuals((rows) => mergeVisual(rows, current));
        setSelectedId(current.id);
      }
      return current;
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "비주얼 실행에 실패했습니다.");
      return current;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    Promise.all([
      api.get<ContentBrandKitView>("/api/content/brand-kit/"),
      api.get<ContentVisualView[]>(`/api/content/articles/${article.id}/visuals/`),
      api.get<ContentCapabilitiesView>("/api/content/capabilities/"),
    ])
      .then(([brandResult, visualResult, capabilityResult]) => {
        if (!mounted.current) return;
        setBrand(brandResult.data);
        setVisuals(visualResult.data);
        setCapabilities(capabilityResult.data);
        const selected = visualResult.data.find((visual) => visual.activeAt) ?? visualResult.data[0] ?? null;
        if (selected) selectVisual(selected);
        const resumable = visualResult.data.find((visual) => ["queued", "running"].includes(visual.status));
        if (resumable) void driveVisual(resumable);
      })
      .catch((cause) => {
        if (mounted.current) setError(cause instanceof Error ? cause.message : "비주얼 작업 공간을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => { mounted.current = false; };
  }, [article.id, driveVisual, selectVisual]);

  const selected = useMemo(
    () => visuals.find((visual) => visual.id === selectedId) ?? visuals[0] ?? null,
    [selectedId, visuals],
  );

  const updateBrandField = (field: "brandName" | "primaryColor" | "secondaryColor", value: string) => {
    setBrand((current) => current ? { ...current, [field]: value } : current);
  };

  const saveBrand = async () => {
    if (!brand || brandBusy) return;
    setBrandBusy(true);
    setError(null);
    try {
      const result = await api.patch<ContentBrandKitView>("/api/content/brand-kit/", {
        brandName: brand.brandName,
        primaryColor: brand.primaryColor,
        secondaryColor: brand.secondaryColor,
        version: brand.version,
      });
      setBrand(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "브랜드 키트를 저장하지 못했습니다.");
    } finally {
      setBrandBusy(false);
    }
  };

  const chooseLogo = async (file: File | undefined) => {
    if (!file || brandBusy) return;
    setBrandBusy(true);
    setError(null);
    try {
      setBrand(await uploadLogo(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "브랜드 로고를 업로드하지 못했습니다.");
    } finally {
      setBrandBusy(false);
    }
  };

  const removeLogo = async () => {
    if (!brand || brandBusy) return;
    setBrandBusy(true);
    try {
      setBrand((await api.delete<ContentBrandKitView>("/api/content/brand-kit/logo/")).data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "로고를 삭제하지 못했습니다.");
    } finally {
      setBrandBusy(false);
    }
  };

  const createVisual = async () => {
    if (busy || displayTitle.trim().length < 1) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<ContentVisualView>(`/api/content/articles/${article.id}/visuals/`, {
        idempotencyKey: crypto.randomUUID(),
        stylePreset,
        displayTitle,
        showTitle,
        showLogo,
        visualDirection: visualDirection || null,
        focalX,
        focalY,
      });
      setVisuals((rows) => mergeVisual(rows, result.data));
      setSelectedId(result.data.id);
      await driveVisual(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "새 비주얼을 만들지 못했습니다.");
      setBusy(false);
    }
  };

  const rerender = async () => {
    if (!selected || selected.status !== "ready" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.patch<ContentVisualView>(`/api/content/visuals/${selected.id}/`, {
        displayTitle,
        showTitle,
        showLogo,
        visualDirection: visualDirection || null,
        focalX,
        focalY,
        version: selected.version,
      });
      setVisuals((rows) => mergeVisual(rows, result.data));
      setSelectedId(result.data.id);
      await driveVisual(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "다시 렌더링하지 못했습니다.");
      setBusy(false);
    }
  };

  const activate = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const result = await api.post<ContentVisualView>(`/api/content/visuals/${selected.id}/activate/`);
      setVisuals((rows) => rows.map((visual) => ({ ...visual, activeAt: visual.id === result.data.id ? result.data.activeAt : null, ...(visual.id === result.data.id ? result.data : {}) })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "대표 비주얼로 지정하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    if (!selected || busy) return;
    const result = await api.post<ContentVisualView>(`/api/content/visuals/${selected.id}/retry/`);
    setVisuals((rows) => mergeVisual(rows, result.data));
    await driveVisual(result.data);
  };

  const cancel = async () => {
    if (!selected) return;
    const result = await api.post<ContentVisualView>(`/api/content/visuals/${selected.id}/cancel/`);
    setVisuals((rows) => mergeVisual(rows, result.data));
    setBusy(false);
  };

  if (loading) return <div className="rounded-[16px] border border-bebe bg-white p-8 text-[13px] text-foggy">비주얼 작업 공간을 불러오는 중…</div>;

  const thumbnail = assetOf(selected, "thumbnail");
  const openGraph = assetOf(selected, "open_graph");
  const stale = Boolean(selected && selected.articleVersion !== article.version);
  const capability = capabilities?.visualCreation;

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-5">
        <section className="rounded-[16px] border border-bebe bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div><h2 className="text-[15px] font-semibold text-hof">브랜드 키트</h2><p className="mt-1 text-[12px] text-foggy">워크스페이스의 모든 기사에 재사용됩니다.</p></div>
            {brand?.canManage ? <span className="ml-auto text-[11px] font-semibold text-emerald-700">관리 가능</span> : null}
          </div>
          {brand && <div className="mt-4 space-y-3">
            <label className="block text-[11px] font-semibold text-foggy">브랜드명<input value={brand.brandName} onChange={(event) => updateBrandField("brandName", event.target.value)} disabled={!brand.canManage} className={`${fieldClass} mt-1.5`} /></label>
            <div className="grid grid-cols-2 gap-3">
              {(["primaryColor", "secondaryColor"] as const).map((field, index) => <label key={field} className="text-[11px] font-semibold text-foggy">{index === 0 ? "주색" : "보조색"}<span className="mt-1.5 flex h-11 items-center gap-2 rounded-[10px] border border-deco px-2"><input type="color" value={brand[field]} onChange={(event) => updateBrandField(field, event.target.value)} disabled={!brand.canManage} className="h-7 w-8 border-0 bg-transparent"/><span className="font-mono text-[11px]">{brand[field]}</span></span></label>)}
            </div>
            <div className="rounded-[12px] border border-dashed border-deco p-3">
              {brand.logoUrl ? <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${brand.logoUrl}?v=${brand.version ?? 0}`} alt={`${brand.brandName} 로고`} className="h-10 max-w-[150px] object-contain" />
                {brand.canManage && <button type="button" onClick={removeLogo} className="ml-auto text-[11px] font-semibold text-red-700">삭제</button>}
              </div> : <p className="text-[11px] text-foggy">PNG 또는 WebP · 최대 2MB</p>}
              {brand.canManage && <label className="mt-2 inline-flex cursor-pointer rounded-full border border-deco px-3 py-2 text-[11px] font-semibold"><input type="file" accept="image/png,image/webp" onChange={(event) => void chooseLogo(event.target.files?.[0])} className="sr-only" />{brand.logoUrl ? "로고 교체" : "로고 업로드"}</label>}
            </div>
            {brand.canManage && <button type="button" onClick={saveBrand} disabled={brandBusy} className="w-full rounded-full bg-hof px-4 py-2.5 text-[12px] font-semibold text-white disabled:opacity-50">{brandBusy ? "저장 중…" : "브랜드 키트 저장"}</button>}
          </div>}
        </section>

        <section className="rounded-[16px] border border-bebe bg-white p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold text-hof">생성 설정</h2>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {styles.map((style) => <button key={style.id} type="button" onClick={() => setStylePreset(style.id)} className={cn("rounded-[11px] border p-3 text-left", stylePreset === style.id ? "border-rausch bg-rausch/5 ring-1 ring-rausch" : "border-deco")}><span className="block text-[12px] font-semibold">{style.label}</span><span className="mt-1 block text-[10px] leading-4 text-foggy">{style.description}</span></button>)}
          </div>
          <label className="mt-4 block text-[11px] font-semibold text-foggy">표시 제목<input value={displayTitle} maxLength={80} onChange={(event) => setDisplayTitle(event.target.value)} className={`${fieldClass} mt-1.5`} /></label>
          <p className="mt-1 text-right text-[10px] text-grey-500">{displayTitle.length}/80</p>
          <div className="mt-3 flex flex-wrap gap-4 text-[12px] font-medium">
            <label className="flex items-center gap-2"><input type="checkbox" checked={showTitle} onChange={(event) => setShowTitle(event.target.checked)} />제목 표시</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={showLogo} onChange={(event) => setShowLogo(event.target.checked)} />브랜드 표시</label>
          </div>
          <label className="mt-4 block text-[11px] font-semibold text-foggy">추가 시각 지시<textarea value={visualDirection} maxLength={500} onChange={(event) => setVisualDirection(event.target.value)} rows={3} placeholder="예: 차분하고 신뢰감 있는 분위기" className={`${textareaClass} mt-1.5 resize-none`} /></label>
          <button type="button" onClick={createVisual} disabled={busy || !capability?.enabled || displayTitle.trim().length === 0} className="mt-4 w-full rounded-full bg-rausch px-4 py-3 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">{busy ? "제작 중…" : "새 비주얼 만들기"}</button>
          {!capability?.enabled && <p className="mt-2 text-[11px] leading-5 text-amber-700">{capability?.reason ?? "ChatMock 실행 상태를 확인해 주세요."}</p>}
        </section>
      </div>

      <div className="min-w-0 space-y-5">
        <section className="overflow-hidden rounded-[16px] border border-bebe bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-bebe px-5 py-3">
            <h2 className="text-[15px] font-semibold text-hof">결과</h2>
            {selected && <StatusPill status={selected.status} />}
            {selected?.activeAt && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">대표 비주얼</span>}
            {stale && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">글 변경 후 생성되지 않음</span>}
            <span aria-live="polite" className="ml-auto text-[11px] text-foggy">{selected && ["queued", "running"].includes(selected.status) ? stageLabels[selected.stage] : selected?.status === "ready" ? "썸네일과 OG가 준비됐습니다." : ""}</span>
          </div>
          {!selected ? <div className="grid min-h-[420px] place-items-center p-8 text-center"><div><p className="text-[15px] font-semibold text-hof">아직 만든 비주얼이 없습니다.</p><p className="mt-2 text-[12px] text-foggy">왼쪽 설정을 확인하고 첫 썸네일·OG를 만들어 보세요.</p></div></div> : selected.status === "failed" ? <div className="p-8"><p role="alert" className="rounded-[12px] bg-red-50 px-4 py-3 text-[13px] text-red-700">{selected.error.message ?? "비주얼 생성에 실패했습니다."}</p><button type="button" onClick={() => void retry()} className="mt-4 rounded-full bg-hof px-4 py-2 text-[12px] font-semibold text-white">다시 시도</button></div> : thumbnail && openGraph ? <div className="grid gap-5 p-5 lg:grid-cols-2">
            {[{ label: "썸네일", asset: thumbnail }, { label: "OG 이미지", asset: openGraph }].map(({ label, asset }) => <figure key={asset.id} className="min-w-0"><figcaption className="mb-2 flex items-center gap-2 text-[12px] font-semibold"><span>{label}</span><span className="text-[10px] font-normal text-foggy">{asset.mimeType === "image/svg+xml" ? "SVG · " : ""}{asset.width}×{asset.height}</span><a href={asset.downloadUrl} className="ml-auto text-[11px] font-semibold text-rausch">{asset.mimeType === "image/svg+xml" ? "SVG 다운로드" : "다운로드"}</a></figcaption><div className="overflow-hidden rounded-[12px] border border-deco bg-faint">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${asset.url}?v=${selected.version}`} alt={asset.altText ?? `${article.title} ${label}`} className="block h-auto w-full" />
            </div></figure>)}
          </div> : <div className="grid min-h-[420px] place-items-center p-8"><div className="text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-deco border-t-rausch"/><p className="mt-4 text-[12px] text-foggy">{stageLabels[selected.stage]}</p></div></div>}
          {selected && <div className="border-t border-bebe bg-faint px-5 py-4">
            <div className="flex flex-wrap items-center gap-3"><div><p className="text-[11px] font-semibold text-foggy">초점 위치</p><div className="mt-2 grid w-[84px] grid-cols-3 gap-1">{[15, 50, 85].flatMap((y) => [15, 50, 85].map((x) => <button key={`${x}-${y}`} type="button" aria-label={`초점 ${x}, ${y}`} aria-pressed={focalX === x && focalY === y} onClick={() => { setFocalX(x); setFocalY(y); }} className={cn("h-6 rounded-[4px] border", focalX === x && focalY === y ? "border-rausch bg-rausch" : "border-deco bg-white")} />))}</div></div><div className="ml-auto flex flex-wrap gap-2">{["queued", "running"].includes(selected.status) && <button type="button" onClick={() => void cancel()} className="rounded-full border border-deco bg-white px-3 py-2 text-[11px] font-semibold">취소</button>}{selected.status === "ready" && <><button type="button" onClick={rerender} disabled={busy} className="rounded-full border border-deco bg-white px-3 py-2 text-[11px] font-semibold disabled:opacity-45">다시 렌더링</button><button type="button" onClick={activate} disabled={busy || Boolean(selected.activeAt)} className="rounded-full bg-hof px-4 py-2 text-[11px] font-semibold text-white disabled:opacity-45">{selected.activeAt ? "대표 적용됨" : "대표로 적용"}</button></>}</div></div>
          </div>}
        </section>

        <section className="rounded-[16px] border border-bebe bg-white p-5 shadow-sm"><h2 className="text-[15px] font-semibold text-hof">생성 이력</h2>{visuals.length === 0 ? <p className="mt-3 text-[12px] text-foggy">생성된 버전이 없습니다.</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{visuals.map((visual) => <button key={visual.id} type="button" onClick={() => selectVisual(visual)} className={cn("rounded-[11px] border p-3 text-left", selected?.id === visual.id ? "border-rausch bg-rausch/5" : "border-deco")}><div className="flex items-center gap-2"><StatusPill status={visual.status}/>{visual.activeAt && <span className="text-[10px] font-semibold text-emerald-700">대표</span>}<span className="ml-auto text-[10px] text-grey-500">{new Date(visual.createdAt).toLocaleDateString("ko-KR")}</span></div><p className="mt-2 line-clamp-2 text-[11px] font-semibold leading-4">{visual.displayTitle}</p></button>)}</div>}</section>
      </div>
      {error && <div role="alert" className="fixed bottom-5 right-5 z-50 max-w-sm rounded-[12px] bg-red-700 px-4 py-3 text-[12px] text-white shadow-xl">{error}<button type="button" onClick={() => setError(null)} className="ml-3 font-semibold underline">닫기</button></div>}
    </div>
  );
}
