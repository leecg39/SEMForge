"use client";

import { useState } from "react";
import {
  ORGANIC_COLORS,
  OrganicCard,
  OrganicCta,
  OrganicLink,
  OrganicTable,
  OrganicTd,
  OrganicTh,
  OrganicTr,
} from "./organic-ui";

/**
 * 주요 자연 경쟁자 + 경쟁 포지셔닝 지도 카드 (Organic Research 534px 열 2종).
 * 명세: docs/research/components/competitors-map.spec.md
 * 크롭: docs/design-references/semrush-organic/12-competitors.png, 13-positioning-map.png
 */

/** SSR/클라이언트 로케일 차이로 인한 hydration 불일치를 막기 위해 로케일 고정 */
const numberFormat = new Intl.NumberFormat("en-US");

/** 버블/범례 색 — ORGANIC_COLORS.bubbles 6색 순환 */
function bubbleColor(i: number): string {
  return ORGANIC_COLORS.bubbles[i % ORGANIC_COLORS.bubbles.length];
}

/* ------------------------------------------------------------------ */
/* CompetitorsCard — 주요 자연 경쟁자                                   */
/* ------------------------------------------------------------------ */

export interface CompetitorRow {
  domain: string;
  href: string;
  commonKeywords: number;
  levelPct: number;
}

const MAX_COMPETITOR_ROWS = 6;

/** 경쟁 수준 바 (명세 고정값) */
const LEVEL_BAR_TRACK = "#ecedf0";
const LEVEL_BAR_FILL = "oklch(0.58 0.168 278.2)";

