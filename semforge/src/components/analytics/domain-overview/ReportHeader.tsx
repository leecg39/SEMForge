"use client";

import { useState } from "react";
import Link from "next/link";
import type { AnalyticsDevice } from "@/lib/analytics/types";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/LocaleProvider";
import { COPY, OVERVIEW_HREF, SEO_HOME_HREF, SUPPORTED_COUNTRIES } from "./copy";

function ScopeChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "h-8 rounded-[7px] border px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        active
          ? "border-app-blue bg-[#eaf3ff] text-app-blue"
          : "border-app-border bg-a2-card text-a2-text-muted hover:text-a2-text",
      )}
    >
      {children}
    </button>
  );
}

/**
 * 리포트 컨텍스트 헤더 — 브레드크럼, "도메인 개요: {domain}" 타이틀,
 * 국가(데이터베이스)·기기 전환, 데이터 상태 배지, 내보내기.
 */
export function ReportHeader({
  domain,
  country,
  device,
  provenanceLive,
  updatedLabel,
  busy,
  exportDisabled,
  onScopeChange,
  onAnalyze,
  onExport,
}: {
  domain: string;
  country: string;
  device: AnalyticsDevice;
  provenanceLive: boolean;
  updatedLabel: string | null;
  busy: boolean;
  exportDisabled: boolean;
  onScopeChange: (country: string, device: AnalyticsDevice) => void;
  onAnalyze: (domain: string) => void;
  onExport: () => void;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [draft, setDraft] = useState(domain);

  return (
    <header>
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[12px] text-a2-text-muted">
        <Link href={SEO_HOME_HREF} className="hover:text-a2-text hover:underline">
          {copy.breadcrumbSeo}
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={OVERVIEW_HREF} className="hover:text-a2-text hover:underline">
          {copy.title}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-a2-text">{domain}</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <h1 className="flex min-w-0 items-center gap-2 text-[24px] font-semibold leading-[32px] tracking-[-0.3px] text-a2-text">
          <span className="truncate">
            {copy.title}: {domain}
          </span>
          <a
            href={`https://${domain}`}
            target="_blank"
            rel="noreferrer"
            title={copy.openSite}
            aria-label={copy.openSite}
            className="shrink-0 text-a2-text-muted transition-colors hover:text-app-blue"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M14 4h6v6M20 4 10 14M9 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          <form
            key={domain}
            onSubmit={(event) => {
              event.preventDefault();
              const next = draft.trim();
              if (next) onAnalyze(next);
            }}
            className="flex items-center gap-2"
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={copy.domainPlaceholder}
              aria-label={copy.domain}
              className="h-9 w-[220px] rounded-[7px] border border-app-border bg-white px-3 text-[13px] text-a2-text outline-none focus:border-app-blue"
            />
            <button
              type="submit"
              disabled={busy}
              className="h-9 shrink-0 rounded-[7px] bg-[#171a26] px-4 text-[12px] font-semibold text-white transition-colors hover:bg-[#2a2f3e] disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? copy.analyzing : copy.analyze}
            </button>
          </form>
          <button
            type="button"
            onClick={onExport}
            disabled={exportDisabled}
            className="flex h-9 items-center rounded-[7px] border border-app-border bg-a2-card px-3.5 text-[12px] font-medium text-a2-text transition-colors hover:bg-app-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copy.export}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5" role="group" aria-label={copy.country}>
          <span className="text-[11px] font-medium uppercase tracking-[0.4px] text-a2-text-muted">
            {copy.country}
          </span>
          {SUPPORTED_COUNTRIES.map((code) => (
            <ScopeChip
              key={code}
              active={country === code}
              disabled={busy}
              onClick={() => onScopeChange(code, device)}
            >
              {code}
            </ScopeChip>
          ))}
        </div>

        <div className="flex items-center gap-1.5" role="group" aria-label={copy.device}>
          <span className="text-[11px] font-medium uppercase tracking-[0.4px] text-a2-text-muted">
            {copy.device}
          </span>
          <ScopeChip active={device === "desktop"} disabled={busy} onClick={() => onScopeChange(country, "desktop")}>
            {copy.desktop}
          </ScopeChip>
          <ScopeChip active={device === "mobile"} disabled={busy} onClick={() => onScopeChange(country, "mobile")}>
            {copy.mobile}
          </ScopeChip>
        </div>

        <div className="flex items-center gap-2">
          {provenanceLive ? (
            <span className="rounded-full bg-[#e6f5f0] px-2.5 py-1 text-[11px] font-medium text-[#0a6b57]">
              {copy.liveData}
            </span>
          ) : (
            <span className="rounded-full bg-[#f1f2f4] px-2.5 py-1 text-[11px] font-medium text-a2-text-muted">
              {copy.unavailable}
            </span>
          )}
          {updatedLabel && (
            <span className="text-[11px] text-a2-text-muted">
              {copy.dataUpdated}: {updatedLabel}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
