"use client";

import type { FormEvent } from "react";
import { useLocale } from "@/i18n/LocaleProvider";

const EXAMPLE_KEYWORDS = ["seo tools", "ai marketing", "커피 머신", "노트북 추천"];

const COPY = {
  en: {
    keyword: "Keyword",
    keywordPlaceholder: "Enter a keyword",
    domain: "Your domain (optional)",
    domainPlaceholder: "example.com",
    country: "Database",
    device: "Device",
    desktop: "Desktop",
    mobile: "Mobile",
    analyze: "Analyze",
    analyzing: "Collecting SERP…",
    tryExample: "Try an example:",
  },
  ko: {
    keyword: "키워드",
    keywordPlaceholder: "키워드를 입력하세요",
    domain: "내 도메인 (선택)",
    domainPlaceholder: "example.com",
    country: "데이터베이스",
    device: "기기",
    desktop: "데스크톱",
    mobile: "모바일",
    analyze: "분석",
    analyzing: "SERP 수집 중…",
    tryExample: "예시 키워드:",
  },
} as const;

export function SearchForm({
  keyword,
  targetDomain,
  country,
  device,
  loading,
  onKeywordChange,
  onTargetDomainChange,
  onCountryChange,
  onDeviceChange,
  onSubmit,
  onExample,
}: {
  keyword: string;
  targetDomain: string;
  country: string;
  device: "desktop" | "mobile";
  loading: boolean;
  onKeywordChange: (value: string) => void;
  onTargetDomainChange: (value: string) => void;
  onCountryChange: (value: string) => void;
  onDeviceChange: (value: "desktop" | "mobile") => void;
  onSubmit: () => void;
  onExample: (keyword: string) => void;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form
      onSubmit={submit}
      className="mt-5 rounded-[10px] border border-app-border bg-a2-card p-3 shadow-[var(--a2-card-shadow)]"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.2fr)_minmax(180px,1fr)_140px_140px_auto] lg:items-end">
        <label className="min-w-0">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.4px] text-a2-text-muted">
            {copy.keyword}
          </span>
          <input
            name="keyword"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder={copy.keywordPlaceholder}
            required
            className="h-11 w-full rounded-[7px] border border-app-border bg-white px-3 text-[14px] text-a2-text outline-none transition focus:border-app-blue focus:ring-2 focus:ring-[#d8ecff]"
          />
        </label>
        <label className="min-w-0">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.4px] text-a2-text-muted">
            {copy.domain}
          </span>
          <input
            name="domain"
            value={targetDomain}
            onChange={(event) => onTargetDomainChange(event.target.value)}
            placeholder={copy.domainPlaceholder}
            autoComplete="url"
            className="h-11 w-full rounded-[7px] border border-app-border bg-white px-3 text-[13px] text-a2-text outline-none transition focus:border-app-blue focus:ring-2 focus:ring-[#d8ecff]"
          />
        </label>
        <label>
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.4px] text-a2-text-muted">
            {copy.country}
          </span>
          <select
            aria-label={copy.country}
            value={country}
            onChange={(event) => onCountryChange(event.target.value)}
            className="h-11 w-full rounded-[7px] border border-app-border bg-white px-3 text-[13px] text-a2-text outline-none focus:border-app-blue focus:ring-2 focus:ring-[#d8ecff]"
          >
            <option value="KR">South Korea</option>
            <option value="US">United States</option>
          </select>
        </label>
        <label>
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.4px] text-a2-text-muted">
            {copy.device}
          </span>
          <select
            value={device}
            onChange={(event) => onDeviceChange(event.target.value as "desktop" | "mobile")}
            className="h-11 w-full rounded-[7px] border border-app-border bg-white px-3 text-[13px] text-a2-text outline-none focus:border-app-blue focus:ring-2 focus:ring-[#d8ecff]"
          >
            <option value="desktop">{copy.desktop}</option>
            <option value="mobile">{copy.mobile}</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={loading}
          className="h-11 rounded-[7px] bg-app-blue px-6 text-[13px] font-semibold text-white transition-colors hover:bg-app-blue-dark disabled:cursor-wait disabled:opacity-70"
        >
          {loading ? copy.analyzing : copy.analyze}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-a2-text-muted">{copy.tryExample}</span>
        {EXAMPLE_KEYWORDS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onExample(item)}
            className="min-h-8 rounded-full border border-app-border bg-white px-3 text-[11px] text-a2-text transition hover:border-[#b9d8f2] hover:bg-[#f5faff]"
          >
            {item}
          </button>
        ))}
      </div>
    </form>
  );
}
