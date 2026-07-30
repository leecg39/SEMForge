import type { ResourceSpec } from "@/types/crud";

/**
 * 리소스별 화면 설정.
 * 라벨·placeholder·컬럼명은 가능한 한 원본 실측 문구를 사용하고, 근거가 없는 항목은 evidence 로 표시한다.
 */

const STATUS_TONE = {
  completed: { label: "완료", tone: "green" as const },
  running: { label: "실행 중", tone: "blue" as const },
  queued: { label: "대기", tone: "gray" as const },
  failed: { label: "실패", tone: "red" as const },
  idle: { label: "미실행", tone: "gray" as const },
};

export const folderSpec: ResourceSpec = {
  key: "folders",
  title: "폴더",
  label: "폴더",
  evidence: "O",
  evidenceNote:
    "생성·수정·삭제 다이얼로그와 목록 필터를 2026-07-28 원본에서 직접 관찰했습니다.",
  // 원본 실측 placeholder (O)
  searchPlaceholder: "웹사이트 또는 폴더 이름",
  view: "folder",
  columns: [
    { key: "name", label: "폴더", type: "primary" },
    { key: "domain", label: "웹사이트" },
    { key: "createdAt", label: "생성", type: "date" },
    { key: "updatedAt", label: "수정", type: "date" },
  ],
  fields: [
    {
      key: "name",
      label: "비즈니스명",
      type: "text",
      placeholder: "폴더의 이름을 입력하세요",
      required: true,
    },
    {
      key: "domain",
      label: "웹사이트",
      // 원본 생성 다이얼로그의 "웹사이트 추가" 드롭다운 (기존 선택 또는 신규 입력)
      type: "website",
      placeholder: "도메인 또는 서브도메인 입력",
      hint: "웹사이트가 없다면 경쟁자를 추가하세요",
      required: true,
      // 원본 규칙 R1: 도메인은 1회 설정 후 수정 불가
      createOnly: true,
    },
    {
      key: "shareOnReportCreate",
      label: "보고서가 생성되면 공유하기",
      type: "checkbox",
      description: "폴더 생성 후 템플릿을 선택하면 보고서 공유 링크가 자동 생성됩니다",
    },
    // 원본 생성 다이얼로그의 "폴더 색상" 팔레트 (O). 수정 화면에서도 변경 가능하다.
    { key: "color", label: "폴더 색상", type: "color" },
    // 원본 생성 다이얼로그에는 핀 고정이 없어 수정 화면에서만 노출한다.
    { key: "pinned", label: "핀 고정", type: "checkbox", editOnly: true },
  ],
  // 원본 생성 다이얼로그의 필드 순서: 비즈니스명 → 웹사이트 → 공유 → 색상 (증거 O)
  createFieldOrder: ["name", "domain", "shareOnReportCreate", "color"],
  filters: [
    {
      key: "owning",
      label: "소유권",
      // 원본 드롭다운 옵션 문구 그대로 (O)
      options: [
        { value: "", label: "전체" },
        { value: "my", label: "내 소유" },
        { value: "shared", label: "나에게 공유된 캠페인" },
      ],
    },
  ],
  sortOptions: [
    { value: "createdAt:desc", label: "최근 생성순" },
    { value: "updatedAt:desc", label: "최근 수정순" },
    { value: "name:asc", label: "이름 오름차순" },
    { value: "domain:asc", label: "도메인 오름차순" },
  ],
};

