import Link from "next/link";
import type { AppLandingData } from "@/types/app";

/**
 * APP-LANDING 템플릿: 툴킷 대시보드/온보딩 본문 (서버 컴포넌트).
 * AppShell <main> 내부 콘텐츠만 렌더 — 라우트에서 AppShell로 감쌀 것.
 */
export function AppLandingTemplate({ data }: { data: AppLandingData }) {
  const showInput = Boolean(data.inputLabel || data.inputPlaceholder);

  return (
    <div className="p-6">
      {/* 1. 히어로 카드 */}
      <section className="rounded-[12px] border border-app-border bg-white p-8">
        <h1 className="text-[24px] font-semibold leading-[32px] text-app-text">{data.title}</h1>
        <p className="mt-2 max-w-[640px] text-[14px] leading-[22px] text-app-text-secondary">
          {data.description}
        </p>

        {showInput && (
          <form className="mt-6 max-w-[640px]">
            {data.inputLabel && (
              <label
                htmlFor="app-landing-input"
                className="mb-1.5 block text-[13px] font-medium text-app-text"
              >
                {data.inputLabel}
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <input
                id="app-landing-input"
                type="text"
                placeholder={data.inputPlaceholder}
                className="h-[40px] min-w-[200px] flex-1 rounded-[8px] border border-app-border bg-white px-3 text-[14px] text-app-text placeholder:text-app-text-secondary focus:border-app-blue focus:outline-none"
              />
              <button
                type="button"
                className="h-[40px] shrink-0 rounded-[8px] bg-app-blue px-5 text-[14px] font-medium text-white transition-colors hover:bg-app-blue-dark"
              >
                {data.submitLabel ?? "Start"}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* 2. 기능 카드 그리드 */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {data.features.map((feature) => (
          <div
            key={feature.title}
            className="rounded-[8px] border border-app-border bg-white p-5"
          >
            <h2 className="text-[15px] font-semibold leading-[20px] text-app-text">
              {feature.title}
            </h2>
            <p className="mt-1 text-[13px] leading-[18px] text-app-text-secondary">
              {feature.body}
            </p>
          </div>
        ))}
      </div>

      {/* 3. 퀵 링크 */}
      {data.quickLinks && data.quickLinks.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[13px] font-semibold leading-[18px] text-app-text">Jump to</h2>
          <div className="flex flex-wrap gap-2">
            {data.quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-[6px] bg-[#eaf3ff] px-3 py-1.5 text-[13px] text-app-blue transition-colors hover:bg-[#d8ebff]"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
