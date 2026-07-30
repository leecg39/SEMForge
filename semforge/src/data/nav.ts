/**
 * 공개 사이트 전역 내비게이션 데이터 (www.semforge.com 실측 추출)
 * 추출일: 2026-07-27, 데스크톱 1440px + 모바일 드로어 DOM
 */

export interface NavLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface MegaMenuGroup {
  heading: string;
  links: NavLink[];
}

export interface MegaMenuPromo {
  eyebrow?: string;
  title: string;
  description?: string;
  buttonLabel?: string;
  href: string;
}

export interface MegaMenu {
  label: string;
  groups: MegaMenuGroup[];
  promo?: MegaMenuPromo;
}

export const topBanner = {
  text: "TRY SEMFORGE ONE FOR FREE",
  subtext: "The unified SEO and AI search solution",
  href: "/signup/",
};

export const productMenu: MegaMenu = {
  label: "Product",
  groups: [
    {
      heading: "Get started",
      links: [
        { label: "SEMForge One", href: "/one/" },
        { label: "Enterprise", href: "/enterprise/" },
        { label: "SEMForge MCP", href: "/mcp/" },
        { label: "SEMForge API", href: "/ext/developer.semforge.com/", external: true },
        { label: "Our data", href: "/stats/" },
        { label: "Book a demo", href: "/company/sales/" },
      ],
    },
    {
      heading: "Discover",
      links: [
        { label: "Keyword Research", href: "/features/keyword-research/" },
        { label: "Competitor Analysis", href: "/features/competitor-analysis/" },
        { label: "Market Analysis", href: "/features/market-analysis/" },
        { label: "Local SEO", href: "/features/local-seo/" },
        { label: "AI Brand Sentiment", href: "/features/brand-sentiment/" },
        { label: "Backlink Analysis", href: "/features/backlink-analysis/" },
      ],
    },
    {
      heading: "Create and optimize",
      links: [
        { label: "Content Creation", href: "/features/content-marketing/" },
        { label: "Technical Site Health", href: "/features/site-audit/" },
        { label: "Digital PR", href: "/features/digital-pr/" },
      ],
    },
    {
      heading: "Track",
      links: [
        { label: "Rank Tracking", href: "/features/rank-tracking/" },
        { label: "Marketing Reports", href: "/features/reports/" },
        { label: "AI Brand Sentiment", href: "/features/brand-sentiment/" },
        { label: "Backlink Analysis", href: "/features/backlink-analysis/" },
        { label: "See all features", href: "/features/" },
      ],
    },
  ],
  promo: {
    eyebrow: "Data-driven strategies",
    title: "Turn data into direction",
    buttonLabel: "Start free now",
    href: "/signup/",
  },
};

export const solutionsMenu: MegaMenu = {
  label: "Solutions",
  groups: [
    {
      heading: "Use cases",
      links: [
        { label: "Grow search visibility", href: "/solutions/search-visibility/" },
        { label: "Get recommended by AI", href: "/solutions/ai-visibility/" },
        { label: "Research your market", href: "/solutions/analyze-competitors-market/" },
        { label: "Connect with local customers", href: "/solutions/local-search/" },
        { label: "Create engaging content", href: "/solutions/create-content/" },
        { label: "Fix technical site issues", href: "/solutions/technical-seo/" },
        { label: "Grow off-site authority", href: "/solutions/off-site-visibility/" },
        { label: "Build client strategies", href: "/solutions/client-strategy/" },
        { label: "See all use cases", href: "/solutions/use-cases/" },
      ],
    },
    {
      heading: "By size",
      links: [
        { label: "Enterprise", href: "/ext/enterprise.semforge.com/", external: true },
        { label: "Mid-market", href: "/solutions/mid-market/" },
        { label: "Small teams", href: "/solutions/small-teams/" },
        { label: "Solopreneurs", href: "/solutions/solopreneurs/" },
        { label: "Freelancers", href: "/solutions/freelancers/" },
        { label: "Agencies", href: "/solutions/agencies/" },
      ],
    },
    {
      heading: "By role",
      links: [
        { label: "Business Owner", href: "/solutions/business-owners/" },
        { label: "Agency Owner", href: "/solutions/agencies/" },
        { label: "SEO Specialist", href: "/solutions/seo-professionals/" },
        { label: "Content Marketer", href: "/solutions/content-marketers/" },
        { label: "Full-Stack Growth Marketers", href: "/solutions/growth-marketers/" },
      ],
    },
    {
      heading: "By industry",
      links: [
        { label: "Professional Services", href: "/solutions/professional-services/" },
        { label: "Retail & Ecommerce", href: "/solutions/ecommerce/" },
        { label: "Agencies", href: "/solutions/agencies/" },
        { label: "SaaS & B2B Tech", href: "/solutions/saas/" },
        { label: "Healthcare", href: "/solutions/healthcare/" },
        { label: "Local Business", href: "/solutions/local-business/" },
        { label: "See all industries", href: "/solutions/industry/" },
      ],
    },
  ],
  promo: {
    title: "Try SEMForge One for Free",
    description: "The leading platform that unifies SEO authority and AI visibility.",
    href: "/one/",
  },
};

