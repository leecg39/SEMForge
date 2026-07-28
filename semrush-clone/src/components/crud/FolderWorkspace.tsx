"use client";

import { useState } from "react";
import {
  ResourceWorkspace,
  type ResourceWorkspaceProps,
} from "@/components/crud/ResourceWorkspace";
import { ToolkitPromoCarousel } from "@/components/crud/ToolkitPromoCarousel";

/**
 * 앱 홈 (폴더) 화면.
 *
 * ko.semrush.com/home/ 의 섹션 순서를 그대로 따른다.
 *   1) 툴킷 프로모 캐러셀  2) 폴더 섹션  3) 모니터링할 도메인 아코디언  4) 피드백 전송
 * 근거: docs/research/ko.semrush.com/PAGE_TOPOLOGY.md
 */
export function FolderWorkspace(props: ResourceWorkspaceProps) {
  const [monitoringOpen, setMonitoringOpen] = useState(false);

  return (
    <div className="flex flex-col gap-[24px]">
      <ToolkitPromoCarousel />

      <ResourceWorkspace {...props} />

      <section className="rounded-[8px]">
        <button
          type="button"
          aria-expanded={monitoringOpen}
          onClick={() => setMonitoringOpen((v) => !v)}
          className="flex h-[44px] w-full items-center justify-between rounded-[8px] bg-a2-card px-[20px] shadow-[var(--a2-card-shadow)]"
        >
          <span className="text-[16px] font-bold text-a2-text">모니터링할 도메인</span>
          <span className="flex items-center gap-[6px] text-[14px] text-a2-text-muted">
            Open
            <span aria-hidden="true">{monitoringOpen ? "⌃" : "⌄"}</span>
          </span>
        </button>
        {monitoringOpen && (
          <div className="mt-[8px] rounded-[8px] bg-a2-card px-[20px] py-[16px] text-[14px] text-a2-text-muted shadow-[var(--a2-card-shadow)]">
            추적 중인 도메인이 없습니다. 폴더에 웹사이트를 추가하면 여기에 표시됩니다.
          </div>
        )}
      </section>

      <button
        type="button"
        className="flex w-fit items-center gap-[6px] text-[12px] text-a2-text underline underline-offset-2"
      >
        <span aria-hidden="true">💬</span>
        피드백 전송
      </button>
    </div>
  );
}
