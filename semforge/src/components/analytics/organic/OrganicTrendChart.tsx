"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import {
  ORGANIC_COLORS,
  OrganicCard,
  OrganicLegendCheckbox,
  OrganicPeriodPills,
  type OrganicPeriod,
} from "./organic-ui";

/**
 * 자연 키워드 추세 (Organic Research 트렌드 차트).
 * 명세: docs/research/components/trend-chart.spec.md
 * 스크린샷: docs/design-references/semrush-organic/03-trend-chart.png
 */

export interface TrendPoint {
  period: string;
  top3: number;
  p4_10: number;
  p11_20: number;
  p21_50: number;
  p51_100: number;
  serpFeatures: number;
}

type BucketKey = keyof typeof ORGANIC_COLORS.bucket;

/** 스택 순서 아래→위 = 범례 순서 좌→우 */
const BUCKET_ORDER: BucketKey[] = ["top3", "p4_10", "p11_20", "p21_50", "p51_100", "serpFeatures"];

/** 말풍선 오리지널 아이콘 (원본 에셋 미복사) */
function MemoBubbleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M3 2.75h10c.69 0 1.25.56 1.25 1.25v6c0 .69-.56 1.25-1.25 1.25H8.4L5 13.9v-2.65H3c-.69 0-1.25-.56-1.25-1.25V4c0-.69.56-1.25 1.25-1.25z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OrganicTrendChart({
  points,
  period,
  onPeriodChange,
  copy,
}: {
  points: TrendPoint[];
  period: OrganicPeriod;
  onPeriodChange: (p: OrganicPeriod) => void;
  copy: {
    title: string;
    legend: {
      top3: string;
      p4_10: string;
      p11_20: string;
      p21_50: string;
      p51_100: string;
      serpFeatures: string;
    };
    periods: Record<OrganicPeriod, string>;
    memo: string;
    empty: string;
  };
}) {
  const [visible, setVisible] = useState<Record<BucketKey, boolean>>({
    top3: true,
    p4_10: true,
    p11_20: true,
    p21_50: true,
    p51_100: true,
    serpFeatures: true,
  });

  const renderTooltip = ({ active, payload, label }: TooltipContentProps) => {
    if (!active || !payload || payload.length === 0) return null;
    const entries = payload.filter((entry) => {
      const key = String(entry.dataKey) as BucketKey;
      return key in ORGANIC_COLORS.bucket && visible[key] && !entry.hide;
    });
    if (entries.length === 0) return null;
    return (
      <div
        className="rounded-[6px] border bg-white px-3 py-2"
        style={{
          borderColor: ORGANIC_COLORS.border,
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
        }}
      >
        <p className="text-[12px] font-semibold" style={{ color: ORGANIC_COLORS.heading }}>
          {label}
        </p>
        <ul className="mt-1 space-y-1">
          {entries.map((entry) => {
            const key = String(entry.dataKey) as BucketKey;
            return (
              <li key={key} className="flex items-center gap-1.5 text-[12px]">
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: ORGANIC_COLORS.bucket[key] }}
                />
                <span style={{ color: ORGANIC_COLORS.textSecondary }}>{copy.legend[key]}</span>
                <span className="ml-2 font-medium text-black">
                  {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <OrganicCard
      wide
      title={copy.title}
      titleExtra={
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center"
          style={{ color: ORGANIC_COLORS.textSecondary }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      }
    >
      {/* 컨트롤 행: 범례 6개 | 구분선 | 메모 토글 ··· 기간 필 */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-4">
          {BUCKET_ORDER.map((key) => (
            <OrganicLegendCheckbox
              key={key}
              color={ORGANIC_COLORS.bucket[key]}
              checked={visible[key]}
              label={copy.legend[key]}
              onChange={(next) => setVisible((current) => ({ ...current, [key]: next }))}
            />
          ))}
          <span
            aria-hidden
            className="h-4 w-px"
            style={{ backgroundColor: ORGANIC_COLORS.border }}
          />
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-[12px] text-black"
          >
            <MemoBubbleIcon />
            {copy.memo}
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path
                d="M2 3.5l3 3 3-3"
                stroke="currentColor"
                strokeWidth="1.3"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <OrganicPeriodPills value={period} onChange={onPeriodChange} labels={copy.periods} />
      </div>

      {/* 차트 영역 195px */}
      <div className="mt-3 h-[195px]">
        {points.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-[12px]" style={{ color: ORGANIC_COLORS.textSecondary }}>
              {copy.empty}
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} barSize={6} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={ORGANIC_COLORS.gridLine} />
              <XAxis
                dataKey="period"
                tickLine={false}
                axisLine={{ stroke: ORGANIC_COLORS.axisLine }}
                tick={{ fontSize: 11, fill: ORGANIC_COLORS.axisLabel }}
              />
              <YAxis
                tickCount={4}
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: ORGANIC_COLORS.axisLabel }}
              />
              <Tooltip content={renderTooltip} cursor={{ fill: "rgba(0, 21, 16, 0.05)" }} />
              {BUCKET_ORDER.map((key) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="pos"
                  fill={ORGANIC_COLORS.bucket[key]}
                  hide={!visible[key]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </OrganicCard>
  );
}
