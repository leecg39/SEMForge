"use client";

import type { KeywordGapReport } from "@/lib/analytics/keyword-gap";
import { TARGET_COLORS, type GapCopy } from "./copy";

const R_MAX = 62;
const R_MIN = 16;
const R_EMPTY = 9;
const PADDING = 8;

interface CircleSpec {
  cx: number;
  cy: number;
  r: number;
  color: string;
  empty: boolean;
}

/**
 * 랭킹 키워드 수 비례 원 + 쌍별 교집합 비례 겹침의 개략 벤 배치.
 * 3개 이상은 수학적으로 정확한 벤이 불가능하므로(원본도 동일) 인접 쌍의
 * 겹침만 반영한 근사 시각화이며, 카드에 개략 표기를 함께 노출한다.
 */
function layoutCircles(report: KeywordGapReport): CircleSpec[] {
  const counts = report.targets.map((target) => target.rankedKeywords);
  const maxCount = Math.max(...counts, 1);
  const radius = (count: number): number =>
    count === 0 ? R_EMPTY : R_MIN + (R_MAX - R_MIN) * Math.sqrt(count / maxCount);

  const circles: CircleSpec[] = [];
  let cursor = 0;
  counts.forEach((count, index) => {
    const r = radius(count);
    if (index === 0) {
      cursor = PADDING + r;
    } else {
      const previous = circles[index - 1];
      const pair = report.overlaps.find((item) => item.a === index - 1 && item.b === index);
      const share = pair && Math.min(counts[index - 1], count) > 0
        ? pair.count / Math.min(counts[index - 1], count)
        : 0;
      const shift = share > 0
        ? Math.min(previous.r, r) * (0.3 + 0.9 * Math.min(1, share))
        : -10;
      cursor = previous.cx + previous.r + r - shift;
    }
    circles.push({
      cx: cursor,
      cy: PADDING + R_MAX,
      r,
      color: TARGET_COLORS[index] ?? TARGET_COLORS[TARGET_COLORS.length - 1],
      empty: count === 0,
    });
  });
  return circles;
}

export function OverlapVenn({
  report,
  copy,
  numberFormat,
}: {
  report: KeywordGapReport;
  copy: GapCopy;
  numberFormat: Intl.NumberFormat;
}) {
  const circles = layoutCircles(report);
  const width = Math.max(...circles.map((circle) => circle.cx + circle.r)) + PADDING;
  const height = (PADDING + R_MAX) * 2;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[180px] min-w-0 flex-1 basis-[260px]"
        role="img"
        aria-label={copy.keywordOverlap}
      >
        {circles.map((circle, index) => (
          <circle
            key={index}
            cx={circle.cx}
            cy={circle.cy}
            r={circle.r}
            fill={circle.empty ? "none" : circle.color}
            fillOpacity={circle.empty ? 0 : 0.45}
            stroke={circle.color}
            strokeWidth={circle.empty ? 1.5 : 0}
            strokeDasharray={circle.empty ? "3 3" : undefined}
            style={{ mixBlendMode: "multiply" }}
          />
        ))}
      </svg>
      <ul className="flex min-w-[200px] flex-col gap-2">
        {report.targets.map((target, index) => (
          <li key={index} className="flex items-center gap-2 text-[13px]">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: TARGET_COLORS[index] }}
            />
            <span className="min-w-0 flex-1 truncate text-a2-text" title={target.label}>
              {target.label}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-a2-text">
              {target.rankedKeywords > 0
                ? numberFormat.format(target.rankedKeywords)
                : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
