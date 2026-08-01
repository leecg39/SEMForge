"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Organic Research(자연검색 순위) 화면 공용 프리미티브.
 * 원본 계측값: docs/research/BEHAVIORS.md, docs/research/extract/*.json
 * — 카드 셸/세그먼트/기간 필/검정 CTA/테이블/빈 상태를 이 모듈로 통일한다.
 */

/** 원본 computed 팔레트 (oklch 그대로 사용 — 모던 브라우저 전제) */
export const ORGANIC_COLORS = {
  /** 포지션 버킷 (스택 하→상) */
  bucket: {
    top3: "oklch(0.82 0.18 80)",
    p4_10: "oklch(0.46 0.141 280.7)",
    p11_20: "oklch(0.58 0.168 278.2)",
    p21_50: "oklch(0.74 0.117 274.1)",
    p51_100: "oklch(0.82 0.088 272.1)",
    serpFeatures: "oklch(0.82 0.19 143)",
  },
  /** SERP 구성 요소 트렌드 라인 (크롭 08 범례 순서 기준) */
  serpLine: {
    aiOverview: "oklch(0.74 0.225 330)",
    featuredVideo: "oklch(0.58 0.168 278.2)",
    relatedQuestions: "oklch(0.82 0.18 80)",
  },
  /** 의도 컬러 (I/N/C/T) */
  intent: {
    informational: "oklch(0.74 0.117 274.1)",
    navigational: "oklch(0.74 0.17 303)",
    commercial: "oklch(0.82 0.18 80)",
    transactional: "oklch(0.82 0.15 170)",
  },
  /** 경쟁 포지셔닝 버블 순환 팔레트 */
  bubbles: [
    "oklch(0.58 0.168 278.2)",
    "oklch(0.82 0.15 170)",
    "oklch(0.74 0.17 303)",
    "oklch(0.82 0.18 80)",
    "oklch(0.74 0.19 22)",
    "oklch(0.82 0.088 272.1)",
  ],
  /** KPI 스파크라인 */
  spark: {
    bar: "oklch(0.82 0.088 272.1)",
    barActive: "oklch(0.58 0.168 278.2)",
    line: "rgb(102, 107, 219)",
    baseline: "rgb(224, 225, 233)",
  },
  /** 차트 보조 */
  gridLine: "rgba(0, 21, 16, 0.07)",
  axisLine: "rgb(214, 216, 215)",
  axisLabel: "rgba(0, 3, 0, 0.584)",
  /** 텍스트/보더 */
  heading: "rgba(1, 5, 0, 0.898)",
  textSecondary: "rgba(0, 3, 0, 0.584)",
  border: "rgba(0, 12, 8, 0.16)",
  divider: "rgba(0, 21, 16, 0.07)",
  link: "rgb(35, 95, 226)",
  selectedBg: "rgba(0, 81, 255, 0.04)",
  selectedBorder: "rgba(0, 40, 230, 0.42)",
  hoverTint: "rgba(0, 81, 255, 0.04)",
} as const;

/* ------------------------------------------------------------------ */
/* 카드 셸                                                              */
/* ------------------------------------------------------------------ */

