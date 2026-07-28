import type { Locale } from "@/i18n/config";
import type { ResourceSpec } from "@/types/crud";
import generatedEn from "@/i18n/generated-en.json";

/**
 * 인증 앱은 ko.semrush.com 실측 문구를 기준으로 만들어져 있어 한국어가 원문이다.
 * 이 표는 공통 셸과 CRUD 화면에서 사용하는 사용자 노출 문구의 영어 짝을 한곳에서 관리한다.
 */
const KO_TO_EN: Record<string, string> = {
  ...(generatedEn as Record<string, string>),
  홈페이지: "Home",
  "트래픽 & 시장": "Traffic & Market",
  지역: "Local",
  콘텐츠: "Content",
  광고: "Advertising",
  소셜: "Social",
  보고서: "Reports",
  "사이트 감사": "Site Audit",
  "순위 추적": "Position Tracking",
  "키워드 목록": "Keyword Lists",
  "미디어 리스트": "Media Lists",
  "콘텐츠 문서": "Content Documents",
  휴지통: "Trash",
  "감사 로그": "Audit Log",
  "프로필 설정": "Profile settings",
  "사용자 관리": "User management",
  알림: "Notifications",
  "활동 로그": "Activity log",
  기기: "Device",
  "기기 유형": "Device type",
  기본: "Default",
  목록: "List",
  문서: "Documents",
  본문: "Body",
  설명: "Description",
  상태: "Status",
  수동: "Manual",
  대기: "Queued",
  실패: "Failed",
  완료: "Completed",
  없음: "None",
  예약: "Schedule",
  일시중지: "Paused",
  "내 프로필": "My profile",
  "CRUD 도구 (이 클론 전용)": "CRUD tools (clone only)",
  로그아웃: "Log out",
  "작업, 웹사이트 또는 키워드를 입력하세요": "Enter a task, website, or keyword",
  "전역 검색": "Global search",
  검색: "Search",
  "가격 책정": "Pricing",
  엔터프라이즈: "Enterprise",
  툴킷: "Toolkits",
  프로필: "Profile",
  "내 프로필 메뉴": "My profile menu",
  문의하기: "Contact us",
  "회사 정보": "About us",
  블로그: "Blog",
  "요금제 및 가격 보기": "View plans and pricing",
  "Semrush 시작하기": "Get started with Semrush",
  "쿠키 설정": "Cookie settings",
  "법률 정보": "Legal info",
  개인정보처리방침: "Privacy policy",
  "내 개인 정보를 판매하지 마세요": "Do not sell my personal information",
  "© 2026 Semrush Holdings. All rights reserved.":
    "© 2026 Semrush Holdings. All rights reserved.",
  "툴킷 추천": "Toolkit recommendations",
  "오른쪽으로 스크롤": "Scroll right",
  "제품 카드": "Product card",
  "콘텐츠 아이디어": "Content ideas",
  "AI 가시성": "AI Visibility",
  "리뷰를 관리하고, 로컬 검색 가시성을 높이고, 로컬 경쟁자를 추적하세요.":
    "Manage reviews, improve local search visibility, and track local competitors.",
  "AI와 경쟁 데이터를 활용해 SEO 친화적인 콘텐츠를 만들어 보세요.":
    "Create SEO-friendly content using AI and competitive data.",
  "경쟁자를 조사하고, Google 광고와 Meta 광고를 시작하고 최적화하세요.":
    "Research competitors, then launch and optimize Google and Meta ads.",
  "LLM에서의 브랜드 가시성을 좌우하는 언론 노출을 확보하세요.":
    "Earn media coverage that improves your brand visibility in LLMs.",
  "생성, 예약, 분석까지 소셜 미디어의 전체 사이클을 관리하세요.":
    "Manage the full social media cycle, from creation and scheduling to analytics.",
  "ChatGPT, Google AI 및 기타 AI 검색 엔진에서 검색되도록 하세요.":
    "Get discovered in ChatGPT, Google AI, and other AI search engines.",
  "모니터링할 도메인": "Domains to monitor",
  열기: "Open",
  닫기: "Close",
  "추적 중인 도메인이 없습니다. 폴더에 웹사이트를 추가하면 여기에 표시됩니다.":
    "No domains are being tracked. Add a website to a folder to see it here.",
  "피드백 전송": "Send feedback",
  폴더: "Folders",
  "폴더 이름": "Folder name",
  "비즈니스명": "Business name",
  "비즈니스 이름 입력": "Enter a business name",
  웹사이트: "Website",
  "도메인 또는 서브도메인 입력": "Enter a domain or subdomain",
  "웹사이트가 없다면 경쟁자를 추가하세요": "If you do not have a website, add a competitor.",
  생성: "Created",
  수정: "Updated",
  "보고서가 생성되면 공유하기": "Share when a report is created",
  "핀 고정": "Pin",
  소유권: "Ownership",
  전체: "All",
  "내 소유": "Owned by me",
  "나에게 공유된 캠페인": "Campaigns shared with me",
  "최근 생성순": "Newest first",
  "최근 수정순": "Recently updated",
  "이름 오름차순": "Name A–Z",
  "도메인 오름차순": "Domain A–Z",
  정렬: "Sort",
  활성: "Active",
  "테이블 보기(SEO 전용)": "Table view (SEO only)",
  "CSV 내보내기": "Export CSV",
  증거: "Evidence",
  "선택사항": "optional",
  "데이터 로드 중": "Loading data",
  "이 목록을 볼 권한이 없습니다.": "You do not have permission to view this list.",
  "목록을 불러오지 못했습니다.": "Could not load the list.",
  "다시 시도": "Try again",
  "휴지통이 비어 있습니다.": "Trash is empty.",
  "삭제한 항목이 여기에 30일간 보관됩니다.":
    "Deleted items are kept here for 30 days.",
  "검색 결과가 없습니다.": "No search results.",
  "다른 검색어를 쓰거나 필터를 해제해 보세요.":
    "Try another search term or clear the filters.",
  "검색·필터 초기화": "Reset search and filters",
  복구: "Restore",
  "영구 삭제": "Delete permanently",
  설정: "Settings",
  삭제: "Delete",
  "전체 선택": "Select all",
  작업: "Actions",
  취소: "Cancel",
  "저장 중…": "Saving…",
  저장: "Save",
  "자연검색 트래픽": "Organic traffic",
  "자연 키워드": "Organic keywords",
  백링크: "Backlinks",
  언급: "Mentions",
  가시성: "Visibility",
  "웹사이트 문제를 확인하세요": "Check your website for issues",
  "키워드 포지션을 추적하세요": "Track keyword positions",
  소유자: "Owner",
  관리자: "Admin",
  편집자: "Editor",
  조회자: "Viewer",
};

