/**
 * 포지션 추적 화면의 탭 정의.
 *
 * 원본(Semrush 포지션 추적)의 9개 탭 구성을 따른다. 데이터 소스가 없는 탭은
 * 가짜 화면을 만들지 않고 준비 중 상태와 사유를 함께 노출한다.
 */

export type TabStatus = "available" | "pending";

export interface PositionTrackingTab {
  slug: string;
  label: string;
  status: TabStatus;
  /** pending 일 때만 존재한다. 왜 아직 못 보여주는지 사용자에게 설명한다. */
  reason?: string;
}

export const DEFAULT_TAB_SLUG = "landscape";

export const POSITION_TRACKING_TABS: readonly PositionTrackingTab[] = [
  { slug: "landscape", label: "현황", status: "available" },
  {
    slug: "overview",
    label: "개요",
    status: "pending",
    reason:
      "현황 탭이 같은 지표를 이미 보여줍니다. 원본의 개요 탭은 기간별 비교 표가 중심이라 이력 데이터가 더 쌓인 뒤 분리합니다.",
  },
  { slug: "rank-distribution", label: "순위 분포", status: "available" },
  { slug: "tags", label: "태그", status: "available" },
  { slug: "pages", label: "페이지", status: "available" },
  {
    slug: "devices",
    label: "기기 및 위치",
    status: "pending",
    reason:
      "캠페인이 기기·위치 조합을 하나만 수집하고 있습니다. 비교하려면 같은 키워드를 여러 조합으로 수집해야 합니다.",
  },
  { slug: "cannibalization", label: "카니발리제이션", status: "available" },
  { slug: "competitors", label: "경쟁자 발견", status: "available" },
  { slug: "featured-snippets", label: "추천 스니펫", status: "available" },
];

/** 대시보드가 이미 갖고 있는 내부 섹션. 탭 내비게이션을 두 벌 두지 않기 위해 매핑한다. */
export type DashboardSection = "overview" | "distribution" | "discovery" | "tags";

const SECTION_BY_SLUG: Record<string, DashboardSection> = {
  landscape: "overview",
  "rank-distribution": "distribution",
  tags: "tags",
  competitors: "discovery",
};

/** available 탭만 대시보드 섹션을 갖는다. 준비 중 탭은 null 이다. */
export function toDashboardSection(slug: string): DashboardSection | null {
  return SECTION_BY_SLUG[slug] ?? null;
}

const TAB_BY_SLUG = new Map(POSITION_TRACKING_TABS.map((tab) => [tab.slug, tab]));

export function isValidTabSlug(slug: string): boolean {
  return TAB_BY_SLUG.has(slug);
}

/**
 * slug 를 탭으로 바꾼다.
 * 탭은 화면 안의 이동이므로 알 수 없는 값이 와도 404 로 떨어뜨리지 않고 기본 탭으로 되돌린다.
 */
export function resolveTab(slug: string | undefined): PositionTrackingTab {
  const fallback = TAB_BY_SLUG.get(DEFAULT_TAB_SLUG);
  if (!fallback) {
    throw new Error("[position-tracking] 기본 탭 정의가 없습니다.");
  }
  if (!slug) return fallback;
  return TAB_BY_SLUG.get(slug) ?? fallback;
}
