// @TASK NAVER-KI-BLOG-UI-01 - 선택 키워드 블로그 검색 보강 패널
// @SPEC user-approved-plan#3-d-authenticated-features
// @TEST src/components/analytics/naver-keywords/BlogEnrichmentPanel.test.tsx
"use client";

import {
  MAX_BLOG_ENRICHMENT_KEYWORDS,
  selectBlogEnrichmentKeywords,
  type BlogEnrichmentResultView,
  type BlogEnrichmentView,
} from "@/components/analytics/naver-keywords/blog-enrichment-model";

export type BlogEnrichmentPanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; report: BlogEnrichmentView }
  | { status: "error"; message: string };

interface BlogEnrichmentPanelProps {
  selectedKeywords: readonly string[];
  state: BlogEnrichmentPanelState;
  onRequest: () => void;
}

const STATUS_LABELS = {
  live: "정상 (live)",
  unavailable: "사용 불가 (unavailable)",
  error: "오류 (error)",
} as const;

const STATUS_CLASSES = {
  live: "bg-[#e7f6f1] text-[#08765c]",
  unavailable: "bg-[#fff5dc] text-[#8a5a00]",
  error: "bg-[#fdecef] text-[#a4002a]",
} as const;

function formatFetchedAt(value: string): string {
  return value ? value.replace("T", " ").slice(0, 16) : "미제공";
}

function BlogEnrichmentResultCard({
  result,
  index,
}: {
  result: BlogEnrichmentResultView;
  index: number;
}) {
  const titleId = `naver-blog-enrichment-keyword-${index}`;
  return (
    <article className="h-full rounded-[8px] border border-bebe bg-white p-4" aria-labelledby={titleId}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={titleId} className="break-words text-[14px] font-semibold text-hof">
          {result.keyword}
        </h3>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${STATUS_CLASSES[result.status]}`}>
          {STATUS_LABELS[result.status]}
        </span>
      </header>

      <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-foggy">블로그 검색 응답 total</dt>
          <dd className="mt-1 font-semibold tabular-nums text-hof">
            {result.total === null ? "미제공" : result.total.toLocaleString("ko-KR")}
          </dd>
        </div>
        <div>
          <dt className="text-foggy">상태</dt>
          <dd className="mt-1 font-medium text-hof">{STATUS_LABELS[result.status]}</dd>
        </div>
        <div>
          <dt className="text-foggy">캐시</dt>
          <dd className="mt-1 font-medium text-hof">{result.cache === "stale" ? "오래된 캐시" : "신선한 캐시"}</dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-1">
          <dt className="text-foggy">출처</dt>
          <dd className="mt-1 break-all font-medium text-hof">{result.source || "미제공"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-foggy">수집 시각</dt>
          <dd className="mt-1 font-medium tabular-nums text-hof">{formatFetchedAt(result.fetchedAt)}</dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="text-foggy">사유</dt>
          <dd className="mt-1 break-words leading-5 text-hof">{result.reason || "미제공"}</dd>
        </div>
      </dl>
    </article>
  );
}

export function BlogEnrichmentPanel({
  selectedKeywords,
  state,
  onRequest,
}: BlogEnrichmentPanelProps) {
  const requestKeywords = selectBlogEnrichmentKeywords(selectedKeywords);
  const overLimit = selectedKeywords.length > MAX_BLOG_ENRICHMENT_KEYWORDS;
  const disabled = requestKeywords.length === 0 || state.status === "loading";

  return (
    <section className="mt-4 rounded-[12px] border border-bebe bg-faint/60 p-4 sm:p-5" aria-labelledby="naver-blog-enrichment-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-rausch">Optional enrichment</p>
          <h2 id="naver-blog-enrichment-title" className="mt-1 text-[17px] font-semibold text-hof">
            선택 키워드 블로그 검색 보강
          </h2>
          <p id="naver-blog-enrichment-description" className="mt-2 text-[12px] leading-5 text-foggy">
            네이버 블로그 검색 API 응답 예시/통합검색 순위 아님
          </p>
          <p className="mt-1 text-[11px] leading-5 text-foggy">
            CSV 다운로드와 별개인 명시적 조회입니다. 선택된 키워드만 한 번에 최대 {MAX_BLOG_ENRICHMENT_KEYWORDS}개까지 요청합니다.
          </p>
          <p className="mt-2 text-[11px] font-medium text-hof" aria-live="polite">
            {selectedKeywords.length === 0
              ? "표에서 보강할 키워드를 선택하세요."
              : overLimit
                ? `선택 ${selectedKeywords.length}개 중 앞 ${MAX_BLOG_ENRICHMENT_KEYWORDS}개를 요청합니다.`
                : `선택 ${selectedKeywords.length}개를 요청합니다.`}
          </p>
        </div>

        <button
          type="button"
          onClick={onRequest}
          disabled={disabled}
          aria-busy={state.status === "loading"}
          aria-describedby="naver-blog-enrichment-description"
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-[8px] bg-hof px-4 text-[12px] font-semibold text-white transition hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rausch disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state.status === "loading" ? "블로그 검색 조회 중…" : "선택 키워드 블로그 검색 보강"}
        </button>
      </div>

      {state.status === "loading" && (
        <div className="mt-4 rounded-[8px] border border-bebe bg-white px-4 py-3 text-[12px] text-foggy" role="status" aria-live="polite">
          블로그 검색 응답을 조회하고 있습니다.
        </div>
      )}

      {state.status === "error" && (
        <div className="mt-4 rounded-[8px] border border-[#f3bdc9] bg-[#fff7f8] px-4 py-3" role="alert">
          <p className="text-[12px] font-semibold text-[#9d1537]">블로그 검색 보강을 완료하지 못했습니다</p>
          <p className="mt-1 text-[11px] leading-5 text-[#7a3042]">{state.message}</p>
        </div>
      )}

      {state.status === "success" && (
        <div className="mt-4" role="status" aria-live="polite" aria-atomic="false">
          <p className="mb-3 text-[11px] text-foggy">
            {state.report.results.length}개 키워드 응답 · 생성 {formatFetchedAt(state.report.generatedAt)}
          </p>
          {state.report.results.length === 0 ? (
            <p className="rounded-[8px] border border-dashed border-bebe bg-white px-4 py-6 text-center text-[12px] text-foggy">
              반환된 키워드별 응답이 없습니다.
            </p>
          ) : (
            <ul className="grid gap-3 xl:grid-cols-2">
              {state.report.results.map((result, index) => (
                <li key={`${result.keyword}-${index}`}>
                  <BlogEnrichmentResultCard result={result} index={index} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
