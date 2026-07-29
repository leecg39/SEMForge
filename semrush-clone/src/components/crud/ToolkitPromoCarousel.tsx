"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
    icon: "traffic",
    emoji: "📈",
    title: "트래픽 및 시장",
    body: "모든 웹사이트의 트래픽과 시장 점유율을 분석하세요.",
    href: "/analytics/traffic/",
  },
  {
    icon: "local",
    emoji: "📍",
    title: "지역",
    body: "리뷰를 관리하고, 로컬 검색 가시성을 높이고, 로컬 경쟁자를 추적하세요.",
    href: "/local-business/",
  },
  {
    icon: "content",
    emoji: "💡",
    title: "콘텐츠 아이디어",
    body: "AI와 경쟁 데이터를 활용해 SEO 친화적인 콘텐츠를 만들어 보세요.",
    href: "/content/",
  },
  {
    icon: "advertising",
    emoji: "📣",
    title: "광고",
    body: "경쟁자를 조사하고, Google 광고와 Meta 광고를 시작하고 최적화하세요.",
    href: "/advertising/",
  },
  {
    icon: "pr",
    emoji: "📰",
    title: "AI PR",
    body: "LLM에서의 브랜드 가시성을 좌우하는 언론 노출을 확보하세요.",
    href: "/pr-toolkit/",
  },
  {
    icon: "social",
    emoji: "📱",
    title: "소셜",
    body: "생성, 예약, 분석까지 소셜 미디어의 전체 사이클을 관리하세요.",
    href: "/social-media/",
  },
  {
    icon: "ai",
    emoji: "✨",
    title: "AI 가시성",
    body: "ChatGPT, Google AI 및 기타 AI 검색 엔진에서 검색되도록 하세요.",
    href: "/ai-seo/overview/",
  },
];

/** 카드 248 + gap 24 = 272px */
const CARD_STRIDE = 272;

export function ToolkitPromoCarousel() {
  const { locale } = useLocale();
  const tx = (text: string) => translateAppText(locale, text) ?? text;
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    setCanScrollLeft(track.scrollLeft > 1);
    setCanScrollRight(track.scrollLeft < max - 1);
  }, []);

  useEffect(() => {
    // 마운트 시점의 레이아웃을 읽어 초기 버튼 상태를 맞춘다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    updateScrollState();
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [updateScrollState]);

  /**
   * 페이지 단위 스크롤.
   * 네이티브 smooth scrollBy 무시, rAF 정지 등 환경별 제약이 있어
   * 즉시 스크롤(instant)로 동작을 보장한다.
   */
  const scrollPage = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    // 보이는 폭에서 카드 1장을 뺀 만큼 이동해 숨겨진 카드가 통째로 드러나게 한다.
    const page = Math.max(CARD_STRIDE, track.clientWidth - CARD_STRIDE);
    track.scrollBy({ left: direction * page, behavior: "instant" as ScrollBehavior });
    // 일부 환경(ego-lite)은 프로그래매틱 스크롤에 scroll 이벤트를 발생시키지
    // 않으므로 버튼 상태를 직접 갱신한다.
    updateScrollState();
  };

  return (
    <section aria-label={tx("툴킷 추천")} className="relative">
      <div
        ref={trackRef}
        onScroll={updateScrollState}
        className="flex gap-[24px] overflow-x-auto pb-[2px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {CARDS.map((card) => {
          return (
            <Link
              key={card.title}
              href={card.href}
              aria-label={`${tx("제품 카드")} - ${tx(card.title)}`}
              className="flex h-[128px] min-w-[200px] flex-1 flex-col gap-[8px] rounded-[8px] bg-a2-card p-[16px] shadow-[var(--a2-card-shadow)] transition-shadow hover:shadow-md"
            >
              <span className="flex items-center gap-[8px]">
                <span aria-hidden="true" className="text-[24px] leading-[28px]">
                  {card.emoji}
                </span>
                <span className="text-[14px] font-medium leading-[19.88px] text-a2-text">
                  {tx(card.title)}
                </span>
              </span>
              <span className="line-clamp-3 text-[14px] leading-[19.88px] text-a2-value-muted">
                {tx(card.body)}
              </span>
            </Link>
          );
        })}
      </div>

      {canScrollLeft && (
        <button
          type="button"
          aria-label={tx("왼쪽으로 스크롤")}
          onClick={() => scrollPage(-1)}
          className="absolute -left-[6px] top-1/2 hidden h-[28px] w-[28px] -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[var(--a2-card-shadow)] lg:flex"
        >
          <span aria-hidden="true" className="text-[14px] text-a2-text-muted">
            ‹
          </span>
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          aria-label={tx("오른쪽으로 스크롤")}
          onClick={() => scrollPage(1)}
          className="absolute -right-[6px] top-1/2 hidden h-[28px] w-[28px] -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[var(--a2-card-shadow)] lg:flex"
        >
          <span aria-hidden="true" className="text-[14px] text-a2-text-muted">
            ›
          </span>
        </button>
      )}
    </section>
  );
}
