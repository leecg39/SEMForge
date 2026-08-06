// @TASK NAVER-P0-EXPLORER - NAVER 공식 데이터 기반 키워드 탐색기
// @SPEC user-approved-plan#3-d-authenticated-features
// @TEST src/components/analytics/naver-keywords/model.test.ts
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeywordResults } from "@/components/analytics/naver-keywords/KeywordResults";
import { SeedForm } from "@/components/analytics/naver-keywords/SeedForm";
import {
  MAX_ACTION_KEYWORDS,
  MAX_SELECTED_ROWS,
  buildActionHref,
  exactKeywordVolume,
  normalizeExplorePayload,
  normalizeSeeds,
} from "@/components/analytics/naver-keywords/model";
import type {
  ApiErrorEnvelope,
  KeywordListOption,
  NaverKeywordExploreView,
  NaverKeywordRow,
} from "@/components/analytics/naver-keywords/types";

interface NaverKeywordExplorerProps {
  initialSeeds?: readonly string[];
}

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "success"; saved: number; skipped: number }
  | { status: "error"; message: string };

function apiErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null) return fallback;
  const envelope = payload as ApiErrorEnvelope;
  return envelope.error?.message || fallback;
}

function hasExploreEnvelope(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  const data = (payload as { data?: unknown }).data;
  return typeof data === "object" && data !== null && "keywords" in data;
}

function LoadingState() {
  return (
    <div className="mt-5 rounded-[12px] border border-bebe bg-white p-5" role="status" aria-live="polite">
      <span className="sr-only">네이버 공식 데이터를 조회하고 있습니다</span>
      <div className="h-5 w-44 animate-pulse rounded-[4px] bg-bebe" />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-20 animate-pulse rounded-[8px] bg-faint" />
        ))}
      </div>
      <div className="mt-5 h-56 animate-pulse rounded-[8px] bg-faint" />
    </div>
  );
}

