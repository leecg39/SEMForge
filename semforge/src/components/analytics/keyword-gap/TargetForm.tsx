"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  formatGapTargetParam,
  gapTargetLabel,
  MAX_GAP_TARGETS,
  type GapScope,
  type GapTarget,
} from "@/lib/analytics/keyword-gap";
import { cn } from "@/lib/utils";
import {
  KEYWORD_GAP_HREF,
  SCOPE_ORDER,
  SUPPORTED_COUNTRIES,
  TARGET_COLORS,
  type GapCopy,
} from "./copy";
import { pushRecentGap } from "./recent";

interface RowState {
  value: string;
  scope: GapScope;
}

function toRows(targets: GapTarget[] | undefined): RowState[] {
  const rows = (targets ?? []).map((target) => ({ value: target.value, scope: target.scope }));
  while (rows.length < 2) rows.push({ value: "", scope: "root" });
  return rows.slice(0, MAX_GAP_TARGETS);
}

/**
 * 나 + 경쟁자(최대 4) 대상 입력 폼.
 * 제출하면 URL 쿼리(`you`, `c1`–`c4`, `country`)로 이동해 SSR 리포트를 다시 만든다.
 * 키워드 유형은 자연 키워드만 소스가 있으므로 유료/PLA 는 비활성으로 표시한다.
 */
export function GapTargetForm({
  copy,
  initialTargets,
  initialCountry = "KR",
  variant,
}: {
  copy: GapCopy;
  initialTargets?: GapTarget[];
  initialCountry?: string;
  variant: "landing" | "report";
}) {
  const router = useRouter();
  const [rows, setRows] = useState<RowState[]>(() => toRows(initialTargets));
  const [country, setCountry] = useState(
    (SUPPORTED_COUNTRIES as readonly string[]).includes(initialCountry.toUpperCase())
      ? initialCountry.toUpperCase()
      : "KR",
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const setRow = (index: number, patch: Partial<RowState>) => {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const submit = () => {
    const you: GapTarget = { value: rows[0].value, scope: rows[0].scope };
    if (!gapTargetLabel(you)) {
      setError(copy.needYou);
      return;
    }
    const competitors = rows
      .slice(1)
      .map((row): GapTarget => ({ value: row.value, scope: row.scope }))
      .filter((target) => target.value.trim() && gapTargetLabel(target));
    if (competitors.length === 0) {
      setError(copy.needCompetitor);
      return;
    }
    setError(null);
    setSubmitting(true);
    const encoded = [you, ...competitors].map(formatGapTargetParam);
    const params = new URLSearchParams();
    params.set("you", encoded[0]);
    encoded.slice(1).forEach((value, index) => params.set(`c${index + 1}`, value));
    params.set("country", country);
    pushRecentGap({ targets: encoded, country });
    router.push(`${KEYWORD_GAP_HREF}?${params.toString()}`);
  };

  const compact = variant === "report";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="w-full"
    >
      <div className={cn(compact ? "flex flex-wrap items-center gap-2" : "flex flex-col gap-2")}>
        {rows.map((row, index) => (
          <div
            key={index}
            className={cn(
              "flex min-w-0 items-center gap-2",
              compact ? "flex-none basis-[320px]" : "w-full",
            )}
          >
            <span
              className={cn(
                "flex h-9 items-center rounded-l-[8px] border border-r-0 border-app-border px-2",
                compact && "h-8",
              )}
              style={{ backgroundColor: "#f7f8fa" }}
            >
              {index === 0 ? (
                <span
                  className="rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold text-white"
                  style={{ backgroundColor: TARGET_COLORS[0] }}
                >
                  {copy.youBadge}
                </span>
              ) : (
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: TARGET_COLORS[index] }}
                />
              )}
            </span>
            <input
              type="text"
              value={row.value}
              onChange={(event) => setRow(index, { value: event.target.value })}
              placeholder={index === 0 ? copy.youPlaceholder : copy.competitorPlaceholder}
              aria-label={index === 0 ? copy.youPlaceholder : `${copy.competitorPlaceholder} ${index}`}
              className={cn(
                "-ml-2 h-9 min-w-0 flex-1 rounded-r-[8px] border border-l-0 border-app-border bg-white px-2.5 text-[13px] text-a2-text outline-none transition-colors focus:border-app-blue",
                compact && "h-8",
              )}
            />
            <select
              value={row.scope}
              onChange={(event) => setRow(index, { scope: event.target.value as GapScope })}
              aria-label={copy.scopeLabels[row.scope]}
              className={cn(
                "h-9 shrink-0 rounded-[8px] border border-app-border bg-white px-2 text-[12px] text-a2-text outline-none focus:border-app-blue",
                compact && "h-8",
              )}
            >
              {SCOPE_ORDER.map((scope) => (
                <option key={scope} value={scope}>
                  {copy.scopeLabels[scope]}
                </option>
              ))}
            </select>
            {!compact && (
              <select
                value="organic"
                aria-label={copy.typeOrganic}
                title={copy.typeUnavailable}
                onChange={() => undefined}
                className="h-9 shrink-0 rounded-[8px] border border-app-border bg-white px-2 text-[12px] text-a2-text outline-none focus:border-app-blue"
              >
                <option value="organic">{copy.typeOrganic}</option>
                <option value="paid" disabled>
                  {copy.typePaid}
                </option>
                <option value="pla" disabled>
                  {copy.typePla}
                </option>
              </select>
            )}
            {index > 0 && rows.length > 2 && (
              <button
                type="button"
                aria-label={copy.removeRow}
                onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[14px] text-a2-text-muted transition-colors hover:bg-black/5 hover:text-a2-text"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {rows.length < MAX_GAP_TARGETS ? (
          <button
            type="button"
            onClick={() => setRows((current) => [...current, { value: "", scope: "root" }])}
            className="text-[13px] font-medium text-app-blue hover:underline"
          >
            {copy.addCompetitor}
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <select
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            aria-label={copy.country}
            className="h-9 shrink-0 rounded-[8px] border border-app-border bg-white px-2 text-[13px] text-a2-text outline-none focus:border-app-blue"
          >
            {SUPPORTED_COUNTRIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={submitting}
            className="h-9 shrink-0 rounded-[8px] bg-[#171a26] px-6 text-[13px] font-semibold text-white transition-colors hover:bg-[#2a2f3e] disabled:opacity-60"
          >
            {copy.compare}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[12px] text-[#d1002f]">
          {error}
        </p>
      )}
    </form>
  );
}