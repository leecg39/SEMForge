"use client";

import Link from "next/link";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { translateAppText } from "@/i18n/app";
import { useLocale } from "@/i18n/LocaleProvider";

/**
 * 로그인 앱 푸터.
 * ko.semforge.com/home/ 1440px 실측: padding 24px 32px, gap 12px, 2행 구성.
 * 근거: docs/research/components/promo-carousel-and-footer.spec.md
 */

const linkClass = "text-[14px] leading-[24px] text-a2-footer-text hover:underline";

export function AppFooter() {
  const { locale } = useLocale();
  const tx = (text: string) => translateAppText(locale, text) ?? text;

  return (
    <footer className="flex flex-col gap-[12px] bg-a2-surface px-[16px] py-[24px] lg:px-[32px]">
      <div className="flex flex-wrap items-center gap-x-[24px] gap-y-[8px]">
        <Link href="/company/contacts/" className={linkClass}>
          {tx("문의하기")}
        </Link>
        <Link href="/company/" className={linkClass}>
          {tx("회사 정보")}
        </Link>
        <Link href="/blog/" className={linkClass}>
          {tx("블로그")}
        </Link>
        <LanguageSwitcher variant="app" />

        <div className="ml-auto flex items-center gap-[8px]">
          <Link
            href="/pricing/"
            className="flex h-[32px] items-center rounded-[6px] border border-a2-cta-outline-border bg-a2-cta-outline-bg px-[12px] text-[14px] text-a2-footer-text"
          >
            {tx("요금제 및 가격 보기")}
          </Link>
          <Link
            href="/signup/"
            className="flex h-[32px] items-center rounded-[6px] border border-a2-cta-green bg-a2-cta-green px-[12px] text-[14px] text-white"
          >
            {tx("SEMForge 시작하기")}
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-[24px] gap-y-[8px]">
        <Link href="/company/legal/" className={linkClass}>
          {tx("쿠키 설정")}
        </Link>
        <Link href="/company/legal/" className={linkClass}>
          {tx("법률 정보")}
        </Link>
        <Link href="/company/legal/privacy-policy/" className={linkClass}>
          {tx("개인정보처리방침")}
        </Link>
        <Link href="/company/legal/" className={linkClass}>
          {tx("내 개인 정보를 판매하지 마세요")}
        </Link>
        <p className="ml-auto text-[14px] leading-[24px] text-a2-footer-text">
          {tx("© 2026 SEMForge Holdings. All rights reserved.")}
        </p>
      </div>
    </footer>
  );
}
