import type { GapCategory, GapScope } from "@/lib/analytics/keyword-gap";

export const KEYWORD_GAP_HREF = "/analytics/keywordgap/";
export const KEYWORD_OVERVIEW_HREF = "/analytics/keywordoverview/";

/** 수집 파이프라인이 지원하는 국가만 노출한다 (도메인 개요와 동일). */
export const SUPPORTED_COUNTRIES = ["KR", "US"] as const;

/**
 * 대상 색상 — 입력 행 색점·포지션 컬럼 헤더·겹침 벤에서 공용.
 * 원본 무드(보라 큰 원 + 파랑 원)를 따른 5색 팔레트.
 */
export const TARGET_COLORS = [
  "#8b5cf6",
  "#3b82f6",
  "#f59e0b",
  "#14b8a6",
  "#ef4444",
] as const;

/** '나' 포지션 컬럼 하이라이트 (원본 민트 톤). */
export const YOU_COLUMN_BG = "#e9f9f2";

/** KD 구간 색 (Semrush 난이도 구간). */
export function kdColor(score: number): string {
  if (score >= 85) return "#d1002f";
  if (score >= 70) return "#ff4953";
  if (score >= 50) return "#ff8c43";
  if (score >= 30) return "#fdc23c";
  if (score >= 15) return "#59ddaa";
  return "#009f81";
}

/** 포지션 구간 색 (도메인 개요 버킷 팔레트와 동일 톤). */
export function positionColor(position: number): string {
  if (position <= 3) return "#009f81";
  if (position <= 10) return "#008ff8";
  if (position <= 20) return "#8649e1";
  if (position <= 50) return "#e0447c";
  return "#8a8e9b";
}

export const SCOPE_ORDER: readonly GapScope[] = ["root", "sub", "folder", "url"];

export const GAP_TAB_ORDER: readonly (GapCategory | "all")[] = [
  "shared",
  "missing",
  "weak",
  "strong",
  "untapped",
  "unique",
  "all",
];

