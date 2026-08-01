"use client";

import { CheckCircledIcon, CrossCircledIcon, ReloadIcon } from "@radix-ui/react-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";

export interface PositionTrackingRunView {
  id: string;
  campaignId: string;
  trigger: "initial" | "manual" | "scheduled";
  status: "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  currentKeyword: string | null;
  error: string | null;
  items: {
    id: string;
    keywordId: string;
    keyword: string;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    attempts: number;
    error: string | null;
  }[];
  createdAt: string;
  completedAt: string | null;
}

const TERMINAL = new Set<PositionTrackingRunView["status"]>([
  "completed",
  "partial",
  "failed",
  "cancelled",
]);

export function PositionTrackingRunProgress({
  runId,
  canProcess,
  onFinished,
}: {
  runId: string;
  canProcess: boolean;
  onFinished?: (run: PositionTrackingRunView) => void | Promise<void>;
}) {
  const [run, setRun] = useState<PositionTrackingRunView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const processingRef = useRef(false);
  const finishedRunRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.get<PositionTrackingRunView>(
        `/api/position-tracking/runs/${encodeURIComponent(runId)}/`,
      );
      setRun(response.data);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ClientApiError ? caught.message : "실행 상태를 불러오지 못했습니다.");
    }
  }, [runId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!run || !TERMINAL.has(run.status) || finishedRunRef.current === run.id) return;
    finishedRunRef.current = run.id;
    void onFinished?.(run);
  }, [onFinished, run]);

  useEffect(() => {
    if (!run || !canProcess || TERMINAL.has(run.status) || processingRef.current || error) return;
    processingRef.current = true;
    void api
      .post<PositionTrackingRunView>(
        `/api/position-tracking/runs/${encodeURIComponent(run.id)}/process/`,
      )
      .then((response) => {
        processingRef.current = false;
        setRun(response.data);
        setError(null);
      })
      .catch((caught) => {
        processingRef.current = false;
        setError(caught instanceof ClientApiError ? caught.message : "다음 키워드를 수집하지 못했습니다.");
      });
  }, [canProcess, error, run]);

  const retryFailed = async () => {
    if (!run || retrying) return;
    setRetrying(true);
    setError(null);
    try {
      const response = await api.post<PositionTrackingRunView>(
        `/api/position-tracking/runs/${encodeURIComponent(run.id)}/retry/`,
      );
      finishedRunRef.current = null;
      setRun(response.data);
    } catch (caught) {
      setError(caught instanceof ClientApiError ? caught.message : "실패 항목을 재시도하지 못했습니다.");
    } finally {
      setRetrying(false);
    }
  };

  const cancelRun = async () => {
    if (!run || cancelling) return;
    setCancelling(true);
    setError(null);
    try {
      const response = await api.post<PositionTrackingRunView>(
        `/api/position-tracking/runs/${encodeURIComponent(run.id)}/cancel/`,
      );
      setRun(response.data);
    } catch (caught) {
      setError(caught instanceof ClientApiError ? caught.message : "실행을 취소하지 못했습니다.");
    } finally {
      setCancelling(false);
    }
  };

  const processed = run?.processed ?? 0;
  const total = run?.total ?? 0;
  const progress = total > 0 ? Math.round((processed / total) * 100) : 0;
  const isRunning = Boolean(run && !TERMINAL.has(run.status));
  const currentKeyword = run?.currentKeyword
    ?? run?.items.find((item) => item.status === "running" || item.status === "queued")?.keyword
    ?? null;

  return (
    <section
      aria-live="polite"
      aria-busy={isRunning}
      className="mb-5 overflow-hidden rounded-[12px] border border-[#d9dcf8] bg-[linear-gradient(135deg,#f7f7ff_0%,#fff_55%,#f1f7ff_100%)] p-5 shadow-sm sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            {isRunning ? (
              <ReloadIcon className="h-5 w-5 animate-spin text-[#5753c9]" aria-hidden="true" />
            ) : run?.status === "completed" ? (
              <CheckCircledIcon className="h-5 w-5 text-[#0a8a61]" aria-hidden="true" />
            ) : (
              <CrossCircledIcon className="h-5 w-5 text-[#bd2649]" aria-hidden="true" />
            )}
            <h2 className="text-[18px] font-semibold text-app-text">
              {isRunning ? "검색 포지션을 수집하고 있습니다" : run?.status === "completed" ? "수집이 완료되었습니다" : "수집이 부분 완료되었습니다"}
            </h2>
          </div>
          <p className="mt-2 text-[13px] leading-[20px] text-app-text-secondary">
            {isRunning
              ? "이 페이지가 열려 있는 동안 한 건씩 안전하게 처리합니다. 새로고침하거나 브라우저를 다시 열어도 이어서 진행됩니다."
              : "완료된 결과는 키워드 표와 가시성 위젯에 반영됩니다."}
          </p>
        </div>
        <strong className="text-[26px] font-semibold tabular-nums text-[#5753c9]">
          {processed}/{total}
        </strong>
      </div>

      <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-[#dfe1e9]">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            run?.status === "completed" ? "bg-[#0a8a61]" : "bg-[#625ee8]",
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[8px] bg-white/75 px-3 py-2">
          <span className="block text-[11px] text-app-text-secondary">성공</span>
          <strong className="text-[17px] text-[#0a8a61]">{run?.succeeded ?? 0}</strong>
        </div>
        <div className="rounded-[8px] bg-white/75 px-3 py-2">
          <span className="block text-[11px] text-app-text-secondary">실패</span>
          <strong className="text-[17px] text-[#bd2649]">{run?.failed ?? 0}</strong>
        </div>
        <div className="min-w-0 rounded-[8px] bg-white/75 px-3 py-2">
          <span className="block text-[11px] text-app-text-secondary">현재 키워드</span>
          <strong className="block truncate text-[14px] text-app-text">{currentKeyword ?? "—"}</strong>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#f5c2cd] bg-[#fff4f6] px-3 py-2 text-[12px] text-[#a4002a]" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => { setError(null); void load(); }} className="font-semibold underline">다시 연결</button>
        </div>
      )}

      {isRunning && canProcess && (
        <button
          type="button"
          onClick={() => void cancelRun()}
          disabled={cancelling}
          className="mt-4 h-9 rounded-[7px] border border-app-border bg-white px-4 text-[12px] font-medium text-app-text-secondary hover:text-app-red disabled:opacity-50"
        >
          {cancelling ? "취소 중…" : "수집 취소"}
        </button>
      )}

      {run && TERMINAL.has(run.status) && run.failed > 0 && canProcess && (
        <button
          type="button"
          onClick={() => void retryFailed()}
          disabled={retrying}
          className="mt-4 h-9 rounded-[7px] bg-[#17181c] px-4 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {retrying ? "재시도 준비 중…" : `실패한 ${run.failed}개만 다시 수집`}
        </button>
      )}
    </section>
  );
}
