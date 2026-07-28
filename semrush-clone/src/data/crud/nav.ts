/**
 * 앱 좌측 레일 구성.
 *
 * 원본 `ko.semrush.com/home/` 의 `<snav-sidebar>` 를 실측해 11개 툴킷과 링크를 그대로 옮겼다.
 * 그룹 구분(간격 15px)도 원본과 동일하다.
 * 근거: docs/research/components/app-rail.spec.md
 */

export interface RailItem {
  key: string;
  label: string;
  href: string;
  icon: string;
}

export const railGroups: RailItem[][] = [
  [
    { key: "home", label: "홈페이지", href: "/home/", icon: "home" },
    { key: "seo", label: "SEO", href: "/seo/", icon: "seo" },
    { key: "ai", label: "AI", href: "/ai-seo/overview/", icon: "ai" },
    { key: "traffic", label: "트래픽 & 시장", href: "/analytics/traffic/", icon: "traffic" },
  ],
  [
    { key: "local", label: "지역", href: "/local-business/", icon: "local" },
    { key: "content", label: "콘텐츠", href: "/content/", icon: "content" },
    { key: "advertising", label: "광고", href: "/advertising/", icon: "advertising" },
    { key: "pr", label: "AI PR", href: "/pr-toolkit/", icon: "pr" },
    { key: "social", label: "소셜", href: "/social-media/", icon: "social" },
  ],
  [
    { key: "reports", label: "보고서", href: "/my_reports/grid/", icon: "reports" },
    { key: "apps", label: "App Center", href: "/apps/", icon: "apps" },
  ],
];

/**
 * 이 클론에서만 존재하는 CRUD 작업 화면.
 * 원본 레일에는 없는 항목이므로 프로필 메뉴 아래에 따로 노출한다.
 */
export const crudTools = [
  { label: "사이트 감사", href: "/app/site-audits/" },
  { label: "순위 추적", href: "/app/position-tracking/" },
  { label: "키워드 목록", href: "/app/keyword-lists/" },
  { label: "미디어 리스트", href: "/app/media-lists/" },
  { label: "콘텐츠 문서", href: "/app/content/" },
  { label: "보고서", href: "/app/reports/" },
  { label: "휴지통", href: "/app/trash/" },
  { label: "감사 로그", href: "/app/audit/" },
];

export const accountNav = [
  { label: "프로필 설정", href: "/app/account/profile/" },
  { label: "사용자 관리", href: "/app/account/members/" },
  { label: "알림", href: "/app/account/notifications/" },
  { label: "활동 로그", href: "/app/account/activities/" },
];
