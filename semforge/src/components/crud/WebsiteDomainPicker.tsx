"use client";

import { useEffect, useRef, useState } from "react";
import { translateAppText } from "@/i18n/app";
import { useLocale } from "@/i18n/LocaleProvider";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";

/**
 * 폴더 생성 다이얼로그의 "웹사이트 추가" 드롭다운.
 * ko.semforge.com/home/ 생성 폼 실측(사용자 제공 캡처):
 *   - 트리거: "웹사이트 추가 (N개의 무료 웹사이트 남음)"
 *   - 패널: 검색 입력 "Enter a domain or subdomain here..." + "모든 웹사이트" 목록
 *   - 기존 웹사이트를 고르거나, 입력한 신규 도메인을 그대로 쓸 수 있다.
 */

const FREE_WEBSITE_LIMIT = 10;

interface SiteRow {
  id: string;
  domain: string;
}

export function WebsiteDomainPicker({
  id,
  value,
  invalid,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  invalid?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const { locale } = useLocale();
  const tx = (text: string) => translateAppText(locale, text) ?? text;
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState<SiteRow[] | null>(null);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // 패널을 처음 열 때만 워크스페이스 웹사이트 목록을 가져온다.
  useEffect(() => {
    if (!open || sites !== null) return;
    let cancelled = false;
    api
      .get<SiteRow[]>("/api/sites/?pageSize=100")
      .then((response) => {
        if (!cancelled) setSites(response.data);
      })
      .catch(() => {
        if (!cancelled) setSites([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sites]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const remaining = Math.max(0, FREE_WEBSITE_LIMIT - (sites?.length ?? 0));
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = (sites ?? []).filter((site) =>
    site.domain.toLowerCase().includes(normalizedQuery)
  );
  const exactMatch = (sites ?? []).some(
    (site) => site.domain.toLowerCase() === normalizedQuery
  );

  const selectDomain = (domain: string) => {
    onChange(domain);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-invalid={invalid}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-[38px] w-full items-center gap-2 rounded-[6px] border bg-white px-3 text-left text-[14px] outline-none",
          invalid ? "border-app-red" : "border-app-border focus:border-app-link"
        )}
      >
        {value ? (
          <span className="truncate text-app-text">{value}</span>
        ) : (
          <span className="truncate text-app-text-secondary">{tx("웹사이트 추가")}</span>
        )}
        <span className="ml-auto shrink-0 text-[12px] text-app-text-secondary">
          {locale === "en"
            ? `(${remaining} free websites left)`
            : `(${remaining}개의 무료 웹사이트 남음)`}
        </span>
        <span aria-hidden="true" className="shrink-0 text-[12px] text-app-text-secondary">
          {open ? "⌃" : "⌄"}
        </span>
      </button>

      {open && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          aria-label={tx("모든 웹사이트")}
          className="absolute left-0 right-0 z-10 mt-1 rounded-[8px] border border-app-border bg-white py-2 shadow-lg"
        >
          <div className="px-3 pb-2">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              aria-label={tx("도메인 검색")}
              className="h-[34px] w-full rounded-[6px] border border-app-border px-3 text-[13px] outline-none focus:border-app-link"
            />
          </div>
          <p className="px-3 pb-1 text-[12px] font-medium text-app-text-secondary">
            {tx("모든 웹사이트")}
          </p>
          <ul className="max-h-[200px] overflow-y-auto">
            {sites === null && (
              <li className="px-3 py-2 text-[13px] text-app-text-secondary">
                {tx("불러오는 중…")}
              </li>
            )}
            {filtered.map((site) => (
              <li key={site.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === site.domain}
                  onClick={() => selectDomain(site.domain)}
                  className="block w-full px-3 py-2 text-left text-[13px] hover:bg-app-bg"
                >
                  {site.domain}
                </button>
              </li>
            ))}
            {normalizedQuery && !exactMatch && (
              <li>
                <button
                  type="button"
                  onClick={() => selectDomain(query.trim())}
                  className="block w-full px-3 py-2 text-left text-[13px] font-medium text-app-link hover:bg-app-bg"
                >
                  {tx("새 도메인 사용")}: {query.trim()}
                </button>
              </li>
            )}
            {sites !== null && filtered.length === 0 && !normalizedQuery && (
              <li className="px-3 py-2 text-[13px] text-app-text-secondary">
                {tx("등록된 웹사이트가 없습니다")}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
