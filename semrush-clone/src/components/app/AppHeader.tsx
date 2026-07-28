"use client";

import Link from "next/link";
import { ChevronDownIcon, SearchIcon } from "@/components/app/app-icons";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { useLocale } from "@/i18n/LocaleProvider";

const headerLinkClass =
  "hidden rounded-[6px] px-2.5 py-1.5 text-[13px] text-app-text transition-colors hover:bg-app-bg md:block";

/** 로그인 앱 상단 헤더 (56px, 흰 배경, 하단 보더) */
export function AppHeader() {
  const { locale } = useLocale();

  return (
    <header className="sticky top-0 z-50 flex h-[56px] shrink-0 items-center gap-3 border-b border-app-border bg-white px-4">
      {/* 좌: 워드마크 */}
      <Link href="/home/" className="flex shrink-0 flex-col justify-center leading-none">
        <span className="font-lazzer text-[18px] font-semibold leading-[20px] tracking-[-0.36px] text-app-text">
          Semrush
        </span>
        <span className="text-[9px] leading-[11px] text-app-text-secondary">
          {locale === "ko" ? "Adobe 계열사" : "An Adobe Company"}
        </span>
      </Link>

      {/* 중앙: 전역 검색 (모바일에서는 아이콘 버튼으로 축소) */}
      <div className="mx-auto hidden h-[36px] w-full max-w-[480px] flex-1 items-center gap-2 rounded-[8px] bg-app-bg px-3 sm:flex">
        <SearchIcon width={16} height={16} className="shrink-0 text-app-text-secondary" />
        <input
          type="text"
          placeholder={
            locale === "ko"
              ? "도구, 도메인 또는 키워드 검색"
              : "Search for a tool, domain, or keyword"
          }
          className="h-full w-full min-w-0 bg-transparent text-[13px] text-app-text outline-none placeholder:text-app-text-secondary"
        />
      </div>
      <button
        type="button"
        aria-label={locale === "ko" ? "검색" : "Search"}
        className="ml-auto flex h-[32px] w-[32px] items-center justify-center rounded-[6px] text-app-text-secondary hover:bg-app-bg sm:hidden"
      >
        <SearchIcon width={18} height={18} />
      </button>

      {/* 우: 링크 + 프로필 */}
      <div className="flex shrink-0 items-center gap-1">
        <Link href="/pricing/" className={headerLinkClass}>
          {locale === "ko" ? "가격 책정" : "Pricing"}
        </Link>
        <Link href="/enterprise/" className={headerLinkClass}>
          {locale === "ko" ? "엔터프라이즈" : "Enterprise"}
        </Link>
        <button
          type="button"
          className="hidden items-center gap-1 rounded-[6px] px-2.5 py-1.5 text-[13px] text-app-text transition-colors hover:bg-app-bg md:flex"
        >
          {locale === "ko" ? "더보기" : "More"}
          <ChevronDownIcon width={14} height={14} className="text-app-text-secondary" />
        </button>
        <LanguageSwitcher variant="header" />
        <button
          type="button"
          aria-label={locale === "ko" ? "계정 메뉴" : "Account menu"}
          className="ml-2 flex h-[32px] w-[32px] items-center justify-center rounded-full bg-app-blue text-[13px] font-semibold text-white"
        >
          U
        </button>
      </div>
    </header>
  );
}
