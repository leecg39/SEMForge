import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * ko.semforge.com/seo/30605634/ 위젯 대시보드 실측 토큰.
 * 근거: docs/research/ko.semforge.com/seo-dashboard/{PAGE_TOPOLOGY,BEHAVIORS}.md
 */
export const SM = {
  /** 위젯 타이틀 본문색 */
  title: "text-[oklch(0.23_0.01_140)]",
  /** 본문 텍스트 */
  body: "text-[rgba(1,5,0,0.898)]",
  /** 보조 캡션 */
  caption: "text-[oklch(0.53_0.004_149.6)]",
  /** 링크/셀렉트 블루 */
  link: "text-[rgb(35,95,226)]",
  /** AI 보라 타이틀 */
  aiTitle: "text-[rgb(128,41,236)]",
  /** AI 보라 빅 넘버 */
  aiValue: "text-[#7F54E8]",
  /** 증가 배지 */
  deltaUp: "text-[oklch(0.53_0.142_170)]",
  /** 감소 배지 */
  deltaDown: "text-[oklch(0.53_0.206_27.3)]",
  /** 다크 CTA */
  darkCta:
    "inline-flex items-center justify-center rounded-[6px] bg-[rgb(26,30,26)] px-3 text-[14px] font-medium text-[rgba(254,255,255,0.95)] transition-colors hover:bg-[rgb(45,50,45)]",
  /** mute(스텁) 텍스트 */
  stub: "text-[color(display-p3_0.00228_0.01289_0.00252_/_0.583)]",
} as const;

/** 위젯 카드 공통 래퍼 — 실측: radius 8px, padding 8px 20px 20px(big은 20px), --a2-card-shadow */
export function WidgetCard({
  children,
  className,
  big,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  /** 전폭(big) 위젯은 패딩 20px */
  big?: boolean;
  ariaLabel?: string;
}) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        "min-w-0 rounded-[8px] bg-a2-card shadow-[var(--a2-card-shadow)]",
        big ? "p-[20px]" : "px-[20px] pb-[20px] pt-[8px]",
        className
      )}
    >
      {children}
    </section>
  );
}

/** 위젯 타이틀 (16px/700) */
export function WidgetTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("text-[16px] font-bold leading-[20px]", SM.title, className)}>{children}</h3>;
}

/** 셀렉트 링크 (14px/400 블루 + chevron) */
export function SelectLink({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className={cn("flex items-center gap-1 text-[14px] leading-[20px]", SM.link)}
    >
      {children}
      <span aria-hidden="true" className="text-[10px]">⌄</span>
    </button>
  );
}

/** 증감 배지 (12px/400, up 초록/down 빨강) */
export function DeltaBadge({ value, invert }: { value: number; invert?: boolean }) {
  const positive = invert ? value < 0 : value > 0;
  const sign = value > 0 ? "+" : "";
  return (
    <span className={cn("text-[12px] leading-[16px]", positive ? SM.deltaUp : SM.deltaDown)}>
      {sign}
      {value.toFixed(2)}%
    </span>
  );
}

/** 간이 스파크라인 (실측 130×30, polyline) */
export function Sparkline({ points, color = "#235FE2" }: { points: number[]; color?: string }) {
  if (points.length < 2) return null;
  const w = 130;
  const h = 30;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - 3 - ((p - min) / span) * (h - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} aria-hidden="true" className="overflow-hidden">
      <polyline points={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
