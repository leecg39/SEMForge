"use client";

import type { ReactNode } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { useLocalizedValue } from "@/i18n/useLocalizedValue";
import { cn } from "@/lib/utils";
import type { AppEditorData } from "@/types/app";

/** 콘텐츠/광고/보고서 생성 편집기 템플릿 (SEO Writing Assistant 등). */

const SCORE_COPY = {
  en: {
    unavailable: "No analysis engine is connected, so no score is computed.",
    emptySuggestions: "Suggestions will appear here once an analysis engine is connected.",
  },
  ko: {
    unavailable: "분석 엔진이 연결되지 않아 점수를 계산할 수 없습니다.",
    emptySuggestions: "분석 엔진을 연결하면 제안이 표시됩니다.",
  },
} as const;

const GAUGE_RADIUS = 52;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

function BriefField({
  field,
}: {
  field: AppEditorData["briefFields"][number];
}) {
  const baseClass =
    "w-full rounded-[6px] border border-app-border bg-white px-[10px] text-[13px] text-app-text placeholder:text-app-text-secondary focus:border-app-blue focus:outline-none";

  return (
    <label className="flex flex-col gap-[6px]">
      <span className="text-[12px] font-semibold text-app-text">{field.label}</span>
      {field.type === "textarea" ? (
        <textarea
          className={cn(baseClass, "min-h-[80px] py-[8px] leading-[1.5]")}
          placeholder={field.placeholder}
          rows={3}
        />
      ) : field.type === "select" ? (
        <select className={cn(baseClass, "h-[36px]")} defaultValue="">
          <option value="">{field.placeholder ?? field.label}</option>
        </select>
      ) : (
        <input
          type={field.type}
          className={cn(baseClass, "h-[36px]")}
          placeholder={field.placeholder}
        />
      )}
    </label>
  );
}

function ToolbarButton({ children, label }: { children: ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex h-[28px] w-[28px] items-center justify-center rounded-[6px] text-[13px] text-app-text-secondary transition-colors hover:bg-app-bg hover:text-app-text"
    >
      {children}
    </button>
  );
}