export const siteAuditSpec: ResourceSpec = {
  key: "site-audits",
  title: "사이트 진단",
  label: "캠페인",
  evidence: "P",
  evidenceNote:
    "원본은 무료 플랜에서 랜딩으로 게이트되어 내부 화면을 관찰하지 못했습니다. 필드 구성은 랜딩 안내문(크롤링 범위·페이지 제한·크롤링 소스·프로젝트 이름·예약)을 근거로 한 제안입니다.",
  searchPlaceholder: "캠페인 또는 도메인 이름",
  columns: [
    { key: "name", label: "프로젝트", type: "primary" },
    { key: "domain", label: "도메인" },
    { key: "siteHealth", label: "Site Health", type: "number", align: "right", emptyText: "n/a" },
    { key: "status", label: "상태", type: "badge", badgeMap: STATUS_TONE },
    {
      key: "schedule",
      label: "예약",
      type: "badge",
      badgeMap: {
        off: { label: "없음", tone: "gray" },
        weekly: { label: "매주", tone: "blue" },
        monthly: { label: "매월", tone: "blue" },
      },
    },
    { key: "pageLimit", label: "페이지 제한", type: "number", align: "right" },
    { key: "lastRunAt", label: "마지막 실행", type: "date", emptyText: "—" },
  ],
  fields: [
    { key: "name", label: "프로젝트 이름", type: "text", placeholder: "프로젝트 이름 입력", required: true },
    {
      key: "domain",
      label: "도메인",
      type: "text",
      placeholder: "도메인 입력",
      required: true,
      createOnly: true,
    },
    {
      key: "crawlScope",
      label: "크롤링 범위",
      type: "select",
      options: [
        { value: "domain", label: "도메인 전체" },
        { value: "subdomain", label: "서브도메인" },
        { value: "path", label: "특정 경로" },
      ],
    },
    {
      key: "crawlSource",
      label: "크롤링 소스",
      type: "select",
      options: [
        { value: "website", label: "웹사이트" },
        { value: "sitemap", label: "사이트맵" },
        { value: "url_list", label: "URL 목록" },
      ],
    },
    { key: "pageLimit", label: "페이지 제한", type: "number", placeholder: "100" },
    {
      key: "schedule",
      label: "정기 진단",
      type: "select",
      options: [
        { value: "off", label: "사용 안 함" },
        { value: "weekly", label: "매주" },
        { value: "monthly", label: "매월" },
      ],
    },
    {
      key: "status",
      label: "상태",
      type: "select",
      editOnly: true,
      options: [
        { value: "idle", label: "미실행" },
        { value: "queued", label: "대기" },
        { value: "running", label: "실행 중" },
        { value: "completed", label: "완료" },
        { value: "failed", label: "실패" },
      ],
    },
  ],
  filters: [
    {
      key: "status",
      label: "상태",
      options: [
        { value: "", label: "전체" },
        { value: "idle", label: "미실행" },
        { value: "running", label: "실행 중" },
        { value: "completed", label: "완료" },
        { value: "failed", label: "실패" },
      ],
    },
    {
      key: "schedule",
      label: "예약",
      options: [
        { value: "", label: "전체" },
        { value: "off", label: "없음" },
        { value: "weekly", label: "매주" },
        { value: "monthly", label: "매월" },
      ],
    },
  ],
  sortOptions: [
    { value: "createdAt:desc", label: "최근 생성순" },
    { value: "siteHealth:desc", label: "Site Health 높은순" },
    { value: "name:asc", label: "이름 오름차순" },
    { value: "lastRunAt:desc", label: "최근 실행순" },
  ],
};

