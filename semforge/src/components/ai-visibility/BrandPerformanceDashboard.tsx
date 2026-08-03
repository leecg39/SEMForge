"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Cross2Icon,
  GearIcon,
  InfoCircledIcon,
  MagicWandIcon,
  PlusIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import {
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { AiVisibilityProvider } from "@/db/schema";
import { api, ClientApiError } from "@/lib/client-api";
import type {
  BrandPerformanceBrandMetric,
  BrandPerformanceDashboardResponse,
  BrandPerformanceTrackedBrandView,
} from "@/server/ai-visibility/brand-performance";
import type {
  AiVisibilityProjectListItem,
  AiVisibilitySettingsView,
} from "@/server/ai-visibility/projects";
import type { AiVisibilityRunView } from "@/server/ai-visibility/runs";
import {
  AiVisibilityPromptManager,
  AiVisibilitySettingsPanel,
  type AiVisibilityPromptRow,
} from "./AiVisibilityProjectSetup";

interface Props {
  initialFolderId?: string;
}

interface BrandDraft {
  name: string;
  aliases: string;
  domain: string;
}

const CARD = "rounded-[8px] border border-[#e2e4e8] bg-white shadow-[0_1px_2px_rgba(21,27,38,0.025)]";
const BUTTON = "inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] border border-[#d7dae0] bg-white px-3 text-[12px] font-medium text-[#30353d] transition hover:bg-[#f6f7f9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7774e8]/40 disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY = "inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] bg-[#7657e8] px-3.5 text-[12px] font-semibold text-white transition hover:bg-[#6646da] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7657e8]/40 disabled:cursor-not-allowed disabled:bg-[#bbb8ca]";
const PROVIDER_LABELS: Record<AiVisibilityProvider, string> = {
  google_aio: "Google AI 개요",
  chatgpt_web: "ChatGPT",
  gemini_grounded: "Gemini",
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ClientApiError ? error.message : fallback;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function normalizeDomain(value: string) {
  return value.trim().toLocaleLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded bg-[#eceef2] ${className}`} />;
}

function EmptyCard({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`${CARD} flex min-h-[260px] flex-col items-center justify-center px-8 py-10 text-center`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f0efff] text-[#7158df]"><MagicWandIcon width={22} height={22} /></span>
      <h2 className="mt-4 text-[16px] font-semibold text-[#2c3037]">{title}</h2>
      <p className="mt-2 max-w-[520px] text-[12px] leading-5 text-[#777e89]">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function AnalysisSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className={`${CARD} min-h-[300px] p-5`}>
            <Skeleton className="h-4 w-36" />
            <Skeleton className="mt-6 h-3 w-4/5" />
            <Skeleton className="mt-3 h-3 w-3/5" />
            <Skeleton className="mt-8 h-40 w-full" />
          </div>
        ))}
      </div>
      <p className="sr-only">브랜드 성과 분석을 생성하는 중입니다.</p>
    </div>
  );
}

