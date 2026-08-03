"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, SearchIcon } from "@/components/app/app-icons";
import { AppNotificationsMenu } from "@/components/app/AppNotificationsMenu";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { useLocale } from "@/i18n/LocaleProvider";

const headerLinkClass =
  "hidden rounded-full px-3 py-2 text-[14px] font-medium text-app-text transition-colors hover:bg-faint md:block";

/** 로그인 앱 상단 헤더 — 흰 캔버스와 캡슐형 검색을 사용하는 공용 내비게이션. */
export function AppHeader() {
  const { locale } = useLocale();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-50 flex h-[64px] shrink-0 items-center gap-3 border-b border-bebe bg-white px-4 md:px-6">
      {/* 좌: 워드마크 */}
      <Link href="/home/" className="flex shrink-0 flex-col justify-center leading-none">
        <span className="font-lazzer text-[20px] font-semibold leading-[22px] tracking-[-0.4px] text-rausch">
          SEMForge
        </span>
      </Link>

      {/* 중앙: 전역 검색 (모바일에서는 아이콘 버튼으로 축소) */}
      <form
        className="mx-auto hidden h-[44px] w-full max-w-[560px] flex-1 items-center gap-2 rounded-full border border-bebe bg-white py-1 pl-4 pr-1 shadow-[var(--shadow-subtle)] sm:flex"
        onSubmit={(e) => {
          e.preventDefault();
          const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
          if (q) router.push(`/analytics/overview/?domain=${encodeURIComponent(q)}`);
        }}
      >
        <SearchIcon width={16} height={16} className="shrink-0 text-foggy" />
        <input
          type="text"
          name="q"
          placeholder={
            locale === "ko"
              ? "도구, 도메인 또는 키워드 검색"
              : "Search for a tool, domain, or keyword"
          }
          className="h-full w-full min-w-0 bg-transparent text-[14px] text-hof outline-none placeholder:text-foggy"
        />
        <button
          type="submit"
          aria-label={locale === "ko" ? "검색" : "Search"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rausch text-white transition-colors hover:bg-rausch-600"
        >
          <SearchIcon width={16} height={16} />
        </button>
      </form>
      <button
        type="button"
        aria-label={locale === "ko" ? "검색" : "Search"}
        className="ml-auto flex h-10 w-10 items-center justify-center rounded-full bg-faint text-hof hover:bg-bebe sm:hidden"
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
          className="hidden items-center gap-1 rounded-full px-3 py-2 text-[14px] font-medium text-app-text transition-colors hover:bg-faint md:flex"
        >
          {locale === "ko" ? "더보기" : "More"}
          <ChevronDownIcon width={14} height={14} className="text-app-text-secondary" />
        </button>
        <AppNotificationsMenu />
        <LanguageSwitcher variant="header" />
        <button
          type="button"
          aria-label={locale === "ko" ? "계정 메뉴" : "Account menu"}
          className="ml-2 flex h-10 w-10 items-center justify-center rounded-full bg-rausch text-[13px] font-semibold text-white transition-colors hover:bg-rausch-600"
        >
          U
        </button>
      </div>
    </header>
  );
}