export const COPY = {
  en: {
    title: "Keyword Gap",
    landingSubtitle:
      "Compare your keyword profile with your competitors' to find the gaps you can win.",
    youBadge: "You",
    youPlaceholder: "Enter your domain",
    competitorPlaceholder: "Add competitor",
    addCompetitor: "+ Add up to 4 competitors",
    removeRow: "Remove",
    compare: "Compare",
    country: "Database",
    scopeLabels: {
      root: "Root domain",
      sub: "Subdomain",
      folder: "Folder",
      url: "Exact URL",
    } as Record<GapScope, string>,
    typeOrganic: "Organic keywords",
    typePaid: "Paid keywords",
    typePla: "PLA keywords",
    typeUnavailable: "Only organic keywords are supported — no ad SERP source is collected.",
    needYou: "Enter a valid domain for yourself.",
    needCompetitor: "Add at least one valid competitor.",
    lastChecked: "Recent comparisons:",
    andMore: "+",
    // 랜딩 사용법 블록
    howEnterTitle: "Enter competitors",
    howEnterBody:
      "Add up to 5 domains, subdomains, folders or exact URLs. You'll see the keyword lists you and your competitors have in common — and the ones you're missing.",
    howTypeTitle: "Select keyword types",
    howTypeBody:
      "This workspace collects organic SERPs, so the comparison covers organic keywords. Paid and PLA types stay disabled until an ad SERP source is connected.",
    howInsightTitle: "Get insights to rank higher",
    howInsightBody:
      "Find the competitor with the biggest keyword profile, then build your keyword list to outperform them where it matters.",
    principleTitle: "Data principles",
    principleBody:
      "The gap is computed only from SERP snapshots this workspace actually collected (TalorData). There is no domain-to-keyword reverse index, so keywords outside the collected universe are honestly not compared.",
    // 리포트
    breadcrumbSeo: "SEO",
    breadcrumbSection: "Competitive Analysis",
    liveTag: "Live",
    calcTag: "Modeled",
    universeSummary: (keywords: string, ranked: string): string =>
      `${keywords} keywords in the collected universe · ${ranked} with at least one ranking`,
    lastCollected: "Last collected",
    universeHint:
      "Comparison is limited to the keyword universe collected in this workspace (Keyword Overview lookups and Position Tracking collections grow it).",
    exportCsv: "Export CSV",
    topOpportunities: "Top Opportunities",
    keywordOverlap: "Keyword Overlap",
    overlapHint: "Circle area is proportional to ranked keywords (approximate).",
    keywordsWord: "keywords",
    noRanking: "No rankings in the collected universe",
    opportunityEmptyTitle: "No opportunities found",
    opportunityEmptyHint: "Not enough overlap data in the collected universe yet.",
    keywordDetails: "Keyword Details",
    tabLabels: {
      all: "All",
      shared: "Shared",
      missing: "Missing",
      weak: "Weak",
      strong: "Strong",
      untapped: "Untapped",
      unique: "Unique",
    } as Record<GapCategory | "all", string>,
    searchPlaceholder: "Filter by keyword…",
    positionFilter: "Position",
    positionAny: "All positions",
    positionTarget: "for",
    volumeFilter: "Volume",
    kdFilter: "KD %",
    intentFilter: "Intent",
    anyOption: "All",
    clearFilters: "Reset filters",
    keywordHeader: "Keyword",
    intentHeader: "Intent",
    volumeHeader: "Volume",
    kdHeader: "KD %",
    cpcHeader: "CPC (USD)",
    updatedHeader: "Collected",
    noRows: "No keywords in this category.",
    noUniverseTitle: "The collected keyword universe is still empty",
    noUniverseHint:
      "Look up keywords in Keyword Overview or run a Position Tracking collection to grow the universe, then compare again.",
    rowsPerPage: "Rows",
    pagePrev: "Prev",
    pageNext: "Next",
    openKeyword: "Open in Keyword Overview",
    intentModelNote: "Intent is a rule-based classification (clone-intent-v1).",
    kdModelNote: "KD % is modeled from collected link and SERP evidence (clone-kd-v1).",
  },
  ko: {
    title: "키워드 갭",
    landingSubtitle: "나의 키워드 프로필과 경쟁자의 키워드 프로필을 분석할 수 있는 도구입니다.",
    youBadge: "나",
    youPlaceholder: "나의 도메인 입력",
    competitorPlaceholder: "도메인 추가",
    addCompetitor: "+ 최대 4개의 경쟁자 추가",
    removeRow: "삭제",
    compare: "비교",
    country: "데이터베이스",
    scopeLabels: {
      root: "루트 도메인",
      sub: "하위 도메인",
      folder: "폴더",
      url: "정확한 URL",
    } as Record<GapScope, string>,
    typeOrganic: "자연 키워드",
    typePaid: "유료 키워드",
    typePla: "PLA 키워드",
    typeUnavailable: "광고 SERP 소스가 없어 자연 키워드만 지원합니다.",
    needYou: "나의 도메인을 올바르게 입력해 주세요.",
    needCompetitor: "유효한 경쟁자를 1개 이상 추가해 주세요.",
    lastChecked: "최근 비교:",
    andMore: "외",
    // 랜딩 사용법 블록
    howEnterTitle: "경쟁자 입력",
    howEnterBody:
      "최대 5개의 도메인, 서브도메인, 폴더 또는 정확한 URL을 입력합니다. 나와 경쟁자가 공통으로 사용 중인 키워드와 나만 놓치고 있는 키워드 목록을 확인할 수 있습니다.",
    howTypeTitle: "키워드 유형 선택",
    howTypeBody:
      "이 워크스페이스는 자연 검색 SERP를 수집하므로 비교는 자연 키워드 기준입니다. 유료·PLA 유형은 광고 SERP 소스가 연결될 때까지 비활성으로 정직하게 표시합니다.",
    howInsightTitle: "상위 랭킹을 위한 인사이트 도출",
    howInsightBody:
      "가장 많은 키워드 프로필을 보유한 경쟁자를 확인하고, 나의 키워드 목록을 생성하여 경쟁자보다 더 나은 성과를 만드세요.",
    principleTitle: "데이터 원칙",
    principleBody:
      "갭은 이 워크스페이스가 실제로 수집한 SERP 스냅샷(TalorData)만으로 계산합니다. 도메인→키워드 역조회 인덱스가 없으므로, 수집된 유니버스 밖의 키워드는 비교하지 않는다고 정직하게 표시합니다.",
    // 리포트
    breadcrumbSeo: "SEO",
    breadcrumbSection: "경쟁 분석",
    liveTag: "실시간",
    calcTag: "계산식",
    universeSummary: (keywords: string, ranked: string): string =>
      `수집된 키워드 유니버스 ${keywords}개 · 순위 확인 ${ranked}개`,
    lastCollected: "최종 수집",
    universeHint:
      "비교는 이 워크스페이스가 수집한 키워드 유니버스로 한정됩니다 (키워드 오버뷰 조회·포지션 추적 수집으로 유니버스가 늘어납니다).",
    exportCsv: "CSV 내보내기",
    topOpportunities: "상위 기회",
    keywordOverlap: "키워드 겹침",
    overlapHint: "원 면적은 랭킹 키워드 수에 비례합니다 (개략).",
    keywordsWord: "키워드",
    noRanking: "수집 유니버스에서 순위 없음",
    opportunityEmptyTitle: "기회를 찾을 수 없습니다",
    opportunityEmptyHint: "수집된 유니버스에 아직 겹침 데이터가 충분하지 않습니다.",
    keywordDetails: "키워드 세부 정보",
    tabLabels: {
      all: "모두",
      shared: "공유됨",
      missing: "누락",
      weak: "약함",
      strong: "강함",
      untapped: "미개발",
      unique: "고유",
    } as Record<GapCategory | "all", string>,
    searchPlaceholder: "키워드로 필터…",
    positionFilter: "포지션",
    positionAny: "전체 포지션",
    positionTarget: "기준",
    volumeFilter: "검색량",
    kdFilter: "KD %",
    intentFilter: "인텐트",
    anyOption: "전체",
    clearFilters: "필터 초기화",
    keywordHeader: "키워드",
    intentHeader: "의도",
    volumeHeader: "검색량",
    kdHeader: "KD %",
    cpcHeader: "CPC (USD)",
    updatedHeader: "수집일",
    noRows: "이 카테고리에 해당하는 키워드가 없습니다.",
    noUniverseTitle: "수집된 키워드 유니버스가 아직 없습니다",
    noUniverseHint:
      "키워드 오버뷰에서 키워드를 조회하거나 포지션 추적 수집을 실행해 유니버스를 만든 뒤 다시 비교하세요.",
    rowsPerPage: "표시 개수",
    pagePrev: "이전",
    pageNext: "다음",
    openKeyword: "키워드 오버뷰에서 열기",
    intentModelNote: "의도는 규칙 기반 분류(clone-intent-v1) 결과입니다.",
    kdModelNote: "KD %는 수집된 링크·SERP 근거로 계산한 모델값입니다 (clone-kd-v1).",
  },
} as const;

export type GapCopy = (typeof COPY)[keyof typeof COPY];