/** 외부 링크 아이콘 — 원본 에셋을 복사하지 않은 오리지널 SVG(모서리 박스 + 대각 화살표), 색은 currentColor 상속 */
function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="shrink-0">
      <path
        d="M6 3.5H4.5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M8.5 2.5h3v3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11.5 2.5 7.25 6.75" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function CompetitorsCard({
  rows,
  totalCount,
  viewAllHref,
  copy,
}: {
  rows: CompetitorRow[];
  totalCount: number;
  viewAllHref: string;
  copy: {
    title: string;
    headers: { domain: string; common: string; level: string };
    viewAll: (n: number) => string;
    empty: string;
  };
}) {
  const visible = rows.slice(0, MAX_COMPETITOR_ROWS);

  return (
    <OrganicCard title={copy.title}>
      {visible.length === 0 ? (
        <div
          className="flex min-h-[220px] items-center justify-center text-[12px]"
          style={{ color: ORGANIC_COLORS.textSecondary }}
        >
          {copy.empty}
        </div>
      ) : (
        <OrganicTable>
          <thead>
            <tr>
              <OrganicTh>{copy.headers.domain}</OrganicTh>
              <OrganicTh align="right">{copy.headers.common}</OrganicTh>
              <OrganicTh align="right" sortable>
                {copy.headers.level}
              </OrganicTh>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <OrganicTr key={`${row.domain}-${i}`}>
                <OrganicTd>
                  <OrganicLink href={row.href} external>
                    <span className="inline-flex items-center gap-1">
                      {row.domain}
                      <ExternalLinkIcon />
                    </span>
                  </OrganicLink>
                </OrganicTd>
                <OrganicTd align="right">{numberFormat.format(row.commonKeywords)}</OrganicTd>
                <OrganicTd align="right">
                  <div className="flex items-center justify-end gap-2">
                    <div
                      className="h-2 w-16 rounded-[4px]"
                      style={{ backgroundColor: LEVEL_BAR_TRACK }}
                    >
                      <div
                        className="h-full rounded-[4px]"
                        style={{ width: `${row.levelPct}%`, backgroundColor: LEVEL_BAR_FILL }}
                      />
                    </div>
                    <span className="whitespace-nowrap text-[12px] text-black">
                      {row.levelPct}%
                    </span>
                  </div>
                </OrganicTd>
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

/* ------------------------------------------------------------------ */
/* PositioningMapCard — 경쟁 포지셔닝 지도                              */
/* ------------------------------------------------------------------ */

export interface BubbleRow {
  domain: string;
  keywords: number;
  traffic: number;
  r: number;
}

/** 차트 viewBox 계측 — 534px 카드 내부 폭(≈500px)에 맞춘 고정 좌표계 */
const VIEW_W = 500;
const VIEW_H = 240;
const PAD_LEFT = 40;
const PAD_RIGHT = 6;
const PAD_TOP = 10;
const PAD_BOTTOM = 32;
const PLOT_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = VIEW_H - PAD_TOP - PAD_BOTTOM;

/** rough 간격을 1/2/5×10^k 계열로 올림한 "nice" 눈금 간격 */
function niceStep(rough: number): number {
  const pow = 10 ** Math.floor(Math.log10(rough));
  const unit = rough / pow;
  const factor = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return factor * pow;
}

/** 0..max 도메인의 눈금 값 목록 (약 6분할) */
function buildTicks(max: number): number[] {
  const step = niceStep(max / 6);
  const ticks: number[] = [];
  for (let i = 0; i * step <= max * (1 + 1e-9); i += 1) ticks.push(i * step);
  return ticks;
}

function PositioningChart({
  bubbles,
  copy,
}: {
  bubbles: BubbleRow[];
  copy: { xLabel: string; yLabel: string };
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  // 도메인 0..max*1.1 — 전량 0인 축은 1로 대체해 0 나눗셈 방지
  const xMax = Math.max(...bubbles.map((b) => b.keywords)) * 1.1 || 1;
  const yMax = Math.max(...bubbles.map((b) => b.traffic)) * 1.1 || 1;
  const xTicks = buildTicks(xMax);
  const yTicks = buildTicks(yMax);

  const sx = (v: number) => PAD_LEFT + (v / xMax) * PLOT_W;
  const sy = (v: number) => PAD_TOP + PLOT_H - (v / yMax) * PLOT_H;

  const hoveredBubble = hovered === null ? undefined : bubbles.at(hovered);

  return (
    <div className="relative h-[240px]">
      {/* preserveAspectRatio=none — viewBox 좌표를 컨테이너 퍼센트로 그대로 환산하기 위함 */}
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="block h-full w-full"
      >
        {/* 그리드 (수직·수평) */}
        {xTicks.map((t) => (
          <line
            key={`gx-${t}`}
            x1={sx(t)}
            x2={sx(t)}
            y1={PAD_TOP}
            y2={PAD_TOP + PLOT_H}
            stroke={ORGANIC_COLORS.gridLine}
            strokeWidth={1}
          />
        ))}
        {yTicks.map((t) => (
          <line
            key={`gy-${t}`}
            x1={PAD_LEFT}
            x2={PAD_LEFT + PLOT_W}
            y1={sy(t)}
            y2={sy(t)}
            stroke={ORGANIC_COLORS.gridLine}
            strokeWidth={1}
          />
        ))}

        {/* 축선 */}
        <line
          x1={PAD_LEFT}
          x2={PAD_LEFT + PLOT_W}
          y1={PAD_TOP + PLOT_H}
          y2={PAD_TOP + PLOT_H}
          stroke={ORGANIC_COLORS.axisLine}
          strokeWidth={1}
        />
        <line
          x1={PAD_LEFT}
          x2={PAD_LEFT}
          y1={PAD_TOP}
          y2={PAD_TOP + PLOT_H}
          stroke={ORGANIC_COLORS.axisLine}
          strokeWidth={1}
        />

        {/* 눈금 라벨 */}
        {xTicks.map((t) => (
          <text
            key={`lx-${t}`}
            x={sx(t)}
            y={PAD_TOP + PLOT_H + 14}
            textAnchor="middle"
            fontSize={11}
            fill={ORGANIC_COLORS.axisLabel}
          >
            {numberFormat.format(t)}
          </text>
        ))}
        {yTicks.map((t) => (
          <text
            key={`ly-${t}`}
            x={PAD_LEFT - 8}
            y={sy(t)}
            textAnchor="end"
            dominantBaseline="central"
            fontSize={11}
            fill={ORGANIC_COLORS.axisLabel}
          >
            {numberFormat.format(t)}
          </text>
        ))}

        {/* 축 제목 */}
        <text
          x={PAD_LEFT + PLOT_W / 2}
          y={VIEW_H - 4}
          textAnchor="middle"
          fontSize={11}
          fill={ORGANIC_COLORS.axisLabel}
        >
          {copy.xLabel}
        </text>
        <text
          x={10}
          y={PAD_TOP + PLOT_H / 2}
          textAnchor="middle"
          fontSize={11}
          fill={ORGANIC_COLORS.axisLabel}
          transform={`rotate(-90 10 ${PAD_TOP + PLOT_H / 2})`}
        >
          {copy.yLabel}
        </text>

        {/* 버블 + 중심 십자 마커 */}
        {bubbles.map((b, i) => {
          const color = bubbleColor(i);
          const cx = sx(b.keywords);
          const cy = sy(b.traffic);
          return (
            <g
              key={`${b.domain}-${i}`}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <circle cx={cx} cy={cy} r={b.r} fill={color} opacity={0.45} />
              {/* 같은 색 전체 불투명 = "진하게" — 8px 십자, 2px 선 */}
              <path
                d={`M ${cx - 4} ${cy} H ${cx + 4} M ${cx} ${cy - 4} V ${cy + 4}`}
                stroke={color}
                strokeWidth={2}
                fill="none"
              />
            </g>
          );
        })}
      </svg>

      {hoveredBubble !== undefined && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[6px] border bg-white px-2.5 py-1.5 shadow-md"
          style={{
            borderColor: ORGANIC_COLORS.border,
            left: `${(sx(hoveredBubble.keywords) / VIEW_W) * 100}%`,
            top: `${((sy(hoveredBubble.traffic) - hoveredBubble.r - 6) / VIEW_H) * 100}%`,
          }}
        >
          <p className="text-[12px] font-semibold text-black">{hoveredBubble.domain}</p>
          <p className="text-[12px]" style={{ color: ORGANIC_COLORS.textSecondary }}>
            {copy.xLabel}: {numberFormat.format(hoveredBubble.keywords)}
          </p>
          <p className="text-[12px]" style={{ color: ORGANIC_COLORS.textSecondary }}>
            {copy.yLabel}: {numberFormat.format(hoveredBubble.traffic)}
          </p>
        </div>
      )}
    </div>
  );
}

export function PositioningMapCard({
  bubbles,
  copy,
}: {
  bubbles: BubbleRow[];
  copy: { title: string; xLabel: string; yLabel: string; empty: string };
}) {
  return (
    <OrganicCard title={copy.title}>
      {bubbles.length === 0 ? (
        <div
          className="flex min-h-[240px] items-center justify-center text-[12px]"
          style={{ color: ORGANIC_COLORS.textSecondary }}
        >
          {copy.empty}
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
            {bubbles.map((b, i) => (
              <span key={`${b.domain}-${i}`} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: bubbleColor(i) }}
                />
                <span className="text-[13px] text-black">{b.domain}</span>
              </span>
            ))}
          </div>
          <PositioningChart bubbles={bubbles} copy={{ xLabel: copy.xLabel, yLabel: copy.yLabel }} />
        </>
      )}
    </OrganicCard>
  );
}