export function OrganicCard({
  title,
  titleExtra,
  children,
  className,
  wide,
}: {
  title?: ReactNode;
  /** 제목 우측(같은 행)에 붙는 컨트롤 */
  titleExtra?: ReactNode;
  children: ReactNode;
  className?: string;
  /** true = 1085px 전폭, false = 534px 열 (grid 배치는 부모 담당) */
  wide?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-[6px] border bg-white p-4",
        wide ? "col-span-2" : "col-span-1",
        className,
      )}
      style={{ borderColor: ORGANIC_COLORS.divider, boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
    >
      {title !== undefined && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[16px] font-semibold leading-6" style={{ color: ORGANIC_COLORS.heading }}>
            {title}
          </h3>
          {titleExtra}
        </div>
      )}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 세그먼트 컨트롤 (joined button group)                                */
/* ------------------------------------------------------------------ */

export function OrganicSegmented<T extends string>({
  options,
  value,
  onChange,
  size = "m",
  ariaLabel,
}: {
  options: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (next: T) => void;
  size?: "m" | "s";
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex">
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={selected}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative inline-flex items-center gap-1.5 border bg-white px-3 text-[14px] leading-none text-black",
              size === "m" ? "h-[28px]" : "h-[24px] text-[12px]",
              i > 0 && "-ml-px",
              i === 0 && "rounded-l-[6px]",
              i === options.length - 1 && "rounded-r-[6px]",
              selected && "z-[1]",
            )}
            style={{
              borderColor: selected ? ORGANIC_COLORS.selectedBorder : ORGANIC_COLORS.border,
              backgroundColor: selected ? ORGANIC_COLORS.selectedBg : "#fff",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 기간 필 (텍스트 + 3px 밑줄)                                          */
/* ------------------------------------------------------------------ */

export type OrganicPeriod = "1m" | "6m" | "1y" | "2y" | "all";

export function OrganicPeriodPills({
  value,
  onChange,
  labels,
}: {
  value: OrganicPeriod;
  onChange: (next: OrganicPeriod) => void;
  labels: Record<OrganicPeriod, string>;
}) {
  const order: OrganicPeriod[] = ["1m", "6m", "1y", "2y", "all"];
  return (
    <div role="tablist" className="flex items-center gap-4">
      {order.map((p) => {
        const selected = p === value;
        return (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(p)}
            className="relative h-[28px] text-[13.33px] font-medium"
            style={{ color: ORGANIC_COLORS.heading }}
          >
            {labels[p]}
            <span
              aria-hidden
              className="absolute inset-x-0 -bottom-px h-[3px]"
              style={{ backgroundColor: selected ? ORGANIC_COLORS.selectedBorder : "transparent" }}
            />
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 검정 CTA 버튼 (키워드 10개 모두 보기 등)                             */
/* ------------------------------------------------------------------ */

export function OrganicCta({
  children,
  href,
  onClick,
  className,
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const cls = cn(
    "inline-flex h-[28px] items-center rounded-[6px] px-3 text-[14px] leading-none",
    "bg-[rgb(26,30,26)] text-[rgba(254,255,255,0.95)] transition-colors hover:bg-[rgb(44,48,44)]",
    className,
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 파랑 링크                                                            */
/* ------------------------------------------------------------------ */

export function OrganicLink({
  children,
  href,
  external,
  className,
  title,
}: {
  children: ReactNode;
  href: string;
  external?: boolean;
  className?: string;
  title?: string;
}) {
  const cls = cn("text-[14px] hover:underline", className);
  const style: CSSProperties = { color: ORGANIC_COLORS.link };
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls} style={style} title={title}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} style={style} title={title}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* 테이블                                                               */
/* ------------------------------------------------------------------ */

export function OrganicTable({ children, className }: { children: ReactNode; className?: string }) {
  return <table className={cn("w-full border-collapse text-left", className)}>{children}</table>;
}

export function OrganicTh({
  children,
  align = "left",
  sortable,
  className,
}: {
  children?: ReactNode;
  align?: "left" | "right";
  sortable?: boolean;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "h-[32px] whitespace-nowrap border-b pb-1 text-[12px] font-normal",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
      style={{ color: ORGANIC_COLORS.textSecondary, borderColor: ORGANIC_COLORS.border }}
    >
      <span className="inline-flex items-center gap-0.5">
        {children}
        {sortable && (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="shrink-0 opacity-70">
            <path d="M5 1l2.5 3h-5L5 1zM5 9L2.5 6h5L5 9z" fill="currentColor" />
          </svg>
        )}
      </span>
    </th>
  );
}

export function OrganicTr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr
      className={cn("transition-colors", className)}
      style={{ borderBottom: `1px solid ${ORGANIC_COLORS.divider}` }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.backgroundColor = ORGANIC_COLORS.hoverTint;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "transparent";
      }}
    >
      {children}
    </tr>
  );
}

export function OrganicTd({
  children,
  align = "left",
  className,
}: {
  children?: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={cn(
        "h-[37px] whitespace-nowrap text-[14px] text-black",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}

/* ------------------------------------------------------------------ */
/* 빈 상태 (결과가 없습니다)                                            */
/* ------------------------------------------------------------------ */

/** 자체 제작 미니 일러스트 — 원본 에셋을 복사하지 않은 유사 무드의 테이블 그림 */
export function OrganicEmptyIllustration() {
  return (
    <svg width="80" height="64" viewBox="0 0 80 64" aria-hidden>
      <rect x="8" y="10" width="64" height="46" rx="4" fill="#fff" stroke="#c8ccd4" strokeWidth="2" />
      <rect x="8" y="10" width="64" height="12" rx="4" fill="#eef0f4" stroke="#c8ccd4" strokeWidth="2" />
      <line x1="8" y1="34" x2="72" y2="34" stroke="#e2e5ea" strokeWidth="2" />
      <line x1="8" y1="45" x2="72" y2="45" stroke="#e2e5ea" strokeWidth="2" />
      <line x1="30" y1="22" x2="30" y2="56" stroke="#e2e5ea" strokeWidth="2" />
      <line x1="51" y1="22" x2="51" y2="56" stroke="#e2e5ea" strokeWidth="2" />
      <circle cx="66" cy="14" r="6" fill="#ff642d" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

export function OrganicEmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 py-6 text-center">
      <OrganicEmptyIllustration />
      <p className="text-[14px] font-semibold" style={{ color: ORGANIC_COLORS.heading }}>
        {title}
      </p>
      <p className="text-[12px]" style={{ color: ORGANIC_COLORS.textSecondary }}>
        {hint}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 범례 색 체크박스 (16px)                                              */
/* ------------------------------------------------------------------ */

export function OrganicLegendCheckbox({
  color,
  checked,
  label,
  onChange,
}: {
  color: string;
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden
        className="inline-flex h-4 w-4 items-center justify-center rounded-[4px] border"
        style={{
          backgroundColor: checked ? color : "#fff",
          borderColor: checked ? color : ORGANIC_COLORS.border,
        }}
      >
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" aria-hidden>
            <path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          </svg>
        )}
      </span>
      <span className="text-[12px] text-black">{label}</span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* KPI 변화율 배지 (0%)                                                 */
/* ------------------------------------------------------------------ */

export function OrganicDeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="text-[12px]" style={{ color: ORGANIC_COLORS.textSecondary }}>
        —
      </span>
    );
  }
  const isUp = delta > 0;
  const isDown = delta < 0;
  const color = isUp ? "#009f81" : isDown ? "#d1002f" : ORGANIC_COLORS.textSecondary;
  return (
    <span className="inline-flex items-center gap-0.5 text-[12px]" style={{ color }}>
      {isUp && "▲"}
      {isDown && "▼"}
      {Math.abs(delta)}%
    </span>
  );
}

/** 점선 밑줄 보조 수치 (SF 열 등) */
export function OrganicDottedValue({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="cursor-help text-[14px] underline decoration-dotted underline-offset-4"
      style={{ color: ORGANIC_COLORS.textSecondary, textDecorationColor: ORGANIC_COLORS.textSecondary }}
    >
      {children}
    </span>
  );
}
