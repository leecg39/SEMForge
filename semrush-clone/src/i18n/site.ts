import type { Locale } from "@/i18n/config";
import generatedKo from "@/i18n/generated-ko.json";

/** 공개 홈과 전역 내비게이션에서 쓰는 영문 원문 → 한국어 사전. */
const EN_TO_KO: Record<string, string> = {
  ...(generatedKo as Record<string, string>),
  "TRY SEMRUSH ONE FOR FREE": "SEMRUSH ONE 무료 체험",
  "The unified SEO and AI search solution": "SEO와 AI 검색을 통합한 솔루션",
  Product: "제품",
  Solutions: "솔루션",
  Resources: "리소스",
  "Get started": "시작하기",
  Discover: "살펴보기",
  "Create and optimize": "제작 및 최적화",
  Track: "추적",
  "Our data": "데이터",
  "Our Data": "데이터",
  "Book a demo": "데모 예약",
  "Keyword Research": "키워드 리서치",
  "Competitor Analysis": "경쟁사 분석",
  "Market Analysis": "시장 분석",
  "Local SEO": "로컬 SEO",
  "AI Brand Sentiment": "AI 브랜드 감성",
  "Backlink Analysis": "백링크 분석",
  "Content Creation": "콘텐츠 제작",
  "Technical Site Health": "기술 사이트 상태",
  "Digital PR": "디지털 PR",
  "Rank Tracking": "순위 추적",
  "Marketing Reports": "마케팅 보고서",
  "See all features": "모든 기능 보기",
  "Connect Semrush MCP to AI": "Semrush MCP를 AI에 연결하세요",
  "The world's most powerful traffic, visibility, and market dataset. Inside your AI assistants.":
    "강력한 트래픽·가시성·시장 데이터를 AI 어시스턴트에서 바로 활용하세요.",
  "Use cases": "사용 사례",
  "Grow search visibility": "검색 가시성 높이기",
  "Get recommended by AI": "AI 추천 받기",
  "Research your market": "시장 조사하기",
  "Connect with local customers": "지역 고객과 연결하기",
  "Create engaging content": "매력적인 콘텐츠 만들기",
  "Fix technical site issues": "기술적 사이트 문제 해결",
  "Grow off-site authority": "외부 사이트 권위 높이기",
  "Build client strategies": "고객 전략 수립",
  "See all use cases": "모든 사용 사례 보기",
  "By size": "규모별",
  "Mid-market": "중견 기업",
  "Small teams": "소규모 팀",
  Solopreneurs: "1인 기업",
  Freelancers: "프리랜서",
  Agencies: "에이전시",
  "By role": "역할별",
  "Business Owner": "비즈니스 소유자",
  "Agency Owner": "에이전시 소유자",
  "SEO Specialist": "SEO 전문가",
  "Content Marketer": "콘텐츠 마케터",
  "Full-Stack Growth Marketers": "풀스택 성장 마케터",
  "By industry": "산업별",
  "Professional Services": "전문 서비스",
  "Retail & Ecommerce": "리테일 및 이커머스",
  "SaaS & B2B Tech": "SaaS 및 B2B 기술",
  Healthcare: "헬스케어",
  "Local Business": "지역 비즈니스",
  "See all industries": "모든 산업 보기",
  "Try Semrush One for Free": "Semrush One 무료 체험",
  "The leading platform that unifies SEO authority and AI visibility.":
    "SEO 권위와 AI 가시성을 통합하는 선도적인 플랫폼입니다.",
  "Grow with Semrush": "Semrush와 함께 성장하기",
  "Knowledge Base": "지식 베이스",
  "Success Stories": "성공 사례",
  "AI Visibility Index": "AI 가시성 지수",
  Webinars: "웨비나",
  News: "뉴스",
  "Explore Free Tools": "무료 도구 살펴보기",
  "AI Visibility Checker": "AI 가시성 검사기",
  "SEO Checker": "SEO 검사기",
  "Website Traffic Checker": "웹사이트 트래픽 검사기",
  "Keyword Tool": "키워드 도구",
  "Backlink Checker": "백링크 검사기",
  "Top Websites by Traffic": "트래픽 상위 웹사이트",
  "Explore Other Free Tools": "다른 무료 도구 살펴보기",
  Platform: "플랫폼",
  Integrations: "통합",
  "App Center": "앱 센터",
  "About Semrush": "Semrush 소개",
  "About Us": "회사 정보",
  "Stats and Facts": "통계 및 현황",
  "Affiliate Program": "제휴 프로그램",
  "Contact Us": "문의하기",
  "Get Your Ticket Now": "지금 티켓 받기",
  "One day. Real strategies. Built for marketers who play to win. October 13, 2026 · London, UK":
    "단 하루, 실전 전략을 만나보세요. 2026년 10월 13일 · 영국 런던",
  Features: "기능",
  Pricing: "가격 책정",
  "Free Trial": "무료 체험",
  "Compare Semrush": "Semrush 비교",
  "More tools": "더 많은 도구",
  "Enterprise SEO": "엔터프라이즈 SEO",
  "Top Websites": "상위 웹사이트",
  "Free Tools": "무료 도구",
  Company: "회사",
  Careers: "채용",
  Partners: "파트너",
  "Global Issues Index": "글로벌 이슈 지수",
  "Do not sell my personal info": "내 개인 정보를 판매하지 마세요",
  Support: "지원",
  Community: "커뮤니티",
  "Semrush Blog": "Semrush 블로그",
  "Ambassador Program": "앰배서더 프로그램",
  Legal: "법률",
  "Privacy Policy": "개인정보처리방침",
  "Terms of Service": "서비스 약관",
  "Cookies Settings": "쿠키 설정",
  "GET STARTED WITH SEMRUSH TODAY": "오늘 SEMRUSH를 시작하세요",
  "Try Semrush free for seven days. Cancel anytime.":
    "Semrush를 7일 동안 무료로 체험하세요. 언제든 취소할 수 있습니다.",
  "Start free trial": "무료 체험 시작",
  "All rights reserved.": "모든 권리 보유.",
  "Semrush homepage": "Semrush 홈페이지",
  Main: "주요 메뉴",
  "Mobile navigation": "모바일 메뉴",
  Footer: "푸터",
  "Cookie settings": "쿠키 설정",
  "Manage how this site uses cookies. This is a representative consent dialog.":
    "이 사이트의 쿠키 사용 방식을 관리하세요. 이 화면은 대표적인 동의 설정 예시입니다.",
  "Strictly necessary": "필수 쿠키",
  "Required for the site to function. Always on.": "사이트 작동에 필요하며 항상 켜져 있습니다.",
  Performance: "성능",
  "Help us understand how the site is used.": "사이트 이용 방식을 파악하는 데 도움을 줍니다.",
  Functional: "기능",
  "Remember your preferences and choices.": "사용자의 환경설정과 선택을 기억합니다.",
  Targeting: "타기팅",
  "Used to personalize content and ads.": "콘텐츠와 광고를 개인화하는 데 사용합니다.",
  Toggle: "전환",
  "Reject all": "모두 거부",
  "Save preferences": "환경설정 저장",
  Toolkits: "툴킷",
  "Toolkit tools": "{toolkit} 도구",
  "Collapse sidebar": "사이드바 접기",
  Home: "홈",
  "AI Visibility": "AI 가시성",
  "Traffic & Market": "트래픽 및 시장",
  Local: "지역",
  Content: "콘텐츠",
  Advertising: "광고",
  Social: "소셜",
  Reports: "보고서",
  Dashboard: "대시보드",
  "Site Performance": "사이트 성과",
  "Competitive Analysis": "경쟁 분석",
  "Content Ideas": "콘텐츠 아이디어",
  "Link Building": "링크 구축",
  "AI Analysis": "AI 분석",
  "Brand Performance": "브랜드 성과",
  "Growth & Monitoring": "성장 및 모니터링",
  Start: "시작",
  Overview: "개요",
  "Traffic Distribution": "트래픽 분포",
  "Pages & Categories": "페이지 및 카테고리",
  "Regional Trends": "지역별 추세",
  Audience: "오디언스",
  Advanced: "고급",
  Management: "관리",
  Automation: "자동화",
  Creation: "제작",
  Optimization: "최적화",
  Workflows: "워크플로",
  Research: "리서치",
  Campaigns: "캠페인",
  Monitoring: "모니터링",
  Publishing: "게시",
  Analytics: "분석",
  Discovery: "탐색",
  Utilities: "유틸리티",
  Store: "스토어",
  "My Apps": "내 앱",
  "Site Audit": "사이트 감사",
  "Technical Site Audit": "기술 사이트 감사",
  "Position Tracking": "순위 추적",
  "Keyword Magic Tool": "키워드 매직 도구",
  "Semrush One": "Semrush One",
  "Semrush Rank": "Semrush Rank",
  "Semrush Sensor": "Semrush Sensor",
  "AI PR": "AI PR",
  Share: "공유",
  "Create folder": "폴더 만들기",
  Shared: "공유됨",
  websites: "개 웹사이트",
  "Add website": "웹사이트 추가",
  "Create your first folder": "첫 폴더를 만들어 보세요",
  "Organize your websites and projects in folders to keep everything in one place.":
    "웹사이트와 프로젝트를 폴더로 정리해 한곳에서 관리하세요.",
  Loading: "로딩 중",
  "Upgrade to unlock": "이 기능을 사용하려면 업그레이드하세요:",
  "This feature is available on higher plans. Upgrade your subscription to get instant access to {feature} and more advanced tools.":
    "이 기능은 상위 요금제에서 사용할 수 있습니다. 구독을 업그레이드해 {feature} 및 고급 도구를 바로 이용하세요.",
  Upgrade: "업그레이드",
  "See plans": "요금제 보기",
  Export: "내보내기",
  Enterprise: "엔터프라이즈",
  Blog: "블로그",
  Academy: "아카데미",
  All: "전체",
  Course: "강좌",
  "Speaker · Date to be announced": "연사 · 일정 추후 공개",
  "Read more": "더 읽기",
  "Stay in the loop": "최신 소식 받기",
  "Enter your email": "이메일을 입력하세요",
  "Email address": "이메일 주소",
  Subscribe: "구독하기",
  "On this page": "이 페이지의 내용",
  Related: "관련 콘텐츠",
  "Get weekly insights in your inbox": "매주 새로운 인사이트를 이메일로 받아보세요",
  Monthly: "월간",
  Annual: "연간",
  "Most popular": "가장 인기 있음",
  "Compare plans": "요금제 비교",
  Feature: "기능",
  "Frequently asked questions": "자주 묻는 질문",
  "Need a custom plan?": "맞춤형 요금제가 필요하신가요?",
  "Contact sales": "영업팀 문의",
  FEATURES: "기능",
  "No items found for this category.": "이 카테고리에 표시할 항목이 없습니다.",
  "Get started with Plans and pricing.": "요금제와 가격을 확인하고 시작하세요.",
  Core: "핵심 기능",
  Projects: "프로젝트",
  Unlimited: "무제한",
  Reporting: "보고서",
  "White-label": "화이트 라벨",
  Onboarding: "온보딩",
  "Works with": "함께 사용할 수 있는 도구",
  FAQ: "자주 묻는 질문",
  "START YOUR FREE TRIAL": "무료 체험 시작",
  "Challenges we solve": "해결할 수 있는 과제",
  "How it works": "이용 방법",
  "Related tools": "관련 도구",
  "Get more with a free account": "무료 계정으로 더 많은 기능 이용하기",

  "Grow your visibility everywhere search happens": "검색이 일어나는 모든 곳에서 가시성을 높이세요",
  "One platform to measure and grow how your brand shows up across search, AI answers, and social.":
    "검색, AI 답변, 소셜 전반에서 브랜드가 어떻게 노출되는지 하나의 플랫폼에서 측정하고 성장시키세요.",
  "Enter your website": "웹사이트를 입력하세요",
  "Get insights": "인사이트 확인",
  "Select country": "국가 선택",
  "Product preview": "제품 미리보기",
  "Previous slide": "이전 슬라이드",
  "Next slide": "다음 슬라이드",
  "Expand item": "{item} 펼치기",
  "Previous resources": "이전 리소스",
  "Next resources": "다음 리소스",
  "Trusted by leading brands": "선도적인 브랜드가 신뢰합니다",
  "Your edge to win every search": "모든 검색에서 앞서가는 경쟁력",
  "Unify SEO and AI visibility in a single workspace, built on years of search data.":
    "수년간 축적한 검색 데이터를 기반으로 SEO와 AI 가시성을 하나의 워크스페이스에서 관리하세요.",
  "Try for free": "무료로 체험하기",
  "Ask AI, get real data": "AI에 질문하고 실제 데이터를 받으세요",
  "Bring live SEO, market, and visibility data into your AI assistant and turn it into actions.":
    "실시간 SEO·시장·가시성 데이터를 AI 어시스턴트에 연결해 실행 가능한 작업으로 전환하세요.",
  "Connect your data": "데이터 연결",
  "Bigger scale, bigger advantage": "규모가 클수록 더 큰 경쟁력",
  "Dominate brand visibility across markets and domains, everywhere your customers search.":
    "고객이 검색하는 모든 시장과 도메인에서 브랜드 가시성을 강화하세요.",
  "Grow your digital brand visibility": "디지털 브랜드 가시성 높이기",
  "Outrank the rest with better SEO": "더 나은 SEO로 경쟁사를 앞서세요",
  "Get cited by AI answers": "AI 답변에 인용되세요",
  "Analyze traffic on any website": "모든 웹사이트의 트래픽 분석",
  "Create search-ready content faster": "검색에 최적화된 콘텐츠를 더 빠르게 제작",
  "Own your local presence": "지역 검색 존재감 강화",
  "Make every ad dollar work harder": "광고비의 효과 극대화",
  "Build trust through earned press": "언론 노출로 신뢰 구축",
  "Manage social in one place": "한곳에서 소셜 관리",
  "SOLUTIONS ( 9 )": "솔루션 ( 9 )",
  "GET SEEN. GET CITED. BE THE ANSWER.": "노출되고, 인용되고, 답이 되세요.",
  "STATS AND FACTS": "통계 및 현황",
  "THE DATA YOU NEED TO OUTRANK THE COMPETITION": "경쟁사를 앞서는 데 필요한 데이터",
  "Learn more": "자세히 알아보기",
  Keywords: "키워드",
  "More keywords means more ways to win.": "더 많은 키워드는 더 많은 성장 기회를 뜻합니다.",
  Backlinks: "백링크",
  "Build credibility with a large link database.": "대규모 링크 데이터베이스로 신뢰도를 높이세요.",
  "Domain profiles": "도메인 프로필",
  "Market insight at your fingertips.": "필요한 시장 인사이트를 바로 확인하세요.",
  "Geo databases": "지역 데이터베이스",
  "Coverage all around the world.": "전 세계를 폭넓게 지원합니다.",
  "LLM prompts": "LLM 프롬프트",
  "Track more prompts, grow faster.": "더 많은 프롬프트를 추적하고 더 빠르게 성장하세요.",
  "AI VISIBILITY INDEX": "AI 가시성 지수",
  "Explore the strategies powering AI search leaders and get clear steps to build your own.":
    "AI 검색 선도 브랜드의 전략과 직접 실행할 수 있는 단계를 확인하세요.",
  "Explore the index": "지수 살펴보기",
  Brand: "브랜드",
  Mentions: "언급",
  "OUR CUSTOMERS": "고객 사례",
  "HOW WE HELP MARKETERS WIN": "마케터의 성장을 돕는 방법",
  "This platform helped our team work more efficiently and focus on the work that actually moves visibility.":
    "이 플랫폼 덕분에 팀이 더 효율적으로 일하고 가시성을 실제로 높이는 업무에 집중할 수 있었습니다.",
  "Head of Growth, Contoso": "성장 책임자, Contoso",
  "Increase in share of voice": "점유율 증가",
  "RESOURCES ( 9 )": "리소스 ( 9 )",
  "STAY AHEAD OF WHAT'S NEXT": "다가올 변화를 한발 앞서 만나세요",
  "Product Update": "제품 업데이트",
  Playbook: "플레이북",
  Spotlight: "스포트라이트",
  Article: "아티클",
  "Academy Course": "아카데미 강좌",
  "A unified solution for the AI search era": "AI 검색 시대를 위한 통합 솔루션",
  "How unified visibility, competitive insight, and content optimization come together in one workflow.":
    "가시성, 경쟁 인사이트, 콘텐츠 최적화를 하나의 워크플로로 연결하는 방법을 알아보세요.",
  "The AI search operating system": "AI 검색 운영 시스템",
  "A free playbook to get your brand found, understood, and recommended in AI search.":
    "AI 검색에서 브랜드가 발견되고 이해되며 추천되도록 돕는 무료 플레이북입니다.",
  "Where ambitious marketers take center stage": "성장을 꿈꾸는 마케터를 위한 무대",
  "Practical strategies, expert feedback, and a community built for marketers who play to win.":
    "실전 전략, 전문가 피드백, 성장을 추구하는 마케터 커뮤니티를 만나보세요.",
  "New partnership brings search data into the builder": "새로운 파트너십으로 빌더에 검색 데이터 연결",
  "Search intelligence integrated directly into the building experience for faster iteration.":
    "검색 인텔리전스를 제작 환경에 직접 통합해 더 빠르게 개선하세요.",
  "Strengthening enterprise brand visibility": "엔터프라이즈 브랜드 가시성 강화",
  "How brand visibility, SEO, and AI-driven customer experience come together at scale.":
    "브랜드 가시성, SEO, AI 기반 고객 경험을 대규모로 연결하는 방법입니다.",
  "FAQ for customers": "고객 FAQ",
  "Answers to the most important questions: what changes, what stays the same, and what to expect next.":
    "무엇이 바뀌고 유지되는지, 앞으로 무엇을 기대할 수 있는지 주요 질문에 답합니다.",
  "Direct access to data inside AI chat": "AI 채팅 안에서 데이터에 바로 접근",
  "A go-to integration to streamline daily tasks and centralize your data where you work.":
    "일상 업무를 간소화하고 작업 공간에 데이터를 모으는 핵심 통합입니다.",
  "How we drive LLM visibility": "LLM 가시성을 높이는 방법",
  "A systematic approach that nearly tripled AI share of voice, with real data behind it.":
    "실제 데이터를 기반으로 AI 점유율을 약 세 배 높인 체계적인 접근법입니다.",
  "Sharpen your marketing skills with free webinars": "무료 웨비나로 마케팅 역량 강화",
  "A free certification course on how AI is changing search and how to grow your visibility.":
    "AI가 검색을 어떻게 바꾸는지, 가시성을 어떻게 높이는지 배우는 무료 인증 강좌입니다.",
};

