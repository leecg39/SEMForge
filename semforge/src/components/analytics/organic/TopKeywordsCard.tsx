"use client";

import { useState } from "react";
import {
  ORGANIC_COLORS,
  OrganicCard,
  OrganicCta,
  OrganicDottedValue,
  OrganicLink,
  OrganicSegmented,
  OrganicTable,
  OrganicTd,
  OrganicTh,
  OrganicTr,
} from "./organic-ui";

/**
 * 상위 키워드 카드 (Organic Research 534px 열).
 * 명세: docs/research/components/top-keywords.spec.md
 * 크롭: docs/design-references/semrush-organic/04-top-keywords.png
 */

export interface TopKeywordRow {
  keyword: string;
  href: string;
  serpHref?: string;
  position: number;
  sf: number | null;
  sfTitle?: string;
  volume: number | null;
  trafficPct: string;
  hasSerpFeatures: boolean;
}

type SegmentValue = "all" | "organic" | "serp";

const MAX_ROWS = 5;

/** SSR/클라이언트 로케일 차이로 인한 hydration 불일치를 막기 위해 로케일 고정 */
const volumeFormat = new Intl.NumberFormat("en-US");

/** SERP 미리보기 아이콘 — 원본 에셋을 복사하지 않은 오리지널 SVG(사각 창 + 가로줄 2개) */
function SerpPreviewIcon({ serpHref }: { serpHref?: string }) {
  const icon = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" />
      <path d="M4 6.5h8" stroke="currentColor" strokeLinecap="round" />
      <path d="M4 9.5h5.5" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
  const cls =
    "inline-flex shrink-0 text-[rgba(0,3,0,0.4)] transition-colors hover:text-[rgba(0,3,0,0.75)]";
  if (serpHref) {
    return (
      <a href={serpHref} target="_blank" rel="noreferrer" title="SERP" className={cls}>
        {icon}
      </a>
    );
  }
  return <span className={cls}>{icon}</span>;
}

export function TopKeywordsCard({
  rows,
  totalCount,
  viewAllHref,
  copy,
}: {
  rows: TopKeywordRow[];
  totalCount: number;
  viewAllHref: string;
  copy: {
    title: string;
    segments: { all: string; organic: string; serp: string };
    headers: { keyword: string; position: string; sf: string; volume: string; traffic: string };
    viewAll: (n: number) => string;
    empty: string;
  };
}) {
  const [segment, setSegment] = useState<SegmentValue>("all");

  // organic = 광고 제외 개념 — 현재 데이터는 전 행이 자연검색이므로 all 과 동일
  const filtered = segment === "serp" ? rows.filter((row) => row.hasSerpFeatures) : rows;
  const visible = filtered.slice(0, MAX_ROWS);

  return (
    <OrganicCard title={copy.title}>
      {/* 카드 제목 블록의 기본 간격은 12px — 명세의 8px에 맞춰 -4px 보정 */}
      <div className="-mt-1">
        <OrganicSegmented<SegmentValue>
          options={[
            { value: "all", label: copy.segments.all },
            { value: "organic", label: copy.segments.organic },
            { value: "serp", label: copy.segments.serp },
          ]}
          value={segment}
          onChange={setSegment}
        />
      </div>

      {visible.length === 0 ? (
        <div
          className="flex min-h-[185px] items-center justify-center text-[12px]"
          style={{ color: ORGANIC_COLORS.textSecondary }}
        >
          {copy.empty}
        </div>
      ) : (
        <OrganicTable className="mt-2">
          <thead>
            <tr>
              <OrganicTh>{copy.headers.keyword}</OrganicTh>
              <OrganicTh align="right">{copy.headers.position}</OrganicTh>
              <OrganicTh align="right">{copy.headers.sf}</OrganicTh>
              <OrganicTh align="right">{copy.headers.volume}</OrganicTh>
              <OrganicTh align="right" sortable>
                {copy.headers.traffic}
              </OrganicTh>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <OrganicTr key={`${row.keyword}-${i}`}>
                <OrganicTd>
                  <span className="inline-flex items-center gap-1">
                    <OrganicLink href={row.href}>{row.keyword}</OrganicLink>
                    <SerpPreviewIcon serpHref={row.serpHref} />
                  </span>
                </OrganicTd>
                <OrganicTd align="right">{row.position}</OrganicTd>
                <OrganicTd align="right">
                  {row.sf === null ? (
                    <span style={{ color: ORGANIC_COLORS.textSecondary }}>—</span>
                  ) : (
                    <OrganicDottedValue title={row.sfTitle}>{row.sf}</OrganicDottedValue>
                  )}
                </OrganicTd>
                <OrganicTd align="right">
                  {row.volume === null ? "—" : volumeFormat.format(row.volume)}
                </OrganicTd>
                <OrganicTd align="right">{row.trafficPct}</OrganicTd>
              </OrganicTr>
            ))}
          </tbody>
        </OrganicTable>
      )}

      <div className="mt-3">
        <OrganicCta href={viewAllHref}>{copy.viewAll(totalCount)}</OrganicCta>
      </div>
    </OrganicCard>
  );
}