export const positionTrackingSpec: ResourceSpec = {
  key: "position-tracking",
  title: "포지션 추적",
  label: "캠페인",
  evidence: "P",
  evidenceNote:
    "원본에서는 '추적 설정' 진입점과 필수값 검증만 관찰했습니다. 위치·기기·검색엔진 필드는 랜딩 문구를 근거로 한 제안입니다.",
  searchPlaceholder: "캠페인 또는 도메인 이름",
  columns: [
    { key: "name", label: "캠페인", type: "primary" },
    { key: "domain", label: "도메인" },
    { key: "visibility", label: "가시성", type: "number", align: "right", emptyText: "n/a" },
    {
      key: "device",
      label: "기기",
      type: "badge",
      badgeMap: {
        desktop: { label: "데스크톱", tone: "gray" },
        mobile: { label: "모바일", tone: "blue" },
        tablet: { label: "태블릿", tone: "purple" },
      },
    },
    {
      key: "searchEngine",
      label: "검색 엔진",
      type: "badge",
      badgeMap: {
        google: { label: "Google", tone: "blue" },
        bing: { label: "Bing", tone: "gray" },
        chatgpt: { label: "ChatGPT", tone: "purple" },
      },
    },
    { key: "location", label: "위치" },
    {
      key: "status",
      label: "상태",
      type: "badge",
      badgeMap: {
        active: { label: "활성", tone: "green" },
        paused: { label: "일시중지", tone: "gray" },
      },
    },
  ],
  fields: [
    { key: "name", label: "캠페인 이름", type: "text", placeholder: "캠페인 이름 입력", required: true },
    { key: "domain", label: "도메인", type: "text", placeholder: "도메인 입력", required: true, createOnly: true },
    { key: "location", label: "위치", type: "text", placeholder: "Seoul, South Korea" },
    {
      key: "device",
      label: "기기 유형",
      type: "select",
      options: [
        { value: "desktop", label: "데스크톱" },
        { value: "mobile", label: "모바일" },
        { value: "tablet", label: "태블릿" },
      ],
    },
    {
      key: "searchEngine",
      label: "검색 엔진",
      type: "select",
      options: [
        { value: "google", label: "Google" },
        { value: "bing", label: "Bing" },
        { value: "chatgpt", label: "ChatGPT" },
      ],
    },
    {
      key: "status",
      label: "상태",
      type: "select",
      editOnly: true,
      options: [
        { value: "active", label: "활성" },
        { value: "paused", label: "일시중지" },
      ],
    },
  ],
  filters: [
    {
      key: "status",
      label: "상태",
      options: [
        { value: "", label: "전체" },
        { value: "active", label: "활성" },
        { value: "paused", label: "일시중지" },
      ],
    },
    {
      key: "device",
      label: "기기",
      options: [
        { value: "", label: "전체" },
        { value: "desktop", label: "데스크톱" },
        { value: "mobile", label: "모바일" },
        { value: "tablet", label: "태블릿" },
      ],
    },
  ],
  sortOptions: [
    { value: "createdAt:desc", label: "최근 생성순" },
    { value: "visibility:desc", label: "가시성 높은순" },
    { value: "name:asc", label: "이름 오름차순" },
  ],
};

export const keywordListSpec: ResourceSpec = {
  key: "keyword-lists",
  title: "키워드 목록",
  label: "목록",
  evidence: "P",
  evidenceNote:
    "원본에서 3개 생성 모드(도메인 기반·시드 키워드 기반·수동)와 데이터베이스 선택은 관찰했으나, 목록 화면은 게이트되어 확인하지 못했습니다.",
  searchPlaceholder: "목록 이름 또는 시드",
  columns: [
    { key: "name", label: "목록", type: "primary" },
    {
      key: "mode",
      label: "모드",
      type: "badge",
      badgeMap: {
        domain: { label: "도메인 기반", tone: "blue" },
        seed: { label: "시드 키워드", tone: "purple" },
        manual: { label: "수동", tone: "gray" },
      },
    },
    { key: "database", label: "데이터베이스" },
    { key: "seed", label: "시드", emptyText: "—" },
    {
      key: "status",
      label: "상태",
      type: "badge",
      badgeMap: {
        draft: { label: "초안", tone: "gray" },
        generating: { label: "생성 중", tone: "blue" },
        ready: { label: "준비됨", tone: "green" },
      },
    },
    { key: "updatedAt", label: "수정", type: "date" },
  ],
  fields: [
    { key: "name", label: "목록 이름", type: "text", placeholder: "목록 이름 입력", required: true },
    {
      key: "mode",
      label: "생성 모드",
      type: "select",
      options: [
        { value: "domain", label: "도메인 기반" },
        { value: "seed", label: "시드 키워드 기반" },
        { value: "manual", label: "수동" },
      ],
    },
    { key: "database", label: "데이터베이스", type: "text", placeholder: "US" },
    { key: "seed", label: "시드", type: "text", placeholder: "도메인 또는 시드 키워드" },
    {
      key: "status",
      label: "상태",
      type: "select",
      editOnly: true,
      options: [
        { value: "draft", label: "초안" },
        { value: "generating", label: "생성 중" },
        { value: "ready", label: "준비됨" },
      ],
    },
  ],
  filters: [
    {
      key: "mode",
      label: "모드",
      options: [
        { value: "", label: "전체" },
        { value: "domain", label: "도메인 기반" },
        { value: "seed", label: "시드 키워드" },
        { value: "manual", label: "수동" },
      ],
    },
    {
      key: "status",
      label: "상태",
      options: [
        { value: "", label: "전체" },
        { value: "draft", label: "초안" },
        { value: "generating", label: "생성 중" },
        { value: "ready", label: "준비됨" },
      ],
    },
  ],
  sortOptions: [
    { value: "createdAt:desc", label: "최근 생성순" },
    { value: "updatedAt:desc", label: "최근 수정순" },
    { value: "name:asc", label: "이름 오름차순" },
  ],
};

