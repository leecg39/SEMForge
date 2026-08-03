"use client";

import { useState } from "react";
import type { ContentAiProfileId } from "@/lib/content-ai";
import type { ContentCapabilitiesView } from "@/types/content";
import { fieldClass, textareaClass } from "@/components/content/ContentUi";

export type OptimizeRequirements = {
  keyword: string;
  audience: string;
  title: string;
  brandVoice: string;
  targetWordCount: number;
  language: string;
  countryCode: string;
  aiProfile: ContentAiProfileId;
  sourceType: "url" | "direct";
  sourceUrl: string;
  sourceText: string;
};

function SourceFields({ value, onChange }: {
  value: OptimizeRequirements;
  onChange: (next: OptimizeRequirements) => void;
}) {
  return <>
    <div className="grid grid-cols-2 rounded-[10px] bg-faint p-1" role="radiogroup" aria-label="최적화 원문 입력 방식">
      {(["url", "direct"] as const).map((sourceType) => <button key={sourceType} type="button" role="radio" aria-checked={value.sourceType === sourceType} onClick={() => onChange({ ...value, sourceType })} className={`rounded-[8px] px-3 py-2 text-[11px] font-semibold ${value.sourceType === sourceType ? "bg-white text-hof shadow-sm" : "text-foggy"}`}>{sourceType === "url" ? "URL 가져오기" : "직접 입력"}</button>)}
    </div>
    {value.sourceType === "url" ? <label className="text-[11px] font-semibold text-foggy">원문 URL<input type="url" value={value.sourceUrl} onChange={(event) => onChange({ ...value, sourceUrl: event.target.value })} placeholder="https://example.com/article" className={`${fieldClass} mt-1.5`} /></label> : <label className="text-[11px] font-semibold text-foggy">최적화할 원문<textarea value={value.sourceText} onChange={(event) => onChange({ ...value, sourceText: event.target.value })} rows={9} placeholder="Markdown 또는 일반 텍스트 원문을 200자 이상 입력하세요." className={`${textareaClass} mt-1.5`} /><span className="mt-1 block text-right font-normal text-grey-500">{value.sourceText.trim().length.toLocaleString()}자</span></label>}
  </>;
}

function CommonFields({ value, onChange }: {
  value: OptimizeRequirements;
  onChange: (next: OptimizeRequirements) => void;
}) {
  return <>
    <label className="text-[11px] font-semibold text-foggy">핵심 키워드<input value={value.keyword} onChange={(event) => onChange({ ...value, keyword: event.target.value })} className={`${fieldClass} mt-1.5`} /></label>
    <label className="text-[11px] font-semibold text-foggy">목표 독자<input value={value.audience} onChange={(event) => onChange({ ...value, audience: event.target.value })} className={`${fieldClass} mt-1.5`} /></label>
    <details className="rounded-[10px] bg-faint p-3"><summary className="cursor-pointer text-[11px] font-semibold text-hof">고급 설정</summary><div className="mt-3 grid gap-3"><label className="text-[11px] text-foggy">새 제목 · 선택<input value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} className={`${fieldClass} mt-1`} /></label><label className="text-[11px] text-foggy">브랜드 보이스<input value={value.brandVoice} onChange={(event) => onChange({ ...value, brandVoice: event.target.value })} className={`${fieldClass} mt-1`} /></label><label className="text-[11px] text-foggy">목표 분량<input type="number" min={500} max={5000} step={100} value={value.targetWordCount} onChange={(event) => onChange({ ...value, targetWordCount: Number(event.target.value) })} className={`${fieldClass} mt-1`} /></label></div></details>
  </>;
}

export function ContentOptimizeSetup({ submitting, capabilities, aiProfile, onSubmit }: {
  submitting: boolean;
  capabilities: ContentCapabilitiesView | null;
  aiProfile: ContentAiProfileId;
  onSubmit: (requirements: OptimizeRequirements) => void;
}) {
  const [value, setValue] = useState<OptimizeRequirements>({ keyword: "", audience: "주제에 관심 있는 일반 독자", title: "", brandVoice: "명확하고 신뢰감 있는 전문가", targetWordCount: 1400, language: "ko", countryCode: "KR", aiProfile, sourceType: "url", sourceUrl: "", sourceText: "" });
  const model = capabilities?.contentModels.find((item) => item.id === value.aiProfile);
  const hasSource = value.sourceType === "url" ? /^https?:\/\//iu.test(value.sourceUrl) : value.sourceText.trim().length >= 200;
  const disabled = submitting || !hasSource || !value.keyword.trim() || !capabilities?.talorData.enabled || !model?.enabled;
  return <div className="space-y-4 rounded-[14px] border border-bebe bg-white p-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-rausch">기존 글 개선</p><p className="mt-1 text-[11px] leading-5 text-foggy">URL은 Firecrawl로 가져옵니다. 실패하면 직접 입력으로 새 실행을 시작할 수 있습니다.</p></div><SourceFields value={value} onChange={setValue} /><CommonFields value={value} onChange={setValue} />{capabilities && (!capabilities.talorData.enabled || !model?.enabled) && <p className="text-[11px] text-amber-700">{!capabilities.talorData.enabled ? capabilities.talorData.reason : model?.reason}</p>}<button type="button" disabled={disabled} onClick={() => onSubmit(value)} className="w-full rounded-full bg-rausch px-5 py-2.5 text-[12px] font-semibold text-white disabled:opacity-40">{submitting ? "실행 준비 중…" : "최적화 시작"}</button></div>;
}
