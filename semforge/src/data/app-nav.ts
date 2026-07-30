/**
 * 로그인 앱 내비게이션 정보구조.
 * 출처: SEMFORGE_UI_UX_PAGE_INVENTORY.md 섹션 5 (전역 11개 툴킷 + 툴킷별 좌측 메뉴).
 */

export interface AppTool {
  label: string;
  href: string;
  group?: string;
}

export interface AppToolkit {
  key: string;
  label: string;
  icon: string; // icons.tsx 키
  dashboardHref: string;
  groups: { heading?: string; tools: AppTool[] }[];
}

export const appGlobalNav: { key: string; label: string; icon: string; href: string }[] = [
  { key: "home", label: "Home", icon: "home", href: "/home/" },
  { key: "seo", label: "SEO", icon: "seo", href: "/seo/" },
  { key: "ai", label: "AI Visibility", icon: "ai", href: "/ai-seo/overview/" },
  { key: "traffic", label: "Traffic & Market", icon: "traffic", href: "/analytics/traffic/" },
  { key: "local", label: "Local", icon: "local", href: "/local-business/" },
  { key: "content", label: "Content", icon: "content", href: "/content/" },
  { key: "advertising", label: "Advertising", icon: "advertising", href: "/advertising/" },
  { key: "pr", label: "AI PR", icon: "pr", href: "/pr-toolkit/" },
  { key: "social", label: "Social", icon: "social", href: "/social-media/" },
  { key: "reports", label: "Reports", icon: "reports", href: "/my_reports/grid/" },
  { key: "apps", label: "App Center", icon: "apps", href: "/apps/" },
];

