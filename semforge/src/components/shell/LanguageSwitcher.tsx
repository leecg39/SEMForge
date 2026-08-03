"use client";

import { useEffect, useRef, useState } from "react";
import { LANGUAGE_OPTIONS, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { useLocale } from "@/i18n/LocaleProvider";
import { langCheckDataUri } from "@/components/shell/icon-data";
import { cn } from "@/lib/utils";

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21M12 3c-2.4 2.5-3.6 5.5-3.6 9S9.6 18.5 12 21" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="m2.5 4.25 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LanguageSwitcher({
  variant = "public",
}: {
  variant?: "public" | "app" | "header";
}) {
  const { locale, switching, switchError, switchLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dict = getDictionary(locale);
  const options = LANGUAGE_OPTIONS.filter(
    (option): option is { label: string; locale: Locale } => Boolean(option.locale),
  );

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function choose(next: Locale) {
    if (next === locale) {
      setOpen(false);
      return;
    }
    try {
      await switchLocale(next);
      setOpen(false);
    } catch {
      // 오류 문구는 열린 메뉴 안에서 접근 가능하게 표시한다.
    }
  }

  const isHeader = variant === "header";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={locale === "ko" ? "언어 선택" : "Select language"}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={switching}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex items-center gap-2 disabled:cursor-wait disabled:opacity-60",
          variant === "public" &&
            "rounded-pill border border-mp-medium-grey px-4 py-2 font-lazzer text-[14px] font-medium text-mp-off-black transition-colors hover:border-mp-off-black",
          variant === "app" &&
            "text-[14px] leading-[24px] text-a2-footer-text hover:underline",
          isHeader &&
            "h-10 rounded-full bg-faint px-3 text-[13px] text-hof transition-colors hover:bg-bebe",
        )}
      >
        {(variant === "app" || isHeader) && <GlobeIcon />}
        <span>{dict.footer.languageLabel}</span>
        {(variant === "app" || isHeader) && <ChevronIcon />}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={locale === "ko" ? "언어" : "Language"}
          className={cn(
            "absolute z-[700] w-[190px] rounded-[10px] border border-black/10 bg-white p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.14)]",
            isHeader ? "right-0 top-full mt-2" : "bottom-full left-0 mb-2",
          )}
        >
          {options.map((option) => {
            const selected = option.locale === locale;
            return (
              <button
                key={option.locale}
                type="button"
                role="option"
                lang={option.locale}
                aria-selected={selected}
                disabled={switching}
                onClick={() => void choose(option.locale)}
                className={cn(
                  "flex w-full items-center justify-between rounded-[7px] px-3 py-2 text-left text-[14px] text-mp-off-black hover:bg-black/[0.06]",
                  selected && "font-semibold",
                )}
              >
                {option.label}
                {selected && <img src={langCheckDataUri} alt="" width={18} height={18} />}
              </button>
            );
          })}
          {switchError && (
            <p role="alert" className="px-3 pb-1 pt-2 text-[12px] leading-4 text-app-red">
              {switchError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
