"use client";

import { useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { useLocalizedValue } from "@/i18n/useLocalizedValue";
import { EmptyState } from "@/components/app/AppStateTemplates";
import { cn } from "@/lib/utils";
import type { AppStoreData, StoreApp } from "@/types/app";

/** App Center 스토어/컬렉션/앱 상세/내 앱 템플릿. */

const EMPTY_COPY = {
  en: {
    title: "No marketplace data source",
    body: "The App Center has no connected marketplace backend, so no app listings are shown.",
  },
  ko: {
    title: "마켓플레이스 데이터 소스가 없습니다",
    body: "앱 센터는 연결된 마켓플레이스 백엔드가 없어 앱 목록을 표시하지 않습니다.",
  },
} as const;

function AppIconTile({ name, size }: { name: string; size: 48 | 64 }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[8px] bg-linear-to-br from-[#008ff8] to-[#8649e1] font-semibold text-white",
        size === 64 ? "h-[64px] w-[64px] text-[24px]" : "h-[48px] w-[48px] text-[18px]"
      )}
      aria-hidden="true"
    >
      {name.charAt(0)}
    </div>
  );
}

function StoreAppCard({ app, isMyApps }: { app: StoreApp; isMyApps: boolean }) {
  return (
    <article className="flex flex-col rounded-[8px] border border-app-border bg-white p-[20px] transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
      <AppIconTile name={app.name} size={48} />
      <h3 className="mt-[14px] text-[15px] font-semibold text-app-text">{app.name}</h3>
      <p className="mt-[2px] text-[12px] text-app-text-secondary">{app.category}</p>
      <p className="mt-[8px] line-clamp-2 flex-1 text-[13px] leading-[1.5] text-app-text-secondary">
        {app.blurb}
      </p>
      <div className="mt-[16px] flex flex-wrap items-center gap-[8px]">
        <span className="text-[13px] font-semibold text-app-text">{app.price}</span>
        {typeof app.rating === "number" && (
          <span className="flex items-center gap-[3px] text-[12px] text-app-text-secondary">
            <span className="text-app-yellow" aria-hidden="true">
              &#9733;
            </span>
            {app.rating.toFixed(1)}
          </span>
        )}
        <div className="ml-auto flex gap-[6px]">
          {isMyApps ? (
            <>
              <button
                type="button"
                className="h-[28px] rounded-[6px] bg-app-blue px-[12px] text-[12px] font-semibold text-white transition-colors hover:bg-app-blue-dark"
              >
                Open
              </button>
              <button
                type="button"
                className="h-[28px] rounded-[6px] border border-app-border bg-white px-[12px] text-[12px] font-semibold text-app-text transition-colors hover:bg-[#f9fafb]"
              >
                Manage
              </button>
            </>
          ) : (
            <button
              type="button"
              className="h-[28px] rounded-[6px] bg-app-blue px-[12px] text-[12px] font-semibold text-white transition-colors hover:bg-app-blue-dark"
            >
              Get
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function StoreDetail({ detail }: { detail: NonNullable<AppStoreData["detail"]> }) {
  return (
    <div className="grid items-start gap-[24px] lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <div className="flex items-start gap-[16px]">
          <AppIconTile name={detail.name} size={64} />
          <div>
            <h1 className="text-[28px] font-semibold leading-[1.2] text-app-text">
              {detail.name}
            </h1>
            <p className="mt-[6px] text-[16px] leading-[1.5] text-app-text-secondary">
              {detail.blurb}
            </p>
          </div>
        </div>
        <div className="mt-[24px] flex flex-col gap-[16px]">
          {detail.longDescription.map((paragraph, i) => (
            <p key={i} className="text-[14px] leading-[1.7] text-app-text">
              {paragraph}
            </p>
          ))}
        </div>
        <h2 className="mt-[32px] text-[16px] font-semibold text-app-text">Features</h2>
        <ul className="mt-[12px] flex flex-col gap-[10px]">
          {detail.features.map((feature) => (
            <li key={feature} className="flex items-start gap-[8px]">
              <span
                className="mt-[2px] flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full bg-[#e6f5f2]"
                aria-hidden="true"
              >
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 6.5L5 9L9.5 3.5"
                    stroke="#009f81"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="text-[14px] leading-[1.5] text-app-text">{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <aside className="rounded-[8px] border border-app-border bg-white p-[24px] lg:sticky lg:top-[24px]">
        <p className="text-[24px] font-semibold text-app-text">{detail.price}</p>
        <button
          type="button"
          className="mt-[16px] h-[40px] w-full rounded-[8px] bg-app-blue text-[14px] font-semibold text-white transition-colors hover:bg-app-blue-dark"
        >
          Start free trial
        </button>
        <button
          type="button"
          className="mt-[8px] h-[40px] w-full rounded-[8px] border border-app-border bg-white text-[14px] font-semibold text-app-text transition-colors hover:bg-[#f9fafb]"
        >
          Add to workspace
        </button>
      </aside>
    </div>
  );
}

export function AppStoreTemplate({ data: sourceData }: { data: AppStoreData }) {
  const { locale } = useLocale();
  const data = useLocalizedValue(sourceData);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  if (data.mode === "detail" && data.detail) {
    return (
      <div className="p-[24px] text-app-text">
        <StoreDetail detail={data.detail} />
      </div>
    );
  }

  const isMyApps = data.mode === "my-apps";
  const filteredApps = activeCategory
    ? data.apps.filter((app) => app.category === activeCategory)
    : data.apps;

  const pillBase =
    "h-[32px] shrink-0 rounded-full px-[14px] text-[13px] font-medium transition-colors";

  return (
    <div className="flex flex-col gap-[20px] p-[24px] text-app-text">
      {/* 헤더 */}
      <div>
        <h1 className="text-[24px] font-semibold leading-[1.25]">{data.title}</h1>
        <p className="mt-[6px] text-[14px] leading-[1.5] text-app-text-secondary">
          {data.description}
        </p>
      </div>

      {/* 마켓플레이스 소스 미연결 — 정직한 빈 상태 */}
      {data.apps.length === 0 ? (
        <div className="rounded-[8px] border border-app-border bg-white">
          <EmptyState title={EMPTY_COPY[locale].title} body={EMPTY_COPY[locale].body} />
        </div>
      ) : (
        <>
      {/* 카테고리 필터 */}
      {data.categories && data.categories.length > 0 && (
        <div className="flex flex-wrap gap-[8px]">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={cn(
              pillBase,
              activeCategory === null
                ? "bg-[#191b23] text-white"
                : "border border-app-border bg-white text-app-text hover:bg-[#f9fafb]"
            )}
          >
            All
          </button>
          {data.categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={cn(
                pillBase,
                activeCategory === category
                  ? "bg-[#191b23] text-white"
                  : "border border-app-border bg-white text-app-text hover:bg-[#f9fafb]"
              )}
            >
              {category}
            </button>
          ))}
        </div>
      )}

      {/* 앱 그리드 */}
      {filteredApps.length > 0 ? (
        <div className="grid grid-cols-1 gap-[16px] md:grid-cols-2 lg:grid-cols-3">
          {filteredApps.map((app) => (
            <StoreAppCard key={app.name} app={app} isMyApps={isMyApps} />
          ))}
        </div>
      ) : (
        <p className="rounded-[8px] border border-app-border bg-white p-[24px] text-center text-[13px] text-app-text-secondary">
          No apps found in this category.
        </p>
      )}
        </>
      )}
    </div>
  );
}
