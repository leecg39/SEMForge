"use client";

import type { ReactNode } from "react";
import { OrganicCard, OrganicLink } from "./organic-ui";

/**
 * SERP 구성 요소 그리드 — 도메인으로 연결됨 / 연결되지 않음 2그룹 × 6열.
 * 명세: docs/research/components/serp-features-grid.spec.md (크롭 09)
 * 아이콘은 전부 이 파일의 오리지널 미니 SVG (외부 에셋 미사용).
 */

export interface SerpFeatureItem {
  key: string;
  label: string;
  keywords: number;
  href?: string;
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  featured_snippet: (
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M4.5 5.5h7M4.5 8h7M4.5 10.5h4" />
    </>
  ),
  sitelinks: (
    <>
      <path d="M6.5 9.5a3 3 0 0 0 4.3.3l2-2a3 3 0 0 0-4.2-4.2l-1 1" />
      <path d="M9.5 6.5a3 3 0 0 0-4.3-.3l-2 2a3 3 0 0 0 4.2 4.2l1-1" />
    </>
  ),
  ai_overview: (
    <>
      <path d="M8 1.5 9.4 6l4.6 1.5L9.4 9 8 13.5 6.6 9 2 7.5 6.6 6 8 1.5z" />
    </>
  ),
  faq: (
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M6.2 6.2a1.9 1.9 0 0 1 3.7.6c0 1.2-1.8 1.4-1.8 2.5" />
      <circle cx="8" cy="11.4" r="0.4" fill="currentColor" stroke="none" />
    </>
  ),
  reviews: (
    <>
      <path d="M8 1.8 9.9 5.7l4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.8z" />
    </>
  ),
  news: (
    <>
      <rect x="2" y="3" width="10" height="10" rx="1" />
      <path d="M12 6h1.5a.5.5 0 0 1 .5.5V12a1 1 0 0 1-1 1H4" />
      <path d="M4.5 6h5M4.5 8.5h5M4.5 11h3" />
    </>
  ),
  image: (
    <>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <circle cx="5.5" cy="6.5" r="1" />
      <path d="M2.5 11.5 6 8l3 3 2-2 2.5 2.5" />
    </>
  ),
  image_pack: (
    <>
      <rect x="4" y="4.5" width="10" height="8.5" rx="1" />
      <path d="M2 10.5V3.5A1.5 1.5 0 0 1 3.5 2H11" />
      <path d="M4.5 11.5 8 8l3 3 3-2.5" />
    </>
  ),
  video: (
    <>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M6.8 6l3.4 2-3.4 2V6z" fill="currentColor" stroke="none" />
    </>
  ),
  featured_video: (
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M6.8 5.8 10.4 8l-3.6 2.2V5.8z" fill="currentColor" stroke="none" />
    </>
  ),
  video_carousel: (
    <>
      <rect x="4" y="4.5" width="10" height="8.5" rx="1" />
      <path d="M2 10.5V3.5A1.5 1.5 0 0 1 3.5 2H11" />
      <path d="M8 7l2.8 1.8L8 10.6V7z" fill="currentColor" stroke="none" />
    </>
  ),
  related_questions: (
    <>
      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H6l-3.5 3v-3H3.5A1.5 1.5 0 0 1 2 9.5v-6z" />
      <path d="M6.6 5.4a1.5 1.5 0 0 1 2.9.5c0 .9-1.4 1.1-1.4 2" />
      <circle cx="8" cy="9.4" r="0.4" fill="currentColor" stroke="none" />
    </>
  ),
  people_also_ask: (
    <>
      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H6l-3.5 3v-3H3.5A1.5 1.5 0 0 1 2 9.5v-6z" />
      <path d="M6.6 5.4a1.5 1.5 0 0 1 2.9.5c0 .9-1.4 1.1-1.4 2" />
      <circle cx="8" cy="9.4" r="0.4" fill="currentColor" stroke="none" />
    </>
  ),
  local_pack: (
    <>
      <path d="M8 14s4.8-4.3 4.8-7.8a4.8 4.8 0 1 0-9.6 0C3.2 9.7 8 14 8 14z" />
      <circle cx="8" cy="6.2" r="1.6" />
    </>
  ),
  knowledge_panel: (
    <>
      <path d="m8 2.5 6 2.6-6 2.6-6-2.6 6-2.6z" />
      <path d="M4 6.8v3.2c0 1 1.8 2 4 2s4-1 4-2V6.8" />
    </>
  ),
  top_stories: (
    <>
      <rect x="4" y="4.5" width="10" height="8.5" rx="1" />
      <path d="M2 10.5V3.5A1.5 1.5 0 0 1 3.5 2H11" />
      <path d="M6 7.5h6M6 10h4" />
    </>
  ),
  recipes: (
    <>
      <path d="M5 2v5M3.5 2v3M6.5 2v3M5 7v7" />
      <path d="M11.5 2c-1.4 0-2.5 1.6-2.5 3.5S10.1 9 11.5 9V14" />
    </>
  ),
  jobs: (
    <>
      <rect x="2" y="5" width="12" height="8.5" rx="1.5" />
      <path d="M6 5V3.8A1.3 1.3 0 0 1 7.3 2.5h1.4A1.3 1.3 0 0 1 10 3.8V5" />
      <path d="M2 8.5h12" />
    </>
  ),
  twitter: (
    <>
      <path d="M3 3l10 10M13 3 3 13" />
    </>
  ),
  shopping_ads: (
    <>
      <path d="M2.5 3h1.6l1.6 7.5h6.6L14 5H5" />
      <circle cx="6.5" cy="12.8" r="1" />
      <circle cx="11" cy="12.8" r="1" />
    </>
  ),
  ads_top: (
    <>
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
      <path d="M5 10.5 6.8 5.8h.4L9 10.5M5.7 9h2.6" />
      <path d="M11 8.2v2.3" />
    </>
  ),
};

