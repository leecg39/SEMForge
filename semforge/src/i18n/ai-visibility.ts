import type { Locale } from "@/i18n/config";

const KO_TO_EN: Record<string, string> = {
  "Google AI 개요": "Google AI Overview",
  "ChatGPT 웹 검색": "ChatGPT web search",
  "Gemini 검색 그라운딩": "Gemini search grounding",
  "실적이 좋은 주제": "Top-performing topics",
  "주제 기회": "Topic opportunities",
  "인용된 소스": "Cited sources",
  "소스 기회": "Source opportunities",
  "인용된 페이지": "Cited pages",
  "수집 전": "Not collected",
  "비교 데이터 없음": "No comparison data",
  "측정 전": "Not measured",
  높음: "High",
  중간: "Medium",
  낮음: "Low",
  "AI 가시성": "AI Visibility",
  "첫 수집을 완료하면 실제 가시성 점수가 표시됩니다.": "Your measured visibility score will appear after the first collection.",
  언급: "Mentions",
  인용: "Citations",
  "주요 측정항목": "Key metrics",
  "수집 이력이 아직 없습니다.": "No collection history yet.",
  "AI 가시성 (%)": "AI Visibility (%)",
  "표시할 실측 데이터가 없습니다.": "No measured data to display.",
  "다음 단계": "Next steps",
  "주제 및 출처": "Topics and sources",
  "최신 실측 셀 기준 · 추정 소스 없음": "Based on the latest measured cells · no estimated sources",
  "결과 검색": "Search results",
  항목: "Item",
  가시성: "Visibility",
  "인용 페이지": "Cited pages",
  "Google 검색 수요": "Google search demand",
  "플랫폼·국가": "Platform · Country",
  "현재 필터에서 실제 관측 결과가 없습니다.": "No measured results match the current filters.",
  이전: "Previous",
  다음: "Next",
  "프롬프트를 추가하지 못했습니다.": "Could not add prompts.",
  "추적 프롬프트": "Tracked prompts",
  "포지션 추적 키워드를 가져오지 못했습니다.": "Could not import Position Tracking keywords.",
  "포지션 추적에서 가져오기": "Import from Position Tracking",
  "CSV 업로드": "Upload CSV",
  "포지션 추적 가져오기 비활성": "Position Tracking import unavailable",
  "프롬프트를 줄바꿈으로 입력": "Enter one prompt per line",
  "주제 태그 (선택)": "Topic tag (optional)",
  추가: "Add",
  삭제: "Delete",
  "프로젝트 설정": "Project settings",
  "AI 가시성 설정": "AI Visibility settings",
  "브랜드, 실제 수집 플랫폼, 대표 국가를 지정합니다. 키가 없는 플랫폼은 선택할 수 없습니다.":
    "Choose the brand, measured platforms, and primary markets. Platforms without a configured key cannot be selected.",
  브랜드명: "Brand name",
  "AI 플랫폼": "AI platforms",
  국가: "Country",
  플랫폼: "Platform",
  "자동 수집": "Automatic collection",
  매주: "Weekly",
  "사용 안 함": "Off",
  "설정을 저장하지 못했습니다.": "Could not save settings.",
  "저장 중…": "Saving…",
  "설정 저장": "Save settings",
  "프로젝트 설정 완료": "Complete project setup",
  "수집 큐 처리 중": "Processing collection queue",
  "브랜드·국가·플랫폼 설정": "Configure brand, country, and platform",
  "측정할 브랜드와 실제 연결 가능한 데이터 소스를 확인합니다.": "Confirm the brand and data sources available for measurement.",
  "추적 프롬프트 등록": "Add tracking prompts",
  "직접 입력, CSV 또는 연결된 포지션 추적에서 최대 20개를 등록합니다.": "Add up to 20 prompts manually, by CSV, or from connected Position Tracking.",
  "첫 실측 수집": "Run the first measured collection",
  "승인한 프롬프트만 플랫폼·국가별로 수집해 개요를 만듭니다.": "Collect only approved prompts by platform and country to build the overview.",
  "시작 가이드": "Getting started",
  "실제 AI 응답 수집을 3단계로 시작하세요": "Start measuring real AI responses in three steps",
  "프롬프트를 자동 생성하거나 승인 없이 수집하지 않습니다.": "Prompts are never generated or collected without your approval.",
  "1단계 설정 열기": "Open step 1 settings",
  "2단계 프롬프트 등록": "Add prompts in step 2",
  "수집 중…": "Collecting…",
  "3단계 첫 실측 수집": "Run the first measured collection",
  "측정 불가 셀": "Unmeasurable cells",
  "공급자가 인용 정보를 제공하지 않아 점수 분모에서 제외된 실제 관측입니다.":
    "These measured observations are excluded from the score denominator because the provider did not return citation data.",
  프롬프트: "Prompt",
  "수집 출처": "Collection source",
  "수집 시각": "Collected at",
  "현재 필터에서 측정 불가 셀이 없습니다.": "There are no unmeasurable cells for the current filters.",
  "프로젝트를 불러오지 못했습니다.": "Could not load projects.",
  "프로젝트 설정을 불러오지 못했습니다.": "Could not load project settings.",
  "AI 가시성 개요를 불러오지 못했습니다.": "Could not load the AI Visibility overview.",
  "실제 추적을 완료하지 못했습니다.": "Could not complete the measured tracking run.",
  "수집 상태를 확인하지 못했습니다. 다시 시도해 주세요.": "Could not check collection status. Please try again.",
  "수집을 시작하지 못했습니다.": "Could not start collection.",
  "AI 가시성 프로젝트를 불러오는 중…": "Loading AI Visibility projects…",
  "AI 가시성을 불러오지 못했습니다": "Could not load AI Visibility",
  "로그인으로 이동": "Go to sign in",
  "먼저 프로젝트 폴더를 만들어 주세요": "Create a project folder first",
  "AI 가시성은 폴더 도메인과 소유권을 기준으로 실제 인용을 판정합니다.": "AI Visibility verifies real citations using the folder domain and ownership.",
  "프로젝트로 이동": "Go to projects",
  "인쇄 / PDF 저장": "Print / Save PDF",
  홈: "Home",
  "가시성 개요": "Visibility Overview",
  "실제 AI 응답의 브랜드 언급과 자사 도메인 인용만 집계합니다.": "Counts only brand mentions and owned-domain citations found in real AI responses.",
  설정: "Settings",
  "CSV 내보내기": "Export CSV",
  "PDF로 저장": "Save as PDF",
  "수집 시작 중…": "Starting collection…",
  "지금 수집": "Collect now",
  비활성: "Disabled",
  "1개월": "1 month",
  "6개월": "6 months",
  "전체 (400일)": "All (400 days)",
  "최근 수집": "Last collected",
  "LLM별 언급 분포": "Mentions by LLM",
  "국가별 언급": "Mentions by country",
  "가시성 공식": "Visibility formula",
  "측정 가능한 최신 프롬프트×플랫폼×국가 셀 중 브랜드 언급 또는 자사 도메인 인용 비율":
    "Share of the latest measurable prompt × platform × country cells containing a brand mention or owned-domain citation",
  보존: "Retention",
  일: "days",
  "OpenAI Responses 웹 검색": "OpenAI Responses web search",
  "GEMINI_API_KEY가 필요합니다.": "GEMINI_API_KEY is required.",
  "이 프로젝트에 연결된 포지션 추적 캠페인이 없습니다.": "No Position Tracking campaign is connected to this project.",
  "포지션 추적에 가져올 활성 키워드가 없습니다.": "Position Tracking has no active keywords to import.",
  "플랫폼 결과 보기": "View platform results",
  "주제 기회 보기": "View topic opportunities",
  "소스 기회 보기": "View source opportunities",
  "측정 불가 보기": "View unmeasurable cells",
  "전체 결과 보기": "View all results",
  "측정 불가 응답 확인": "Review unmeasurable responses",
  "주간 관측 유지": "Keep weekly monitoring",
  "현재 필터에서 큰 격차가 확인되지 않았습니다. 정기 수집으로 변화를 계속 확인하세요.":
    "No major gaps were found for the current filters. Keep collecting regularly to monitor changes.",
};

