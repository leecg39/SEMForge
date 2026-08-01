"use client";

import { useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ORGANIC_COLORS,
  OrganicCard,
  OrganicCta,
  OrganicLegendCheckbox,
  OrganicPeriodPills,
  type OrganicPeriod,
} from "./organic-ui";

/**
 * SERP 구성 요소 트렌드 카드.
 * 참고: docs/design-references/semrush-organic/08-serp-trends.png,
 *       docs/research/components/serp-trends.spec.md
 */

export interface SerpTrendPoint {
  period: string;
  aiOverview: number | null;
  featuredVideo: number | null;
  relatedQuestions: number | null;
}

type SerpFeatureKey = "aiOverview" | "featuredVideo" | "relatedQuestions";

const FEATURE_KEYS: readonly SerpFeatureKey[] = ["aiOverview", "featuredVideo", "relatedQuestions"];

export function SerpTrendsChart({
  points,
  period,
  onPeriodChange,
  viewAllHref,
  copy,
}: {
  points: SerpTrendPoint[];
  period: OrganicPeriod;
  onPeriodChange: (p: OrganicPeriod) => void;
  viewAllHref: string;
  copy: {
    title: string;
    features: { aiOverview: string; featuredVideo: string; relatedQuestions: string };
    otherSelect: string;
    periods: Record<OrganicPeriod, string>;
    viewAll: string;
  };
}) {
  const [visible, setVisible] = useState<Record<SerpFeatureKey, boolean>>({
    aiOverview: true,
    featuredVideo: true,
    relatedQuestions: true,
  });

  return (
    <OrganicCard wide title={copy.title}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-4">
            {FEATURE_KEYS.map((key) => (
              <OrganicLegendCheckbox
                key={key}
                color={ORGANIC_COLORS.serpLine[key]}
                checked={visible[key]}
                label={copy.features[key]}
                onChange={(next) => setVisible((prev) => ({ ...prev, [key]: next }))}
              />
            ))}
          </div>
          {/* 원본과 동일한 시각 전용 셀렉트 트리거 — 동작 없음 */}
          <button
            type="button"
            aria-haspopup="listbox"
            className="inline-flex h-[28px] cursor-default items-center gap-1.5 rounded-[6px] border bg-white px-2.5 text-[12px]"
            style={{ borderColor: ORGANIC_COLORS.border, color: ORGANIC_COLORS.textSecondary }}
          >
            {copy.otherSelect}
            <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
              <path
                d="M1 2.5l3 3 3-3"
                stroke="currentColor"
                strokeWidth="1.4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <OrganicPeriodPills value={period} onChange={onPeriodChange} labels={copy.periods} />
      </div>

      <div className="h-[160px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11, fill: ORGANIC_COLORS.axisLabel }}
              axisLine={{ stroke: ORGANIC_COLORS.axisLine }}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: `1px solid ${ORGANIC_COLORS.border}`,
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            {FEATURE_KEYS.map((key) => (
              <Line
                key={key}
                dataKey={key}
                stroke={ORGANIC_COLORS.serpLine[key]}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
                hide={!visible[key]}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex justify-start">
        <OrganicCta href={viewAllHref}>{copy.viewAll}</OrganicCta>
      </div>
    </OrganicCard>
  );
}
