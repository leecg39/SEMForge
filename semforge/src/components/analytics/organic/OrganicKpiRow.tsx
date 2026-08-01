"use client";

import { cn } from "@/lib/utils";
import { ORGANIC_COLORS, OrganicCard, OrganicDeltaBadge } from "./organic-ui";

/**
 * Organic Research KPI 행 (크롭 02-kpi-row 대응).
 * 전폭 카드 하나에 지표 5개를 수직 보더로 구분한 5열 그리드로 배치한다.
 * 스파크라인은 외부 라이브러리 없이 인라인 SVG 로 직접 계산해 그린다.
 */

export interface OrganicKpiItem {
  key: string;
  label: string;
  /** 이미 포맷된 문자열 ("67", "US$16.0"). null = 데이터 없음(회색 — 표시) */
  value: string | null;
  /** 변화율 %. 0 => 회색 "0%", null => "—" */
  delta: number | null;
  spark?: { type: "bar" | "line"; points: number[] } | null;
  /** 데이터 없음 사유 — 라벨 hover 시 title 툴팁으로 노출 */
  unavailableNote?: string;
}

const SPARK_HEIGHT = 32;
const LINE_SPARK_WIDTH = 140;
const BAR_WIDTH = 6;
const BAR_GAP = 2;
/** 선/끝점 도트(r=3)가 위아래로 잘리지 않도록 두는 세로 여백 */
const LINE_PAD_Y = 4;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 위쪽 모서리만 radius 1px 인 막대 path */
function topRoundedBarPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(1, w / 2, h);
  return [
    `M${round2(x)},${round2(y + h)}`,
    `V${round2(y + r)}`,
    `Q${round2(x)},${round2(y)} ${round2(x + r)},${round2(y)}`,
    `H${round2(x + w - r)}`,
    `Q${round2(x + w)},${round2(y)} ${round2(x + w)},${round2(y + r)}`,
    `V${round2(y + h)}`,
    "Z",
  ].join("");
}

function BarSpark({ points }: { points: number[] }) {
  const width = points.length * BAR_WIDTH + (points.length - 1) * BAR_GAP;
  const max = Math.max(...points);
  return (
    <svg width={width} height={SPARK_HEIGHT} viewBox={`0 0 ${width} ${SPARK_HEIGHT}`} aria-hidden>
      {points.map((v, i) => {
        if (v <= 0 || max <= 0) return null;
        const h = Math.max(1, (v / max) * SPARK_HEIGHT);
        return (
          <path
            key={i}
            d={topRoundedBarPath(i * (BAR_WIDTH + BAR_GAP), SPARK_HEIGHT - h, BAR_WIDTH, h)}
            fill={i === points.length - 1 ? ORGANIC_COLORS.spark.barActive : ORGANIC_COLORS.spark.bar}
          />
        );
      })}
    </svg>
  );
}

function LineSpark({ points }: { points: number[] }) {
  const min = Math.min(...points);
  const range = Math.max(...points) - min;
  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * LINE_SPARK_WIDTH;
    const t = range === 0 ? 0.5 : (v - min) / range;
    const y = SPARK_HEIGHT - LINE_PAD_Y - t * (SPARK_HEIGHT - LINE_PAD_Y * 2);
    return [round2(x), round2(y)] as const;
  });
  const line = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const [endX, endY] = coords[coords.length - 1];
  return (
    <svg
      width={LINE_SPARK_WIDTH}
      height={SPARK_HEIGHT}
      viewBox={`0 0 ${LINE_SPARK_WIDTH} ${SPARK_HEIGHT}`}
      aria-hidden
      className="overflow-visible"
    >
      <polygon
        points={`0,${SPARK_HEIGHT} ${line} ${LINE_SPARK_WIDTH},${SPARK_HEIGHT}`}
        fill={ORGANIC_COLORS.spark.line}
        fillOpacity={0.12}
      />
      <line
        x1={0}
        y1={SPARK_HEIGHT - 0.5}
        x2={LINE_SPARK_WIDTH}
        y2={SPARK_HEIGHT - 0.5}
        stroke={ORGANIC_COLORS.spark.baseline}
        strokeWidth={1}
      />
      <polyline
        points={line}
        fill="none"
        stroke={ORGANIC_COLORS.spark.line}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={endX} cy={endY} r={3} fill={ORGANIC_COLORS.spark.line} />
    </svg>
  );
}

export function OrganicKpiRow({ items }: { items: OrganicKpiItem[] }) {
  const cols = Math.max(items.length, 1);
  return (
    <OrganicCard wide>
      <div
        className="grid grid-cols-5"
        style={cols !== 5 ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}
      >
        {items.map((item, i) => {
          const spark = item.spark;
          const hasSpark = spark != null && spark.points.length >= 2;
          return (
            <div
              key={item.key}
              className={cn(
                "px-4",
                i === 0 && "pl-0",
                i === items.length - 1 && "pr-0",
                i > 0 && "border-l",
              )}
              style={i > 0 ? { borderLeftColor: ORGANIC_COLORS.divider } : undefined}
            >
              <span
                title={item.unavailableNote ?? item.label}
                className="cursor-help text-[12px] leading-4 underline decoration-dotted underline-offset-4"
                style={{
                  color: ORGANIC_COLORS.textSecondary,
                  textDecorationColor: ORGANIC_COLORS.textSecondary,
                }}
              >
                {item.label}
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                {item.value === null ? (
                  <span
                    className="text-[24px] font-bold leading-8"
                    style={{ color: ORGANIC_COLORS.textSecondary }}
                  >
                    —
                  </span>
                ) : (
                  <>
                    <span className="text-[24px] font-bold leading-8 text-black">{item.value}</span>
                    <OrganicDeltaBadge delta={item.delta} />
                  </>
                )}
              </div>
              {hasSpark && (
                <div className="mt-2 h-8">
                  {spark.type === "bar" ? (
                    <BarSpark points={spark.points} />
                  ) : (
                    <LineSpark points={spark.points} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </OrganicCard>
  );
}
