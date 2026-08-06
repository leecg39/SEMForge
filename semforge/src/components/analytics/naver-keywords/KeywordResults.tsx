// @TASK NAVER-P0-EXPLORER - 반응형 키워드 결과 표·카드·필터·CSV
// @SPEC user-approved-plan#3-d-authenticated-features
// @TEST src/components/analytics/naver-keywords/KeywordResults.test.tsx
"use client";

import { useMemo, useState } from "react";
import {
  INTENT_LABELS,
  buildKeywordCsv,
  filterKeywordRows,
  paginateKeywordRows,
} from "@/components/analytics/naver-keywords/model";
import type {
  KeywordFilters,
  NaverKeywordCount,
  NaverKeywordExploreView,
  NaverKeywordRow,
} from "@/components/analytics/naver-keywords/types";

interface KeywordResultsProps {
  report: NaverKeywordExploreView;
  selectedKeywords: ReadonlySet<string>;
  onToggleKeyword: (keyword: string, checked: boolean) => void;
  onTogglePage: (rows: readonly NaverKeywordRow[], checked: boolean) => void;
}

const DEFAULT_FILTERS: KeywordFilters = {
  query: "",
  competition: "all",
  intent: "all",
};

const COMPETITION_LABELS = {
  low: "낮음",
  medium: "중간",
  high: "높음",
} as const;

function displayCount(count: NaverKeywordCount | null) {
  if (!count) return <span className="text-grey-500">미제공</span>;
  return (
    <span title={count.relation === "exact" ? "절대 검색량" : "공급자 범위값"}>
      {count.display}
    </span>
  );
}

function displayDecimal(value: number | null, suffix = "") {
  if (value === null) return <span className="text-grey-500">—</span>;
  return <>{new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value)}{suffix}</>;
}

