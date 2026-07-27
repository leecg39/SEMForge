import type { AnalysisPageData } from "@/types/app";
import { DataTable, FilterBar, MetricCard, TrendChart } from "@/components/app/app-primitives";
import { cn } from "@/lib/utils";

/**
 * APP-ANALYSIS 템플릿: 도메인/키워드/트래픽 분석 보고서 본문.
 * AppShell <main> 내부 콘텐츠만 렌더 — 라우트에서 AppShell로 감쌀 것.
 */
export function AppAnalysisTemplate({ data }: { data: AnalysisPageData }) {
  return (
    <div className="p-6">
      {/* 1. 헤더행: 도구명/설명 + Export to PDF */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold leading-[28px] text-app-text">
            {data.toolName}
          </h1>
          <p className="mt-0.5 text-[13px] leading-[18px] text-app-text-secondary">
            {data.toolDescription}
          </p>
        </div>
        <button
          type="button"
          className="flex h-[36px] shrink-0 items-center rounded-[6px] border border-app-border bg-white px-4 text-[13px] font-medium text-app-text transition-colors hover:bg-app-bg"
        >
          Export to PDF
        </button>
      </div>

      {/* 2. 밑줄 탭 바 (첫 탭 활성) */}
      {data.tabs && data.tabs.length > 0 && (
        <div className="mt-4 flex gap-1 overflow-x-auto border-b border-app-border">
          {data.tabs.map((tab, index) => (
            <button
              key={tab}
              type="button"
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] transition-colors",
                index === 0
                  ? "border-app-blue font-medium text-app-text"
                  : "border-transparent text-app-text-secondary hover:text-app-text"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* 3. 대상 + 필터 */}
      <div className="mt-4">
        <FilterBar
          entityLabel={data.entityLabel}
          entityValue={data.entityValue}
          filters={data.filters}
        />
      </div>

      {/* 4. KPI 그리드 (반응형 2~5열) */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {data.kpis.map((kpi) => (
          <MetricCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {/* 5. 추이 차트 */}
      <div className="mt-4">
        <TrendChart
          title={data.chartTitle}
          type={data.chartType}
          series={data.series}
          legend={data.seriesLegend}
        />
      </div>

      {/* 6. 테이블 섹션 */}
      <section className="mt-6">
        <h2 className="mb-2 text-[14px] font-semibold leading-[20px] text-app-text">
          {data.tableTitle}
        </h2>
        <DataTable columns={data.columns} rows={data.rows} />
      </section>
    </div>
  );
}
