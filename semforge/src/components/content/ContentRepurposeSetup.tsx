"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client-api";
import type { ContentAiProfileId } from "@/lib/content-ai";
import type { ContentArticleView, ContentCapabilitiesView } from "@/types/content";
import { fieldClass, textareaClass } from "@/components/content/ContentUi";

export type RepurposeRequirements = {
  keyword: string;
  title: string;
  audience: string;
  brandVoice: string;
  language: string;
  countryCode: string;
  targetWordCount: number;
  aiProfile: ContentAiProfileId;
  sourceType: "article" | "direct";
  sourceArticleId: string;
  sourceText: string;
  targetFormat: "summary" | "newsletter" | "social_thread";
};

function SourceInput({ value, articles, onChange }: { value: RepurposeRequirements; articles: ContentArticleView[]; onChange: (next: RepurposeRequirements) => void }) {
  return <><div className="grid grid-cols-2 rounded-[10px] bg-faint p-1" role="radiogroup" aria-label="재활용 원문 방식">{(["article", "direct"] as const).map((sourceType) => <button key={sourceType} type="button" role="radio" aria-checked={value.sourceType === sourceType} onClick={() => onChange({ ...value, sourceType })} className={`rounded-[8px] px-3 py-2 text-[11px] font-semibold ${value.sourceType === sourceType ? "bg-white text-hof shadow-sm" : "text-foggy"}`}>{sourceType === "article" ? "Library 문서" : "직접 입력"}</button>)}</div>{value.sourceType === "article" ? <label className="text-[11px] font-semibold text-foggy">원본 문서<select value={value.sourceArticleId} onChange={(event) => { const article = articles.find((item) => item.id === event.target.value); onChange({ ...value, sourceArticleId: event.target.value, keyword: article?.keyword ?? value.keyword, title: article ? `${article.title} 파생 콘텐츠` : value.title }); }} className={`${fieldClass} mt-1.5`}><option value="">문서를 선택하세요</option>{articles.map((article) => <option key={article.id} value={article.id}>{article.title} · v{article.version}</option>)}</select></label> : <label className="text-[11px] font-semibold text-foggy">재활용할 원문<textarea value={value.sourceText} onChange={(event) => onChange({ ...value, sourceText: event.target.value })} rows={9} placeholder="Markdown 또는 일반 텍스트 원문을 200자 이상 입력하세요." className={`${textareaClass} mt-1.5`} /></label>}</>;
}

export function ContentRepurposeSetup({ submitting, capabilities, aiProfile, defaultSourceArticleId = "", onSubmit }: { submitting: boolean; capabilities: ContentCapabilitiesView | null; aiProfile: ContentAiProfileId; defaultSourceArticleId?: string; onSubmit: (requirements: RepurposeRequirements) => void }) {
  const [articles, setArticles] = useState<ContentArticleView[]>([]);
  const [value, setValue] = useState<RepurposeRequirements>({ keyword: "", title: "", audience: "기존 콘텐츠의 핵심 독자", brandVoice: "명확하고 신뢰감 있는 전문가", language: "ko", countryCode: "KR", targetWordCount: 700, aiProfile, sourceType: "article", sourceArticleId: defaultSourceArticleId, sourceText: "", targetFormat: "newsletter" });
  useEffect(() => { let active = true; api.get<ContentArticleView[]>("/api/content/?pageSize=100&sort=updatedAt:desc").then(({ data }) => { if (!active) return; const available = data.filter((article) => Boolean(article.body)); setArticles(available); setValue((current) => { const article = available.find((item) => item.id === current.sourceArticleId); return article ? { ...current, keyword: article.keyword ?? article.title, title: `${article.title} 파생 콘텐츠` } : current; }); }).catch(() => undefined); return () => { active = false; }; }, []);
  const selected = useMemo(() => articles.find((article) => article.id === value.sourceArticleId), [articles, value.sourceArticleId]);
  const model = capabilities?.contentModels.find((item) => item.id === value.aiProfile);
  const hasSource = value.sourceType === "article" ? Boolean(selected) : value.sourceText.trim().length >= 200;
  const disabled = submitting || !hasSource || !value.keyword.trim() || !model?.enabled;
  return <div className="space-y-4 rounded-[14px] border border-bebe bg-white p-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-rausch">문서 재활용</p><p className="mt-1 text-[11px] leading-5 text-foggy">Library 문서는 현재 버전을 스냅샷으로 고정하고 파생 관계를 저장합니다.</p></div><SourceInput value={value} articles={articles} onChange={setValue} /><label className="text-[11px] font-semibold text-foggy">대상 형식<select value={value.targetFormat} onChange={(event) => setValue({ ...value, targetFormat: event.target.value as RepurposeRequirements["targetFormat"] })} className={`${fieldClass} mt-1.5`}><option value="summary">핵심 요약</option><option value="newsletter">이메일 뉴스레터</option><option value="social_thread">소셜 스레드</option></select></label><label className="text-[11px] font-semibold text-foggy">핵심 주제<input value={value.keyword} onChange={(event) => setValue({ ...value, keyword: event.target.value })} className={`${fieldClass} mt-1.5`} /></label>{!model?.enabled && <p className="text-[11px] text-amber-700">{model?.reason ?? "사용 가능한 AI 모델이 없습니다."}</p>}<button type="button" disabled={disabled} onClick={() => onSubmit(value)} className="w-full rounded-full bg-rausch px-5 py-2.5 text-[12px] font-semibold text-white disabled:opacity-40">{submitting ? "실행 준비 중…" : "파생 문서 생성"}</button></div>;
}
