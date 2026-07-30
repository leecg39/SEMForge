"use client";

import { Fragment } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { useLocalizedValue } from "@/i18n/useLocalizedValue";
import { EmptyState } from "@/components/app/AppStateTemplates";
import { cn } from "@/lib/utils";
import type { AppWorkspaceData } from "@/types/app";

/** 프로젝트/감사/관리 작업공간 템플릿 (Site Audit, Position Tracking 등). */

const EMPTY_COPY = {
  en: {
    title: "No project data connected",
    body: "This workspace has no connected project data, so no metrics are shown. Create a folder and connect a data source from Home to get started.",
    cta: "Set up in Home",
  },
  ko: {
    title: "연결된 프로젝트 데이터가 없습니다",
    body: "이 작업공간은 연결된 프로젝트 데이터가 없어 지표를 표시하지 않습니다. 홈에서 폴더를 만들고 데이터 소스를 연결하세요.",
    cta: "홈에서 설정하기",
  },
} as const;

const severityDot: Record<"error" | "warning" | "notice", string> = {
  error: "bg-app-red",
  warning: "bg-app-orange",
  notice: "bg-app-text-secondary",
};

const trendColor: Record<"up" | "down" | "flat", string> = {
  up: "text-app-green",
  down: "text-app-red",
  flat: "text-app-text-secondary",
};

function ActionButton({
  action,
}: {
  action: AppWorkspaceData["actions"][number];
}) {
  return (
    <button
      type="button"
      className={cn(
        "h-[36px] shrink-0 rounded-[8px] px-[16px] text-[13px] font-semibold transition-colors",
        action.variant === "primary"
          ? "bg-app-blue text-white hover:bg-app-blue-dark"
          : "border border-app-border bg-white text-app-text hover:bg-[#f9fafb]"
      )}
    >
      {action.label}
    </button>
  );
}

function StepCircle({ step, index }: { step: { title: string; done: boolean }; index: number }) {
  return (
    <div className="flex shrink-0 items-center gap-[8px]">
      <span
        className={cn(
          "flex h-[24px] w-[24px] items-center justify-center rounded-full text-[12px] font-semibold",
          step.done
            ? "bg-app-green text-white"
            : "border border-app-border bg-white text-app-text-secondary"
        )}
      >
        {step.done ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M2.5 6.5L5 9L9.5 3.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          index + 1
        )}
      </span>
      <span
        className={cn(
          "whitespace-nowrap text-[13px]",
          step.done ? "font-medium text-app-text" : "text-app-text-secondary"
        )}
      >
        {step.title}
      </span>
    </div>
  );
}

export function AppWorkspaceTemplate({ data: sourceData }: { data: AppWorkspaceData }) {
  const { locale } = useLocale();
  const data = useLocalizedValue(sourceData);
  const hasData = data.summary.length > 0 || data.issues.length > 0 || data.rows.length > 0;

  if (!hasData) {
    const empty = EMPTY_COPY[locale];
    return (
      <div className="flex flex-col gap-[24px] p-[24px] text-app-text">
        <h1 className="text-[20px] font-semibold leading-[1.3]">{data.title}</h1>
        <div className="rounded-[8px] border border-app-border bg-white">
          <EmptyState title={empty.title} body={empty.body} cta={empty.cta} ctaHref="/home/" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[24px] p-[24px] text-app-text">
      {/* 1. 헤더행: 타이틀 + 프로젝트 pill + 액션 */}
      <div className="flex flex-wrap items-center gap-[12px]">
        <h1 className="text-[20px] font-semibold leading-[1.3]">{data.title}</h1>
        <span className="inline-flex items-center gap-[6px] rounded-[6px] bg-[#eaf3ff] px-[10px] py-[4px] text-[13px] font-medium text-app-text">
          <span className="h-[8px] w-[8px] rounded-full bg-app-blue" aria-hidden="true" />
          {data.projectLabel}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-[8px]">
          {data.actions.map((action) => (
            <ActionButton key={action.label} action={action} />
          ))}
        </div>
      </div>

      {/* 2. 진행 단계 */}
      {data.steps && data.steps.length > 0 && (
        <div className="flex items-center overflow-x-auto rounded-[8px] border border-app-border bg-white px-[20px] py-[14px]">
          {data.steps.map((step, i) => (
            <Fragment key={step.title}>
              {i > 0 && (
                <span
                  className="mx-[12px] h-px min-w-[24px] flex-1 bg-app-border"
                  aria-hidden="true"
                />
              )}
              <StepCircle step={step} index={i} />
            </Fragment>
          ))}
        </div>
      )}

      {/* 3. 요약 KPI 그리드 */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-[16px]">
        {data.summary.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-[8px] border border-app-border bg-white p-[16px]"
          >
            <p className="text-[12px] text-app-text-secondary">{kpi.label}</p>
            <div className="mt-[6px] flex items-baseline gap-[8px]">
              <p className="text-[24px] font-semibold leading-[1.2]">{kpi.value}</p>
              {kpi.delta && (
                <span
                  className={cn(
                    "text-[12px] font-medium",
                    trendColor[kpi.trend ?? "flat"]
                  )}
                >
                  {kpi.trend === "up" && "\u2191 "}
                  {kpi.trend === "down" && "\u2193 "}
                  {kpi.delta}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 4. 이슈 섹션 */}
      <section className="rounded-[8px] border border-app-border bg-white">
        <h2 className="border-b border-app-border px-[16px] py-[12px] text-[14px] font-semibold">
          {data.issuesTitle}
        </h2>
        <ul>
          {data.issues.map((issue) => (
            <li
              key={issue.label}
              className="flex items-center gap-[10px] border-b border-[#eef0f2] px-[16px] py-[10px] last:border-b-0"
            >
              <span
                className={cn(
                  "h-[8px] w-[8px] shrink-0 rounded-full",
                  severityDot[issue.severity]
                )}
                aria-hidden="true"
              />
              <span className="flex-1 text-[13px]">{issue.label}</span>
              <span className="rounded-[4px] bg-app-bg px-[8px] py-[2px] text-[12px] font-semibold text-app-text">
                {issue.count.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 5. 데이터 테이블 */}
      <div className="overflow-hidden rounded-[8px] border border-app-border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-app-border bg-[#f9fafb]">
                {data.columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "whitespace-nowrap px-[16px] py-[10px] text-[12px] font-semibold uppercase tracking-[0.04em] text-app-text-secondary",
                      col.align === "right" && "text-right"
                    )}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-[#f9fafb]">
                  {data.columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "border-b border-[#eef0f2] px-[16px] py-[12px] text-[13px]",
                        col.align === "right" && "text-right tabular-nums"
                      )}
                    >
                      {row[col.key] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
