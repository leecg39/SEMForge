"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ORGANIC_COLORS, OrganicSegmented } from "./organic-ui";

/**
 * 자연검색 순위 상단 헤더 블록.
 * 크롭 01-header-filter-tabbar.png / organic-header.spec.md 기준.
 * - OrganicHeader: 브레드크럼 행 + 제목 행
 * - OrganicFilterBar: DB 세그먼트 + 장치/날짜/통화 필터
 * - OrganicPageTabs: 페이지 탭바 (하단 전폭 보더 + 활성 3px 바)
 */

/* ------------------------------------------------------------------ */
/* 오리지널 미니 아이콘 (외부 에셋 없음, currentColor 상속)              */
/* ------------------------------------------------------------------ */

function BookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
      <path
        d="M8 4.2C6.9 3.1 5.2 2.8 3 2.8v9.4c2.2 0 3.9.3 5 1.4 1.1-1.1 2.8-1.4 5-1.4V2.8c-2.2 0-3.9.3-5 1.4Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M8 4.2v9.4" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function BubbleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
      <path
        d="M2.8 4.4A1.6 1.6 0 0 1 4.4 2.8h7.2a1.6 1.6 0 0 1 1.6 1.6v4.8a1.6 1.6 0 0 1-1.6 1.6H8.2L5 13.4v-2.6h-.6a1.6 1.6 0 0 1-1.6-1.6V4.4Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="shrink-0">
      <path
        d="M6 3.5H4A1.5 1.5 0 0 0 2.5 5v5A1.5 1.5 0 0 0 4 11.5h5A1.5 1.5 0 0 0 10.5 10V8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M8.5 2.5h3v3M11.2 2.8 7 7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 업로드 화살표(내보내기) */
function ExportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
      <path
        d="M8 10.2V2.8M4.8 5.6 8 2.4l3.2 3.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.8 10.5v1.7a1.3 1.3 0 0 0 1.3 1.3h7.8a1.3 1.3 0 0 0 1.3-1.3v-1.7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
      <rect x="2" y="3" width="12" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 11v2.2M5.5 13.5h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function CaretDownIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden className="shrink-0">
      <path
        d="M1.5 2.8 4 5.3l2.5-2.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* 국기 (16×12 단순화 오리지널 SVG)                                     */
/* ------------------------------------------------------------------ */

/** 태극기 단순화: 흰 바탕 + 빨강(상)/파랑(하) 원 */
function FlagKr() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden className="shrink-0">
      <rect x="0.5" y="0.5" width="15" height="11" fill="#fff" stroke="rgba(0,12,8,0.16)" />
      <path d="M5 6a3 3 0 0 1 6 0Z" fill="#cd2e3a" />
      <path d="M5 6a3 3 0 0 0 6 0Z" fill="#0047a0" />
    </svg>
  );
}

/** 성조기 단순화: 빨간 줄 + 파란 사각 */
function FlagUs() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden className="shrink-0">
      <rect width="16" height="12" fill="#fff" />
      <g fill="#b22234">
        <rect y="0" width="16" height="1.5" />
        <rect y="3" width="16" height="1.5" />
        <rect y="6" width="16" height="1.5" />
        <rect y="9" width="16" height="1.5" />
      </g>
      <rect width="7" height="6" fill="#3c3b6e" />
      <rect x="0.5" y="0.5" width="15" height="11" fill="none" stroke="rgba(0,12,8,0.16)" />
    </svg>
  );
}

/** 유니언잭 단순화: 파란 바탕 + 대각선 + 십자 */
function FlagUk() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden className="shrink-0">
      <rect width="16" height="12" fill="#012169" />
      <path d="M0 0l16 12m0-12L0 12" stroke="#fff" strokeWidth="2" />
      <path d="M8 0v12M0 6h16" stroke="#fff" strokeWidth="4" />
      <path d="M8 0v12M0 6h16" stroke="#c8102e" strokeWidth="2" />
    </svg>
  );
}

/** 미매핑 코드 폴백: 회색 사각 */
function FlagFallback() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden className="shrink-0">
      <rect x="0.5" y="0.5" width="15" height="11" fill="#e2e5ea" stroke="rgba(0,12,8,0.16)" />
    </svg>
  );
}

