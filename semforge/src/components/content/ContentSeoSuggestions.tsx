"use client";

import type {
  ContentSeoSuggestion,
  ContentSeoUndo,
} from "@/lib/content-seo";

export function ContentSeoSuggestions({ suggestions, history, notice, onApply, onUndo }: {
  suggestions: ContentSeoSuggestion[];
  history: Partial<Record<ContentSeoSuggestion["id"], ContentSeoUndo>>;
  notice: string | null;
  onApply: (suggestion: ContentSeoSuggestion) => void;
  onUndo: (undo: ContentSeoUndo) => void;
}) {
  return (
    <aside className="border-b border-bebe bg-faint px-5 py-4" aria-label="SEO 검사 제안">
      <details open>
        <summary className="cursor-pointer text-[12px] font-semibold text-hof">SEO 검사 제안 · {suggestions.length}건</summary>
        <p className="mt-1 text-[10px] text-grey-500">semforge-content-v1 · 규칙 기반 검사</p>
        {suggestions.length === 0 ? <p className="mt-3 text-[11px] text-emerald-700">현재 적용할 수 있는 결정적 제안이 없습니다.</p> : (
          <ul className="mt-3 grid gap-2 lg:grid-cols-3">
            {suggestions.map((suggestion) => {
              const undo = history[suggestion.id];
              return <li key={suggestion.id} className="rounded-[10px] border border-deco bg-white p-3"><p className="text-[11px] font-semibold text-hof">{suggestion.label}</p><p className="mt-1 text-[10px] leading-4 text-foggy">{suggestion.reason}</p>{undo ? <button type="button" onClick={() => onUndo(undo)} className="mt-2 text-[10px] font-semibold text-rausch underline underline-offset-2">되돌리기</button> : <button type="button" onClick={() => onApply(suggestion)} className="mt-2 rounded-full bg-hof px-3 py-1.5 text-[10px] font-semibold text-white">제안 적용</button>}</li>;
            })}
          </ul>
        )}
        {notice && <p aria-live="polite" className="mt-3 text-[11px] text-amber-700">{notice}</p>}
      </details>
    </aside>
  );
}
