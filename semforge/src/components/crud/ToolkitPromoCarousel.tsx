"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { appIcons } from "@/components/app/app-icons";
import { translateAppText } from "@/i18n/app";
import { useLocale } from "@/i18n/LocaleProvider";

/**
 * 툴킷 프로모 캐러셀 (= 앱 홈 최상단 툴킷 목차).
 * ko.semforge.com/home/ 1440px 실측을 기준으로 하되, 6개 카드를 한눈에 훑을 수
 * 있도록 가시성 위주로 의도적으로 확장했다.
 *   - 카드 순서: 사용자 지정 (광고 → AI PR → 소셜 → AI 가시성 → 트래픽 → 콘텐츠)
 *   - 이모지 대신 앱 셸과 동일한 라인 아이콘 + 툴킷별 accent 컬러 칩
 *   - 6개 카드가 가로 폭을 동일하게 나누되, 최소 크기 232×140px 유지
 * 유지: gap 24px, radius 8px, `--a2-card-shadow`, 카드 문구 원문.
 * 근거: docs/research/components/promo-carousel-and-footer.spec.md
 */

const CARDS = [
  {
    icon: "advertising",
    accent: "var(--app-orange)",
    title: "광고",
    body: "경쟁자를 조사하고, Google 광고와 Meta 광고를 시작하고 최적화하세요.",
    href: "/advertising/",
  },
  {
    icon: "pr",
    accent: "var(--app-red)",
    title: "AI PR",
    body: "LLM에서의 브랜드 가시성을 좌우하는 언론 노출을 확보하세요.",
    href: "/pr-toolkit/",
  },
  {
    icon: "social",
    accent: "var(--app-blue)",
    title: "소셜",
    body: "생성, 예약, 분석까지 소셜 미디어의 전체 사이클을 관리하세요.",
    href: "/social-media/",
  },
  {
    icon: "ai",
    accent: "var(--app-purple)",
    title: "AI 가시성",
    body: "ChatGPT, Google AI 및 기타 AI 검색 엔진에서 검색되도록 하세요.",
    href: "/ai-seo/overview/",
  },
  {
    icon: "traffic",
    accent: "var(--app-link)",
    title: "트래픽 및 시장",
    body: "모든 웹사이트의 트래픽과 시장 점유율을 분석하세요.",
    href: "/analytics/traffic/",
  },
  {
    icon: "content",
    accent: "var(--app-yellow)",
    title: "콘텐츠 아이디어",
    body: "AI와 경쟁 데이터를 활용해 SEO 친화적인 콘텐츠를 만들어 보세요.",
    href: "/content/",
  },
];

/**
 * accent 를 카드 칩에 적용할 때 쓰는 혼합 공식.
 * 배경은 흰색에 옅게 섞고, 글리프는 텍스트 색을 조금 섞어 어둡게 눌러
 * 모든 accent(노랑 포함)가 WCAG 비텍스트 대비 3:1 을 넘기게 한다.
 */
const chipBackground = (accent: string) => `color-mix(in oklab, ${accent} 14%, #fff)`;
const chipGlyph = (accent: string) =>
  `color-mix(in oklab, ${accent} 88%, var(--aurea-text-primary))`;

/** 카드 최소 너비 232 + gap 24 = 256px */
const CARD_STRIDE = 256;

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
      <div className="relative">
        <div
          ref={trackRef}
          onScroll={updateScrollState}
          className="flex snap-x snap-mandatory gap-[24px] overflow-x-auto pb-[4px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {CARDS.map((card) => {
            const Icon = appIcons[card.icon];
            return (
              <Link
                key={card.title}
                href={card.href}
                aria-label={`${tx("제품 카드")} - ${tx(card.title)}`}
                className="flex min-h-[140px] min-w-[232px] flex-1 snap-start flex-col gap-[10px] rounded-[8px] bg-a2-card p-[16px] shadow-[var(--a2-card-shadow)] transition-transform duration-150 hover:-translate-y-[2px] focus-visible:-translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-focus-color)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span className="flex items-center gap-[10px]">
                  <span
                    aria-hidden="true"
                    className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px]"
                    style={{
                      background: chipBackground(card.accent),
                      color: chipGlyph(card.accent),
                    }}
                  >
                    <Icon width={20} height={20} />
                  </span>
                  <span className="text-[15px] font-semibold leading-[21px] text-a2-text">
                    {tx(card.title)}
                  </span>
                </span>
                <span className="line-clamp-3 text-[14px] leading-[19.88px] text-a2-text-muted">
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
            className="absolute -left-[10px] top-1/2 hidden h-[32px] w-[32px] -translate-y-1/2 items-center justify-center rounded-full border border-app-border bg-white text-[16px] text-a2-text shadow-[var(--aurea-shadow-3)] transition-colors hover:bg-a2-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-focus-color)] lg:flex"
          >
            <span aria-hidden="true">‹</span>
          </button>
        )}
        {canScrollRight && (
          <button
            type="button"
            aria-label={tx("오른쪽으로 스크롤")}
            onClick={() => scrollPage(1)}
            className="absolute -right-[10px] top-1/2 hidden h-[32px] w-[32px] -translate-y-1/2 items-center justify-center rounded-full border border-app-border bg-white text-[16px] text-a2-text shadow-[var(--aurea-shadow-3)] transition-colors hover:bg-a2-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-focus-color)] lg:flex"
          >
            <span aria-hidden="true">›</span>
          </button>
        )}
      </div>
    </section>
  );
}
