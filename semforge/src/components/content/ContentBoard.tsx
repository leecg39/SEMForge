"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client-api";
import {
  DEFAULT_CONTENT_AI_PROFILE,
  isContentAiProfileId,
  type ContentAiProfileId,
} from "@/lib/content-ai";
import { cn } from "@/lib/utils";
import type {
  ContentBoardView,
  ContentCapabilitiesView,
  ContentRunStage,
  ContentRunView,
} from "@/types/content";
import { MarkdownArticleEditor } from "@/components/content/MarkdownArticleEditor";
import { StatusPill, fieldClass } from "@/components/content/ContentUi";

const stages: Array<{ id: ContentRunStage; label: string }> = [
  { id: "validate", label: "입력 검증" },
  { id: "research", label: "TalorData 연구" },
  { id: "generate", label: "AI 초안 생성" },
  { id: "analyze", label: "SEO 검사" },
  { id: "persist", label: "라이브러리 저장" },
];

type Requirements = {
  keyword: string;
  audience: string;
  title: string;
  brandVoice: string;
  targetWordCount: number;
  language: string;
  countryCode: string;
  aiProfile: ContentAiProfileId;
};

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function RunProgress({ run }: { run: ContentRunView }) {
  const current = stages.findIndex((stage) => stage.id === run.stage);
  return (
    <section aria-live="polite" aria-atomic="true" className="rounded-[14px] border border-bebe bg-white p-4">
      <div className="flex items-center gap-2">
        <StatusPill status={run.status} />
        <span className="text-[12px] font-semibold text-hof">{run.status === "completed" ? "기사 생성 완료" : stages[current]?.label}</span>
      </div>
      <ol className="mt-4 space-y-2.5">
        {stages.map((stage, index) => {
          const done = run.status === "completed" || index < current;
          const active = run.status !== "completed" && index === current && ["queued", "running"].includes(run.status);
          return (
            <li key={stage.id} className="flex items-center gap-2.5 text-[12px]">
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border text-[10px]", done && "border-emerald-600 bg-emerald-600 text-white", active && "border-rausch bg-rausch text-white", !done && !active && "border-deco text-grey-500")}>
                {done ? "✓" : index + 1}
              </span>
              <span className={active ? "font-semibold text-hof" : "text-foggy"}>{stage.label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function RequirementsWizard({
  submitting,
  capabilities,
  defaultAiProfile,
  onSubmit,
}: {
  submitting: boolean;
  capabilities: ContentCapabilitiesView | null;
  defaultAiProfile: ContentAiProfileId;
  onSubmit: (requirements: Requirements) => void;
}) {
  const [step, setStep] = useState(0);
  const [requirements, setRequirements] = useState<Requirements>({
    keyword: "",
    audience: "주제에 관심 있는 일반 독자",
    title: "",
    brandVoice: "명확하고 신뢰감 있는 전문가",
    targetWordCount: 1400,
    language: "ko",
    countryCode: "KR",
    aiProfile: defaultAiProfile,
  });
  const selectedModel = capabilities?.contentModels.find((model) => model.id === requirements.aiProfile);
  const canContinue = step === 0 ? requirements.keyword.trim().length > 0 : step === 1 ? requirements.audience.trim().length > 0 : true;
  const questions = [
    "검색에서 가장 중요한 핵심 키워드는 무엇인가요?",
    "이 글을 가장 먼저 읽어야 할 독자는 누구인가요?",
    "원하는 제목이 있나요? 비워 두면 검색 문맥으로 추천합니다.",
  ];

  if (step < 3) {
    const key = step === 0 ? "keyword" : step === 1 ? "audience" : "title";
    return (
      <div className="rounded-[14px] border border-bebe bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-rausch">질문 {step + 1}/3</p>
        <label className="mt-2 block text-[14px] font-semibold leading-6 text-hof" htmlFor={`requirement-${key}`}>{questions[step]}</label>
        <input
          id={`requirement-${key}`}
          value={requirements[key]}
          onChange={(event) => setRequirements((current) => ({ ...current, [key]: event.target.value }))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canContinue) setStep((value) => value + 1);
          }}
          placeholder={step === 0 ? "예: 자사몰 SEO" : step === 1 ? "예: 온라인 쇼핑몰을 처음 운영하는 사장님" : "선택 입력"}
          className={`${fieldClass} mt-4`}
          autoFocus
        />
        <div className="mt-4 flex items-center justify-between">
          {step > 0 ? <button type="button" onClick={() => setStep((value) => value - 1)} className="text-[12px] font-semibold text-foggy">이전</button> : <span />}
          <button type="button" disabled={!canContinue} onClick={() => setStep((value) => value + 1)} className="rounded-full bg-hof px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40">다음</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-bebe bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-rausch">생성 조건 확인</p>
      <dl className="mt-3 space-y-2 text-[12px]">
        <div className="flex gap-3"><dt className="w-16 shrink-0 text-foggy">키워드</dt><dd className="font-semibold text-hof">{requirements.keyword}</dd></div>
        <div className="flex gap-3"><dt className="w-16 shrink-0 text-foggy">독자</dt><dd className="text-hof">{requirements.audience}</dd></div>
        <div className="flex gap-3"><dt className="w-16 shrink-0 text-foggy">제목</dt><dd className="text-hof">{requirements.title || "SERP 문맥으로 추천"}</dd></div>
        <div className="flex gap-3"><dt className="w-16 shrink-0 text-foggy">AI 모델</dt><dd className="text-hof">{selectedModel ? `${selectedModel.providerLabel} · ${selectedModel.label}` : requirements.aiProfile}</dd></div>
      </dl>
      <details className="mt-4 rounded-[10px] bg-faint p-3">
        <summary className="cursor-pointer text-[12px] font-semibold text-hof">고급 설정</summary>
        <div className="mt-3 grid gap-3">
          <label className="text-[11px] text-foggy">
            생성 모델
            <select
              value={requirements.aiProfile}
              onChange={(event) => {
                if (isContentAiProfileId(event.target.value)) {
                  setRequirements((current) => ({ ...current, aiProfile: event.target.value as ContentAiProfileId }));
                }
              }}
              className={`${fieldClass} mt-1`}
            >
              {capabilities?.contentModels.map((model) => (
                <option key={model.id} value={model.id} disabled={!model.enabled}>
                  {model.providerLabel} · {model.label}{!model.enabled ? " (설정 필요)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-foggy">브랜드 보이스<input value={requirements.brandVoice} onChange={(event) => setRequirements((current) => ({ ...current, brandVoice: event.target.value }))} className={`${fieldClass} mt-1`} /></label>
          <label className="text-[11px] text-foggy">목표 분량<input type="number" min={500} max={5000} step={100} value={requirements.targetWordCount} onChange={(event) => setRequirements((current) => ({ ...current, targetWordCount: Number(event.target.value) }))} className={`${fieldClass} mt-1`} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-foggy">언어<input value={requirements.language} onChange={(event) => setRequirements((current) => ({ ...current, language: event.target.value }))} className={`${fieldClass} mt-1`} /></label>
            <label className="text-[11px] text-foggy">국가<input value={requirements.countryCode} maxLength={2} onChange={(event) => setRequirements((current) => ({ ...current, countryCode: event.target.value.toUpperCase() }))} className={`${fieldClass} mt-1`} /></label>
          </div>
        </div>
      </details>
      {capabilities && (!capabilities.talorData.enabled || !selectedModel?.enabled) && (
        <p className="mt-3 text-[11px] leading-5 text-amber-700">
          {!capabilities.talorData.enabled ? capabilities.talorData.reason : selectedModel?.reason ?? "선택한 AI 모델을 사용할 수 없습니다."}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between">
        <button type="button" onClick={() => setStep(2)} className="text-[12px] font-semibold text-foggy">수정</button>
        <button type="button" disabled={submitting || !capabilities?.talorData.enabled || !selectedModel?.enabled} onClick={() => onSubmit(requirements)} className="rounded-full bg-rausch px-5 py-2.5 text-[12px] font-semibold text-white disabled:opacity-40">{submitting ? "실행 준비 중…" : "이 조건으로 생성"}</button>
      </div>
    </div>
  );
}

export function ContentBoard({ boardId }: { boardId: string }) {
  const searchParams = useSearchParams();
  const folderId = searchParams.get("fid") ?? "";
  const [board, setBoard] = useState<ContentBoardView | null>(null);
  const [run, setRun] = useState<ContentRunView | null>(null);
  const [capabilities, setCapabilities] = useState<ContentCapabilitiesView | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBoard = useCallback(async () => {
    const { data } = await api.get<ContentBoardView>(`/api/content/boards/${boardId}/`);
    setBoard(data);
    setRun(data.runs[0] ?? null);
    return data;
  }, [boardId]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<ContentBoardView>(`/api/content/boards/${boardId}/`),
      api.get<ContentCapabilitiesView>("/api/content/capabilities/"),
    ])
      .then(([{ data }, capabilityResult]) => {
        if (!active) return;
        setBoard(data);
        setRun(data.runs[0] ?? null);
        setCapabilities(capabilityResult.data);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "작업판을 불러오지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [boardId]);

  useEffect(() => {
    if (!run || !["queued", "running"].includes(run.status)) return;
    let active = true;
    const runId = run.id;
    const process = async () => {
      let current = run;
      while (active && ["queued", "running"].includes(current.status)) {
        try {
          if (current.processing) {
            await sleep(2_000);
            const polled = await api.get<ContentRunView>(`/api/content/runs/${runId}/`);
            if (!active) return;
            current = polled.data;
            setRun(current);
            continue;
          }
          const before = `${current.status}:${current.stage}:${current.updatedAt}`;
          const result = await api.post<ContentRunView>(`/api/content/runs/${runId}/process/`);
          if (!active) return;
          current = result.data;
          setRun(current);
          const after = `${current.status}:${current.stage}:${current.updatedAt}`;
          if (before === after || current.processing) {
            await sleep(800);
            const polled = await api.get<ContentRunView>(`/api/content/runs/${runId}/`);
            if (!active) return;
            current = polled.data;
            setRun(current);
          }
        } catch (cause) {
          if (active) setError(cause instanceof Error ? cause.message : "실행 상태를 확인하지 못했습니다.");
          return;
        }
      }
      if (active) await refreshBoard();
    };
    process();
    return () => { active = false; };
    // runId가 바뀔 때만 새 처리 루프를 시작한다. 루프 내부에서 최신 상태를 관리한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id, refreshBoard]);

  const article = board
    ? (run?.articleId
        ? board.articles.find((item) => item.id === run.articleId) ?? board.articles[0] ?? null
        : board.articles[0] ?? null)
    : null;

  const startRun = async (requirements: Requirements) => {
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post<ContentRunView>(`/api/content/boards/${boardId}/runs/`, {
        idempotencyKey: crypto.randomUUID(),
        input: {
          ...requirements,
          title: requirements.title || null,
          sourceUrl: null,
        },
      });
      setRun(data);
      await refreshBoard();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "기사 생성을 시작하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    if (!run) return;
    try {
      const { data } = await api.post<ContentRunView>(`/api/content/runs/${run.id}/cancel/`);
      setRun(data);
      await refreshBoard();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "실행을 취소하지 못했습니다.");
    }
  };

  const retry = async () => {
    if (!run) return;
    try {
      const { data } = await api.post<ContentRunView>(`/api/content/runs/${run.id}/retry/`);
      setRun(data);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "재시도하지 못했습니다.");
    }
  };

  if (loading) return <div className="flex min-h-[calc(100dvh-64px)] items-center justify-center text-[13px] text-foggy">작업판을 복원하는 중…</div>;
  if (!board) return <div role="alert" className="p-8 text-red-700">{error ?? "작업판을 찾을 수 없습니다."}</div>;

  const research = run?.provenance?.research as { provider?: string; capturedAt?: string; fromCache?: boolean } | undefined;
  const analysis = run?.output?.analysis as { score?: number | null; unavailableReason?: string | null } | undefined;
  const initialMessage = board.messages.find((message) => message.role === "user" && message.kind === "text");
  const initialPayload = initialMessage?.payload && typeof initialMessage.payload === "object"
    ? initialMessage.payload as Record<string, unknown>
    : null;
  const configuredProfile = run?.input?.aiProfile ?? initialPayload?.aiProfile;
  const defaultAiProfile = isContentAiProfileId(configuredProfile)
    ? configuredProfile
    : DEFAULT_CONTENT_AI_PROFILE;

  return (
    <div className="flex min-h-[calc(100dvh-64px)] flex-col bg-faint lg:flex-row">
      <aside className="w-full shrink-0 border-b border-bebe bg-white lg:sticky lg:top-0 lg:h-[calc(100dvh-64px)] lg:w-[340px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="p-4 sm:p-5">
          <Link href={`/content/workspaces/${folderId ? `?fid=${encodeURIComponent(folderId)}` : ""}`} className="text-[12px] font-semibold text-foggy hover:text-hof">← 작업판</Link>
          <h1 className="mt-3 text-[18px] font-semibold leading-6 tracking-[-0.02em] text-hof">{board.title}</h1>
          <div className="mt-2 flex items-center gap-2"><StatusPill status={board.status} /><span className="truncate text-[11px] text-grey-500">{board.folderName ?? "프로젝트 미지정"}</span></div>
        </div>

        <div className="space-y-4 border-t border-bebe p-4 sm:p-5">
          {initialMessage && (
            <div className="rounded-[14px] bg-hof px-4 py-3 text-[13px] leading-6 text-white">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/55">작성 요청</p>
              {initialMessage.body}
            </div>
          )}
          {!run && <RequirementsWizard submitting={submitting} capabilities={capabilities} defaultAiProfile={defaultAiProfile} onSubmit={startRun} />}
          {run && <RunProgress run={run} />}
          {run?.status === "failed" && (
            <div role="alert" className="rounded-[14px] border border-red-100 bg-red-50 p-4 text-[12px] leading-5 text-red-800">
              <p className="font-semibold">{run.error.message ?? "실행에 실패했습니다."}</p>
              <p className="mt-1 text-red-700">실패 단계: {stages.find((stage) => stage.id === run.error.stage)?.label ?? run.stage}</p>
              <button type="button" onClick={retry} className="mt-3 rounded-full bg-red-700 px-4 py-2 font-semibold text-white">같은 단계 재시도</button>
            </div>
          )}
          {run?.status === "cancelled" && <RequirementsWizard submitting={submitting} capabilities={capabilities} defaultAiProfile={defaultAiProfile} onSubmit={startRun} />}
          {run && ["queued", "running"].includes(run.status) && <button type="button" onClick={cancel} className="w-full rounded-full border border-deco bg-white px-4 py-2.5 text-[12px] font-semibold text-foggy hover:bg-faint">실행 취소</button>}
          {board.messages.filter((message) => ["progress", "error"].includes(message.kind)).length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-grey-500">실행 기록</p>
              <ol className="space-y-2">
                {board.messages.filter((message) => ["progress", "error"].includes(message.kind)).slice(-8).map((message) => (
                  <li key={message.id} className={cn("rounded-[10px] px-3 py-2 text-[11px] leading-5", message.kind === "error" ? "bg-red-50 text-red-700" : "bg-faint text-foggy")}>{message.body}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        {error && <div role="alert" className="mb-4 rounded-[12px] bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>}
        {article ? (
          <div className="mx-auto w-full max-w-[1180px]">
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[14px] border border-bebe bg-white px-4 py-3 text-[12px] text-foggy">
              <span className="font-semibold text-hof">SEO {analysis?.score === null || analysis?.score === undefined ? "이용 불가" : `${analysis.score}/100`}</span>
              {analysis?.unavailableReason && <span>{analysis.unavailableReason}</span>}
              {research && <span className="sm:ml-auto">{research.provider} · {research.fromCache ? "캐시 연구" : "신규 연구"} · {research.capturedAt ? new Date(research.capturedAt).toLocaleString("ko-KR") : ""}</span>}
              <Link href={`/content/?mode=linked&sourceArticleId=${encodeURIComponent(article.id)}${folderId ? `&fid=${encodeURIComponent(folderId)}` : ""}`} className="rounded-full bg-rausch px-3 py-1.5 text-[10px] font-semibold text-white">연계 제작으로 확장</Link>
            </div>
            <MarkdownArticleEditor
              key={article.id}
              article={article}
              onSaved={(saved) => setBoard((current) => current ? { ...current, articles: current.articles.map((item) => item.id === saved.id ? saved : item) } : current)}
            />
          </div>
        ) : (
          <div className="mx-auto flex min-h-[640px] w-full max-w-[1180px] items-center justify-center rounded-[18px] border border-dashed border-deco bg-white p-8 text-center">
            <div className="max-w-[420px]">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-faint text-[20px]" aria-hidden="true">✦</div>
              <h2 className="mt-4 text-[19px] font-semibold text-hof">{run ? "실제 결과를 준비하고 있습니다" : "조건을 확인하면 생성이 시작됩니다"}</h2>
              <p className="mt-2 text-[13px] leading-6 text-foggy">{run ? "완료된 서버 단계만 왼쪽 진행 기록에 표시됩니다. 새로고침하거나 페이지를 닫아도 다음 단계부터 이어집니다." : "왼쪽에서 필요한 조건을 한 번에 하나씩 답해 주세요."}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
