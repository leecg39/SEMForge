"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";

const COPY = {
  ko: {
    title: "태그 관리",
    keywordFilter: "키워드로 필터링",
    tagFilter: "태그로 필터링",
    selectAll: "모두 선택",
    tagInput: "태그 입력 (쉼표로 구분)",
    addTags: "+ Add tags",
    removeTags: "태그 삭제",
    applying: "적용 중…",
    close: "닫기",
    empty: "조건에 맞는 키워드가 없습니다.",
    needSelection: "먼저 키워드를 선택하세요.",
    needTags: "태그를 입력하세요.",
    updateError: "태그를 저장하지 못했습니다.",
    updated: (count: number) => `${count}개 키워드에 적용했습니다.`,
  },
  en: {
    title: "Manage tags",
    keywordFilter: "Filter by keyword",
    tagFilter: "Filter by tag",
    selectAll: "Select all",
    tagInput: "Tags (comma separated)",
    addTags: "+ Add tags",
    removeTags: "Remove tags",
    applying: "Applying…",
    close: "Close",
    empty: "No keywords match the filters.",
    needSelection: "Select keywords first.",
    needTags: "Enter at least one tag.",
    updateError: "Tags could not be saved.",
    updated: (count: number) => `Applied to ${count} keywords.`,
  },
} as const;

export interface TaggableKeyword {
  id: string;
  keyword: string;
  tags: string[];
}

function splitTags(input: string): string[] {
  return [
    ...new Set(
      input
        .split(",")
        .map((tag) => tag.trim().replace(/\s+/g, " ").toLowerCase())
        .filter(Boolean)
    ),
  ];
}

/**
 * 태그 관리 모달 (원본의 태그 관리 다이얼로그).
 * 키워드를 선택하고 태그를 일괄 추가/제거한다. 저장 후 onSaved 로 재조회를 알린다.
 */
export function TagManageModal({
  open,
  onOpenChange,
  campaignId,
  keywords,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  keywords: TaggableKeyword[];
  onSaved: () => void;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [keywordFilter, setKeywordFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [tagInput, setTagInput] = useState("");
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const visible = useMemo(() => {
    const keywordTerm = keywordFilter.trim().toLowerCase();
    const tagTerm = tagFilter.trim().toLowerCase();
    return keywords.filter((row) => {
      if (keywordTerm && !row.keyword.toLowerCase().includes(keywordTerm)) return false;
      if (tagTerm && !row.tags.some((tag) => tag.toLowerCase().includes(tagTerm))) return false;
      return true;
    });
  }, [keywords, keywordFilter, tagFilter]);

  const allVisibleSelected =
    visible.length > 0 && visible.every((row) => selected.has(row.id));

  const toggleAll = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visible.forEach((row) => next.delete(row.id));
      else visible.forEach((row) => next.add(row.id));
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const apply = async (mode: "add" | "remove") => {
    const tags = splitTags(tagInput);
    if (selected.size === 0) {
      setNotice({ kind: "error", text: copy.needSelection });
      return;
    }
    if (tags.length === 0) {
      setNotice({ kind: "error", text: copy.needTags });
      return;
    }
    setApplying(true);
    setNotice(null);
    try {
      const response = await api.post<{ updated: number }>(
        `/api/position-tracking/${encodeURIComponent(campaignId)}/keywords/tags/`,
        {
          keywordIds: [...selected],
          add: mode === "add" ? tags : [],
          remove: mode === "remove" ? tags : [],
        }
      );
      setNotice({ kind: "ok", text: copy.updated(response.data.updated) });
      setTagInput("");
      onSaved();
    } catch (caught) {
      setNotice({
        kind: "error",
        text: caught instanceof ClientApiError ? caught.message : copy.updateError,
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[12px] bg-white p-5 shadow-[0_24px_60px_rgba(15,20,30,0.25)] focus:outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-[16px] font-semibold text-app-text">
              {copy.title}
            </Dialog.Title>
            <Dialog.Close
              aria-label={copy.close}
              className="rounded-[6px] p-1 text-app-text-secondary transition-colors hover:bg-[#f3f4f7] hover:text-app-text"
            >
              ✕
            </Dialog.Close>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <input
              value={keywordFilter}
              onChange={(event) => setKeywordFilter(event.target.value)}
              placeholder={copy.keywordFilter}
              aria-label={copy.keywordFilter}
              className="h-[34px] rounded-[8px] border border-app-border px-3 text-[13px] outline-none focus:border-app-blue"
            />
            <input
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              placeholder={copy.tagFilter}
              aria-label={copy.tagFilter}
              className="h-[34px] rounded-[8px] border border-app-border px-3 text-[13px] outline-none focus:border-app-blue"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[8px] border border-[#f0cdd6] bg-[#fdf3f5] p-2">
            <label className="flex items-center gap-1.5 text-[12px] text-app-text">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleAll}
                className="h-4 w-4 accent-app-blue"
              />
              {copy.selectAll}
            </label>
            <input
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              placeholder={copy.tagInput}
              aria-label={copy.tagInput}
              className="h-[32px] min-w-[160px] flex-1 rounded-[6px] border border-app-border px-3 text-[13px] outline-none focus:border-app-blue"
            />
            <button
              type="button"
              disabled={applying}
              onClick={() => void apply("add")}
              className="h-[32px] rounded-[6px] bg-[#171b18] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#303633] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {applying ? copy.applying : copy.addTags}
            </button>
            <button
              type="button"
              disabled={applying}
              onClick={() => void apply("remove")}
              className="h-[32px] rounded-[6px] border border-[#e6a4b4] px-3 text-[12px] font-semibold text-[#b42346] transition-colors hover:bg-[#fdecef] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {copy.removeTags}
            </button>
          </div>

          {notice && (
            <p
              role={notice.kind === "error" ? "alert" : "status"}
              className={cn(
                "mt-2 text-[12px]",
                notice.kind === "error" ? "text-app-red" : "text-[#0a6b57]"
              )}
            >
              {notice.text}
            </p>
          )}

          <ul className="mt-3 max-h-[320px] overflow-y-auto rounded-[8px] border border-app-border">
            {visible.length === 0 && (
              <li className="px-3 py-6 text-center text-[13px] text-app-text-secondary">
                {copy.empty}
              </li>
            )}
            {visible.map((row, index) => (
              <li
                key={row.id}
                className={cn(
                  "flex items-center gap-3 border-b border-app-border px-3 py-2 last:border-b-0",
                  selected.has(row.id) && "bg-[#f0f6ff]"
                )}
              >
                <span className="w-5 text-right text-[12px] text-app-text-secondary">
                  {index + 1}
                </span>
                <input
                  type="checkbox"
                  checked={selected.has(row.id)}
                  onChange={() => toggleOne(row.id)}
                  aria-label={row.keyword}
                  className="h-4 w-4 accent-app-blue"
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-app-text">
                  {row.keyword}
                </span>
                <span className="flex max-w-[45%] flex-wrap justify-end gap-1">
                  {row.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-[4px] bg-[#eef2f7] px-1.5 py-0.5 text-[11px] text-[#475166]"
                    >
                      {tag}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
