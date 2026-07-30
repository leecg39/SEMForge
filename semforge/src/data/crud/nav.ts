/**
 * 앱 좌측 레일 구성.
 *
 * 원본 `ko.semforge.com/home/` 의 `<snav-sidebar>` 를 실측해 11개 툴킷과 링크를 그대로 옮겼다.
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

export interface RailFlyoutLink {
  label: string;
  href: string;
}

export interface RailFlyoutGroup {
  heading?: string;
  links: RailFlyoutLink[];
}

/**
 * 레일 카테고리 호버/포커스 플라이아웃의 하위 메뉴.
 * appToolkits(src/data/app-nav.ts)의 툴킷별 메뉴를 한국어 원문으로 옮긴 것으로,
 * 존재하는 라우트만 담는다. 단일 링크인 홈페이지는 플라이아웃이 없고,
 * App Center는 app-nav에 툴킷 정의가 없어 여기서 새로 구성한다.
 */
export const railFlyouts: Record<string, RailFlyoutGroup[]> = {
  seo: [
    { heading: "대시보드", links: [{ label: "SEO 대시보드", href: "/seo/" }] },
    {
      heading: "사이트 성과",
      links: [
        { label: "사이트 진단", href: "/siteaudit/" },
        { label: "포지션 추적", href: "/position-tracking/" },
      ],
    },
    {
      heading: "경쟁 분석",
      links: [
        { label: "도메인 개요", href: "/analytics/overview/" },
        { label: "자연검색 리서치", href: "/analytics/organic/overview" },
        { label: "인기 페이지", href: "/analytics/toppages/" },
        { label: "도메인 비교", href: "/analytics/comparedomains/" },
        { label: "키워드 갭", href: "/analytics/keywordgap/" },
        { label: "백링크 갭", href: "/analytics/gap/backlinks/" },
      ],
    },
    {
      heading: "키워드 리서치",
      links: [
        { label: "키워드 개요", href: "/analytics/keywordoverview/" },
        { label: "키워드 매직 도구", href: "/analytics/keywordmagic/" },
        { label: "키워드 전략 빌더", href: "/analytics/keywordmanager/" },
      ],
    },
    {
      heading: "콘텐츠 아이디어",
      links: [
        { label: "SEO 작성 도우미", href: "/swa/" },
        { label: "토픽 리서치", href: "/topic-research/" },
      ],
    },
    {
      heading: "링크 구축",
      links: [
        { label: "백링크", href: "/analytics/backlinks/overview/" },
        { label: "참조 도메인", href: "/analytics/refdomains/report/" },
        { label: "백링크 감사", href: "/backlink_audit/" },
      ],
    },
    {
      heading: "더 많은 도구",
      links: [
        { label: "Sensor", href: "/sensor/" },
        { label: "SEMForge Rank", href: "/analytics/ranks/rank/" },
        { label: "온페이지 SEO 체커", href: "/on-page-seo-checker/" },
        { label: "자연검색 트래픽 인사이트", href: "/organic_traffic_insights/" },
      ],
    },
  ],
  ai: [
    {
      heading: "AI 분석",
      links: [
        { label: "가시성 개요", href: "/ai-seo/overview/" },
        { label: "경쟁사 리서치", href: "/ai-seo/competitor-research/" },
        { label: "프롬프트 리서치", href: "/ai-seo/prompt-research/" },
      ],
    },
    {
      heading: "브랜드 성과",
      links: [
        { label: "브랜드 성과", href: "/ai-seo/brand-performance/" },
        { label: "인식", href: "/ai-seo/perception/" },
        { label: "내러티브 드라이버", href: "/ai-seo/narrative-drivers/" },
        { label: "질문", href: "/ai-seo/questions/" },
      ],
    },
    {
      heading: "성장 및 모니터링",
      links: [
        { label: "성장 액션", href: "/ai-seo/growth-plan/" },
        { label: "사이트 진단", href: "/siteaudit/" },
        { label: "프롬프트 추적", href: "/position-tracking/" },
        { label: "콘텐츠 제작", href: "/content/" },
      ],
    },
  ],
  traffic: [
    { heading: "시작", links: [{ label: "대시보드", href: "/analytics/traffic/" }] },
    {
      heading: "개요",
      links: [
        { label: "트래픽 분석", href: "/analytics/traffic/traffic-overview/" },
        { label: "시장 개요", href: "/analytics/traffic/market-overview/" },
        { label: "인기 페이지", href: "/analytics/traffic/top-pages/" },
        { label: "경쟁사 모니터링", href: "/analytics/traffic/competitor-monitoring/" },
      ],
    },
    {
      heading: "트래픽 분포",
      links: [
        { label: "AI 트래픽", href: "/analytics/traffic/ai-traffic/" },
        { label: "레퍼럴", href: "/analytics/traffic/referral/" },
        { label: "자연검색", href: "/analytics/traffic/organic-search/" },
        { label: "유료 검색", href: "/analytics/traffic/paid-search/" },
        { label: "자연 소셜", href: "/analytics/traffic/organic-social/" },
        { label: "유료 소셜", href: "/analytics/traffic/paid-social/" },
        { label: "이메일", href: "/analytics/traffic/email/" },
        { label: "디스플레이 광고", href: "/analytics/traffic/display-ads/" },
        { label: "유입·이탈 경로", href: "/analytics/traffic/sources-destinations/" },
      ],
    },
    {
      heading: "페이지 및 카테고리",
      links: [
        { label: "하위 폴더·서브도메인", href: "/analytics/traffic/subfolders-subdomains/" },
        { label: "페이지 그룹", href: "/analytics/traffic/page-groups/" },
      ],
    },
    {
      heading: "지역별 추세",
      links: [
        { label: "미국", href: "/analytics/traffic/usa/" },
        { label: "국가", href: "/analytics/traffic/countries/" },
        { label: "비즈니스 지역", href: "/analytics/traffic/business-regions/" },
        { label: "지리적 지역", href: "/analytics/traffic/geographical-regions/" },
      ],
    },
    {
      heading: "오디언스",
      links: [
        { label: "인구통계", href: "/analytics/traffic/demographics/" },
        { label: "오디언스 중복", href: "/analytics/traffic/audience-overlap/" },
        { label: "사회경제", href: "/analytics/traffic/socioeconomics/" },
        { label: "행동", href: "/analytics/traffic/behavior/" },
      ],
    },
    {
      heading: "고급",
      links: [
        { label: "일별 추세", href: "/analytics/traffic/daily-trends/" },
        { label: "산업·일괄 분석", href: "/analytics/traffic/industry-and-bulk-analysis/" },
        { label: "Trends API", href: "/analytics/traffic/trends-api" },
        { label: "인기 웹사이트", href: "/trending-websites/global/all/" },
      ],
    },
  ],
  local: [
    { heading: "대시보드", links: [{ label: "로컬 대시보드", href: "/local-business/" }] },
    {
      heading: "관리",
      links: [
        { label: "리스팅 관리", href: "/listings-management/" },
        { label: "리뷰 관리", href: "/review-management/" },
        { label: "GBP 최적화", href: "/gbp-optimization/" },
      ],
    },
    { heading: "자동화", links: [{ label: "GBP AI 에이전트", href: "/gbp-ai-agent/" }] },
    { heading: "경쟁 분석", links: [{ label: "맵 순위 추적", href: "/map-rank-tracker/" }] },
  ],
  content: [
    { heading: "대시보드", links: [{ label: "콘텐츠 대시보드", href: "/content/" }] },
    {
      heading: "만들기",
      links: [
        { label: "AI 아티클 생성기", href: "/content/articles/create/" },
        { label: "콘텐츠 최적화", href: "/content/articles/optimize/" },
        { label: "콘텐츠 재활용", href: "/content/articles/repurpose/" },
        { label: "SEO 브리프 생성기", href: "/content/briefs/create/" },
      ],
    },
    {
      heading: "리서치",
      links: [
        { label: "토픽 파인더", href: "/content/topic-finder/" },
        { label: "내 콘텐츠", href: "/content/articles/" },
      ],
    },
  ],
  advertising: [
    { heading: "대시보드", links: [{ label: "광고 대시보드", href: "/advertising/" }] },
    {
      heading: "만들기·실행",
      links: [
        { label: "광고 실행 도우미", href: "/advertising/ads-launch-assistant" },
        { label: "광고 AI 에이전트", href: "/advertising/ads-ai-agent" },
      ],
    },
    {
      heading: "리서치",
      links: [
        { label: "광고 리서치", href: "/analytics/adwords/positions/" },
        { label: "PLA 리서치", href: "/analytics/pla/positions/" },
        { label: "AdClarity", href: "/apps/adclarity-advertising-intelligence/" },
      ],
    },
  ],
  pr: [
    {
      heading: "대시보드",
      links: [
        { label: "AI PR 대시보드", href: "/pr-toolkit/" },
        { label: "AI 인용 미디어", href: "/pr-toolkit/ai-cited-media/" },
      ],
    },
    {
      heading: "미디어 데이터베이스",
      links: [
        { label: "연락처 검색", href: "/pr-toolkit/media-database/" },
        { label: "미디어 리스트", href: "/pr-toolkit/media-lists/" },
      ],
    },
    {
      heading: "이메일",
      links: [
        { label: "내 이메일", href: "/pr-toolkit/emails" },
        { label: "발신자·도메인", href: "/pr-toolkit/emails/settings/senders/" },
      ],
    },
    {
      heading: "모니터링",
      links: [
        { label: "미디어 모니터링", href: "/pr-toolkit/media-monitoring/" },
        { label: "알림·요약", href: "/pr-toolkit/media-monitoring/emails/" },
      ],
    },
  ],
  social: [
    { heading: "대시보드", links: [{ label: "소셜 대시보드", href: "/social-media/" }] },
    {
      heading: "핵심",
      links: [
        { label: "소셜 포스터", href: "/social-media/?tool=poster" },
        { label: "소셜 트래커", href: "/social-media/?tool=tracker" },
        { label: "콘텐츠 인사이트", href: "/social-media/?tool=content-insights" },
        { label: "소셜 분석", href: "/social-media/?tool=analytics" },
      ],
    },
    {
      heading: "고급",
      links: [
        { label: "인플루언서 분석", href: "/apps/influencer-marketing-platform/" },
        { label: "미디어 모니터링", href: "/media-monitoring/" },
      ],
    },
  ],
  reports: [
    { heading: "홈", links: [{ label: "내 보고서", href: "/my_reports/grid/" }] },
    {
      heading: "빌더",
      links: [
        { label: "보고서 만들기", href: "/my_reports/constructor" },
        { label: "템플릿", href: "/my_reports/constructor?accordionTab=integrations" },
        { label: "테마", href: "/my_reports/constructor?accordionTab=themes" },
      ],
    },
    { heading: "정보", links: [{ label: "보고서 스위트", href: "/my_reports/suite" }] },
  ],
  apps: [
    {
      links: [
        { label: "App Center 홈", href: "/apps/" },
        { label: "내 앱", href: "/apps/my-apps/" },
        { label: "인기 컬렉션", href: "/apps/collection/most-popular/" },
      ],
    },
  ],
};

/**
 * 이 클론에서만 존재하는 CRUD 작업 화면.
 * 원본 레일에는 없는 항목이므로 프로필 메뉴 아래에 따로 노출한다.
 */
export const crudTools = [
  { label: "사이트 진단", href: "/app/site-audits/" },
  { label: "포지션 추적", href: "/app/position-tracking/" },
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
