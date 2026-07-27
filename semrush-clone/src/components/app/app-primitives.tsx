"use client";

/**
 * 로그인 앱 분석 화면 공용 프리미티브.
 * recharts(TrendChart)가 클라이언트 전용이라 파일 전체를 client boundary로 둔다.
 */

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FilterDef, Kpi, SeriesPoint, TableColumn, TableRow } from "@/types/app";
import { ChevronDownIcon } from "@/components/app/app-icons";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* MetricCard                                                          */
/* ------------------------------------------------------------------ */

/** KPI 한 칸: label / value / (선택) delta + 추세 화살표 */
export function MetricCard({ kpi }: { kpi: Kpi }) {
  return (
    <div className="rounded-[8px] border border-app-border bg-white p-4">
      <div className="text-[12px] leading-[16px] text-app-text-secondary">{kpi.label}</div>
      <div className="mt-1 text-[24px] font-semibold leading-[32px] text-app-text">
        {kpi.value}
      </div>
      {kpi.delta && (
        <div
          className={cn(
            "mt-1 flex items-center gap-1 text-[12px] leading-[16px]",
            kpi.trend === "up" && "text-app-green",
            kpi.trend === "down" && "text-app-red",
            (kpi.trend === "flat" || !kpi.trend) && "text-app-text-secondary"
          )}
        >
          {kpi.trend === "up" && <span aria-hidden="true">▲</span>}
          {kpi.trend === "down" && <span aria-hidden="true">▼</span>}
          <span>{kpi.delta}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FilterBar                                                           */
/* ------------------------------------------------------------------ */

interface FilterBarProps {
  entityLabel: string;
  entityValue: string;
  filters: FilterDef[];
}

/** 분석 대상(도메인/키워드) 표시 + 필터 드롭다운 버튼 + Export 버튼 한 줄 */
export function FilterBar({ entityLabel, entityValue, filters }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] text-app-text-secondary">{entityLabel}:</span>
      <span className="flex h-[36px] items-center gap-2 rounded-[6px] bg-[#eaf3ff] px-3 text-[13px] font-medium text-app-text">
        <span className="h-[8px] w-[8px] shrink-0 rounded-full bg-app-blue" aria-hidden="true" />
        {entityValue}
      </span>

      {filters.map((filter) => (
        <button
          key={filter.label}
          type="button"
          aria-label={filter.label}
          className="flex h-[36px] items-center gap-1.5 rounded-[6px] border border-app-border bg-white px-3 text-[12px] text-app-text transition-colors hover:bg-app-bg"
        >
          {filter.options[0]}
          <ChevronDownIcon width={12} height={12} className="shrink-0 text-app-text-secondary" />
        </button>
      ))}

      <button
        type="button"
        className="ml-auto flex h-[36px] items-center rounded-[6px] border border-app-border bg-white px-4 text-[13px] font-medium text-app-text transition-colors hover:bg-app-bg"
      >
        Export
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* DataTable                                                           */
/* ------------------------------------------------------------------ */

interface DataTableProps {
  columns: TableColumn[];
  rows: TableRow[];
}

/** 흰 카드 안 데이터 테이블: sticky thead, 첫 열 링크색, 우측 정렬 지원 */
export function DataTable({ columns, rows }: DataTableProps) {
  return (
    <div className="overflow-x-auto rounded-[8px] border border-app-border bg-white">
      <table className="w-full min-w-[560px] border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  "sticky top-0 z-10 border-b border-[#eef0f2] bg-[#f9fafb] px-3 py-[10px] text-left text-[12px] font-semibold uppercase tracking-[0.3px] text-app-text-secondary",
                  col.align === "right" && "text-right"
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="transition-colors hover:bg-[#f9fafb]">
              {columns.map((col, colIndex) => (
                <td
                  key={col.key}
                  className={cn(
                    "border-b border-[#eef0f2] px-3 py-[10px] text-[13px] text-app-text",
                    col.align === "right" && "text-right",
                    colIndex === 0 && "text-left text-app-blue"
                  )}
                >
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TrendChart                                                          */
/* ------------------------------------------------------------------ */

interface TrendChartProps {
  title: string;
  type: "line" | "bar" | "area";
  series: SeriesPoint[];
  legend?: [string, string?];
}

const COLOR_A = "#008ff8";
const COLOR_B = "#8649e1";

/** recharts 기반 추이 차트 카드 (line | bar | area) */
export function TrendChart({ title, type, series, legend }: TrendChartProps) {
  const hasB = series.some((point) => typeof point.b === "number");
  const nameA = legend?.[0] ?? "Series A";
  const nameB = legend?.[1] ?? "Series B";
  const margin = { top: 8, right: 12, left: 0, bottom: 0 };

  const grid = <CartesianGrid stroke="#eef0f2" vertical={false} />;
  const xAxis = (
    <XAxis
      dataKey="label"
      tickLine={false}
      axisLine={{ stroke: "#e0e1e9" }}
      tick={{ fontSize: 11, fill: "#6c6e79" }}
      tickMargin={8}
    />
  );
  const yAxis = (
    <YAxis
      tickLine={false}
      axisLine={false}
      tick={{ fontSize: 11, fill: "#6c6e79" }}
      width={44}
    />
  );
  const tooltip = (
    <Tooltip
      cursor={type === "bar" ? { fill: "#f4f5f9" } : { stroke: "#e0e1e9" }}
      contentStyle={{
        borderRadius: 8,
        border: "1px solid #e0e1e9",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.08)",
        fontSize: 12,
      }}
    />
  );
  const legendEl = legend ? (
    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
  ) : null;

  return (
    <div className="rounded-[8px] border border-app-border bg-white p-4">
      <h3 className="mb-3 text-[14px] font-semibold leading-[20px] text-app-text">{title}</h3>
      <ResponsiveContainer width="100%" height={280}>
        {type === "line" ? (
          <LineChart data={series} margin={margin}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            {legendEl}
            <Line type="monotone" dataKey="a" name={nameA} stroke={COLOR_A} strokeWidth={2} dot={false} />
            {hasB && (
              <Line type="monotone" dataKey="b" name={nameB} stroke={COLOR_B} strokeWidth={2} dot={false} />
            )}
          </LineChart>
        ) : type === "bar" ? (
          <BarChart data={series} margin={margin}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            {legendEl}
            <Bar dataKey="a" name={nameA} fill={COLOR_A} radius={[3, 3, 0, 0]} maxBarSize={32} />
            {hasB && (
              <Bar dataKey="b" name={nameB} fill={COLOR_B} radius={[3, 3, 0, 0]} maxBarSize={32} />
            )}
          </BarChart>
        ) : (
          <AreaChart data={series} margin={margin}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            {legendEl}
            <Area
              type="monotone"
              dataKey="a"
              name={nameA}
              stroke={COLOR_A}
              strokeWidth={2}
              fill={COLOR_A}
              fillOpacity={0.15}
            />
            {hasB && (
              <Area
                type="monotone"
                dataKey="b"
                name={nameB}
                stroke={COLOR_B}
                strokeWidth={2}
                fill={COLOR_B}
                fillOpacity={0.15}
              />
            )}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