export const mediaListSpec: ResourceSpec = {
  key: "media-lists",
  title: "미디어 리스트",
  label: "리스트",
  evidence: "P",
  evidenceNote:
    "원본은 7일 무료 트라이얼 게이트로 막혀 내부를 확인하지 못했습니다. 필드는 랜딩 설명을 근거로 한 제안입니다.",
  searchPlaceholder: "리스트 이름 또는 설명",
  columns: [
    { key: "name", label: "리스트", type: "primary" },
    { key: "description", label: "설명", emptyText: "—" },
    { key: "createdAt", label: "생성", type: "date" },
    { key: "updatedAt", label: "수정", type: "date" },
  ],
  fields: [
    { key: "name", label: "리스트 이름", type: "text", placeholder: "리스트 이름 입력", required: true },
    { key: "description", label: "설명", type: "textarea", placeholder: "어떤 기준으로 묶은 리스트인지 적어 주세요" },
  ],
  sortOptions: [
    { value: "createdAt:desc", label: "최근 생성순" },
    { value: "updatedAt:desc", label: "최근 수정순" },
    { value: "name:asc", label: "이름 오름차순" },
  ],
};

export const reportSpec: ResourceSpec = {
  key: "reports",
  title: "보고서",
  label: "보고서",
  evidence: "P",
  evidenceNote:
    "원본에서 인기 템플릿(브랜드 성과·GA4·GSC)과 화이트라벨 테마, 자동 일정 기능은 랜딩에서 관찰했으나 목록 화면은 확인하지 못했습니다.",
  searchPlaceholder: "보고서 이름",
  columns: [
    { key: "name", label: "보고서", type: "primary" },
    {
      key: "template",
      label: "템플릿",
      type: "badge",
      badgeMap: {
        blank: { label: "처음부터", tone: "gray" },
        brand_performance: { label: "브랜드 성과", tone: "purple" },
        ga4: { label: "Google 애널리틱스 4", tone: "orange" },
        gsc: { label: "Google Search Console", tone: "blue" },
        monthly_seo: { label: "월간 SEO", tone: "green" },
      },
    },
    {
      key: "status",
      label: "상태",
      type: "badge",
      badgeMap: {
        draft: { label: "초안", tone: "gray" },
        published: { label: "발행됨", tone: "green" },
        archived: { label: "보관됨", tone: "orange" },
      },
    },
    { key: "widgetCount", label: "위젯", type: "number", align: "right" },
    {
      key: "theme",
      label: "테마",
      type: "badge",
      badgeMap: {
        default: { label: "기본", tone: "gray" },
        white_label: { label: "화이트 라벨", tone: "purple" },
      },
    },
    { key: "updatedAt", label: "수정", type: "date" },
  ],
  fields: [
    { key: "name", label: "보고서 이름", type: "text", placeholder: "보고서 이름 입력", required: true },
    {
      key: "template",
      label: "템플릿",
      type: "select",
      options: [
        { value: "blank", label: "처음부터 시작" },
        { value: "brand_performance", label: "브랜드 성과" },
        { value: "ga4", label: "Google 애널리틱스 4" },
        { value: "gsc", label: "Google Search Console" },
        { value: "monthly_seo", label: "월간 SEO" },
      ],
    },
    {
      key: "theme",
      label: "테마",
      type: "select",
      options: [
        { value: "default", label: "기본" },
        { value: "white_label", label: "화이트 라벨" },
      ],
    },
    { key: "widgetCount", label: "위젯 수", type: "number", placeholder: "0" },
    {
      key: "status",
      label: "상태",
      type: "select",
      editOnly: true,
      options: [
        { value: "draft", label: "초안" },
        { value: "published", label: "발행됨" },
        { value: "archived", label: "보관됨" },
      ],
    },
  ],
  filters: [
    {
      key: "status",
      label: "상태",
      options: [
        { value: "", label: "전체" },
        { value: "draft", label: "초안" },
        { value: "published", label: "발행됨" },
        { value: "archived", label: "보관됨" },
      ],
    },
    {
      key: "template",
      label: "템플릿",
      options: [
        { value: "", label: "전체" },
        { value: "blank", label: "처음부터" },
        { value: "brand_performance", label: "브랜드 성과" },
        { value: "ga4", label: "GA4" },
        { value: "gsc", label: "GSC" },
        { value: "monthly_seo", label: "월간 SEO" },
      ],
    },
  ],
  sortOptions: [
    { value: "createdAt:desc", label: "최근 생성순" },
    { value: "updatedAt:desc", label: "최근 수정순" },
    { value: "widgetCount:desc", label: "위젯 많은순" },
    { value: "name:asc", label: "이름 오름차순" },
  ],
};