export const resourcesMenu: MegaMenu = {
  label: "Resources",
  groups: [
    {
      heading: "Grow with SEMForge",
      links: [
        { label: "Blog", href: "/blog/" },
        { label: "Knowledge Base", href: "/kb/" },
        { label: "Academy", href: "/academy/" },
        { label: "Success Stories", href: "/company/stories/" },
        { label: "AI Visibility Index", href: "/ext/ai-visibility-index.semforge.com/", external: true },
        { label: "Webinars", href: "/academy/webinars/" },
        { label: "News", href: "/news/" },
      ],
    },
    {
      heading: "Explore Free Tools",
      links: [
        { label: "AI Visibility Checker", href: "/free-tools/ai-search-visibility-checker/" },
        { label: "SEO Checker", href: "/siteaudit/" },
        { label: "Website Traffic Checker", href: "/website/top/" },
        { label: "Keyword Tool", href: "/analytics/keywordmagic/" },
        { label: "Backlink Checker", href: "/analytics/backlinks/overview/" },
        { label: "Top Websites by Traffic", href: "/trending-websites/global/all/" },
        { label: "Explore Other Free Tools", href: "/free-tools/" },
      ],
    },
    {
      heading: "Platform",
      links: [
        { label: "Our Data", href: "/stats/" },
        { label: "Integrations", href: "/company/partner-integrations/" },
        { label: "App Center", href: "/apps/" },
      ],
    },
    {
      heading: "About SEMForge",
      links: [
        { label: "About Us", href: "/company/" },
        { label: "Stats and Facts", href: "/stats/" },
        { label: "Affiliate Program", href: "/lp/affiliate-program/en/" },
        { label: "Contact Us", href: "/company/contacts/" },
      ],
    },
  ],
  promo: {
    title: "Get Your Ticket Now",
    description:
      "One day. Real strategies. Built for marketers who play to win. October 13, 2026 · London, UK",
    href: "https://www.spotlightconf.com/",
  },
};

export const headerMenus: MegaMenu[] = [productMenu, solutionsMenu, resourcesMenu];

export const footerGroups: MegaMenuGroup[] = [
  {
    heading: "SEMForge",
    links: [
      { label: "SEMForge One", href: "/one/" },
      { label: "Features", href: "/features/" },
      { label: "Solutions", href: "/solutions/" },
      { label: "Pricing", href: "/pricing/" },
      { label: "Free Trial", href: "/free-trial/" },
      { label: "Compare SEMForge", href: "/vs/" },
      { label: "Success Stories", href: "/company/stories/" },
      { label: "Stats and Facts", href: "/stats/" },
      { label: "Affiliate Program", href: "/lp/affiliate-program/en/" },
    ],
  },
  {
    heading: "More tools",
    links: [
      { label: "Enterprise SEO", href: "/ext/enterprise.semforge.com/", external: true },
      { label: "Enterprise AIO", href: "/lp/enterprise-aio/en/" },
      { label: "Enterprise SI", href: "/lp/site-intelligence/en/" },
      { label: "Insights24", href: "/lp/insights/en/" },
      { label: "Mfour", href: "/lp/mfour/en/" },
      { label: "App Center", href: "/apps/" },
      { label: "Top Websites", href: "/website/top/" },
      { label: "Free Tools", href: "/free-tools/" },
      { label: "Sensor", href: "/sensor/" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About Us", href: "/company/" },
      { label: "News", href: "/news/" },
      { label: "Careers", href: "/ext/careers.semforge.com/", external: true },
      { label: "Partners", href: "/company/partners/" },
      { label: "SEMForge Select", href: "/company/select/" },
      { label: "Global Issues Index", href: "/company/global-issues/" },
      { label: "Do not sell my personal info", href: "#" },
      { label: "Contact Us", href: "/company/contacts/" },
    ],
  },
  {
    heading: "Support",
    links: [
      { label: "Knowledge Base", href: "/kb/" },
      { label: "Academy", href: "/academy/" },
      { label: "SEMForge API", href: "/api-documentation/" },
    ],
  },
  {
    heading: "Community",
    links: [
      { label: "SEMForge Blog", href: "/blog/" },
      { label: "Webinars", href: "/academy/webinars/" },
      { label: "Ambassador Program", href: "/lp/semforge-circle/en/" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", href: "/company/legal/privacy-policy/" },
      { label: "Terms of Service", href: "/company/legal/" },
      { label: "Cookies Settings", href: "#cookie-settings" },
    ],
  },
];

export const footerSocial: { label: string; href: string; icon: string }[] = [
  { label: "SEMForge linkedin", href: "https://www.linkedin.com/company/semforge", icon: "linkedin" },
  { label: "SEMForge instagram", href: "https://instagram.com/semforge/", icon: "instagram" },
  { label: "SEMForge tiktok", href: "https://www.tiktok.com/@semforge", icon: "tiktok" },
  { label: "SEMForge youtube", href: "https://www.youtube.com/user/SEMForgeHQ", icon: "youtube" },
  { label: "SEMForge facebook", href: "https://www.facebook.com/SEMForge", icon: "facebook" },
  { label: "SEMForge twitter", href: "https://x.com/semforge", icon: "twitter" },
];

export const footerLanguages = [
  "English",
  "Deutsch",
  "Español",
  "Français",
  "Italiano",
  "Nederlands",
  "Polski",
  "Português (Brasil)",
  "Svenska",
  "Tiếng Việt",
  "Türkçe",
  "中文",
];

export const footerCta = {
  heading: "GET STARTED WITH SEMFORGE TODAY",
  subtext: "Try SEMForge free for seven days. Cancel anytime.",
  buttonLabel: "Start free trial",
  href: "/signup/",
};

export const footerLegal = {
  copyright: "© 2026 SEMForge Holdings.",
  rights: "All rights reserved.",
  links: [
    { label: "Privacy Policy", href: "/company/legal/privacy-policy/" },
    { label: "Terms of Service", href: "/company/legal/" },
    { label: "Cookies Settings", href: "#cookie-settings" },
  ],
};
