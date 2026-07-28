"use client";

import { useLocalizedValue, useSiteText } from "@/i18n/useLocalizedValue";

/** 앱 공통 상태 템플릿: 빈 상태 / 로딩 스켈레톤 / 업그레이드 게이트. */

export interface EmptyStateProps {
  title: string;
  body: string;
  cta?: string;
}

export function EmptyState({ title, body, cta }: EmptyStateProps) {
  const localized = useLocalizedValue({ title, body, cta });
  return (
    <div className="flex flex-col items-center justify-center p-[64px] text-center text-app-text">
      <div
        className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-app-bg"
        aria-hidden="true"
      >
        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#eaf3ff]">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <circle cx="9.5" cy="9.5" r="6" stroke="#008ff8" strokeWidth="2" />
            <path d="M14.2 14.2L19 19" stroke="#008ff8" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      <h2 className="mt-[20px] text-[18px] font-semibold leading-[1.3]">{localized.title}</h2>
      <p className="mt-[8px] max-w-[400px] text-[14px] leading-[1.6] text-app-text-secondary">
        {localized.body}
      </p>
      {localized.cta && (
        <button
          type="button"
          className="mt-[20px] h-[36px] rounded-[8px] bg-app-blue px-[20px] text-[13px] font-semibold text-white transition-colors hover:bg-app-blue-dark"
        >
          {localized.cta}
        </button>
      )}
    </div>
  );
}

const skeletonRowWidths = ["w-full", "w-[92%]", "w-[97%]", "w-[88%]", "w-[95%]"];

export function LoadingState() {
  const tx = useSiteText();
  return (
    <div className="flex flex-col gap-[24px] p-[24px]" aria-busy="true" aria-label={tx("Loading")}>
      {/* KPI 카드 스켈레톤 3개 */}
      <div className="grid grid-cols-1 gap-[16px] md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-[8px] border border-app-border bg-white p-[16px]">
            <div className="h-[12px] w-[96px] animate-pulse rounded-[4px] bg-[#e9ebef]" />
            <div className="mt-[12px] h-[28px] w-[128px] animate-pulse rounded-[6px] bg-[#e9ebef]" />
          </div>
        ))}
      </div>
      {/* 표 스켈레톤 5행 */}
      <div className="rounded-[8px] border border-app-border bg-white p-[16px]">
        <div className="h-[14px] w-[160px] animate-pulse rounded-[4px] bg-[#e9ebef]" />
        <div className="mt-[18px] flex flex-col gap-[14px]">
          {skeletonRowWidths.map((width) => (
            <div
              key={width}
              className={`h-[16px] animate-pulse rounded-[4px] bg-[#e9ebef] ${width}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export interface UpgradeGateProps {
  feature: string;
}

export function UpgradeGate({ feature }: UpgradeGateProps) {
  const tx = useSiteText();
  const localizedFeature = useLocalizedValue(feature);
  return (
    <div className="flex items-center justify-center p-[40px] text-app-text">
      <div className="flex w-full max-w-[480px] flex-col items-center rounded-[12px] border border-app-border bg-white p-[40px] text-center">
        <div
          className="flex h-[64px] w-[64px] items-center justify-center rounded-full bg-app-bg"
          aria-hidden="true"
        >
          <svg width="24" height="28" viewBox="0 0 24 28" fill="none">
            <rect x="1" y="11" width="22" height="16" rx="4" fill="#6c6e79" />
            <path
              d="M6 11V8a6 6 0 0 1 12 0v3"
              stroke="#6c6e79"
              strokeWidth="2.5"
              fill="none"
            />
            <circle cx="12" cy="19" r="2.5" fill="#fff" />
          </svg>
        </div>
        <h2 className="mt-[20px] text-[18px] font-semibold leading-[1.3]">
          {tx("Upgrade to unlock")} {localizedFeature}
        </h2>
        <p className="mt-[8px] text-[14px] leading-[1.6] text-app-text-secondary">
          {tx("This feature is available on higher plans. Upgrade your subscription to get instant access to {feature} and more advanced tools.").replace("{feature}", localizedFeature)}
        </p>
        <div className="mt-[24px] flex flex-wrap justify-center gap-[8px]">
          <button
            type="button"
            className="h-[36px] rounded-[8px] bg-app-blue px-[20px] text-[13px] font-semibold text-white transition-colors hover:bg-app-blue-dark"
          >
            {tx("Upgrade")}
          </button>
          <button
            type="button"
            className="h-[36px] rounded-[8px] border border-app-border bg-white px-[20px] text-[13px] font-semibold text-app-text transition-colors hover:bg-[#f9fafb]"
          >
            {tx("See plans")}
          </button>
        </div>
      </div>
    </div>
  );
}
