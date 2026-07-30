"use client";

import Link from "next/link";
import type { ReactElement, SVGProps } from "react";
import { translateAppText } from "@/i18n/app";
import { useLocale } from "@/i18n/LocaleProvider";

/**
 * 추천 툴킷 및 앱 카드 레일 (= 앱 홈 최상단 툴킷 목차).
 * ko.semrush.com/home/ 의 "추천 툴킷 및 앱" 섹션 실측 기준:
 *   - 한 줄 카드 레일: 데스크톱 6장이 균등 분할, 좁은 폭에서는 가로 스크롤
 *   - 카드 = 툴킷 아이콘(인라인 SVG) + 제목 + 한 줄 설명
 *   - 보유 툴킷(AI 가시성 / 트래픽 & 시장 / 지역)은 카드 우상단에 초록 체크 배지
 *     (실제 Semrush 의 구매한 제품 카드와 동일한 위치/색)
 *   - 보유 판정은 프론트 상수(owned)로 고정 — DB 접근 없음
 */

type IconProps = SVGProps<SVGSVGElement>;
type Icon = (props: IconProps) => ReactElement;

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** 광고 — 메가폰 */
function MegaphoneIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M16 5.5 7.5 9H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2.5L16 18.5v-13z" />
      <path d="M19 10a3.5 3.5 0 0 1 0 4" />
      <path d="m8.5 15.5 1.2 4" />
    </IconBase>
  );
}

/** AI PR — 신문 */
function NewspaperIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h11A1.5 1.5 0 0 1 18 6.5V19H6a2 2 0 0 1-2-2V6.5z" />
      <path d="M18 8h1a1.5 1.5 0 0 1 1.5 1.5V17a2 2 0 0 1-2 2H18" />
      <path d="M7 9h7.5M7 12.5h7.5M7 16h4.5" />
    </IconBase>
  );
}

/** 소셜 — 공유 노드 */
function ShareNodesIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="6.5" cy="12" r="2.5" />
      <circle cx="17.5" cy="5.5" r="2.5" />
      <circle cx="17.5" cy="18.5" r="2.5" />
      <path d="m8.8 10.9 6.4-4.2M8.8 13.1l6.4 4.2" />
    </IconBase>
  );
}

/** AI 가시성 — 스파크 */
function SparkIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 5l1.7 5.3L19 12l-5.3 1.7L12 19l-1.7-5.3L5 12l5.3-1.7L12 5z" />
      <path d="M18.5 3.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </IconBase>
  );
}

/** 트래픽 & 시장 — 차트 */
function ChartIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 20h16" />
      <path d="M7.5 20v-5" />
      <path d="M12 20v-9" />
      <path d="M16.5 20v-13" />
    </IconBase>
  );
}

/** 지역 — 핀 */
function PinIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M18.5 10.5c0 4.6-6.5 10-6.5 10s-6.5-5.4-6.5-10a6.5 6.5 0 0 1 13 0z" />
      <circle cx="12" cy="10.5" r="2.2" />
    </IconBase>
  );
}

/** 보유 배지 체크 */
function CheckIcon(props: IconProps) {
  return (
    <IconBase strokeWidth={2.4} {...props}>
      <path d="m4.5 12.5 5 5 10-11" />
    </IconBase>
  );
}

const CARDS: Array<{
  icon: Icon;
  accent: string;
  title: string;
  body: string;
  href: string;
  owned: boolean;
}> = [
  {
    icon: MegaphoneIcon,
    accent: "var(--app-orange)",
    title: "광고",
    body: "경쟁자를 조사하고, Google 광고와 Meta 광고를 시작하고 최적화하세요.",
    href: "/advertising/",
    owned: false,
  },
  {
    icon: NewspaperIcon,
    accent: "var(--app-red)",
    title: "AI PR",
    body: "LLM에서의 브랜드 가시성을 좌우하는 언론 노출을 확보하세요.",
    href: "/pr-toolkit/",
    owned: false,
  },
  {
    icon: ShareNodesIcon,
    accent: "var(--app-blue)",
    title: "소셜",
    body: "생성, 예약, 분석까지 소셜 미디어의 전체 사이클을 관리하세요.",
    href: "/social-media/",
    owned: false,
  },
  {
    icon: SparkIcon,
    accent: "var(--app-purple)",
    title: "AI 가시성",
    body: "ChatGPT, Google AI 및 기타 AI 검색 엔진에서 검색되도록 하세요.",
    href: "/ai-seo/overview/",
    owned: true,
  },
  {
    icon: ChartIcon,
    accent: "var(--app-link)",
    title: "트래픽 & 시장",
    body: "경쟁자를 추적하고, 시장을 분석하고, 성장 기회를 발굴하세요.",
    href: "/analytics/traffic/",
    owned: true,
  },
  {
    icon: PinIcon,
    accent: "var(--app-green)",
    title: "지역",
    body: "리뷰를 관리하고, 로컬 검색 가시성을 높이고, 로컬 경쟁자를 추적하세요.",
    href: "/local-business/",
    owned: true,
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

export function ToolkitPromoCarousel() {
  const { locale } = useLocale();
  const tx = (text: string) => translateAppText(locale, text) ?? text;

  return (
    <section aria-labelledby="toolkit-rail-heading" className="relative">
      <h2
        id="toolkit-rail-heading"
        className="mb-[12px] text-[16px] font-semibold leading-[22px] text-a2-text"
      >
        {tx("추천 툴킷 및 앱")}
      </h2>
      <div className="flex gap-[24px] overflow-x-auto pb-[4px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CARDS.map((card) => {
          const CardIcon = card.icon;
          return (
            <Link
              key={card.title}
              href={card.href}
              aria-label={`${tx("제품 카드")} - ${tx(card.title)}`}
              className="relative flex min-h-[140px] min-w-[232px] flex-1 snap-start flex-col gap-[10px] rounded-[8px] bg-a2-card p-[16px] shadow-[var(--a2-card-shadow)] transition-transform duration-150 hover:-translate-y-[2px] focus-visible:-translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-focus-color)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              {card.owned && (
                <span
                  className="absolute right-[12px] top-[12px] flex h-[20px] w-[20px] items-center justify-center rounded-full bg-app-green text-white"
                  title={tx("보유 툴킷")}
                >
                  <CheckIcon width={11} height={11} />
                  <span className="sr-only">{tx("보유 툴킷")}</span>
                </span>
              )}
              <span className="flex items-center gap-[10px]">
                <span
                  aria-hidden="true"
                  className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px]"
                  style={{
                    background: chipBackground(card.accent),
                    color: chipGlyph(card.accent),
                  }}
                >
                  <CardIcon width={20} height={20} />
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
    </section>
  );
}