const FALLBACK_ICON = (
  <>
    <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
    <path d="M2.5 6.5h11M2.5 10h11M6.5 2.5v11M10 2.5v11" />
  </>
);

function FeatureCell({ item, keywordCount }: { item: SerpFeatureItem; keywordCount: (n: number) => string }) {
  const active = item.keywords > 0;
  return (
    <div className="flex items-start gap-2">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: active ? "#eef4ff" : "#f4f5f7",
          color: active ? "rgb(35, 95, 226)" : "rgba(0, 3, 0, 0.35)",
        }}
      >
        <Icon>{ICONS[item.key] ?? FALLBACK_ICON}</Icon>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 pt-0.5">
        {active && item.href ? (
          <OrganicLink href={item.href} className="!text-[13px] leading-4">
            {item.label}
          </OrganicLink>
        ) : (
          <span
            className="truncate text-[13px] leading-4"
            style={{ color: active ? "rgb(35, 95, 226)" : "rgba(0, 3, 0, 0.584)" }}
            title={item.label}
          >
            {item.label}
          </span>
        )}
        <span className="text-[12px] leading-4" style={{ color: "rgba(0, 3, 0, 0.45)" }}>
          {keywordCount(item.keywords)}
        </span>
      </span>
    </div>
  );
}

export function SerpFeaturesGrid({
  linked,
  notLinked,
  copy,
}: {
  linked: SerpFeatureItem[];
  notLinked: SerpFeatureItem[];
  copy: { title: string; linkedTitle: string; notLinkedTitle: string; keywordCount: (n: number) => string };
}) {
  return (
    <OrganicCard wide title={copy.title}>
      {[
        { heading: copy.linkedTitle, items: linked, first: true },
        { heading: copy.notLinkedTitle, items: notLinked, first: false },
      ].map((group) => (
        <div key={group.heading}>
          <h4
            className="mb-2 text-[13px] font-semibold text-black"
            style={{ marginTop: group.first ? 0 : 16 }}
          >
            {group.heading}
          </h4>
          <div className="grid grid-cols-6 gap-x-4 gap-y-2">
            {group.items.map((item) => (
              <FeatureCell key={item.key} item={item} keywordCount={copy.keywordCount} />
            ))}
          </div>
        </div>
      ))}
    </OrganicCard>
  );
}