export function translateAppText(locale: Locale, text: string | undefined): string | undefined {
  if (!text || locale === "ko") return text;
  return KO_TO_EN[text] ?? text;
}

/** 필드 키와 API 값은 그대로 두고 화면에 노출되는 리소스 사양만 번역한다. */
export function localizeResourceSpec(spec: ResourceSpec, locale: Locale): ResourceSpec {
  if (locale === "ko") return spec;

  const tx = (value: string | undefined) => translateAppText(locale, value);
  return {
    ...spec,
    title: tx(spec.title) ?? spec.title,
    label: tx(spec.label) ?? spec.label,
    description: tx(spec.description),
    evidenceNote: tx(spec.evidenceNote),
    searchPlaceholder: tx(spec.searchPlaceholder) ?? spec.searchPlaceholder,
    columns: spec.columns.map((column) => ({
      ...column,
      label: tx(column.label) ?? column.label,
      emptyText: tx(column.emptyText),
      badgeMap: column.badgeMap
        ? Object.fromEntries(
            Object.entries(column.badgeMap).map(([key, badge]) => [
              key,
              { ...badge, label: tx(badge.label) ?? badge.label },
            ]),
          )
        : undefined,
    })),
    fields: spec.fields.map((field) => ({
      ...field,
      label: tx(field.label) ?? field.label,
      placeholder: tx(field.placeholder),
      hint: tx(field.hint),
      options: field.options?.map((option) => ({
        ...option,
        label: tx(option.label) ?? option.label,
      })),
    })),
    filters: spec.filters?.map((filter) => ({
      ...filter,
      label: tx(filter.label) ?? filter.label,
      options: filter.options.map((option) => ({
        ...option,
        label: tx(option.label) ?? option.label,
      })),
    })),
    sortOptions: spec.sortOptions.map((option) => ({
      ...option,
      label: tx(option.label) ?? option.label,
    })),
  };
}