function translateDynamic(text: string): string | null {
  let match = text.match(/^실제 추적 (\d+)건을 완료했습니다\.$/u);
  if (match) return `Completed ${match[1]} measured tracking items.`;
  match = text.match(/^실제 추적을 완료했습니다\. 성공 (\d+)건 · 실패 (\d+)건$/u);
  if (match) return `Measured tracking complete. ${match[1]} succeeded · ${match[2]} failed`;
  match = text.match(/^(.+) 노출 보강$/u);
  if (match) return `Improve visibility on ${KO_TO_EN[match[1]] ?? match[1]}`;
  match = text.match(/^현재 가시성 (\d+)%로 가장 낮습니다\. 해당 플랫폼의 실측 프롬프트를 우선 검토하세요\.$/u);
  if (match) return `This platform has the lowest current visibility at ${match[1]}%. Review its measured prompts first.`;
  match = text.match(/^주제 기회: (.+)$/u);
  if (match) return `Topic opportunity: ${match[1]}`;
  match = text.match(/^(\d+)개 프롬프트의 가시성이 프로젝트 평균보다 낮습니다\. 관련 페이지와 답변 근거를 보강하세요\.$/u);
  if (match) return `${match[1]} prompts have below-average visibility. Strengthen the related pages and supporting evidence.`;
  match = text.match(/^반복 인용 소스 분석: (.+)$/u);
  if (match) return `Analyze repeatedly cited source: ${match[1]}`;
  match = text.match(/^자사 미노출 응답에서 (\d+)회 인용됐습니다\. 해당 출처가 제공하는 근거 구조를 비교하세요\.$/u);
  if (match) return `Cited ${match[1]} times in responses where your brand was absent. Compare the evidence structure this source provides.`;
  match = text.match(/^최신 관측의 ([\d.]+)%는 인용 정보가 없어 점수에서 제외되었습니다\. 원문과 수집 출처를 확인하세요\.$/u);
  if (match) return `${match[1]}% of the latest observations lacked citation data and were excluded from the score. Review the source response and collection origin.`;
  match = text.match(/^측정 가능한 최신 셀 (\d+)개를 기준으로 계산했습니다\.$/u);
  if (match) return `Calculated from ${match[1]} measurable cells in the latest collection.`;
  return null;
}

export function translateAiVisibilityText(locale: Locale, text: string): string {
  if (locale === "ko") return text;
  return KO_TO_EN[text] ?? translateDynamic(text) ?? text;
}