function FlagIcon({ code }: { code: string }) {
  switch (code.toUpperCase()) {
    case "KR":
      return <FlagKr />;
    case "US":
      return <FlagUs />;
    case "UK":
    case "GB":
      return <FlagUk />;
    default:
      return <FlagFallback />;
  }
}

/* ------------------------------------------------------------------ */
/* OrganicHeader — 브레드크럼 행 + 제목 행                              */
/* ------------------------------------------------------------------ */

interface OrganicHeaderCopy {
  breadcrumbs: string[];
  manual: string;
  feedback: string;
  titlePrefix: string;
  exportPdf: string;
}

export function OrganicHeader({
  domain,
  domainHref,
  onExportPdf,
  copy,
}: {
  domain: string;
  domainHref: string;
  onExportPdf?: () => void;
  copy: OrganicHeaderCopy;
}) {
  return (
    <header>
      {/* 브레드크럼 행 */}
      <div className="flex items-center justify-between gap-4">
        <nav className="flex flex-wrap items-center gap-1.5 text-[12px]" style={{ color: ORGANIC_COLORS.textSecondary }}>
          {copy.breadcrumbs.map((crumb, i) => {
            const isLast = i === copy.breadcrumbs.length - 1;
            return (
              <span key={`${i}-${crumb}`} className="flex items-center gap-1.5">
                {isLast ? (
                  <span aria-current="page">{crumb}</span>
                ) : (
                  <span className="cursor-pointer hover:underline">{crumb}</span>
                )}
                {!isLast && <span aria-hidden>&gt;</span>}
              </span>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-4">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[12px] hover:underline"
            style={{ color: ORGANIC_COLORS.link }}
          >
            <BookIcon />
            {copy.manual}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[12px] hover:underline"
            style={{ color: ORGANIC_COLORS.link }}
          >
            <BubbleIcon />
            {copy.feedback}
          </button>
        </div>
      </div>

      {/* 제목 행 */}
      <div className="mt-2 flex items-center justify-between gap-4">
        <h1 className="flex items-center gap-1.5 text-[20px] font-semibold" style={{ color: ORGANIC_COLORS.heading }}>
          <span>
            {copy.titlePrefix} {domain}
          </span>
          <a
            href={domainHref}
            target="_blank"
            rel="noreferrer"
            title={domain}
            className="inline-flex text-[rgba(0,3,0,0.584)] transition-colors hover:text-[rgb(35,95,226)]"
          >
            <ExternalLinkIcon />
          </a>
        </h1>
        <button
          type="button"
          onClick={onExportPdf}
          className="inline-flex h-[28px] shrink-0 items-center gap-1.5 rounded-[6px] border bg-white px-3 text-[14px] leading-none text-black transition-colors hover:bg-[rgba(0,22,16,0.027)]"
          style={{ borderColor: ORGANIC_COLORS.border }}
        >
          <ExportIcon />
          {copy.exportPdf}
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* OrganicFilterBar — DB 세그먼트 + 장치/날짜/통화                      */
/* ------------------------------------------------------------------ */

interface OrganicFilterBarCopy {
  device: string;
  desktop: string;
  mobile: string;
  date: string;
  currency: string;
}

/** DB 그룹 마지막 `⋯` 버튼용 센티널 값 (시각만 — 클릭 무동작) */
const MORE_DB_KEY = "__more__";

export function OrganicFilterBar({
  databases,
  activeDb,
  onDbChange,
  device,
  onDeviceChange,
  dateLabel,
  currency,
  copy,
}: {
  databases: Array<{ code: string; label: string; count: number }>;
  activeDb: string;
  onDbChange: (code: string) => void;
  device: "desktop" | "mobile";
  onDeviceChange: (d: "desktop" | "mobile") => void;
  dateLabel: string;
  currency: string;
  copy: OrganicFilterBarCopy;
}) {
  const [deviceOpen, setDeviceOpen] = useState(false);
  const deviceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!deviceOpen) return;
    const onDown = (e: MouseEvent) => {
      if (deviceRef.current && !deviceRef.current.contains(e.target as Node)) {
        setDeviceOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [deviceOpen]);

  const dbOptions = [
    ...databases.map((db) => ({
      value: db.code,
      label: (
        <span title={db.label} className="inline-flex items-center gap-1.5">
          <FlagIcon code={db.code} />
          <span className="text-[14px] leading-none">{db.code}</span>
          <span className="text-[12px] leading-none" style={{ color: ORGANIC_COLORS.textSecondary }}>
            {db.count}
          </span>
        </span>
      ),
    })),
    { value: MORE_DB_KEY, label: <span className="px-0.5 leading-none">⋯</span> },
  ];

  const deviceLabel = device === "desktop" ? copy.desktop : copy.mobile;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      {/* DB 세그먼트 (joined 그룹 — organic-ui 재사용) */}
      <OrganicSegmented
        options={dbOptions}
        value={activeDb}
        onChange={(next) => {
          if (next !== MORE_DB_KEY) onDbChange(next);
        }}
      />

      {/* 장치 (드롭다운 실동작) */}
      <div className="flex items-center gap-1">
        <span className="text-[12px]" style={{ color: ORGANIC_COLORS.textSecondary }}>
          {copy.device}
        </span>
        <div ref={deviceRef} className="relative">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={deviceOpen}
            onClick={() => setDeviceOpen((o) => !o)}
            className="inline-flex items-center gap-1"
          >
            <span aria-hidden className="inline-flex" style={{ color: ORGANIC_COLORS.heading }}>
              <MonitorIcon />
            </span>
            <span className="text-[13.33px] leading-none" style={{ color: ORGANIC_COLORS.link }}>
              {deviceLabel}
            </span>
            <span aria-hidden className="inline-flex" style={{ color: ORGANIC_COLORS.link }}>
              <CaretDownIcon />
            </span>
          </button>
          {deviceOpen && (
            <div
              role="listbox"
              className="absolute left-0 top-full z-10 mt-1 min-w-[128px] rounded-[6px] border bg-white py-1"
              style={{ borderColor: ORGANIC_COLORS.border, boxShadow: "0 4px 12px rgba(0,0,0,0.12)" }}
            >
              {(["desktop", "mobile"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="option"
                  aria-selected={device === d}
                  onClick={() => {
                    onDeviceChange(d);
                    setDeviceOpen(false);
                  }}
                  className={cn(
                    "flex h-8 w-full items-center px-3 text-left text-[13.33px] transition-colors hover:bg-[rgba(0,81,255,0.04)]",
                    device === d && "bg-[rgba(0,81,255,0.04)]",
                  )}
                  style={{ color: ORGANIC_COLORS.heading }}
                >
                  {d === "desktop" ? copy.desktop : copy.mobile}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 날짜 (트리거 시각만) */}
      <div className="flex items-center gap-1">
        <span className="text-[12px]" style={{ color: ORGANIC_COLORS.textSecondary }}>
          {copy.date}
        </span>
        <button type="button" className="inline-flex items-center gap-1">
          <span className="text-[13.33px] leading-none" style={{ color: ORGANIC_COLORS.link }}>
            {dateLabel ? dateLabel : "—"}
          </span>
          <span aria-hidden className="inline-flex" style={{ color: ORGANIC_COLORS.link }}>
            <CaretDownIcon />
          </span>
        </button>
      </div>

      {/* 통화 (트리거 시각만) */}
      <div className="flex items-center gap-1">
        <span className="text-[12px]" style={{ color: ORGANIC_COLORS.textSecondary }}>
          {copy.currency}
        </span>
        <button type="button" className="inline-flex items-center gap-1">
          <span className="text-[13.33px] leading-none" style={{ color: ORGANIC_COLORS.link }}>
            {currency}
          </span>
          <span aria-hidden className="inline-flex" style={{ color: ORGANIC_COLORS.link }}>
            <CaretDownIcon />
          </span>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* OrganicPageTabs — 페이지 탭바                                        */
/* ------------------------------------------------------------------ */

export function OrganicPageTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ key: string; label: string }>;
  active: string;
  onChange?: (key: string) => void;
}) {
  return (
    <div role="tablist" className="mt-4 flex border-b" style={{ borderColor: ORGANIC_COLORS.border }}>
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange?.(tab.key)}
            className={cn(
              "relative mr-8 h-10 whitespace-nowrap text-[13.33px] font-medium text-[rgba(1,5,0,0.898)]",
              !selected && "transition-colors hover:text-[rgb(35,95,226)]",
            )}
          >
            {tab.label}
            {selected && (
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-px h-[3px]"
                style={{ backgroundColor: ORGANIC_COLORS.selectedBorder }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