export const contentSpec: ResourceSpec = {
  key: "content",
  title: "콘텐츠",
  label: "문서",
  evidence: "P",
  evidenceNote:
    "원본 Content 툴킷의 생성·최적화·재활용·브리프 진입점은 좌측 메뉴에서 관찰했으나, 내 콘텐츠 목록은 트라이얼 게이트로 막혀 있었습니다.",
  searchPlaceholder: "제목 또는 키워드",
  columns: [
    { key: "title", label: "제목", type: "primary" },
    {
      key: "mode",
      label: "모드",
      type: "badge",
      badgeMap: {
        create: { label: "생성", tone: "blue" },
        optimize: { label: "최적화", tone: "green" },
        repurpose: { label: "재활용", tone: "purple" },
        brief: { label: "브리프", tone: "gray" },
      },
    },
    {
      key: "status",
      label: "상태",
      type: "badge",
      badgeMap: {
        draft: { label: "초안", tone: "gray" },
        in_review: { label: "검토 중", tone: "orange" },
        published: { label: "발행됨", tone: "green" },
      },
    },
    { key: "keyword", label: "타깃 키워드", emptyText: "—" },
    { key: "wordCount", label: "단어 수", type: "number", align: "right" },
    { key: "seoScore", label: "SEO 점수", type: "number", align: "right", emptyText: "n/a" },
    { key: "updatedAt", label: "수정", type: "date" },
  ],
  fields: [
    { key: "title", label: "제목", type: "text", placeholder: "제목 입력", required: true },
    {
      key: "mode",
      label: "모드",
      type: "select",
      options: [
        { value: "create", label: "생성" },
        { value: "optimize", label: "최적화" },
        { value: "repurpose", label: "재활용" },
        { value: "brief", label: "브리프" },
      ],
    },
    { key: "keyword", label: "타깃 키워드", type: "text", placeholder: "키워드 입력" },
    { key: "body", label: "본문", type: "textarea", placeholder: "본문을 입력하세요" },
    {
      key: "status",
      label: "상태",
      type: "select",
      editOnly: true,
      options: [
        { value: "draft", label: "초안" },
        { value: "in_review", label: "검토 중" },
        { value: "published", label: "발행됨" },
      ],
    },
  ],
  filters: [
    {
      key: "status",
      label: "상태",
      options: [
        { value: "", label: "전체" },
        { value: "draft", label: "초안" },
        { value: "in_review", label: "검토 중" },
        { value: "published", label: "발행됨" },
      ],
    },
    {
      key: "mode",
      label: "모드",
      options: [
        { value: "", label: "전체" },
        { value: "create", label: "생성" },
        { value: "optimize", label: "최적화" },
        { value: "repurpose", label: "재활용" },
        { value: "brief", label: "브리프" },
      ],
    },
  ],
  sortOptions: [
    { value: "updatedAt:desc", label: "최근 수정순" },
    { value: "createdAt:desc", label: "최근 생성순" },
    { value: "seoScore:desc", label: "SEO 점수 높은순" },
    { value: "title:asc", label: "제목 오름차순" },
  ],
};

export const RESOURCE_SPECS: Record<string, ResourceSpec> = {
  folders: folderSpec,
  "site-audits": siteAuditSpec,
  "position-tracking": positionTrackingSpec,
  "keyword-lists": keywordListSpec,
  "media-lists": mediaListSpec,
  reports: reportSpec,
  content: contentSpec,
};
