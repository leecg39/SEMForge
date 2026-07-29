"use client";

import Link from "next/link";
import { useLocale } from "@/i18n/LocaleProvider";
import { SM, WidgetCard } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

export interface SecondaryWidgetItem {
  key: string;
  title: string;
  description: string;
  href: string;
}

/**
 * 보조 위젯 ×5 (spec: docs/research/components/widget-secondary.spec.md).
 * 설명 텍스트는 원본 verbatim, 설정 버튼은 각 도구로 이동한다.
 */
export function WidgetSecondary({
  title,
  description,
  href,
  ctaLabel,
}: Omit<SecondaryWidgetItem, "key"> & { ctaLabel?: string }) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  return (
    <WidgetCard ariaLabel={title} className="flex min-h-[224px] flex-col">
      <h3 className={cn("pt-2 text-[16px] font-bold leading-[20px]", SM.title)}>{title}</h3>
      <p className={cn("mt-2 text-[14px] leading-[20px]", SM.body)}>{description}</p>
      <div className="mt-auto pt-4">
        <Link href={href} className={cn(SM.darkCta, "h-[32px]")}>
          {ctaLabel ?? (ko ? "설정" : "Set up")}
        </Link>
      </div>
    </WidgetCard>
  );
}

export const SECONDARY_WIDGETS_KO: SecondaryWidgetItem[] = [
  {
    key: "positionTracking",
    title: "포지션 추적",
    description: "Google의 또는 Bing의 상위 100위 자연 및 유료 검색 결과의 포지션에 대한 일일 업데이트를 받아보실 수 있습니다.",
    href: "/position-tracking/",
  },
  {
    key: "siteAudit",
    title: "사이트 진단",
    description: "크롤러빌리티, 콘텐츠, 링크 및 코딩 관련 문제를 감지합니다.",
    href: "/siteaudit/",
  },
  {
    key: "onPageSeo",
    title: "온페이지 SEO 분석 도구",
    description: "전략, 콘텐츠, 백링크 등에 대한 아이디어를 수집하세요.",
    href: "/on-page-seo-checker/",
  },
  {
    key: "backlinkAudit",
    title: "백링크 진단",
    description: "백링크 포트폴리오를 디톡스하고 웹사이트 순위를 강화하세요.",
    href: "/backlink_audit/",
  },
  {
    key: "organicTrafficInsights",
    title: "자연 트래픽 인사이트",
    description: "GA, GSC 및 Semrush 데이터를 통합하여 \"제공되지 않음\" 키워드를 발굴하세요",
    href: "/organic_traffic_insights/",
  },
];

export const SECONDARY_WIDGETS_EN: SecondaryWidgetItem[] = [
  {
    key: "positionTracking",
    title: "Position Tracking",
    description: "Get daily updates on positions in Google's or Bing's top 100 organic and paid search results.",
    href: "/position-tracking/",
  },
  {
    key: "siteAudit",
    title: "Site Audit",
    description: "Detect crawlability, content, linking and coding related issues.",
    href: "/siteaudit/",
  },
  {
    key: "onPageSeo",
    title: "On Page SEO Checker",
    description: "Gather ideas on strategy, content, backlinks and more.",
    href: "/on-page-seo-checker/",
  },
  {
    key: "backlinkAudit",
    title: "Backlink Audit",
    description: "Detox your backlink portfolio and strengthen your website rankings.",
    href: "/backlink_audit/",
  },
  {
    key: "organicTrafficInsights",
    title: "Organic Traffic Insights",
    description: "Combine GA, GSC and Semrush data to uncover \"not provided\" keywords.",
    href: "/organic_traffic_insights/",
  },
];
