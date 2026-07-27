/**
 * CRUD 앱 내비게이션.
 * 원본 좌측 레일의 11개 툴킷 구성(홈/SEO/AI/트래픽/지역/콘텐츠/광고/AI PR/소셜/보고서/App Center)을
 * 실제로 구현한 도메인에 맞춰 축약했다. 구현하지 않은 툴킷은 노출하지 않는다.
 */

export interface CrudNavItem {
  key: string;
  label: string;
  href: string;
  icon: string;
  /** 원본에서 관찰된 진입점 여부 (문서용) */
  evidence: "O" | "P";
}

export const crudNavGroups: { items: CrudNavItem[] }[] = [
  {
    items: [
      { key: "home", label: "홈페이지", href: "/app/home/", icon: "home", evidence: "O" },
    ],
  },
  {
    items: [
      { key: "siteaudit", label: "사이트 감사", href: "/app/site-audits/", icon: "seo", evidence: "P" },
      { key: "position", label: "순위 추적", href: "/app/position-tracking/", icon: "traffic", evidence: "P" },
      { key: "keywords", label: "키워드 목록", href: "/app/keyword-lists/", icon: "ai", evidence: "P" },
      { key: "media", label: "미디어 리스트", href: "/app/media-lists/", icon: "pr", evidence: "P" },
      { key: "content", label: "콘텐츠", href: "/app/content/", icon: "content", evidence: "P" },
      { key: "reports", label: "보고서", href: "/app/reports/", icon: "reports", evidence: "P" },
    ],
  },
  {
    items: [
      { key: "trash", label: "휴지통", href: "/app/trash/", icon: "local", evidence: "P" },
      { key: "audit", label: "감사 로그", href: "/app/audit/", icon: "apps", evidence: "P" },
      { key: "account", label: "계정", href: "/app/account/profile/", icon: "social", evidence: "O" },
    ],
  },
];

export const accountNav = [
  { label: "프로필 설정", href: "/app/account/profile/" },
  { label: "사용자 관리", href: "/app/account/members/" },
  { label: "알림", href: "/app/account/notifications/" },
  { label: "활동 로그", href: "/app/account/activities/" },
];
