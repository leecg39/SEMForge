"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { analyzeSeoWriting, type SeoWritingCheck } from "@/lib/content/seo-writing";

const CHECK_COPY: Record<SeoWritingCheck["key"], { ko: string; en: string }> = {
  title: { ko: "제목을 15~70자로 작성", en: "Keep the title between 15 and 70 characters" },
  keywordTitle: { ko: "제목에 타깃 키워드 포함", en: "Use a target keyword in the title" },
  length: { ko: "본문을 300단어 이상 작성", en: "Write at least 300 words" },
  readability: { ko: "문장당 평균 25단어 이하", en: "Keep average sentence length under 25 words" },
  keywordUsage: { ko: "본문에 타깃 키워드 사용", en: "Use target keywords in the body" },
  density: { ko: "키워드 밀도를 0.5~2.5%로 유지", en: "Keep keyword density between 0.5% and 2.5%" },
};

export function SeoWritingAssistant({
  project,
}: {
  project: { id: string; name: string; domain: string };
}) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [title, setTitle] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keywords = useMemo(
    () => keywordsText.split(",").map((keyword) => keyword.trim()).filter(Boolean),
    [keywordsText],
  );
  const analysis = useMemo(
    () => analyzeSeoWriting({ title, body, keywords }),
    [body, keywords, title],
  );

  const save = async () => {
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const response = await fetch("/api/content/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          folderId: project.id,
          title,
          mode: "optimize",
          keyword: keywords.join(", ") || null,
          body,
          wordCount: analysis.wordCount,
          seoScore: analysis.score,
        }),
      });
      const result = (await response.json()) as {
        data?: { id: string };
        error?: { message?: string };
      };
      if (!response.ok || !result.data) throw new Error(result.error?.message ?? `HTTP ${response.status}`);
      setStatus(ko ? "초안을 실제 콘텐츠 저장소에 저장했습니다." : "Draft saved to the content store.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ko ? "저장하지 못했습니다." : "Could not save the draft.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid min-h-[calc(100dvh-56px)] bg-app-bg lg:grid-cols-[280px_minmax(0,1fr)_300px]">
      <aside className="border-b border-app-border bg-white p-5 lg:border-b-0 lg:border-r">
        <p className="text-[11px] font-medium uppercase tracking-wide text-app-text-secondary">
          {ko ? "실시간 로컬 분석" : "Live local analysis"}
        </p>
        <h1 className="mt-1 text-[20px] font-semibold">{ko ? "SEO 작성 어시스턴트" : "SEO Writing Assistant"}</h1>
        <p className="mt-2 text-[12px] leading-5 text-app-text-secondary">
          {ko ? `${project.domain} 콘텐츠를 입력 원문 그대로 분석합니다.` : `Analyze content for ${project.domain} directly from the entered text.`}
        </p>
        <div className="mt-5 space-y-4">
          <label className="block text-[12px] font-medium">
            {ko ? "타깃 키워드" : "Target keywords"}
            <input value={keywordsText} onChange={(event) => setKeywordsText(event.target.value)} placeholder={ko ? "쉼표로 구분" : "Comma-separated"} className="mt-1 h-9 w-full rounded-[6px] border border-app-border px-3 outline-none focus:border-app-blue" />
          </label>
          <div className="rounded-[8px] border border-app-border bg-app-bg p-3 text-[12px] text-app-text-secondary">
            {ko ? "점수는 검색 순위를 예측하지 않습니다. 제목·길이·문장·키워드 사용 규칙만 계산합니다." : "The score does not predict rankings. It only evaluates title, length, sentence, and keyword-use rules."}
          </div>
        </div>
      </aside>

      <main className="min-w-0 p-5 lg:p-8">
        <div className="mx-auto max-w-[820px] rounded-[10px] border border-app-border bg-white p-5 shadow-sm">
          <label className="block text-[12px] font-medium text-app-text-secondary">{ko ? "제목" : "Title"}</label>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={ko ? "콘텐츠 제목" : "Content title"} className="mt-1 w-full border-0 p-0 text-[24px] font-semibold outline-none placeholder:text-[#b0b3ba]" />
          <div className="my-5 h-px bg-app-border" />
          <label className="sr-only" htmlFor="seo-writing-body">{ko ? "본문" : "Body"}</label>
          <textarea id="seo-writing-body" value={body} onChange={(event) => setBody(event.target.value)} placeholder={ko ? "분석할 원문을 직접 입력하세요…" : "Enter the source text to analyze…"} className="min-h-[520px] w-full resize-y border-0 text-[16px] leading-7 outline-none placeholder:text-[#b0b3ba]" />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-app-border pt-4">
            <span className="text-[12px] text-app-text-secondary">{analysis.wordCount.toLocaleString()} {ko ? "단어" : "words"}</span>
            <button type="button" onClick={() => void save()} disabled={saving || !title.trim()} className="h-9 rounded-[6px] bg-[#1a1e1a] px-4 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? (ko ? "저장 중…" : "Saving…") : ko ? "초안 저장" : "Save draft"}
            </button>
          </div>
          {status && <p role="status" className="mt-3 text-[12px] text-app-green">{status}</p>}
          {error && <p role="alert" className="mt-3 text-[12px] text-app-red">{error}</p>}
        </div>
      </main>

      <aside className="border-t border-app-border bg-white p-5 lg:border-l lg:border-t-0">
        <p className="text-[12px] text-app-text-secondary">{ko ? "규칙 기반 최적화 점수" : "Rule-based optimization score"}</p>
        <div className="mt-3 flex items-end gap-1">
          <strong className="text-[42px] leading-none">{analysis.score}</strong>
          <span className="pb-1 text-[13px] text-app-text-secondary">/100</span>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-2 text-[12px]">
          <div className="rounded-[6px] bg-app-bg p-3"><dt className="text-app-text-secondary">{ko ? "문장" : "Sentences"}</dt><dd className="mt-1 font-semibold">{analysis.sentenceCount}</dd></div>
          <div className="rounded-[6px] bg-app-bg p-3"><dt className="text-app-text-secondary">{ko ? "평균 문장" : "Avg. sentence"}</dt><dd className="mt-1 font-semibold">{analysis.averageSentenceWords}</dd></div>
          <div className="rounded-[6px] bg-app-bg p-3"><dt className="text-app-text-secondary">{ko ? "키워드 사용" : "Keyword uses"}</dt><dd className="mt-1 font-semibold">{analysis.keywordOccurrences}</dd></div>
          <div className="rounded-[6px] bg-app-bg p-3"><dt className="text-app-text-secondary">{ko ? "밀도" : "Density"}</dt><dd className="mt-1 font-semibold">{analysis.keywordDensity}%</dd></div>
        </dl>
        <ul className="mt-5 space-y-2">
          {analysis.checks.map((check) => (
            <li key={check.key} className="flex items-start gap-2 rounded-[6px] border border-app-border p-3 text-[12px]">
              <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] text-white ${check.passed ? "bg-app-green" : "bg-[#b6b9c0]"}`}>{check.passed ? "✓" : "·"}</span>
              <span className="flex-1">{CHECK_COPY[check.key][ko ? "ko" : "en"]}</span>
              <span className="text-app-text-secondary">{check.points}/{check.maxPoints}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
