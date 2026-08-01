"use client";

import { useId, type ReactNode } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocale } from "@/i18n/LocaleProvider";
import type { AnalyticsIntent } from "@/lib/analytics/types";
import { cn } from "@/lib/utils";
import { INTENT_META, type Copy } from "./copy";

/** 카드 공용 껍데기 — 프로젝트 a2 토큰 사용. */
export function Card({
  title,
  hint,
  action,
  children,
  className,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-[10px] border border-app-border bg-a2-card p-4 shadow-[var(--a2-card-shadow)]",
        className,
      )}
    >
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h3 className="text-[14px] font-semibold text-a2-text">{title}</h3>}
            {hint && <p className="mt-0.5 text-[11px] leading-[16px] text-a2-text-muted">{hint}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** 실수집 지표에 붙는 live 배지. */
export function LivePill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-[#e6f5f0] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.35px] text-[#0a6b57]">
      {label}
    </span>
  );
}

/** 규칙/모델 기반 파생 지표에 붙는 계산식 배지 (예: clone-intent-v1). */
export function CalcPill({ label, model }: { label: string; model: string }) {
  return (
    <span
      title={model}
      className="rounded-full bg-[#f1e9fd] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.35px] text-[#6d28d9]"
    >
      {label} {model}
    </span>
  );
}

export function ViewDetailsLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="shrink-0 text-[12px] font-semibold text-app-blue transition-colors hover:text-app-blue-dark hover:underline"
    >
      {label} →
    </Link>
  );
}

/** 섹션 구분 헤더 (자연검색 리서치 / 광고 리서치 / 백링크). */
export function SectionHeading({
  title,
  action,
  className,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-[16px] font-semibold text-a2-text">{title}</h2>
      {action}
    </div>
  );
}

/** 카드 안의 단일 시리즈 면적 추이 차트. */
export function MiniArea({
  data,
  color,
  name,
  formatValue,
}: {
  data: Array<{ label: string; value: number }>;
  color: string;
  name: string;
  formatValue: (value: number) => string;
}) {
  const gradientId = useId();
  if (data.length === 0) {
    return <div className="flex h-[110px] items-center justify-center text-[12px] text-a2-text-muted">—</div>;
  }
  return (
    <div className="h-[110px]" role="img" aria-label={name}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "#9a9ca7" }}
            tickMargin={6}
            minTickGap={28}
          />
          <YAxis hide domain={[0, "auto"]} />
          <Tooltip
            formatter={(value) => [formatValue(Number(value)), name]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #ececee" }}
            labelStyle={{ fontWeight: 600 }}
          />
          <Area type="monotone" dataKey="value" name={name} stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 전월 대비 변화율 칩 (추이 마지막 두 점으로 계산, 이전 값이 0이면 표시하지 않음). */
export function DeltaChip({ series, copy }: { series: number[]; copy: Copy }) {
  if (series.length < 2) return null;
  const previous = series[series.length - 2];
  const current = series[series.length - 1];
  if (previous <= 0) return null;
  const delta = ((current - previous) / previous) * 100;
  if (!Number.isFinite(delta) || delta === 0) return null;
  const positive = delta > 0;
  return (
    <span
      title={copy.vsPreviousMonth}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        positive ? "bg-[#e5f7f1] text-[#087b64]" : "bg-[#ffe8ed] text-[#b0002a]",
      )}
    >
      {positive ? "+" : ""}
      {delta.toFixed(1)}%
    </span>
  );
}

export function NoDataBody({ message, label }: { message: string; label: string }) {
  return (
    <div className="flex min-h-[110px] flex-col items-center justify-center rounded-[8px] border border-dashed border-app-border bg-app-bg px-4 py-6 text-center">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-a2-text-faint">
        <rect x="3" y="10" width="4" height="10" rx="1" stroke="currentColor" strokeWidth="1.6" />
        <rect x="10" y="6" width="4" height="14" rx="1" stroke="currentColor" strokeWidth="1.6" />
        <rect x="17" y="3" width="4" height="17" rx="1" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      <p className="mt-2 text-[12px] font-semibold text-a2-text">{label}</p>
      <p className="mt-1 max-w-[260px] text-[11px] leading-[16px] text-a2-text-muted">{message}</p>
    </div>
  );
}

export function LoadingCards({ copy }: { copy: Copy }) {
  return (
    <div role="status" className="py-10" aria-live="polite">
      <p className="mb-4 text-center text-[13px] text-app-text-secondary">{copy.initialLoading}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-[150px] animate-pulse rounded-[10px] border border-app-border bg-a2-card p-4">
            <div className="h-3 w-24 rounded bg-[#e9ebf0]" />
            <div className="mt-5 h-7 w-20 rounded bg-[#e9ebf0]" />
            <div className="mt-3 h-2.5 w-32 rounded bg-[#f0f1f4]" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * KPI 패널 내부의 소형 지표 블록.
 * value 가 null 이면 미제공("—") — note 를 툴팁으로 노출해 이유를 밝힌다.
 */
export function StatBlock({
  label,
  value,
  note,
  badge,
}: {
  label: string;
  value: string | null;
  note?: string;
  badge?: ReactNode;
}) {
  return (
    <div className="min-w-0" title={note}>
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[11px] font-medium text-a2-text-muted">{label}</span>
        {badge}
      </div>
      <p
        className={cn(
          "mt-0.5 text-[20px] font-semibold leading-[26px] tracking-[-0.3px] tabular-nums",
          value === null ? "text-a2-text-faint" : "text-a2-text",
        )}
      >
        {value ?? "—"}
      </p>
    </div>
  );
}

/** 의도 원문자 배지 (I/N/C/T). */
export function IntentBadge({ intent }: { intent: AnalyticsIntent }) {
  const { locale } = useLocale();
  const meta = INTENT_META[intent];
  return (
    <span
      title={meta.label[locale]}
      className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[4px] text-[10px] font-bold"
      style={{ background: meta.bg, color: meta.color }}
    >
      {meta.short}
    </span>
  );
}
