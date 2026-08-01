"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  OrganicCard,
  OrganicEmptyState,
  OrganicLink,
  OrganicSegmented,
  OrganicTable,
  OrganicTd,
  OrganicTh,
  OrganicTr,
} from "./organic-ui";

/**
 * 상위 포지션 변동 카드 2종 (크롭 06/07).
 * - PositionChangesCard: 자연 검색 — 신규/누락/상승/하락 4개 세그먼트
 * - SerpPositionChangesCard: SERP 구성 요소 — 신규/누락 2개 세그먼트
 * 534px 열 카드. 문구는 전부 copy prop으로 주입한다.
 */

export interface PositionChangeRow {
  keyword: string;
  href: string;
  from: number | null;
  to: number | null;
  volume: number | null;
}

interface PositionChangesCopy<S extends string> {
  title: string;
  segments: Record<S, string>;
  tableHeaders: { keyword: string; change: string; volume: string };
  emptyTitle: string;
  emptyHint: string;
}

/** 순위 숫자는 낮을수록 좋다 — to<from 상승(초록), to>from 하락(빨강) */
const IMPROVED_COLOR = "#009f81";
const DECLINED_COLOR = "#d1002f";

function ChangeValue({ from, to }: { from: number | null; to: number | null }) {
  if (from === null && to === null) return <span>—</span>;
  const comparable = from !== null && to !== null;
  const color =
    comparable && to < from ? IMPROVED_COLOR : comparable && to > from ? DECLINED_COLOR : undefined;
  return (
    <span style={color ? { color } : undefined}>
      {from ?? "—"} → {to ?? "—"}
    </span>
  );
}

function PositionChangesCardBase<S extends string>({
  segments,
  order,
  initial,
  copy,
}: {
  segments: Record<S, PositionChangeRow[]>;
  order: readonly S[];
  initial: S;
  copy: PositionChangesCopy<S>;
}) {
  const [segment, setSegment] = useState<S>(initial);
  const rows = segments[segment];
  const isEmpty = rows.length === 0;

  return (
    <OrganicCard title={copy.title}>
      <OrganicSegmented
        ariaLabel={copy.title}
        options={order.map((value) => ({ value, label: copy.segments[value] }))}
        value={segment}
        onChange={setSegment}
      />
      <div className={cn("mt-3 flex min-h-[236px] flex-col", isEmpty && "justify-center")}>
        {isEmpty ? (
          <OrganicEmptyState title={copy.emptyTitle} hint={copy.emptyHint} />
        ) : (
          <OrganicTable>
            <thead>
              <tr>
                <OrganicTh className="w-full">{copy.tableHeaders.keyword}</OrganicTh>
                <OrganicTh className="pl-4">{copy.tableHeaders.change}</OrganicTh>
                <OrganicTh align="right" className="pl-4">
                  {copy.tableHeaders.volume}
                </OrganicTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <OrganicTr key={`${row.keyword}:${i}`}>
                  <OrganicTd>
                    <OrganicLink
                      href={row.href}
                      title={row.keyword}
                      className="block max-w-[300px] truncate"
                    >
                      {row.keyword}
                    </OrganicLink>
                  </OrganicTd>
                  <OrganicTd className="pl-4">
                    <ChangeValue from={row.from} to={row.to} />
                  </OrganicTd>
                  <OrganicTd align="right" className="pl-4">
                    {row.volume === null ? "—" : row.volume.toLocaleString("en-US")}
                  </OrganicTd>
                </OrganicTr>
              ))}
            </tbody>
          </OrganicTable>
        )}
      </div>
    </OrganicCard>
  );
}

const POSITION_SEGMENT_ORDER = ["new", "lost", "improved", "declined"] as const;
const SERP_SEGMENT_ORDER = ["new", "lost"] as const;

export function PositionChangesCard({
  segments,
  copy,
}: {
  segments: Record<"new" | "lost" | "improved" | "declined", PositionChangeRow[]>;
  copy: {
    title: string;
    segments: Record<"new" | "lost" | "improved" | "declined", string>;
    tableHeaders: { keyword: string; change: string; volume: string };
    emptyTitle: string;
    emptyHint: string;
  };
}) {
  return (
    <PositionChangesCardBase
      segments={segments}
      order={POSITION_SEGMENT_ORDER}
      initial="new"
      copy={copy}
    />
  );
}

export function SerpPositionChangesCard({
  segments,
  copy,
}: {
  segments: Record<"new" | "lost", PositionChangeRow[]>;
  copy: {
    title: string;
    segments: Record<"new" | "lost", string>;
    tableHeaders: { keyword: string; change: string; volume: string };
    emptyTitle: string;
    emptyHint: string;
  };
}) {
  return (
    <PositionChangesCardBase
      segments={segments}
      order={SERP_SEGMENT_ORDER}
      initial="new"
      copy={copy}
    />
  );
}