function CompetitionBadge({ row }: { row: NaverKeywordRow }) {
  if (!row.competition) return <span className="text-[11px] text-grey-500">미제공</span>;
  const classes = {
    low: "bg-[#e7f6f1] text-[#08765c]",
    medium: "bg-[#fff5dc] text-[#8a5a00]",
    high: "bg-[#fdecef] text-[#a4002a]",
  } as const;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${classes[row.competition]}`}>
      {row.competitionLabel ?? COMPETITION_LABELS[row.competition]}
    </span>
  );
}

function IntentBadge({ row }: { row: NaverKeywordRow }) {
  return (
    <span
      className="inline-flex rounded-full border border-bebe bg-faint px-2.5 py-1 text-[11px] font-medium text-hof"
      title="키워드 패턴 기반 clone-intent-v1 추론값"
    >
      {INTENT_LABELS[row.intent]} · 추론
    </span>
  );
}

function SourceCell({ row }: { row: NaverKeywordRow }) {
  return (
    <div className="min-w-[132px] text-[11px] leading-5">
      <span className="font-medium text-hof">NAVER Search Ads</span>
      <span className="block text-foggy">
        {row.cache === "stale" ? "오래된 캐시" : "캐시됨"} · {row.fetchedAt ? row.fetchedAt.replace("T", " ").slice(0, 16) : "시각 미제공"}
      </span>
    </div>
  );
}

function downloadCsv(rows: readonly NaverKeywordRow[]) {
  const blob = new Blob([buildKeywordCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `naver-keywords-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function KeywordResults({
  report,
  selectedKeywords,
  onToggleKeyword,
  onTogglePage,
}: KeywordResultsProps) {
  const [filters, setFilters] = useState<KeywordFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const filteredRows = useMemo(
    () => filterKeywordRows(report.rows, filters),
    [filters, report.rows],
  );
  const pagination = paginateKeywordRows(filteredRows, page);
  const firstVisible = filteredRows.length === 0 ? 0 : (pagination.page - 1) * 50 + 1;
  const currentPageSelected = pagination.rows.filter((row) => selectedKeywords.has(row.keyword)).length;
  const allCurrentPageSelected = pagination.rows.length > 0 && currentPageSelected === pagination.rows.length;

  const updateFilter = <Key extends keyof KeywordFilters>(key: Key, value: KeywordFilters[Key]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  if (report.rows.length === 0) {
    return (
      <section className="mt-5 rounded-[12px] border border-dashed border-bebe bg-white px-5 py-12 text-center" aria-live="polite">
        <h2 className="text-[17px] font-semibold text-hof">연관 키워드가 없습니다</h2>
        <p className="mx-auto mt-2 max-w-xl text-[13px] leading-6 text-foggy">
          공식 공급자가 이 seed에 대한 연관 통계를 반환하지 않았습니다. 다른 표현이나 더 넓은 seed로 다시 조회해 보세요.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-5" aria-labelledby="naver-keyword-results-title">
      <div className="rounded-[12px] border border-bebe bg-white">
        <header className="border-b border-bebe p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="naver-keyword-results-title" className="text-[17px] font-semibold text-hof">
                연관 키워드 {report.total.toLocaleString("ko-KR")}개
              </h2>
              <p className="mt-1 text-[11px] leading-5 text-foggy">
                검색량 하한값 내림차순 · 동률은 가나다순 · 화면당 50개
              </p>
            </div>
            <button
              type="button"
              onClick={() => downloadCsv(filteredRows)}
              disabled={filteredRows.length === 0}
              className="inline-flex h-11 items-center justify-center rounded-[8px] border border-hof bg-white px-4 text-[13px] font-semibold text-hof transition hover:bg-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rausch disabled:opacity-40"
            >
              현재 결과 CSV
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="결과 필터">
            <label>
              <span className="sr-only">결과 내 키워드 검색</span>
              <input
                type="search"
                value={filters.query}
                onChange={(event) => updateFilter("query", event.target.value)}
                placeholder="결과 내 검색"
                className="h-11 w-full rounded-[8px] border border-bebe bg-white px-3 text-[16px] text-hof outline-none transition focus:border-hof focus:ring-2 focus:ring-black/10 sm:text-[13px]"
              />
            </label>
            <label>
              <span className="sr-only">광고 경쟁도 필터</span>
              <select
                value={filters.competition}
                onChange={(event) => updateFilter("competition", event.target.value as KeywordFilters["competition"])}
                className="h-11 w-full rounded-[8px] border border-bebe bg-white px-3 text-[13px] text-hof outline-none focus:border-hof focus:ring-2 focus:ring-black/10"
              >
                <option value="all">모든 광고 경쟁도</option>
                <option value="low">낮음</option>
                <option value="medium">중간</option>
                <option value="high">높음</option>
                <option value="unavailable">미제공</option>
              </select>
            </label>
            <label>
              <span className="sr-only">추론 검색 의도 필터</span>
              <select
                value={filters.intent}
                onChange={(event) => updateFilter("intent", event.target.value as KeywordFilters["intent"])}
                className="h-11 w-full rounded-[8px] border border-bebe bg-white px-3 text-[13px] text-hof outline-none focus:border-hof focus:ring-2 focus:ring-black/10"
              >
                <option value="all">모든 추론 의도</option>
                <option value="informational">정보성</option>
                <option value="navigational">이동형</option>
                <option value="commercial">상업 조사</option>
                <option value="transactional">거래형</option>
              </select>
            </label>
          </div>
        </header>

        {filteredRows.length === 0 ? (
          <div className="px-5 py-12 text-center" role="status">
            <p className="text-[14px] font-medium text-hof">필터와 일치하는 키워드가 없습니다</p>
            <button
              type="button"
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setPage(1);
              }}
              className="mt-3 min-h-11 rounded-[8px] border border-bebe px-4 text-[13px] font-semibold text-hof hover:bg-faint"
            >
              필터 초기화
            </button>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1320px] border-collapse text-left">
                <caption className="sr-only">네이버 공식 데이터 기반 연관 키워드 결과</caption>
                <thead className="bg-faint">
                  <tr className="border-b border-bebe text-[11px] font-semibold text-foggy">
                    <th scope="col" className="w-12 px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={allCurrentPageSelected}
                        onChange={(event) => onTogglePage(pagination.rows, event.target.checked)}
                        aria-label={`현재 페이지 ${pagination.rows.length}개 모두 선택`}
                        className="h-4 w-4 accent-hof"
                      />
                    </th>
                    <th scope="col" className="min-w-[220px] px-3 py-3">키워드</th>
                    <th scope="col" className="px-3 py-3 text-right">PC 검색량</th>
                    <th scope="col" className="px-3 py-3 text-right">모바일 검색량</th>
                    <th scope="col" className="px-3 py-3 text-right">전체 검색량</th>
                    <th scope="col" className="px-3 py-3 text-right">평균 클릭<br /><span className="font-normal">PC / 모바일</span></th>
                    <th scope="col" className="px-3 py-3 text-right">평균 CTR<br /><span className="font-normal">PC / 모바일</span></th>
                    <th scope="col" className="px-3 py-3">광고 경쟁도</th>
                    <th scope="col" className="px-3 py-3">검색 의도</th>
                    <th scope="col" className="px-3 py-3">출처·신선도</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.rows.map((row) => (
                    <tr key={row.normalizedKeyword} className="border-b border-bebe align-middle text-[13px] text-hof transition hover:bg-faint/70">
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedKeywords.has(row.keyword)}
                          onChange={(event) => onToggleKeyword(row.keyword, event.target.checked)}
                          aria-label={`${row.keyword} 선택`}
                          className="h-4 w-4 accent-hof"
                        />
                      </td>
                      <th scope="row" className="px-3 py-3 font-semibold text-hof">{row.keyword}</th>
                      <td className="px-3 py-3 text-right tabular-nums">{displayCount(row.monthlyPcQueries)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{displayCount(row.monthlyMobileQueries)}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">{displayCount(row.monthlyTotalQueries)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{displayDecimal(row.monthlyAveragePcClicks)} / {displayDecimal(row.monthlyAverageMobileClicks)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{displayDecimal(row.monthlyAveragePcCtr, "%")} / {displayDecimal(row.monthlyAverageMobileCtr, "%")}</td>
                      <td className="px-3 py-3"><CompetitionBadge row={row} /></td>
                      <td className="px-3 py-3"><IntentBadge row={row} /></td>
                      <td className="px-3 py-3"><SourceCell row={row} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-bebe lg:hidden">
              <div className="flex min-h-12 items-center gap-3 px-4 py-2">
                <label className="flex min-h-11 items-center gap-3 text-[12px] font-medium text-hof">
                  <input
                    type="checkbox"
                    checked={allCurrentPageSelected}
                    onChange={(event) => onTogglePage(pagination.rows, event.target.checked)}
                    className="h-5 w-5 accent-hof"
                  />
                  현재 페이지 전체 선택
                </label>
              </div>
              {pagination.rows.map((row) => (
                <article key={row.normalizedKeyword} className="p-4">
                  <div className="flex items-start gap-3">
                    <label className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-bebe">
                      <input
                        type="checkbox"
                        checked={selectedKeywords.has(row.keyword)}
                        onChange={(event) => onToggleKeyword(row.keyword, event.target.checked)}
                        aria-label={`${row.keyword} 선택`}
                        className="h-5 w-5 accent-hof"
                      />
                    </label>
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-[15px] font-semibold text-hof">{row.keyword}</h3>
                      <div className="mt-2 flex flex-wrap gap-2"><IntentBadge row={row} /><CompetitionBadge row={row} /></div>
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-[8px] border border-bebe bg-bebe">
                    {[
                      ["PC", displayCount(row.monthlyPcQueries)],
                      ["모바일", displayCount(row.monthlyMobileQueries)],
                      ["전체", displayCount(row.monthlyTotalQueries)],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="bg-white p-3 text-center">
                        <dt className="text-[10px] text-foggy">{label}</dt>
                        <dd className="mt-1 text-[13px] font-semibold tabular-nums text-hof">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
                    <div><span className="block text-[10px] text-foggy">평균 클릭 · PC / 모바일</span><span className="mt-1 block tabular-nums text-hof">{displayDecimal(row.monthlyAveragePcClicks)} / {displayDecimal(row.monthlyAverageMobileClicks)}</span></div>
                    <div><span className="block text-[10px] text-foggy">평균 CTR · PC / 모바일</span><span className="mt-1 block tabular-nums text-hof">{displayDecimal(row.monthlyAveragePcCtr, "%")} / {displayDecimal(row.monthlyAverageMobileCtr, "%")}</span></div>
                  </div>
                  <div className="mt-4 border-t border-bebe pt-3"><SourceCell row={row} /></div>
                </article>
              ))}
            </div>
          </>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-bebe px-4 py-3 text-[12px] text-foggy">
          <span>{filteredRows.length.toLocaleString("ko-KR")}개 중 {firstVisible}–{Math.min(pagination.page * 50, filteredRows.length)} · 선택 {selectedKeywords.size}/100</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={pagination.page <= 1}
              className="h-11 rounded-[8px] border border-bebe bg-white px-4 font-medium text-hof hover:bg-faint disabled:opacity-40"
            >
              이전
            </button>
            <span className="min-w-16 text-center tabular-nums">{pagination.page}/{pagination.pageCount}</span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(pagination.pageCount, current + 1))}
              disabled={pagination.page >= pagination.pageCount}
              className="h-11 rounded-[8px] border border-bebe bg-white px-4 font-medium text-hof hover:bg-faint disabled:opacity-40"
            >
              다음
            </button>
          </div>
        </footer>
      </div>

      <aside className="mt-3 rounded-[8px] border border-dashed border-bebe bg-white px-4 py-3 text-[11px] leading-5 text-foggy">
        <strong className="text-hof">블로그 공급량 미제공</strong> · 이 탐색 API는 NAVER Search Ads 키워드 통계만 반환합니다. 블로그 문서 수나 통합검색 순위를 임의로 생성하지 않습니다.
      </aside>
    </section>
  );
}
