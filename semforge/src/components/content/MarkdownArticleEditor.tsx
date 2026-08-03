"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, ClientApiError } from "@/lib/client-api";
import {
  applyContentSeoSuggestion,
  undoContentSeoSuggestion,
  type ContentSeoDocument,
  type ContentSeoSuggestion,
  type ContentSeoUndo,
} from "@/lib/content-seo";
import { cn } from "@/lib/utils";
import type { ContentArticleView } from "@/types/content";
import { StatusPill, fieldClass } from "@/components/content/ContentUi";
import { ContentSeoSuggestions } from "@/components/content/ContentSeoSuggestions";

function wordCount(markdown: string): number {
  return markdown.trim().split(/\s+/u).filter(Boolean).length;
}

function signature(value: { title: string; metaDescription: string; body: string }): string {
  return JSON.stringify(value);
}

export function MarkdownArticleEditor({
  article,
  onSaved,
  controlledTab,
  onTabChange,
  showTabs = true,
  seoSuggestions = [],
}: {
  article: ContentArticleView;
  onSaved?: (article: ContentArticleView) => void;
  controlledTab?: "write" | "preview";
  onTabChange?: (tab: "write" | "preview") => void;
  showTabs?: boolean;
  seoSuggestions?: ContentSeoSuggestion[];
}) {
  const [title, setTitle] = useState(article.title);
  const [metaDescription, setMetaDescription] = useState(article.metaDescription ?? "");
  const [body, setBody] = useState(article.body ?? "");
  const [status, setStatus] = useState(article.status);
  const [version, setVersion] = useState(article.version);
  const [localTab, setLocalTab] = useState<"write" | "preview">("write");
  const tab = controlledTab ?? localTab;
  const setTab = (value: "write" | "preview") => {
    if (controlledTab === undefined) setLocalTab(value);
    onTabChange?.(value);
  };
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error" | "conflict">("saved");
  const [error, setError] = useState<string | null>(null);
  const [seoHistory, setSeoHistory] = useState<Partial<Record<ContentSeoSuggestion["id"], ContentSeoUndo>>>({});
  const [seoNotice, setSeoNotice] = useState<string | null>(null);
  const [visibleSeoSuggestions] = useState(() => seoSuggestions.filter((suggestion) => {
    const initial = { title: article.title, metaDescription: article.metaDescription ?? "", body: article.body ?? "" };
    return initial[suggestion.field] === suggestion.expectedValue;
  }));
  const initialSignature = signature({ title: article.title, metaDescription: article.metaDescription ?? "", body: article.body ?? "" });
  const savedSignature = useRef(initialSignature);
  const latestSignature = useRef(initialSignature);
  const savingRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const snapshot = { title, metaDescription, body };
    const nextSignature = signature(snapshot);
    latestSignature.current = nextSignature;
    if (nextSignature === savedSignature.current || savingRef.current) return;
    setSaveState("saving");
    debounceTimerRef.current = window.setTimeout(async () => {
      savingRef.current = true;
      try {
        const { data } = await api.patch<ContentArticleView>(`/api/content/${article.id}/`, {
          ...snapshot,
          wordCount: wordCount(body),
          version,
        });
        savedSignature.current = nextSignature;
        setVersion(data.version);
        setStatus(data.status);
        setSaveState(latestSignature.current === nextSignature ? "saved" : "saving");
        setError(null);
        onSaved?.(data);
      } catch (cause) {
        if (cause instanceof ClientApiError && cause.code === "VERSION_CONFLICT") {
          setSaveState("conflict");
          setError("다른 창에서 문서가 수정됐습니다. 현재 입력은 유지되며, 새로고침 후 다시 확인해 주세요.");
        } else {
          setSaveState("error");
          setError(cause instanceof Error ? cause.message : "자동 저장에 실패했습니다.");
        }
      } finally {
        savingRef.current = false;
        debounceTimerRef.current = null;
      }
    }, 850);
    return () => {
      if (debounceTimerRef.current !== null && !savingRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [article.id, body, metaDescription, onSaved, title, version]);

  const changeStatus = async (nextStatus: ContentArticleView["status"]) => {
    if (savingRef.current) return;
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    savingRef.current = true;
    setSaveState("saving");
    try {
      const { data } = await api.patch<ContentArticleView>(`/api/content/${article.id}/`, {
        title,
        metaDescription,
        body,
        wordCount: wordCount(body),
        status: nextStatus,
        publishedAt: nextStatus === "published" ? new Date().toISOString() : null,
        version,
      });
      setStatus(data.status);
      setVersion(data.version);
      savedSignature.current = signature({ title, metaDescription, body });
      setSaveState("saved");
      setError(null);
      onSaved?.(data);
    } catch (cause) {
      setSaveState(cause instanceof ClientApiError && cause.code === "VERSION_CONFLICT" ? "conflict" : "error");
      setError(cause instanceof Error ? cause.message : "상태 변경에 실패했습니다.");
    } finally {
      savingRef.current = false;
    }
  };

  const currentDocument = (): ContentSeoDocument => ({ title, metaDescription, body });
  const replaceDocument = (document: ContentSeoDocument) => {
    setTitle(document.title);
    setMetaDescription(document.metaDescription);
    setBody(document.body);
  };
  const applySuggestion = (suggestion: ContentSeoSuggestion) => {
    const applied = applyContentSeoSuggestion(currentDocument(), suggestion);
    if (!applied.undo) {
      setSeoNotice("제안 생성 후 해당 필드가 수정되어 적용하지 않았습니다.");
      return;
    }
    replaceDocument(applied.document);
    setSeoHistory((current) => ({ ...current, [suggestion.id]: applied.undo! }));
    setSeoNotice("제안을 적용했습니다. 자동 저장 후에도 되돌릴 수 있습니다.");
  };
  const undoSuggestion = (undo: ContentSeoUndo) => {
    const result = undoContentSeoSuggestion(currentDocument(), undo);
    if (!result.restored) {
      setSeoNotice("적용 후 해당 필드가 다시 수정되어 자동으로 되돌리지 않았습니다.");
      return;
    }
    replaceDocument(result.document);
    setSeoHistory((current) => ({ ...current, [undo.suggestionId]: undefined }));
    setSeoNotice("제안 적용 전 내용으로 되돌렸습니다.");
  };

  const saveLabel = {
    saved: "모든 변경사항 저장됨",
    saving: "저장 중…",
    error: "저장 실패",
    conflict: "버전 충돌",
  }[saveState];

  return (
    <section className="flex min-h-[680px] flex-col overflow-hidden rounded-[16px] border border-bebe bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-bebe px-5 py-3">
        {showTabs && <div className="flex rounded-full bg-faint p-1" role="tablist" aria-label="Markdown 편집 모드">
          {(["write", "preview"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                "rounded-full px-4 py-2 text-[12px] font-semibold",
                tab === value ? "bg-white text-hof shadow-sm" : "text-foggy",
              )}
            >
              {value === "write" ? "작성" : "미리보기"}
            </button>
          ))}
        </div>}
        <StatusPill status={status} />
        <span aria-live="polite" className={cn("ml-auto text-[12px]", saveState === "error" || saveState === "conflict" ? "text-red-700" : "text-foggy")}>{saveLabel}</span>
      </div>

      {visibleSeoSuggestions.length > 0 && <ContentSeoSuggestions suggestions={visibleSeoSuggestions} history={seoHistory} notice={seoNotice} onApply={applySuggestion} onUndo={undoSuggestion} />}

      <div className="border-b border-bebe p-5">
        <label className="text-[12px] font-semibold text-foggy" htmlFor={`article-title-${article.id}`}>제목</label>
        <input id={`article-title-${article.id}`} value={title} onChange={(event) => setTitle(event.target.value)} className={`${fieldClass} mt-2 text-[17px] font-semibold`} />
        <label className="mt-4 block text-[12px] font-semibold text-foggy" htmlFor={`article-meta-${article.id}`}>메타 설명</label>
        <textarea id={`article-meta-${article.id}`} value={metaDescription} onChange={(event) => setMetaDescription(event.target.value)} rows={2} maxLength={320} className="mt-2 w-full resize-none rounded-[10px] border border-deco px-3.5 py-3 text-[13px] leading-5 outline-none focus:border-rausch focus:ring-2 focus:ring-rausch/15" />
        <p className="mt-1 text-right text-[11px] text-grey-500">{metaDescription.length}/320</p>
      </div>

      <div className="min-h-0 flex-1">
        {tab === "write" ? (
          <textarea
            aria-label="Markdown 본문"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            spellCheck
            className="h-full min-h-[430px] w-full resize-none border-0 bg-white p-6 font-mono text-[14px] leading-7 text-hof outline-none"
          />
        ) : (
          <article className="content-markdown mx-auto max-w-[820px] px-7 py-8">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </article>
        )}
      </div>

      {error && <div role="alert" className="border-t border-red-100 bg-red-50 px-5 py-3 text-[12px] text-red-700">{error}</div>}
      <footer className="flex flex-wrap items-center gap-2 border-t border-bebe bg-faint px-5 py-3">
        <span className="mr-auto text-[11px] text-foggy">Markdown · {wordCount(body).toLocaleString()}단어</span>
        <button type="button" onClick={() => changeStatus("draft")} disabled={status === "draft" || saveState === "saving"} className="rounded-full border border-deco bg-white px-3 py-2 text-[12px] font-semibold disabled:opacity-45">초안</button>
        <button type="button" onClick={() => changeStatus("in_review")} disabled={status === "in_review" || saveState === "saving"} className="rounded-full border border-deco bg-white px-3 py-2 text-[12px] font-semibold disabled:opacity-45">검토 요청</button>
        <button type="button" onClick={() => changeStatus("published")} disabled={status === "published" || saveState === "saving"} className="rounded-full bg-hof px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-45">내부 게시</button>
      </footer>
    </section>
  );
}