export function AppEditorTemplate({ data: sourceData }: { data: AppEditorData }) {
  const { locale } = useLocale();
  const data = useLocalizedValue(sourceData);
  const scoreCopy = SCORE_COPY[locale];
  // score <= 0 은 미산출(분석 엔진 미연결)을 뜻한다 — 게이지를 그리지 않고 정직한 빈 상태를 보인다.
  const hasScore = data.score > 0;
  const scoreClamped = Math.max(0, Math.min(100, data.score));
  const gaugeDash = (scoreClamped / 100) * GAUGE_CIRCUMFERENCE;
  const scoreHex = data.score >= 70 ? "#009f81" : "#ff642d";

  return (
    <div className="flex h-full flex-col bg-app-bg text-app-text lg:flex-row">
      {/* 좌: Brief 패널 */}
      <aside className="w-full shrink-0 border-b border-app-border bg-white p-[20px] lg:w-[280px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <h2 className="text-[14px] font-semibold">Brief</h2>
        <form
          className="mt-[16px] flex flex-col gap-[14px]"
          onSubmit={(event) => event.preventDefault()}
        >
          {data.briefFields.map((field) => (
            <BriefField key={field.label} field={field} />
          ))}
          <button
            type="submit"
            className="mt-[6px] h-[36px] w-full rounded-[8px] bg-app-blue text-[13px] font-semibold text-white transition-colors hover:bg-app-blue-dark"
          >
            Generate
          </button>
        </form>
      </aside>

      {/* 중앙: 에디터 */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-[2px] border-b border-app-border bg-white px-[16px] py-[8px]">
          <ToolbarButton label="Bold">
            <span className="font-bold">B</span>
          </ToolbarButton>
          <ToolbarButton label="Italic">
            <span className="italic">I</span>
          </ToolbarButton>
          <ToolbarButton label="Underline">
            <span className="underline">U</span>
          </ToolbarButton>
          <span className="mx-[6px] h-[16px] w-px bg-app-border" aria-hidden="true" />
          <ToolbarButton label="Insert link">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M5.5 8.5L8.5 5.5M6 3.5L7 2.5a2.475 2.475 0 013.5 3.5l-1 1M8 10.5l-1 1a2.475 2.475 0 01-3.5-3.5l1-1"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          </ToolbarButton>
          <ToolbarButton label="Bulleted list">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M5 3.5h7M5 7h7M5 10.5h7"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <circle cx="2.5" cy="3.5" r="1" fill="currentColor" />
              <circle cx="2.5" cy="7" r="1" fill="currentColor" />
              <circle cx="2.5" cy="10.5" r="1" fill="currentColor" />
            </svg>
          </ToolbarButton>
          <span className="ml-auto truncate pl-[12px] text-[12px] text-app-text-secondary">
            {data.title}
          </span>
        </div>
        <div className="flex-1 p-[24px] lg:overflow-y-auto">
          <div className="mx-auto min-h-[400px] max-w-[760px] rounded-[8px] border border-app-border bg-white p-[24px]">
            <h1
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              className="text-[20px] font-semibold leading-[1.4] outline-none"
            >
              {data.previewTitle}
            </h1>
            <div
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              className="mt-[16px] flex flex-col gap-[16px] outline-none"
            >
              {data.previewBody.map((paragraph, i) => (
                <p key={i} className="text-[16px] leading-[1.7] text-app-text">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 우: 점수 + 제안 패널 */}
      <aside className="flex w-full shrink-0 flex-col border-t border-app-border bg-white p-[20px] lg:w-[300px] lg:overflow-y-auto lg:border-l lg:border-t-0">
        <p className="text-[12px] text-app-text-secondary">{data.scoreLabel}</p>
        {hasScore ? (
          <div className="relative mx-auto mt-[12px] h-[128px] w-[128px]">
            <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true">
              <circle cx="60" cy="60" r={GAUGE_RADIUS} stroke="#eef0f2" strokeWidth="8" fill="none" />
              <circle
                cx="60"
                cy="60"
                r={GAUGE_RADIUS}
                stroke={scoreHex}
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${gaugeDash} ${GAUGE_CIRCUMFERENCE}`}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className={cn(
                  "text-[40px] font-semibold leading-none",
                  data.score >= 70 ? "text-app-green" : "text-app-orange"
                )}
              >
                {data.score}
              </span>
              <span className="mt-[14px] text-[13px] text-app-text-secondary">/100</span>
            </div>
          </div>
        ) : (
          <div className="mt-[12px] rounded-[8px] border border-dashed border-app-border bg-app-bg p-[16px] text-center">
            <p className="text-[24px] font-semibold leading-[32px] text-app-text-secondary/60">—</p>
            <p className="mt-[4px] text-[12px] leading-[16px] text-app-text-secondary">
              {scoreCopy.unavailable}
            </p>
          </div>
        )}

        {data.suggestions.length > 0 ? (
          <ul className="mt-[20px] flex flex-col gap-[10px]">
            {data.suggestions.map((suggestion) => (
            <li key={suggestion.label} className="flex items-start gap-[8px]">
              {suggestion.status === "ok" ? (
                <span
                  className="mt-[2px] flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full bg-app-green"
                  aria-hidden="true"
                >
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2.5 6.5L5 9L9.5 3.5"
                      stroke="#fff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              ) : (
                <span
                  className="mt-[2px] h-[16px] w-[16px] shrink-0 rounded-full border-[1.5px] border-[#d1d2d5]"
                  aria-hidden="true"
                />
              )}
              <span
                className={cn(
                  "text-[13px] leading-[1.4]",
                  suggestion.status === "ok" ? "text-app-text-secondary" : "text-app-text"
                )}
              >
                {suggestion.label}
              </span>
            </li>
            ))}
          </ul>
        ) : (
          <p className="mt-[20px] text-[12px] leading-[16px] text-app-text-secondary">
            {scoreCopy.emptySuggestions}
          </p>
        )}

        <div className="mt-[24px] flex flex-col gap-[8px] lg:mt-auto lg:pt-[24px]">
          {data.actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={cn(
                "h-[36px] w-full rounded-[8px] px-[16px] text-[13px] font-semibold transition-colors",
                action.variant === "primary"
                  ? "bg-app-blue text-white hover:bg-app-blue-dark"
                  : "border border-app-border bg-white text-app-text hover:bg-[#f9fafb]"
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