function InitialState() {
  return (
    <section className="mt-5 overflow-hidden rounded-[12px] border border-bebe bg-white">
      <div className="grid gap-0 md:grid-cols-[1.1fr_0.9fr]">
        <div className="p-6 sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rausch">Official data first</p>
          <h2 className="mt-2 max-w-xl text-[20px] font-semibold tracking-[-0.02em] text-hof sm:text-[24px]">
            검색량에서 바로 콘텐츠와 광고 실행으로 이동하세요
          </h2>
          <p className="mt-3 max-w-xl text-[13px] leading-6 text-foggy">
            최대 5개의 seed를 입력하면 NAVER Search Ads 연관어를 한 번에 비교합니다. 범위값과 미제공 값은 그대로 보존합니다.
          </p>
        </div>
        <ol className="grid gap-px bg-bebe sm:grid-cols-3 md:grid-cols-1">
          {[
            ["01", "공식 통계", "PC·모바일 검색량과 광고 경쟁도"],
            ["02", "빠른 선별", "검색·필터·50개 페이지·CSV"],
            ["03", "실행 연결", "키워드 목록·브리프·광고 초안"],
          ].map(([number, title, body]) => (
            <li key={number} className="bg-faint px-5 py-4">
              <span className="text-[10px] font-semibold text-rausch">{number}</span>
              <strong className="ml-3 text-[13px] text-hof">{title}</strong>
              <span className="mt-1 block pl-8 text-[11px] leading-5 text-foggy">{body}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function UnavailableState({ report }: { report: NaverKeywordExploreView }) {
  const unavailable = report.provenance.status === "unavailable";
  return (
    <section className="mt-5 rounded-[12px] border border-dashed border-bebe bg-white p-6" role="status">
      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${unavailable ? "bg-[#fff5dc] text-[#8a5a00]" : "bg-[#fdecef] text-[#a4002a]"}`}>
        {unavailable ? "공급자 연결 필요" : "공급자 오류"}
      </span>
      <h2 className="mt-3 text-[18px] font-semibold text-hof">NAVER 키워드 통계를 사용할 수 없습니다</h2>
      <p className="mt-2 max-w-2xl text-[13px] leading-6 text-foggy">
        {report.provenance.reason || "연결 상태를 확인한 뒤 다시 시도해 주세요."}
      </p>
      <p className="mt-3 text-[11px] text-foggy">가짜 검색량이나 임의의 경쟁도는 표시하지 않았습니다.</p>
    </section>
  );
}

export function NaverKeywordExplorer({ initialSeeds = [] }: NaverKeywordExplorerProps) {
  const safeInitialSeeds = useMemo(() => {
    try {
      return initialSeeds.length ? normalizeSeeds(initialSeeds) : [];
    } catch {
      return [];
    }
  }, [initialSeeds]);
  const [seeds, setSeeds] = useState<string[]>(safeInitialSeeds);
  const [report, setReport] = useState<NaverKeywordExploreView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [keywordLists, setKeywordLists] = useState<KeywordListOption[]>([]);
  const [listId, setListId] = useState("");
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const exploreControllerRef = useRef<AbortController | null>(null);
  const autoRanRef = useRef(false);

  const loadKeywordLists = useCallback(async () => {
    setListsLoading(true);
    setListsError(null);
    try {
      const response = await fetch("/api/keyword-lists/?page=1&pageSize=100&sort=name:asc", {
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json()) as { data?: unknown } & ApiErrorEnvelope;
      if (!response.ok || !Array.isArray(payload.data)) {
        throw new Error(apiErrorMessage(payload, "키워드 목록을 불러오지 못했습니다."));
      }
      const options = payload.data
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
        .filter((item) => typeof item.id === "string" && typeof item.name === "string")
        .map((item) => ({
          id: item.id as string,
          name: item.name as string,
          ...(typeof item.mode === "string" ? { mode: item.mode } : {}),
          ...(typeof item.database === "string" ? { database: item.database } : {}),
          ...(typeof item.status === "string" ? { status: item.status } : {}),
        }));
      setKeywordLists(options);
      setListId((current) => current || options[0]?.id || "");
    } catch (caught) {
      setListsError(caught instanceof Error ? caught.message : "키워드 목록을 불러오지 못했습니다.");
    } finally {
      setListsLoading(false);
    }
  }, []);

  const runExplore = useCallback(async (nextSeeds: string[]) => {
    exploreControllerRef.current?.abort();
    const controller = new AbortController();
    exploreControllerRef.current = controller;
    setLoading(true);
    setError(null);
    setSaveState({ status: "idle" });
    setSelectionNotice(null);
    try {
      const normalized = normalizeSeeds(nextSeeds);
      const response = await fetch("/api/analytics/naver-keywords/explore/", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ seeds: normalized }),
      });
      const payload = (await response.json()) as unknown;
      if (!response.ok && !hasExploreEnvelope(payload)) {
        throw new Error(apiErrorMessage(payload, `키워드를 조회하지 못했습니다. (HTTP ${response.status})`));
      }
      const nextReport = normalizeExplorePayload(payload);
      setSeeds(nextReport.seeds.length ? nextReport.seeds : normalized);
      setReport(nextReport);
      setSelectedKeywords(new Set());
      if (nextReport.provenance.status === "live") void loadKeywordLists();
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "키워드를 조회하지 못했습니다.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [loadKeywordLists]);

  useEffect(() => () => exploreControllerRef.current?.abort(), []);

  useEffect(() => {
    if (autoRanRef.current || safeInitialSeeds.length === 0) return;
    autoRanRef.current = true;
    void runExplore(safeInitialSeeds);
  }, [runExplore, safeInitialSeeds]);

  const toggleKeyword = (keyword: string, checked: boolean) => {
    if (checked && !selectedKeywords.has(keyword) && selectedKeywords.size >= MAX_SELECTED_ROWS) {
      setSelectionNotice(`한 번에 최대 ${MAX_SELECTED_ROWS}개까지 저장할 수 있습니다.`);
      return;
    }
    setSelectedKeywords((current) => {
      const next = new Set(current);
      if (!checked) {
        next.delete(keyword);
        return next;
      }
      next.add(keyword);
      return next;
    });
    setSelectionNotice(null);
    setSaveState({ status: "idle" });
  };

  const togglePage = (rows: readonly NaverKeywordRow[], checked: boolean) => {
    const unselected = rows.filter((row) => !selectedKeywords.has(row.keyword));
    const available = Math.max(0, MAX_SELECTED_ROWS - selectedKeywords.size);
    setSelectionNotice(
      checked && unselected.length > available
        ? `한 번에 최대 ${MAX_SELECTED_ROWS}개까지 저장할 수 있습니다.`
        : null,
    );
    setSelectedKeywords((current) => {
      const next = new Set(current);
      if (!checked) {
        rows.forEach((row) => next.delete(row.keyword));
        return next;
      }
      for (const row of rows) {
        if (next.size >= MAX_SELECTED_ROWS) break;
        next.add(row.keyword);
      }
      return next;
    });
    setSaveState({ status: "idle" });
  };

  const selectedRows = useMemo(
    () => report?.rows.filter((row) => selectedKeywords.has(row.keyword)) ?? [],
    [report, selectedKeywords],
  );
  const selectedNames = selectedRows.map((row) => row.keyword);
  const actionNames = selectedNames.slice(0, MAX_ACTION_KEYWORDS);
  const actionContext = report
    ? {
        naverSource: report.provenance.source,
        naverFetchedAt: report.provenance.fetchedAt,
        measurement: report.provenance.measurement,
        intents: selectedRows.slice(0, MAX_ACTION_KEYWORDS).map((row) => row.intent),
      }
    : undefined;

  const saveSelected = async () => {
    if (!listId || selectedRows.length === 0 || saveState.status === "saving") return;
    setSaveState({ status: "saving" });
    try {
      const response = await fetch("/api/analytics/naver-keywords/save/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          listId,
          items: selectedRows.slice(0, MAX_SELECTED_ROWS).map((row) => {
            const volume = exactKeywordVolume(row.monthlyTotalQueries);
            return {
              keyword: row.keyword,
              ...(row.snapshotId ? { snapshotId: row.snapshotId } : {}),
              ...(volume !== null ? { volume } : {}),
              intent: row.intent,
            };
          }),
        }),
      });
      const payload = (await response.json()) as {
        data?: { saved?: unknown; skipped?: unknown };
      } & ApiErrorEnvelope;
      if (!response.ok || typeof payload.data?.saved !== "number" || typeof payload.data.skipped !== "number") {
        throw new Error(apiErrorMessage(payload, "키워드를 저장하지 못했습니다."));
      }
      setSaveState({ status: "success", saved: payload.data.saved, skipped: payload.data.skipped });
    } catch (caught) {
      setSaveState({
        status: "error",
        message: caught instanceof Error ? caught.message : "키워드를 저장하지 못했습니다.",
      });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1560px] px-4 py-5 sm:px-6 sm:py-7">
      <header className="max-w-4xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rausch">NAVER keyword intelligence</p>
        <h1 className="mt-2 text-[24px] font-semibold leading-tight tracking-[-0.03em] text-hof sm:text-[30px]">
          한국형 키워드 탐색기
        </h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-foggy">
          NAVER Search Ads의 월간 검색량과 광고 경쟁도를 비교하고, 선택한 키워드를 콘텐츠 브리프와 광고 리서치로 연결합니다.
        </p>
      </header>

      <SeedForm seeds={seeds} loading={loading} onSeedsChange={setSeeds} onSubmit={(next) => void runExplore(next)} />

      {error && (
        <div className="mt-4 rounded-[8px] border border-[#f3bdc9] bg-[#fff7f8] px-4 py-3" role="alert">
          <p className="text-[13px] font-semibold text-[#9d1537]">조회하지 못했습니다</p>
          <p className="mt-1 text-[12px] leading-5 text-[#7a3042]">{error}</p>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : report?.provenance.status === "live" ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[8px] border border-bebe bg-white px-4 py-3 text-[11px] text-foggy" aria-label="데이터 출처">
            <span className="rounded-full bg-[#e7f6f1] px-2.5 py-1 font-semibold text-[#08765c]">공식 데이터</span>
            <span className="font-medium text-hof">NAVER Search Ads</span>
            <span>· {report.provenance.measurement === "absolute" ? "절대 검색량" : report.provenance.measurement}</span>
            <span>· {report.provenance.cache === "stale" ? "오래된 캐시" : "신선한 캐시"}</span>
            <span>· 수집 {report.provenance.fetchedAt ? report.provenance.fetchedAt.replace("T", " ").slice(0, 16) : "시각 미제공"}</span>
          </div>

          <KeywordResults
            report={report}
            selectedKeywords={selectedKeywords}
            onToggleKeyword={toggleKeyword}
            onTogglePage={togglePage}
          />

          <section className="sticky bottom-3 z-20 mt-4 rounded-[12px] border border-hof bg-white p-3 shadow-[0_8px_24px_rgba(0,0,0,0.12)] sm:p-4" aria-label="선택 키워드 다음 작업">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-hof">선택 {selectedRows.length}개</p>
                <p className="mt-1 truncate text-[11px] text-foggy">
                  {selectedNames.length ? selectedNames.slice(0, 5).join(" · ") : "표에서 실행할 키워드를 선택하세요."}
                </p>
                {selectionNotice && <p className="mt-1 text-[11px] font-medium text-rausch-600" role="status">{selectionNotice}</p>}
                {selectedRows.length > MAX_ACTION_KEYWORDS && (
                  <p className="mt-1 text-[11px] text-foggy">콘텐츠·광고 링크에는 앞 {MAX_ACTION_KEYWORDS}개만 전달하며, 목록 저장은 최대 100개를 처리합니다.</p>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
                <label className="min-w-0 sm:w-[210px]">
                  <span className="sr-only">저장할 키워드 목록</span>
                  <select
                    value={listId}
                    onChange={(event) => {
                      setListId(event.target.value);
                      setSaveState({ status: "idle" });
                    }}
                    disabled={listsLoading || keywordLists.length === 0}
                    className="h-11 w-full rounded-[8px] border border-bebe bg-white px-3 text-[12px] text-hof outline-none focus:border-hof focus:ring-2 focus:ring-black/10 disabled:bg-faint"
                  >
                    {listsLoading ? <option>목록 불러오는 중…</option> : keywordLists.length === 0 ? <option>저장할 목록 없음</option> : keywordLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => void saveSelected()}
                  disabled={selectedRows.length === 0 || !listId || saveState.status === "saving"}
                  aria-busy={saveState.status === "saving"}
                  className="h-11 rounded-[8px] bg-hof px-4 text-[12px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saveState.status === "saving" ? "저장 중…" : "키워드 목록에 저장"}
                </button>
                {selectedRows.length ? (
                  <>
                    <Link href={buildActionHref("content", actionNames, actionContext)} className="inline-flex h-11 items-center justify-center rounded-[8px] border border-hof bg-white px-4 text-[12px] font-semibold text-hof transition hover:bg-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rausch">
                      콘텐츠 브리프
                    </Link>
                    <Link href={buildActionHref("advertising", actionNames, actionContext)} className="inline-flex h-11 items-center justify-center rounded-[8px] border border-hof bg-white px-4 text-[12px] font-semibold text-hof transition hover:bg-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rausch">
                      광고 리서치 초안
                    </Link>
                  </>
                ) : (
                  <>
                    <button type="button" disabled className="h-11 rounded-[8px] border border-bebe px-4 text-[12px] font-semibold text-foggy opacity-50">콘텐츠 브리프</button>
                    <button type="button" disabled className="h-11 rounded-[8px] border border-bebe px-4 text-[12px] font-semibold text-foggy opacity-50">광고 리서치 초안</button>
                  </>
                )}
              </div>
            </div>
            <div className="mt-2 min-h-5 text-[11px]" aria-live="polite">
              {listsError && <span className="text-rausch-600">{listsError} <Link href="/app/keyword-lists/" className="font-semibold underline">목록 관리</Link></span>}
              {!listsError && keywordLists.length === 0 && !listsLoading && <span className="text-foggy">먼저 <Link href="/app/keyword-lists/" className="font-semibold text-hof underline">키워드 목록을 생성</Link>하세요.</span>}
              {saveState.status === "success" && <span className="font-medium text-[#08765c]">{saveState.saved}개 저장 · {saveState.skipped}개 중복 건너뜀</span>}
              {saveState.status === "error" && <span className="text-rausch-600">{saveState.message}</span>}
            </div>
          </section>
        </>
      ) : report ? (
        <UnavailableState report={report} />
      ) : (
        <InitialState />
      )}

      <footer className="mt-6 border-t border-bebe pt-4 text-[11px] leading-5 text-foggy">
        광고 경쟁도는 자연검색 난이도가 아닙니다. 검색 의도는 키워드 패턴 기반 <code className="font-mono text-hof">clone-intent-v1</code> 추론이며, 자동 게시나 캠페인 생성은 실행하지 않습니다.
      </footer>
    </div>
  );
}