const LOWER_EN_TO_KO = Object.fromEntries(
  Object.entries(EN_TO_KO).map(([source, translated]) => [source.toLowerCase(), translated]),
);

export function translateSiteText(locale: Locale, text: string): string {
  if (locale === "en") return text;
  const exact = EN_TO_KO[text];
  if (exact) return exact;
  const fragment = (value: string) =>
    EN_TO_KO[value] ?? LOWER_EN_TO_KO[value.toLowerCase()] ?? value;

  const featureSummary = text.match(
    /^Use (.+?) to (.+)\. Turn insight into action with data trusted by marketing teams worldwide\.$/,
  );
  if (featureSummary) {
    const [, name, purpose] = featureSummary;
    return `${fragment(name)}: ${fragment(purpose)}. 마케팅 팀이 신뢰하는 데이터로 인사이트를 실행에 옮기세요.`;
  }

  const titledPurpose = text.match(/^([^:]+): (.+)$/);
  if (titledPurpose) {
    const [, title, purpose] = titledPurpose;
    const localizedTitle = fragment(title);
    const localizedPurpose = fragment(purpose);
    if (localizedTitle !== title || localizedPurpose !== purpose) {
      return `${localizedTitle}: ${localizedPurpose}`;
    }
  }

  const fullView = text.match(/^Get a complete view so you can (.+) without switching tools\.$/);
  if (fullView) return `도구를 전환하지 않고 전체 현황을 확인하세요. ${fragment(fullView[1])}`;

  const everything = text.match(/^Everything you need for (.+)$/);
  if (everything) return `${fragment(everything[1])}에 필요한 모든 기능`;

  const focusedWorkspace = text.match(
    /^A focused workspace to (.+), with filters, comparisons, and exports built in\.$/,
  );
  if (focusedWorkspace) {
    return `필터, 비교, 내보내기 기능을 갖춘 집중형 워크스페이스입니다. ${fragment(focusedWorkspace[1])}`;
  }

  const testimonial = text.match(
    /^(.+) gave our team the clarity we were missing and made reporting effortless\.$/,
  );
  if (testimonial) {
    return `${fragment(testimonial[1])} 덕분에 팀이 필요한 인사이트를 얻고 보고 업무도 간편해졌습니다.`;
  }

  const whatIs = text.match(/^What is (.+)\?$/);
  if (whatIs) return `${fragment(whatIs[1])}이란 무엇인가요?`;

  const paidPlan = text.match(/^Do I need a paid plan to use (.+)\?$/);
  if (paidPlan) return `${fragment(paidPlan[1])}을 사용하려면 유료 요금제가 필요한가요?`;

  const toolset = text.match(
    /^(.+) is a toolset that helps you (.+), so you can make faster, more confident decisions\.$/,
  );
  if (toolset) {
    return `${fragment(toolset[1])}은(는) 더 빠르고 확신 있는 결정을 돕는 도구 모음입니다. ${fragment(toolset[2])}`;
  }

  const startWith = text.match(/^GET STARTED WITH (.+)$/);
  if (startWith) return `${fragment(startWith[1])} 시작하기`;

  return text;
}

/** 문자열 잎만 번역하고 링크·색상·식별자처럼 사전에 없는 값은 그대로 유지한다. */
export function localizeSiteValue<T>(value: T, locale: Locale): T {
  if (typeof value === "string") return translateSiteText(locale, value) as T;
  if (Array.isArray(value)) {
    return value.map((item) => localizeSiteValue(item, locale)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, localizeSiteValue(item, locale)]),
    ) as T;
  }
  return value;
}
