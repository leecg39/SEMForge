"use client";

import type { AppHomeData } from "@/types/app";
import { useLocalizedValue, useSiteText } from "@/i18n/useLocalizedValue";

/** 폴더 카드용 미니 폴더 글리프 */
function FolderGlyph() {
  return (
    <svg width="32" height="26" viewBox="0 0 32 26" aria-hidden="true">
      <path
        d="M2 4a3 3 0 0 1 3-3h7l3 4h12a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V4Z"
        fill="#fdc23c"
      />
      <path d="M2 9h28v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V9Z" fill="#ffd472" />
    </svg>
  );
}

/** "+" 글리프 (Add website / EmptyState 버튼용) */
function PlusGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

/**
 * APP-HOME 템플릿: 홈/폴더 그리드 본문.
 * AppShell <main> 내부 콘텐츠만 렌더 — 라우트에서 AppShell로 감쌀 것.
 */
export function AppHomeTemplate({ data: sourceData }: { data: AppHomeData }) {
  const data = useLocalizedValue(sourceData);
  const tx = useSiteText();
  const hasFolders = data.folders.length > 0;

  return (
    <div className="p-6">
      {/* 1. 헤더행 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-semibold leading-[32px] text-app-text">{tx("Home")}</h1>
        <div className="flex gap-2">
          <button
            type="button"
            className="flex h-[36px] items-center rounded-[6px] border border-app-border bg-white px-4 text-[13px] font-medium text-app-text transition-colors hover:bg-app-bg"
          >
            {tx("Share")}
          </button>
          <button
            type="button"
            className="flex h-[36px] items-center rounded-[6px] bg-app-blue px-4 text-[13px] font-medium text-white transition-colors hover:bg-app-blue-dark"
          >
            {tx("Create folder")}
          </button>
        </div>
      </div>

      {hasFolders ? (
        /* 2. 폴더 그리드 + Add website 카드 */
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.folders.map((folder) => (
            <div
              key={folder.name}
              className="cursor-pointer rounded-[8px] border border-app-border bg-white p-5 transition-shadow hover:shadow-[0_2px_12px_0_rgba(0,0,0,0.08)]"
            >
              <FolderGlyph />
              <div className="mt-3 flex items-center gap-2">
                <span className="truncate text-[15px] font-semibold leading-[20px] text-app-text">
                  {folder.name}
                </span>
                {folder.shared && (
                  <span className="shrink-0 rounded-[4px] bg-[#eef0f2] px-1.5 py-0.5 text-[11px] leading-[14px] text-app-text-secondary">
                    {tx("Shared")}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[13px] leading-[18px] text-app-text-secondary">
                {folder.sites} {tx("websites")}
              </div>
            </div>
          ))}

          <button
            type="button"
            className="flex min-h-[124px] flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-app-border text-[13px] font-medium text-app-text-secondary transition-colors hover:border-app-blue hover:text-app-blue"
          >
            <PlusGlyph size={20} />
            {tx("Add website")}
          </button>
        </div>
      ) : (
        /* 3. 폴더 0개 EmptyState */
        <div className="mt-6 flex flex-col items-center rounded-[8px] border border-app-border bg-white px-6 py-16 text-center">
          <div className="flex h-[96px] w-[96px] items-center justify-center rounded-full bg-[#eef0f2]">
            <FolderGlyph />
          </div>
          <h2 className="mt-5 text-[16px] font-semibold leading-[22px] text-app-text">
            {tx("Create your first folder")}
          </h2>
          <p className="mt-1 max-w-[360px] text-[13px] leading-[18px] text-app-text-secondary">
            {tx("Organize your websites and projects in folders to keep everything in one place.")}
          </p>
          <button
            type="button"
            className="mt-5 flex h-[36px] items-center gap-1.5 rounded-[6px] bg-app-blue px-4 text-[13px] font-medium text-white transition-colors hover:bg-app-blue-dark"
          >
            <PlusGlyph />
            {tx("Create folder")}
          </button>
        </div>
      )}
    </div>
  );
}
