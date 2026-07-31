"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Keyword Overview 공용 카드 프레임. */
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
            {title && <h2 className="text-[14px] font-semibold text-a2-text">{title}</h2>}
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

/** 계산식(자체 모델) provenance 배지 — clone-kd-v1, clone-intent-v1 등. */
export function CalcPill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-[#f3ecff] px-2 py-0.5 text-[10px] font-semibold tracking-[0.35px] text-[#6d28d9]">
      {label}
    </span>
  );
}

/** 외부 소스(Google Trends 등) provenance 배지. */
export function SourcePill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-[#eaf3ff] px-2 py-0.5 text-[10px] font-semibold tracking-[0.35px] text-[#0872bf]">
      {label}
    </span>
  );
}