function Onboarding({
  projects,
  selectedFid,
  domain,
  onDomain,
  onSubmit,
  onOpenProject,
  busy,
  error,
}: {
  projects: AiVisibilityProjectListItem[];
  selectedFid: string;
  domain: string;
  onDomain: (value: string) => void;
  onSubmit: () => void;
  onOpenProject: (fid: string) => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="min-h-[calc(100dvh-64px)] bg-[#f3f5f8] px-4 py-8 text-[#252930] sm:px-6 lg:py-12">
      <div className="mx-auto w-full max-w-[1180px]">
        <section className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7657e8]">AI 브랜드 성과</p>
          <h1 className="mt-3 text-[30px] font-bold tracking-[-0.035em] sm:text-[40px]">AI는 내 브랜드를 어떻게 언급할까요?</h1>
          <p className="mx-auto mt-4 max-w-[760px] text-[13px] leading-6 text-[#626975] sm:text-[14px]">
            실제 AI 답변에서 브랜드의 점유율과 감정을 확인하고, 경쟁 브랜드와 내러티브 주제까지 한 번에 비교하세요.
          </p>
          <form className="mx-auto mt-8 flex max-w-[760px] flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
            <input
              value={domain}
              onChange={(event) => onDomain(event.target.value)}
              placeholder="분석할 프로젝트 도메인을 입력하세요"
              aria-label="분석할 도메인"
              className="h-12 min-w-0 flex-1 rounded-[8px] border border-[#cfd3db] bg-white px-4 text-[13px] outline-none focus:border-[#7657e8] focus:ring-2 focus:ring-[#7657e8]/15"
            />
            <button className={`${PRIMARY} h-12 px-6 text-[13px]`} disabled={busy || !domain.trim()}>{busy ? "준비 중…" : "분석하기"}</button>
          </form>
          {error && <p role="alert" className="mx-auto mt-3 max-w-[760px] rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-left text-[12px] text-red-700">{error}</p>}
        </section>

        {projects.length > 0 && (
          <section className="mx-auto mt-10 max-w-[920px] text-left">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">분석된 브랜드 프로필</h2>
              <a href="/projects/" className="text-[11px] font-medium text-[#6554cc] hover:underline">프로젝트 관리</a>
            </div>
            <div className="mt-3 overflow-hidden rounded-[8px] border border-[#dadde3] bg-white">
              {projects.map((project) => (
                <button
                  type="button"
                  key={project.id}
                  onClick={() => onOpenProject(project.id)}
                  className={`flex w-full items-center gap-4 border-b border-[#eceef1] px-5 py-4 text-left last:border-b-0 hover:bg-[#fafafe] ${project.id === selectedFid ? "bg-[#f8f7ff]" : ""}`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${project.configured ? "bg-[#55d6ae]" : "bg-[#c7cad1]"}`} />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[13px] font-semibold">{project.name}</b>
                    <span className="mt-0.5 block truncate text-[11px] text-[#7d838d]">{project.domain}</span>
                  </span>
                  <span className="text-[11px] font-medium text-[#6554cc]">{project.configured ? "보고서 보기" : "설정하기"} →</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="mt-14 text-center">
          <h2 className="text-[24px] font-bold tracking-[-0.025em]">AI 인사이트로 시장 점유율을 높이세요</h2>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {[
              ["/images/resources/ai_visibility_share_of_voice.svg", "AI 브랜드 가시성 검토", "실제 답변에서 브랜드 점유율과 감정 분포를 확인합니다."],
              ["/images/resources/adobe_brand_visibility.svg", "LLM에서 경쟁 우위 확보", "같은 질문에서 함께 언급되는 경쟁 브랜드와 주제를 비교합니다."],
              ["/images/resources/ai_search_os.svg", "더 강력한 전략 구축", "근거가 연결된 전략 기회와 다음 행동을 우선순위로 정리합니다."],
            ].map(([src, title, body]) => (
              <article key={title} className={`${CARD} p-6`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="mx-auto h-24 w-32 object-contain" />
                <h3 className="mt-4 text-[14px] font-semibold">{title}</h3>
                <p className="mt-2 text-[12px] leading-5 text-[#737a84]">{body}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function BrandManager({
  open,
  onOpenChange,
  tracked,
  fid,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tracked: BrandPerformanceTrackedBrandView[];
  fid: string;
  onSaved: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<BrandDraft[]>(() => tracked
    .filter((brand) => brand.kind === "competitor" && brand.enabled)
    .map((brand) => ({
      name: brand.name,
      aliases: brand.aliases.join(", "),
      domain: brand.domain ?? "",
    })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (index: number, key: keyof BrandDraft, value: string) => {
    setDrafts((current) => current.map((draft, draftIndex) => draftIndex === index ? { ...draft, [key]: value } : draft));
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[700] bg-[#252a31]/55" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[710] max-h-[calc(100dvh-32px)] w-[min(620px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[10px] bg-white shadow-[0_24px_70px_rgba(0,0,0,0.25)] focus:outline-none">
          <div className="flex items-start justify-between border-b border-[#e5e7eb] px-5 py-4">
            <div>
              <Dialog.Title className="text-[17px] font-semibold text-[#252930]">경쟁 브랜드 관리</Dialog.Title>
              <Dialog.Description className="mt-1 text-[12px] text-[#747b85]">실제 AI 답변에서 비교할 브랜드를 최대 4개까지 선택합니다.</Dialog.Description>
            </div>
            <Dialog.Close asChild><button type="button" aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#777d87] hover:bg-[#f3f4f6]"><Cross2Icon /></button></Dialog.Close>
          </div>
          <div className="space-y-3 px-5 py-5">
            {drafts.map((draft, index) => (
              <div key={index} className="grid gap-2 rounded-[8px] border border-[#e2e4e8] p-3 sm:grid-cols-[1fr_1fr_auto]">
                <input value={draft.name} onChange={(event) => update(index, "name", event.target.value)} placeholder="브랜드명" className="h-9 rounded-[6px] border border-[#d9dce2] px-3 text-[12px] outline-none focus:border-[#7657e8]" />
                <input value={draft.aliases} onChange={(event) => update(index, "aliases", event.target.value)} placeholder="별칭, 쉼표 구분" className="h-9 rounded-[6px] border border-[#d9dce2] px-3 text-[12px] outline-none focus:border-[#7657e8]" />
                <button type="button" aria-label={`${draft.name || "경쟁 브랜드"} 제거`} className="h-9 rounded-[6px] px-3 text-[12px] text-red-600 hover:bg-red-50" onClick={() => setDrafts((current) => current.filter((_, draftIndex) => draftIndex !== index))}>제거</button>
                <input value={draft.domain} onChange={(event) => update(index, "domain", event.target.value)} placeholder="도메인 (선택)" className="h-9 rounded-[6px] border border-[#d9dce2] px-3 text-[12px] outline-none focus:border-[#7657e8] sm:col-span-2" />
              </div>
            ))}
            {drafts.length < 4 && <button type="button" className={`${BUTTON} w-full`} onClick={() => setDrafts((current) => [...current, { name: "", aliases: "", domain: "" }])}><PlusIcon /> 경쟁 브랜드 추가</button>}
            {error && <p role="alert" className="rounded-[6px] bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}
          </div>
          <div className="flex justify-end gap-2 border-t border-[#e5e7eb] px-5 py-4">
            <Dialog.Close asChild><button className={BUTTON}>취소</button></Dialog.Close>
            <button className={PRIMARY} disabled={busy || drafts.some((draft) => draft.name.trim().length < 2)} onClick={async () => {
              setBusy(true); setError(null);
              try {
                await api.put("/api/ai-visibility/brand-performance/brands/", {
                  fid,
                  brands: drafts.map((draft) => ({
                    name: draft.name,
                    aliases: draft.aliases.split(",").map((alias) => alias.trim()).filter(Boolean),
                    domain: draft.domain.trim() || null,
                  })),
                });
                await onSaved();
                onOpenChange(false);
              } catch (cause) {
                setError(errorMessage(cause, "경쟁 브랜드를 저장하지 못했습니다."));
              } finally {
                setBusy(false);
              }
            }}>{busy ? "저장 중…" : "저장"}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function InsightCard({ data }: { data: BrandPerformanceDashboardResponse }) {
  const insights = data.report?.insights ?? [];
  return (
    <article className={`${CARD} min-h-[330px]`}>
      <h2 className="border-b border-[#eceef1] px-5 py-4 text-[14px] font-semibold">인사이트</h2>
      <div className="p-5">
        <p className="text-[11px] text-[#858b95]">최근 실제 AI 응답을 기반으로 생성된 전략입니다.</p>
        <div className="mt-4 space-y-5">
          {insights.length === 0 ? <p className="py-16 text-center text-[12px] text-[#858b95]">근거가 충분한 인사이트가 없습니다.</p> : insights.map((insight) => (
            <div key={insight.id} className="flex gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#7657e8]" />
              <div>
                <h3 className="text-[13px] font-semibold text-[#30343b]">{insight.title}</h3>
                <p className="mt-1 text-[11px] leading-5 text-[#656c77]">{insight.body}</p>
                <a href={`/ai-seo/overview/?fid=${encodeURIComponent(data.scope.fid)}`} className="mt-1 inline-block text-[10px] font-medium text-[#6554cc] hover:underline">근거 응답 {insight.evidenceObservationIds.length}개 확인 →</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function BubbleCard({ brands }: { brands: BrandPerformanceBrandMetric[] }) {
  const visible = brands.filter((brand) => brand.mediaShare !== null && brand.sentimentScore !== null);
  return (
    <article className={`${CARD} min-h-[330px]`}>
      <div className="border-b border-[#eceef1] px-5 py-4">
        <h2 className="text-[14px] font-semibold">매체점유율 vs. 감정 <InfoCircledIcon className="ml-1 inline text-[#9298a1]" /></h2>
        <p className="mt-2 rounded-[5px] bg-[#eef8ff] px-3 py-2 text-[11px] text-[#5d6571]">브랜드 점유율과 답변 감정의 균형을 비교합니다. 원 크기는 언급 답변 수입니다.</p>
      </div>
      <div
        className="h-[245px] p-4"
        role="img"
        aria-label={`브랜드별 매체점유율과 감정 산점도. ${visible.map((brand) => `${brand.name}: 매체점유율 ${brand.mediaShare}%, 감정 점수 ${brand.sentimentScore}%, 언급 답변 ${brand.mentionedAnswers}개`).join("; ")}`}
      >
        {visible.length === 0 ? <div className="flex h-full items-center justify-center text-[12px] text-[#858b95]">분석 가능한 브랜드 언급이 없습니다.</div> : (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 16, bottom: 15, left: 0 }}>
              <CartesianGrid stroke="#edf0f3" />
              <XAxis type="number" dataKey="mediaShare" domain={[0, 100]} tick={{ fontSize: 10, fill: "#858b95" }} name="매체점유율" unit="%" />
              <YAxis type="number" dataKey="sentimentScore" domain={[0, 100]} tick={{ fontSize: 10, fill: "#858b95" }} name="감정 점수" unit="%" width={36} />
              <ZAxis type="number" dataKey="mentionedAnswers" range={[120, 760]} name="언급 답변 수" />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                formatter={(value, name) => name === "언급 답변 수"
                  ? [`${value}개`, name]
                  : [`${value}%`, name === "mediaShare" ? "매체점유율" : "감정 점수"]}
              />
              {visible.map((brand) => (
                <Scatter key={brand.id} name={brand.name} data={[brand]} fill={brand.color} fillOpacity={0.66} shape="circle" />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[#eceef1] px-5 py-3">
        {brands.map((brand) => <span key={brand.id} className="flex items-center gap-1.5 text-[10px] text-[#666d77]"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: brand.color }} />{brand.name}</span>)}
      </div>
    </article>
  );
}

function SentimentCard({ own }: { own: BrandPerformanceBrandMetric | undefined }) {
  const distribution = own ? [
    { name: "긍정", value: own.sentiment.positive, color: "#49d7b0" },
    { name: "중립", value: own.sentiment.neutral, color: "#f0b31a" },
    { name: "부정", value: own.sentiment.negative, color: "#ef6b77" },
  ].filter((item) => item.value > 0) : [];
  return (
    <article className={`${CARD} min-h-[260px]`}>
      <h2 className="border-b border-[#eceef1] px-5 py-4 text-[14px] font-semibold">전반적인 감정 <InfoCircledIcon className="ml-1 inline text-[#9298a1]" /></h2>
      {distribution.length === 0 ? (
        <div className="flex h-[205px] flex-col items-center justify-center px-6 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f1f2f5] text-[#8c929b]"><InfoCircledIcon width={20} height={20} /></span>
          <h3 className="mt-3 text-[13px] font-semibold">브랜드 언급 없음</h3>
          <p className="mt-1 text-[11px] leading-4 text-[#858b95]">브랜드가 실제 AI 답변에 나타나면 감정 분포가 표시됩니다.</p>
        </div>
      ) : (
        <div className="grid min-h-[205px] items-center gap-2 p-4 sm:grid-cols-[1fr_150px]">
          <div className="h-[170px]" role="img" aria-label={`전반적인 감정 분포. ${distribution.map((item) => `${item.name} ${item.value}개`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={distribution} dataKey="value" nameKey="name" innerRadius={45} outerRadius={68} paddingAngle={2}>{distribution.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip /></PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">{distribution.map((item) => <div key={item.name} className="flex items-center justify-between text-[11px]"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span><b>{item.value}</b></div>)}</div>
        </div>
      )}
    </article>
  );
}

function ShareCard({ brands }: { brands: BrandPerformanceBrandMetric[] }) {
  const values = brands.filter((brand) => brand.mediaShare !== null).map((brand) => ({ name: brand.name, value: brand.mediaShare!, color: brand.color }));
  return (
    <article className={`${CARD} min-h-[260px]`}>
      <h2 className="border-b border-[#eceef1] px-5 py-4 text-[14px] font-semibold">매체점유율 <InfoCircledIcon className="ml-1 inline text-[#9298a1]" /></h2>
      {values.length === 0 ? <div className="flex h-[205px] items-center justify-center text-[12px] text-[#858b95]">브랜드 언급 데이터가 없습니다.</div> : (
        <div className="grid min-h-[205px] items-center gap-2 p-4 sm:grid-cols-[1fr_190px]">
          <div className="h-[170px]" role="img" aria-label={`브랜드별 매체점유율. ${values.map((item) => `${item.name} ${item.value}%`).join(", ")}`}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={values} dataKey="value" nameKey="name" innerRadius={44} outerRadius={70} paddingAngle={1}>{values.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value) => [`${value}%`, "매체점유율"]} /></PieChart></ResponsiveContainer></div>
          <div className="space-y-2">{values.map((item) => <div key={item.name} className="flex items-center justify-between gap-4 text-[11px]"><span className="flex min-w-0 items-center gap-2"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /><span className="truncate">{item.name}</span></span><b>{item.value}%</b></div>)}</div>
        </div>
      )}
    </article>
  );
}

function ThemesTable({ data, brands }: { data: BrandPerformanceDashboardResponse; brands: BrandPerformanceBrandMetric[] }) {
  const themes = data.report?.themes ?? [];
  const max = Math.max(1, ...themes.flatMap((theme) => brands.map((brand) => theme.counts[brand.id] ?? 0)));
  return (
    <section className="mt-7">
      <p className="mb-3 text-[12px] font-medium text-[#69707b]">주요 비즈니스 성공 요인</p>
      <div className={CARD}>
        <div className="border-b border-[#eceef1] px-5 py-4">
          <h2 className="text-[14px] font-semibold">브랜드별 내러티브 성공 요인 <InfoCircledIcon className="ml-1 inline text-[#9298a1]" /></h2>
          <p className="mt-1 text-[11px] text-[#858b95]">AI 답변에서 각 주제가 브랜드에 귀속된 횟수입니다.</p>
        </div>
        {themes.length === 0 ? <div className="px-5 py-16 text-center text-[12px] text-[#858b95]">반복적으로 확인된 내러티브 주제가 없습니다.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[11px]">
              <thead><tr className="border-b border-[#eceef1] text-[#747b85]"><th className="w-[280px] px-5 py-3 text-left font-medium">내러티브 성공 요인</th>{brands.map((brand) => <th key={brand.id} className="min-w-[120px] px-2 py-3 text-center font-medium"><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: brand.color }} />{brand.name}</span></th>)}<th className="px-4 py-3 text-right font-medium">총 언급</th></tr></thead>
              <tbody>{themes.map((theme) => <tr key={theme.id} className="border-b border-[#eff1f3] last:border-0"><td className="px-5 py-2.5 font-medium text-[#3b4048]">{theme.label}</td>{brands.map((brand) => { const count = theme.counts[brand.id] ?? 0; const intensity = count / max; return <td key={brand.id} className="p-1.5 text-center"><span className="block rounded-[3px] py-2 font-semibold" style={{ backgroundColor: count === 0 ? "#f3f4f6" : `color-mix(in srgb, ${brand.color} ${Math.round(18 + intensity * 70)}%, white)`, color: intensity > 0.55 ? "white" : "#424750" }}>{count || ""}</span></td>; })}<td className="px-4 py-2.5 text-right font-semibold text-[#575d66]">{theme.total}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function ComparisonCard({ competitor, own, themes }: { competitor: BrandPerformanceBrandMetric; own: BrandPerformanceBrandMetric; themes: NonNullable<BrandPerformanceDashboardResponse["report"]>["themes"] }) {
  const relevant = themes.map((theme) => ({ label: theme.label, value: theme.counts[competitor.id] ?? 0 })).filter((theme) => theme.value > 0).slice(0, 7);
  const max = Math.max(1, ...relevant.map((theme) => theme.value));
  return (
    <article className={CARD}>
      <div className="flex items-center gap-1.5 border-b border-[#eceef1] px-5 py-3.5 text-[12px] font-semibold"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: competitor.color }} />{competitor.name} <span className="text-[#9298a1]">vs</span> <i className="h-2 w-2 rounded-full" style={{ backgroundColor: own.color }} />{own.name}</div>
      <div className="bg-[#eef8ff] px-5 py-3 text-[11px] leading-5 text-[#5c6570]">
        {competitor.mediaShare === null ? "관측 없음 — 실제 답변에 경쟁 브랜드가 나타나지 않았습니다." : competitor.mediaShare > (own.mediaShare ?? 0) ? "경쟁 브랜드가 현재 더 자주 언급됩니다. 자사 고유 주제의 점유를 확대하세요." : "자사 브랜드가 현재 언급 점유율에서 앞서고 있습니다."}
      </div>
      <div className="grid grid-cols-2 gap-5 p-5">
        <div><p className="text-[10px] text-[#7b828c]">매체점유율</p><div className="mt-1 flex items-baseline gap-2"><b className="text-[22px]" style={{ color: competitor.color }}>{competitor.mediaShare === null ? "n/a" : `${competitor.mediaShare}%`}</b><span className="text-[12px] text-[#7a808a]">vs {own.mediaShare === null ? "n/a" : `${own.mediaShare}%`}</span></div></div>
        <div><p className="text-[10px] text-[#7b828c]">감정 점수</p><div className="mt-1 flex items-baseline gap-2"><b className="text-[22px]" style={{ color: competitor.color }}>{competitor.sentimentScore === null ? "n/a" : `${competitor.sentimentScore}%`}</b><span className="text-[12px] text-[#7a808a]">vs {own.sentimentScore === null ? "n/a" : `${own.sentimentScore}%`}</span></div></div>
      </div>
      <div className="border-t border-[#eceef1] px-5 py-4">
        <p className="text-[10px] font-medium text-[#727984]">주요 내러티브</p>
        <div className="mt-3 space-y-2">{relevant.length === 0 ? <p className="text-[11px] text-[#8a9099]">관측된 주제가 없습니다.</p> : relevant.map((theme) => <div key={theme.label} className="grid grid-cols-[minmax(0,1fr)_120px_22px] items-center gap-2 text-[10px]"><span className="truncate">{theme.label}</span><span className="h-5 rounded-[3px] bg-[#f0f1f4]"><i className="block h-full rounded-[3px]" style={{ width: `${(theme.value / max) * 100}%`, backgroundColor: competitor.color }} /></span><b>{theme.value}</b></div>)}</div>
      </div>
    </article>
  );
}

function Opportunities({ data }: { data: BrandPerformanceDashboardResponse }) {
  const rows = data.report?.opportunities ?? [];
  return (
    <section className="mt-7 pb-12">
      <p className="mb-3 text-[12px] font-medium text-[#69707b]">전략 권장사항</p>
      <div className={CARD}>
        <div className="border-b border-[#eceef1] px-5 py-4"><h2 className="text-[14px] font-semibold">AI 전략 기회 <InfoCircledIcon className="ml-1 inline text-[#9298a1]" /></h2><p className="mt-1 text-[11px] text-[#858b95]">실제 응답 근거만 사용한 실행 가능한 권장사항입니다.</p></div>
        {rows.length === 0 ? <div className="px-5 py-16 text-center text-[12px] text-[#858b95]">근거가 충분한 전략 기회가 없습니다.</div> : <div className="grid gap-3 p-4 lg:grid-cols-2 2xl:grid-cols-3">{rows.map((row) => <article key={row.id} className="relative rounded-[7px] border border-[#e4e6ea] bg-[#fafafa] p-4"><span className={`absolute right-3 top-3 rounded-full px-2 py-1 text-[9px] font-semibold ${row.urgency === "urgent" ? "bg-[#ffe1e6] text-[#c63753]" : "bg-[#fff0d4] text-[#a76810]"}`}>{row.urgency === "urgent" ? "즉시 대응 필요" : "중기 대응 가능"}</span><h3 className="pr-24 text-[12px] font-semibold leading-5 text-[#30343b]">{row.title}</h3><p className="mt-3 text-[11px] leading-5 text-[#5f6670]">{row.summary}</p><p className="mt-4 text-[10px] font-semibold">추천</p><ul className="mt-2 space-y-1.5 text-[10px] leading-4 text-[#626974]">{row.recommendations.map((recommendation) => <li key={recommendation} className="flex gap-2"><i className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#7f8792]" /><span>{recommendation}</span></li>)}</ul><p className="mt-4 text-[9px] text-[#969ba3]">근거 응답 {row.evidenceObservationIds.length}개</p></article>)}</div>}
      </div>
    </section>
  );
}

export function BrandPerformanceDashboard({ initialFolderId = "" }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [fid, setFid] = useState(initialFolderId);
  const [projects, setProjects] = useState<AiVisibilityProjectListItem[]>([]);
  const [settings, setSettings] = useState<AiVisibilitySettingsView | null>(null);
  const [prompts, setPrompts] = useState<AiVisibilityPromptRow[]>([]);
  const [data, setData] = useState<BrandPerformanceDashboardResponse | null>(null);
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [showBrands, setShowBrands] = useState(false);
  const [run, setRun] = useState<AiVisibilityRunView | null>(null);
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);
  const analysisRequested = useRef(new Set<string>());

  const reportQuery = useMemo(() => {
    if (!fid) return "";
    const params = new URLSearchParams({ fid });
    for (const key of ["runId", "provider", "locationKey"] as const) {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    }
    return params.toString();
  }, [fid, searchParams]);

  const loadProjects = useCallback(async () => {
    const response = await api.get<AiVisibilityProjectListItem[]>("/api/ai-visibility/projects/");
    setProjects(response.data);
    return response.data;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const projectRows = await loadProjects();
      if (!fid) {
        setDomain("");
        setData(null);
        setSettings(null);
        setPrompts([]);
        return;
      }
      const settingsResponse = await api.get<AiVisibilitySettingsView>(`/api/ai-visibility/settings/?fid=${encodeURIComponent(fid)}`);
      setSettings(settingsResponse.data);
      setDomain(settingsResponse.data.folder.domain);
      const [reportResponse, promptResponse] = await Promise.all([
        api.get<BrandPerformanceDashboardResponse>(`/api/ai-visibility/brand-performance/?${reportQuery || `fid=${encodeURIComponent(fid)}`}`),
        settingsResponse.data.project
          ? api.get<AiVisibilityPromptRow[]>(`/api/ai-visibility/prompts/?fid=${encodeURIComponent(fid)}`)
          : Promise.resolve({ data: [] as AiVisibilityPromptRow[] }),
      ]);
      setData(reportResponse.data);
      setPrompts(promptResponse.data);
      setProjects(reportResponse.data.projects.length ? reportResponse.data.projects : projectRows);
      const reportBrands = reportResponse.data.report?.brands ?? [];
      const requestedBrands = searchParams.get("brands")?.split(",").filter(Boolean) ?? [];
      const validBrands = requestedBrands.filter((id) => reportBrands.some((brand) => brand.id === id));
      setSelectedBrandIds(validBrands.length ? validBrands : reportBrands.map((brand) => brand.id));
    } catch (cause) {
      setError(errorMessage(cause, "브랜드 성과를 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }, [fid, loadProjects, reportQuery, searchParams]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  useEffect(() => {
    if (!data?.eligibleForAnalysis || !data.filters.selected.runId || !data.filters.selected.provider || !data.filters.selected.locationKey) return;
    const key = `${data.filters.selected.runId}:${data.filters.selected.provider}:${data.filters.selected.locationKey}`;
    if (analysisRequested.current.has(key)) return;
    analysisRequested.current.add(key);
    void api.post("/api/ai-visibility/brand-performance/analyze/", {
      fid: data.scope.fid,
      runId: data.filters.selected.runId,
      provider: data.filters.selected.provider,
      locationKey: data.filters.selected.locationKey,
    }).then(() => window.setTimeout(() => void load(), 700)).catch((cause) => {
      setError(errorMessage(cause, "브랜드 분석을 시작하지 못했습니다."));
    });
  }, [data, load]);

  useEffect(() => {
    if (data?.state !== "pending" && data?.state !== "running") return;
    const timer = window.setInterval(() => void load(), 1800);
    return () => window.clearInterval(timer);
  }, [data?.state, load]);

  useEffect(() => {
    if (!run || (run.status !== "queued" && run.status !== "running")) return;
    const timer = window.setInterval(() => {
      api.get<AiVisibilityRunView>(`/api/ai-visibility/runs/${run.id}/`).then(({ data: next }) => {
        setRun(next);
        if (next.status !== "queued" && next.status !== "running") {
          window.clearInterval(timer);
          void load();
        }
      }).catch(() => window.clearInterval(timer));
    }, 1800);
    return () => window.clearInterval(timer);
  }, [run, load]);

  const navigate = (nextFid: string) => {
    setFid(nextFid);
    setError(null);
    router.push(`/ai-seo/brand-performance/?fid=${encodeURIComponent(nextFid)}`);
  };

  const submitDomain = () => {
    const normalized = normalizeDomain(domain);
    const match = projects.find((project) => normalizeDomain(project.domain) === normalized);
    if (!match) {
      setError("이 워크스페이스의 프로젝트 도메인과 일치하지 않습니다. 먼저 프로젝트를 만들어 주세요.");
      return;
    }
    navigate(match.id);
  };

  const startRun = async () => {
    if (!fid) return;
    setBusy(true); setError(null);
    try {
      const created = await api.post<{ runId: string }>("/api/ai-visibility/runs/", { fid });
      const status = await api.get<AiVisibilityRunView>(`/api/ai-visibility/runs/${created.data.runId}/`);
      setRun(status.data);
      if (status.data.status !== "queued" && status.data.status !== "running") await load();
    } catch (cause) {
      setError(errorMessage(cause, "실제 AI 응답 수집을 시작하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };

  const startSetup = async () => {
    if (!fid || !settings) return;
    const textProviders = (["chatgpt_web", "gemini_grounded"] as AiVisibilityProvider[]).filter(
      (provider) => settings.capabilities.providers[provider].enabled,
    );
    if (textProviders.length === 0) {
      setShowSetup(true);
      setError("브랜드 성과에는 응답 본문을 제공하는 ChatGPT 또는 Gemini 연결이 필요합니다.");
      return;
    }
    setBusy(true); setError(null);
    try {
      await api.put(`/api/ai-visibility/settings/?fid=${encodeURIComponent(fid)}`, {
        brandName: settings.defaults.brandName,
        brandAliases: [],
        providers: textProviders,
        locationKeys: settings.defaults.locationKeys,
        schedule: "weekly",
      });
      const imported = await api.post<{ added: number; prompts: AiVisibilityPromptRow[] }>(`/api/ai-visibility/prompts/?fid=${encodeURIComponent(fid)}`, { mode: "position_tracking" });
      await load();
      if (imported.data.prompts.length > 0) await startRun();
      else setShowSetup(true);
    } catch (cause) {
      setError(errorMessage(cause, "브랜드 분석 프로젝트를 설정하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };

  const updateFilter = (runId: string) => {
    const option = data?.filters.runs.find((item) => `${item.runId}:${item.provider}:${item.locationKey}` === runId);
    if (!option || !fid) return;
    const params = new URLSearchParams({
      fid,
      runId: option.runId,
      provider: option.provider,
      locationKey: option.locationKey,
    });
    router.replace(`/ai-seo/brand-performance/?${params.toString()}`, { scroll: false });
  };

  const selectedBrands = useMemo(() => {
    const brands = data?.report?.brands ?? [];
    const selected = brands.filter((brand) => selectedBrandIds.includes(brand.id));
    const total = selected.reduce((sum, brand) => sum + brand.mentionedAnswers, 0);
    return selected.map((brand) => ({
      ...brand,
      mediaShare: brand.mentionedAnswers > 0 && total > 0
        ? Math.round((brand.mentionedAnswers / total) * 1000) / 10
        : null,
    }));
  }, [data?.report?.brands, selectedBrandIds]);
  const own = selectedBrands.find((brand) => brand.kind === "own");

  if (loading && !data && projects.length === 0) {
    return <div className="flex min-h-[600px] items-center justify-center bg-[#f3f5f8] text-[13px] text-[#777e89]">브랜드 성과를 불러오는 중…</div>;
  }

  if (!fid || data?.state === "unconfigured") {
    return (
      <Onboarding
        projects={projects}
        selectedFid={fid}
        domain={domain}
        onDomain={setDomain}
        onSubmit={data?.state === "unconfigured" ? startSetup : submitDomain}
        onOpenProject={navigate}
        busy={busy}
        error={error}
      />
    );
  }

  return (
    <div className="min-h-[calc(100dvh-64px)] bg-[#f3f4f6] text-[#2c3037]">
      <div className="mx-auto w-full max-w-[1540px] px-3 py-5 sm:px-5 lg:px-6">
        <header>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#858b95]"><span>홈</span><span>›</span><span>AI 가시성</span><span>›</span><b className="font-medium text-[#555b65]">브랜드 성과</b></div>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[20px] font-semibold tracking-[-0.02em]">브랜드 성과: <span className="text-[#6554cc]">{data?.scope.domain}</span></h1>
              <p className="mt-1 text-[11px] text-[#7d838d]">실제 AI 답변의 브랜드 언급, 감정과 내러티브만 분석합니다.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={fid} onChange={(event) => navigate(event.target.value)} className="h-9 min-w-[210px] rounded-[6px] border border-[#d7dae0] bg-white px-3 text-[12px]">
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.domain}</option>)}
              </select>
              <button className={BUTTON} onClick={() => setShowSetup((value) => !value)}><GearIcon /> 설정</button>
              <button className={PRIMARY} disabled={busy || prompts.length === 0 || run?.status === "queued" || run?.status === "running"} onClick={() => void startRun()}><ReloadIcon />{run?.status === "queued" || run?.status === "running" ? "수집 중…" : "지금 수집"}</button>
            </div>
          </div>
        </header>

        {error && <div role="alert" className="mt-4 rounded-[7px] border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">{error}</div>}
        {showSetup && settings && <div className="mt-4"><AiVisibilitySettingsPanel settings={settings} onSaved={load} /></div>}
        {(showSetup || data?.state === "no_prompts") && settings?.project && <div className="mt-4"><AiVisibilityPromptManager fid={fid} prompts={prompts} limit={settings.limits.prompts} onChanged={async () => { await load(); }} /></div>}

        {run && (run.status === "queued" || run.status === "running") && (
          <div role="status" aria-live="polite" className="mt-4 rounded-[7px] border border-[#cbc7ff] bg-[#f1efff] px-4 py-3 text-[12px] text-[#57516d]">
            <div className="flex justify-between gap-3"><span>{run.currentPrompt ? `실제 응답 수집 중: ${run.currentPrompt}` : "수집 작업을 준비하는 중입니다."}</span><b>{run.processed}/{run.total}</b></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#ddd9fa]"><div className="h-full bg-[#7657e8]" style={{ width: `${run.total > 0 ? Math.round((run.processed / run.total) * 100) : 0}%` }} /></div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#e0e2e7] bg-white px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {(data?.report?.brands ?? []).map((brand) => {
              const active = selectedBrandIds.includes(brand.id);
              const ownBrand = brand.kind === "own";
              return <button key={brand.id} type="button" aria-pressed={active} onClick={() => {
                if (ownBrand) return;
                setSelectedBrandIds((current) => active ? current.filter((id) => id !== brand.id) : [...current, brand.id]);
              }} className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[10px] ${active ? "border-[#c9c5ef] bg-[#f5f3ff] font-semibold text-[#4e4967]" : "border-[#e0e2e7] bg-white text-[#8b919a]"}`}><i className="h-2 w-2 rounded-full" style={{ backgroundColor: brand.color }} />{brand.name}{ownBrand && <span className="rounded bg-white px-1 text-[8px] text-[#6554cc]">나</span>}</button>;
            })}
            <button type="button" aria-label="경쟁 브랜드 관리" onClick={() => setShowBrands(true)} className="flex h-7 w-7 items-center justify-center rounded-full border border-[#d9dce2] text-[#6f7580] hover:bg-[#f6f7f9]"><PlusIcon /></button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data && data.filters.runs.length > 0 && <select value={`${data.filters.selected.runId}:${data.filters.selected.provider}:${data.filters.selected.locationKey}`} onChange={(event) => updateFilter(event.target.value)} className="h-8 rounded-[6px] border border-[#d8dbe1] bg-white px-2 text-[10px]">{data.filters.runs.map((option) => <option key={`${option.runId}:${option.provider}:${option.locationKey}`} value={`${option.runId}:${option.provider}:${option.locationKey}`}>{PROVIDER_LABELS[option.provider]} · {option.countryCode} · {formatDate(option.capturedAt)}</option>)}</select>}
            <span className="text-[9px] text-[#8d929a]">{data?.provenance.source}</span>
          </div>
        </div>

        {data && data.completeness.observed > 0 && (
          <div className={`mt-3 rounded-[7px] border px-4 py-3 text-[11px] ${data.completeness.ratio >= 100 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            분석 완전성 {data.completeness.analyzed}/{data.completeness.observed} ({data.completeness.ratio}%)
            {data.provenance.analyzerModel && ` · ${data.provenance.analyzerProvider}/${data.provenance.analyzerModel}`}
            {data.provenance.error && ` · ${data.provenance.error}`}
          </div>
        )}

        {data?.state === "no_prompts" ? (
          <div className="mt-4"><EmptyCard title="추적 프롬프트를 추가해 주세요" body="브랜드 성과는 실제 질문에 대한 AI 답변을 분석합니다. Position Tracking 키워드를 가져오거나 직접 프롬프트를 입력하세요." action={<button className={PRIMARY} onClick={() => setShowSetup(true)}>프롬프트 추가</button>} /></div>
        ) : data?.state === "provider_unavailable" ? (
          <div className="mt-4"><EmptyCard title="응답 본문 공급자가 필요합니다" body="TalorData의 Google AI 개요만으로는 감정과 내러티브를 분석할 수 없습니다. ChatGPT 또는 Gemini API 연결 후 수집하세요." action={<button className={BUTTON} onClick={() => setShowSetup(true)}>프로젝트 설정 열기</button>} /></div>
        ) : data?.state === "no_data" ? (
          <div className="mt-4"><EmptyCard title="첫 브랜드 성과 수집을 시작하세요" body={`현재 ${data.scope.promptCount}개 프롬프트가 준비되어 있습니다. 실제 AI 응답 수집이 끝나면 브랜드 성과 분석이 자동으로 생성됩니다.`} action={<button className={PRIMARY} disabled={busy} onClick={() => void startRun()}>지금 수집</button>} /></div>
        ) : data?.state === "failed" ? (
          <div className="mt-4"><EmptyCard title="브랜드 분석을 완료하지 못했습니다" body={data.provenance.error ?? data.capabilities.analyzerReason ?? "분석 모델 연결을 확인하고 다시 시도해 주세요."} action={data.eligibleForAnalysis ? <button className={PRIMARY} onClick={() => { analysisRequested.current.clear(); void load(); }}>다시 분석</button> : undefined} /></div>
        ) : data?.state === "pending" || data?.state === "running" || data?.state === "missing" ? (
          <div className="mt-4"><AnalysisSkeleton /></div>
        ) : data?.report && own ? (
          <>
            <div className="mt-3 grid gap-3 xl:grid-cols-2"><InsightCard data={data} /><BubbleCard brands={selectedBrands} /><SentimentCard own={own} /><ShareCard brands={selectedBrands} /></div>
            <ThemesTable data={data} brands={selectedBrands} />
            {selectedBrands.some((brand) => brand.kind === "competitor") && <section className="mt-7"><p className="mb-3 text-[12px] font-medium text-[#69707b]">내 브랜드 vs. 경쟁사</p><div className="grid gap-3 xl:grid-cols-2">{selectedBrands.filter((brand) => brand.kind === "competitor").map((competitor) => <ComparisonCard key={competitor.id} competitor={competitor} own={own} themes={data.report!.themes} />)}</div></section>}
            <div className="mt-3 rounded-[7px] border border-[#dfe0f6] bg-[#f7f6ff] px-4 py-3 text-[10px] leading-5 text-[#66627b]">매체점유율: {data.report.formulas.mediaShare} · 감정: {data.report.formulas.sentiment} · 히트맵: {data.report.formulas.heatmap}</div>
            <Opportunities data={data} />
          </>
        ) : null}
      </div>

      {data && showBrands && <BrandManager open={showBrands} onOpenChange={setShowBrands} tracked={data.trackedBrands} fid={fid} onSaved={load} />}
    </div>
  );
}