export const appToolkits: Record<string, AppToolkit> = {
  seo: {
    key: "seo",
    label: "SEO",
    icon: "seo",
    dashboardHref: "/seo/",
    groups: [
      { heading: "Dashboard", tools: [{ label: "SEO Dashboard", href: "/seo/" }] },
      {
        heading: "Site Performance",
        tools: [
          { label: "Site Audit", href: "/siteaudit/" },
          { label: "Position Tracking", href: "/position-tracking/" },
        ],
      },
      {
        heading: "Competitive Analysis",
        tools: [
          { label: "Domain Overview", href: "/analytics/overview/" },
          { label: "Top Pages", href: "/analytics/toppages/" },
          { label: "Compare Domains", href: "/analytics/comparedomains/" },
          { label: "Keyword Gap", href: "/analytics/keywordgap/" },
          { label: "Backlink Gap", href: "/analytics/gap/backlinks/" },
        ],
      },
      {
        heading: "Keyword Research",
        tools: [
          { label: "Keyword Overview", href: "/analytics/keywordoverview/" },
          { label: "Keyword Magic Tool", href: "/analytics/keywordmagic/" },
          { label: "Keyword Strategy Builder", href: "/analytics/keywordmanager/" },
        ],
      },
      {
        heading: "Content Ideas",
        tools: [
          { label: "SEO Writing Assistant", href: "/swa/" },
          { label: "Topic Research", href: "/topic-research/" },
        ],
      },
      {
        heading: "Link Building",
        tools: [
          { label: "Backlinks", href: "/analytics/backlinks/overview/" },
          { label: "Referring Domains", href: "/analytics/refdomains/report/" },
          { label: "Backlink Audit", href: "/backlink_audit/" },
        ],
      },
      {
        heading: "More tools",
        tools: [
          { label: "Sensor", href: "/sensor/" },
          { label: "SEMForge Rank", href: "/analytics/ranks/rank/" },
          { label: "On Page SEO Checker", href: "/on-page-seo-checker/" },
          { label: "Organic Traffic Insights", href: "/organic_traffic_insights/" },
        ],
      },
    ],
  },
  ai: {
    key: "ai",
    label: "AI Visibility",
    icon: "ai",
    dashboardHref: "/ai-seo/overview/",
    groups: [
      {
        heading: "AI Analysis",
        tools: [
          { label: "Visibility Overview", href: "/ai-seo/overview/" },
          { label: "Competitor Research", href: "/ai-seo/competitor-research/" },
          { label: "Prompt Research", href: "/ai-seo/prompt-research/" },
        ],
      },
      {
        heading: "Brand Performance",
        tools: [
          { label: "Brand Performance", href: "/ai-seo/brand-performance/" },
          { label: "Perception", href: "/ai-seo/perception/" },
          { label: "Narrative Drivers", href: "/ai-seo/narrative-drivers/" },
          { label: "Questions", href: "/ai-seo/questions/" },
        ],
      },
      {
        heading: "Growth & Monitoring",
        tools: [
          { label: "Growth Actions", href: "/ai-seo/growth-plan/" },
          { label: "Site Audit", href: "/siteaudit/" },
          { label: "Prompt Tracking", href: "/position-tracking/" },
          { label: "Content Creation", href: "/content/" },
        ],
      },
    ],
  },
  traffic: {
    key: "traffic",
    label: "Traffic & Market",
    icon: "traffic",
    dashboardHref: "/analytics/traffic/",
    groups: [
      { heading: "Start", tools: [{ label: "Dashboard", href: "/analytics/traffic/" }] },
      {
        heading: "Overview",
        tools: [
          { label: "Traffic Analytics", href: "/analytics/traffic/traffic-overview/" },
          { label: "Market Overview", href: "/analytics/traffic/market-overview/" },
          { label: "Top Pages", href: "/analytics/traffic/top-pages/" },
          { label: "Competitor Monitoring", href: "/analytics/traffic/competitor-monitoring/" },
        ],
      },
      {
        heading: "Traffic Distribution",
        tools: [
          { label: "AI Traffic", href: "/analytics/traffic/ai-traffic/" },
          { label: "Referral", href: "/analytics/traffic/referral/" },
          { label: "Organic Search", href: "/analytics/traffic/organic-search/" },
          { label: "Paid Search", href: "/analytics/traffic/paid-search/" },
          { label: "Organic Social", href: "/analytics/traffic/organic-social/" },
          { label: "Paid Social", href: "/analytics/traffic/paid-social/" },
          { label: "Email", href: "/analytics/traffic/email/" },
          { label: "Display Ads", href: "/analytics/traffic/display-ads/" },
          { label: "Sources & Destinations", href: "/analytics/traffic/sources-destinations/" },
        ],
      },
      {
        heading: "Pages & Categories",
        tools: [
          { label: "Subfolders & Subdomains", href: "/analytics/traffic/subfolders-subdomains/" },
          { label: "Page Groups", href: "/analytics/traffic/page-groups/" },
        ],
      },
      {
        heading: "Regional Trends",
        tools: [
          { label: "USA", href: "/analytics/traffic/usa/" },
          { label: "Countries", href: "/analytics/traffic/countries/" },
          { label: "Business Regions", href: "/analytics/traffic/business-regions/" },
          { label: "Geographical Regions", href: "/analytics/traffic/geographical-regions/" },
        ],
      },
      {
        heading: "Audience",
        tools: [
          { label: "Demographics", href: "/analytics/traffic/demographics/" },
          { label: "Audience Overlap", href: "/analytics/traffic/audience-overlap/" },
          { label: "Socioeconomics", href: "/analytics/traffic/socioeconomics/" },
          { label: "Behavior", href: "/analytics/traffic/behavior/" },
        ],
      },
      {
        heading: "Advanced",
        tools: [
          { label: "Daily Trends", href: "/analytics/traffic/daily-trends/" },
          { label: "Industry & Bulk Analysis", href: "/analytics/traffic/industry-and-bulk-analysis/" },
          { label: "Trends API", href: "/analytics/traffic/trends-api" },
          { label: "Trending Websites", href: "/trending-websites/global/all/" },
        ],
      },
    ],
  },
  local: {
    key: "local",
    label: "Local",
    icon: "local",
    dashboardHref: "/local-business/",
    groups: [
      { heading: "Dashboard", tools: [{ label: "Local Dashboard", href: "/local-business/" }] },
      {
        heading: "Management",
        tools: [
          { label: "Listing Management", href: "/listings-management/" },
          { label: "Review Management", href: "/review-management/" },
          { label: "GBP Optimization", href: "/gbp-optimization/" },
        ],
      },
      { heading: "Automation", tools: [{ label: "GBP AI Agent", href: "/gbp-ai-agent/" }] },
      { heading: "Competitive Analysis", tools: [{ label: "Map Rank Tracker", href: "/map-rank-tracker/" }] },
    ],
  },
  content: {
    key: "content",
    label: "Content",
    icon: "content",
    dashboardHref: "/content/",
    groups: [
      { heading: "Dashboard", tools: [{ label: "Content Dashboard", href: "/content/" }] },
      {
        heading: "Create",
        tools: [
          { label: "AI Article Generator", href: "/content/articles/create/" },
          { label: "Content Optimizer", href: "/content/articles/optimize/" },
          { label: "Content Repurposing", href: "/content/articles/repurpose/" },
          { label: "SEO Brief Generator", href: "/content/briefs/create/" },
        ],
      },
      {
        heading: "Research",
        tools: [
          { label: "Topic Finder", href: "/content/topic-finder/" },
          { label: "My Content", href: "/content/articles/" },
        ],
      },
    ],
  },
  advertising: {
    key: "advertising",
    label: "Advertising",
    icon: "advertising",
    dashboardHref: "/advertising/",
    groups: [
      { heading: "Dashboard", tools: [{ label: "Advertising Dashboard", href: "/advertising/" }] },
      {
        heading: "Create & Launch",
        tools: [
          { label: "Ads Launch Assistant", href: "/advertising/ads-launch-assistant" },
          { label: "Ads AI Agent", href: "/advertising/ads-ai-agent" },
        ],
      },
      {
        heading: "Research",
        tools: [
          { label: "Advertising Research", href: "/analytics/adwords/positions/" },
          { label: "PLA Research", href: "/analytics/pla/positions/" },
          { label: "AdClarity", href: "/apps/adclarity-advertising-intelligence/" },
        ],
      },
    ],
  },
  pr: {
    key: "pr",
    label: "AI PR",
    icon: "pr",
    dashboardHref: "/pr-toolkit/",
    groups: [
      {
        heading: "Dashboard",
        tools: [
          { label: "AI PR Dashboard", href: "/pr-toolkit/" },
          { label: "AI-Cited Media", href: "/pr-toolkit/ai-cited-media/" },
        ],
      },
      {
        heading: "Media Database",
        tools: [
          { label: "Contact Search", href: "/pr-toolkit/media-database/" },
          { label: "Media Lists", href: "/pr-toolkit/media-lists/" },
        ],
      },
      {
        heading: "Email",
        tools: [
          { label: "My Emails", href: "/pr-toolkit/emails" },
          { label: "Senders & Domains", href: "/pr-toolkit/emails/settings/senders/" },
        ],
      },
      {
        heading: "Monitoring",
        tools: [
          { label: "Media Monitoring", href: "/pr-toolkit/media-monitoring/" },
          { label: "Alerts & Summaries", href: "/pr-toolkit/media-monitoring/emails/" },
        ],
      },
    ],
  },
  social: {
    key: "social",
    label: "Social",
    icon: "social",
    dashboardHref: "/social-media/",
    groups: [
      { heading: "Dashboard", tools: [{ label: "Social Dashboard", href: "/social-media/" }] },
      {
        heading: "Core",
        tools: [
          { label: "Social Poster", href: "/social-media/?tool=poster" },
          { label: "Social Tracker", href: "/social-media/?tool=tracker" },
          { label: "Content Insights", href: "/social-media/?tool=content-insights" },
          { label: "Social Analytics", href: "/social-media/?tool=analytics" },
        ],
      },
      {
        heading: "Advanced",
        tools: [
          { label: "Influencer Analytics", href: "/apps/influencer-marketing-platform/" },
          { label: "Media Monitoring", href: "/media-monitoring/" },
        ],
      },
    ],
  },
  reports: {
    key: "reports",
    label: "Reports",
    icon: "reports",
    dashboardHref: "/my_reports/grid/",
    groups: [
      { heading: "Home", tools: [{ label: "My Reports", href: "/my_reports/grid/" }] },
      {
        heading: "Builder",
        tools: [
          { label: "Create Report", href: "/my_reports/constructor" },
          { label: "Templates", href: "/my_reports/constructor?accordionTab=integrations" },
          { label: "Themes", href: "/my_reports/constructor?accordionTab=themes" },
        ],
      },
      { heading: "Info", tools: [{ label: "Reports suite", href: "/my_reports/suite" }] },
    ],
  },
};
