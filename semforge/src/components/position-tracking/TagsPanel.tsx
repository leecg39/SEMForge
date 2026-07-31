"use client";

import { useMemo, useState } from "react";
import { TagManageModal, type TaggableKeyword } from "@/components/position-tracking/TagManageModal";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

const COPY = {
  ko: {
    title: "태그",
    emptyTitle: "첫 번째 태그 추가하기",
    emptyBody: "태그를 사용하면 키워드 그룹의 실적을 추적하는 데 도움이 됩니다.",
    manage: "키워드 태그하기",
    all: "전체",
    filterHint: "태그를 클릭하면 아래 키워드 테이블이 해당 태그로 필터링됩니다.",
    keywordCount: (count: number) => `${count}개`,
  },
  en: {
    title: "Tags",
    emptyTitle: "Add your first tag",
    emptyBody: "Tags help you track the performance of keyword groups.",
    manage: "Tag keywords",
    all: "All",
    filterHint: "Click a tag to filter the keyword table below.",
    keywordCount: (count: number) => `${count}`,
  },
} as const;

/**
 * 태그 섹션 — 태그별 키워드 수 칩과 태그 관리 모달 진입점.
 * 칩 선택은 키워드 테이블 필터(activeTag)로 연결된다.
 */
export function TagsPanel({
  campaignId,
  keywords,
  canEdit,
  activeTag,
  onSelectTag,
  onChanged,
}: {
  campaignId: string;
  keywords: TaggableKeyword[];
  canEdit: boolean;
  activeTag: string | null;
  onSelectTag: (tag: string | null) => void;
  onChanged: () => void;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [modalOpen, setModalOpen] = useState(false);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const keyword of keywords) {
      for (const tag of keyword.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );
  }, [keywords]);

  return (
    <section className="rounded-[10px] border border-app-border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold leading-[20px] text-app-text">{copy.title}</h3>
        {canEdit && tagCounts.length > 0 && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="h-[30px] rounded-[6px] bg-[#0a8462] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#086b50]"
          >
            {copy.manage}
          </button>
        )}
      </div>

      {tagCounts.length === 0 ? (
        <div className="mt-2 flex flex-col items-center py-6 text-center">
          <span aria-hidden className="text-[28px]">🏷️</span>
          <p className="mt-2 text-[14px] font-semibold text-app-text">{copy.emptyTitle}</p>
          <p className="mt-1 max-w-[360px] text-[12px] leading-[18px] text-app-text-secondary">
            {copy.emptyBody}
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-3 h-[32px] rounded-[6px] bg-[#0a8462] px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#086b50]"
            >
              {copy.manage}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onSelectTag(null)}
              className={cn(
                "h-[28px] rounded-full border px-3 text-[12px] font-medium transition-colors",
                activeTag === null
                  ? "border-app-blue bg-[#eaf3ff] text-app-blue"
                  : "border-app-border text-app-text-secondary hover:bg-[#f6f7f9]"
              )}
            >
              {copy.all}
            </button>
            {tagCounts.map(([tag, count]) => (
              <button
                key={tag}
                type="button"
                onClick={() => onSelectTag(activeTag === tag ? null : tag)}
                className={cn(
                  "h-[28px] rounded-full border px-3 text-[12px] font-medium transition-colors",
                  activeTag === tag
                    ? "border-app-blue bg-[#eaf3ff] text-app-blue"
                    : "border-app-border text-app-text hover:bg-[#f6f7f9]"
                )}
              >
                {tag}
                <span className="ml-1 text-app-text-secondary">{copy.keywordCount(count)}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-[16px] text-app-text-secondary">
            {copy.filterHint}
          </p>
        </>
      )}

      <TagManageModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        campaignId={campaignId}
        keywords={keywords}
        onSaved={onChanged}
      />
    </section>
  );
}
