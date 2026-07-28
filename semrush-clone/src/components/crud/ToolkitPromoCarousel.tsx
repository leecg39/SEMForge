"use client";

import Link from "next/link";
import { useRef } from "react";
import { appIcons } from "@/components/app/app-icons";
import { translateAppText } from "@/i18n/app";
import { useLocale } from "@/i18n/LocaleProvider";

/**
 * 툴킷 프로모 캐러셀.
 * ko.semrush.com/home/ 1440px 실측: 섹션 h=130, flex gap 24px, 카드 248×128,
 * radius 8px, shadow `0 0 1px rgba(0,21,16,.07), 0 1px 3px rgba(0,21,16,.07)`.
 * 카드 문구는 원본 그대로다.
 * 근거: docs/research/components/promo-carousel-and-footer.spec.md
 */

const CARDS = [
  {
    icon: "local",
    title: "지역",
    body: "리뷰를 관리하고, 로컬 검색 가시성을 높이고, 로컬 경쟁자를 추적하세요.",
    href: "/local-business/",
  },
  {
    icon: "content",
    title: "콘텐츠 아이디어",
    body: "AI와 경쟁 데이터를 활용해 SEO 친화적인 콘텐츠를 만들어 보세요.",
    href: "/content/",
  },
  {
    icon: "advertising",
    title: "광고",
    body: "경쟁자를 조사하고, Google 광고와 Meta 광고를 시작하고 최적화하세요.",
    href: "/advertising/",
  },
  {
    icon: "pr",
    title: "AI PR",
    body: "LLM에서의 브랜드 가시성을 좌우하는 언론 노출을 확보하세요.",
    href: "/pr-toolkit/",
  },
  {
    icon: "social",
    title: "소셜",
    body: "생성, 예약, 분석까지 소셜 미디어의 전체 사이클을 관리하세요.",
    href: "/social-media/",
  },
  {
    icon: "ai",
    title: "AI 가시성",
    body: "ChatGPT, Google AI 및 기타 AI 검색 엔진에서 검색되도록 하세요.",
    href: "/ai-seo/overview/",
  },
];

export function ToolkitPromoCarousel() {
  const { locale } = useLocale();
  const tx = (text: string) => translateAppText(locale, text) ?? text;
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollByCards = (direction: 1 | -1) => {
    // 카드 248 + gap 24 = 272px 단위로 이동
    trackRef.current?.scrollBy({ left: direction * 272, behavior: "smooth" });
  };

  return (
    <section aria-label={tx("툴킷 추천")} className="relative">
      <div
        ref={trackRef}
        className="flex gap-[24px] overflow-x-auto scroll-smooth pb-[2px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {CARDS.map((card) => {
          const Icon = appIcons[card.icon];
          return (
            <Link
              key={card.title}
              href={card.href}
              aria-label={`${tx("제품 카드")} - ${tx(card.title)}`}
              className="flex h-[128px] w-[248px] shrink-0 flex-col gap-[8px] rounded-[8px] bg-a2-card p-[16px] shadow-[var(--a2-card-shadow)] transition-shadow hover:shadow-md"
            >
              {Icon && <Icon width={32} height={32} className="text-a2-text-muted" />}
              <span className="text-[14px] font-medium leading-[19.88px] text-a2-text">
                {tx(card.title)}
              </span>
              <span className="line-clamp-3 text-[14px] leading-[19.88px] text-a2-value-muted">
                {tx(card.body)}
              </span>
            </Link>
          );
        })}
      </div>

      <button
        type="button"
        aria-label={tx("오른쪽으로 스크롤")}
        onClick={() => scrollByCards(1)}
        className="absolute -right-[6px] top-1/2 hidden h-[28px] w-[28px] -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[var(--a2-card-shadow)] lg:flex"
      >
        <span aria-hidden="true" className="text-[14px] text-a2-text-muted">
          ›
        </span>
      </button>
    </section>
  );
}
