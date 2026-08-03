import type {
  AnalysisPageData,
  AppLandingData,
  AppWorkspaceData,
  AppEditorData,
  AppStoreData,
  AppHomeData,
} from "@/types/app";

/**
 * 로그인 앱 페이지 데이터. 인벤토리 도구 목록 + 템플릿 메타데이터.
 *
 * 데이터 원칙(2026-07-29): 가짜 KPI/차트/테이블을 주입하지 않는다.
 * 연결된 데이터 소스가 없는 도구는 빈 배열을 내려보내고, 각 템플릿이
 * "데이터 소스 미연결" EmptyState 를 표시한다. 실제 API 가 연결된 페이지는
 * 이 파일이 아니라 각 라우트/서버 모듈에서 실데이터를 주입한다.
 */

const COUNTRY = { label: "Country", options: ["United States", "United Kingdom", "Germany", "Global"] };
const PERIOD = { label: "Period", options: ["Last 30 days", "Last 90 days", "Last 12 months"] };
const DEVICE = { label: "Device", options: ["All devices", "Desktop", "Mobile"] };

function analysis(cfg: {
  toolkit: string;
  href: string;
  name: string;
  desc: string;
  entityLabel?: string;
  entity?: string;
  chartTitle: string;
  chartType?: "line" | "bar" | "area";
  tableTitle: string;
  legend?: [string, string?];
  tabs?: string[];
}): AnalysisPageData {
  return {
    toolkit: cfg.toolkit,
    activeHref: cfg.href,
    toolName: cfg.name,
    toolDescription: cfg.desc,
    entityLabel: cfg.entityLabel ?? "Domain",
    entityValue: cfg.entity ?? "",
    filters: [COUNTRY, PERIOD, DEVICE],
    kpis: [],
    chartTitle: cfg.chartTitle,
    chartType: cfg.chartType ?? "line",
    series: [],
    seriesLegend: cfg.legend,
    tableTitle: cfg.tableTitle,
    columns: [],
    rows: [],
    tabs: cfg.tabs,
  };
}

/* ---------- SEO analysis ---------- */
export const seoAnalysis: Record<string, AnalysisPageData> = {
  "/analytics/overview/": analysis({ toolkit: "seo", href: "/analytics/overview/", name: "Domain Overview", desc: "A snapshot of any domain's visibility across search, ads, and backlinks.", chartTitle: "Organic traffic trend", tableTitle: "Top organic keywords", tabs: ["Overview", "Organic", "Paid", "Backlinks"] }),
  "/analytics/organic/overview": analysis({ toolkit: "seo", href: "/analytics/organic/overview", name: "Organic Research", desc: "Analyze a domain's organic keywords, positions, and competitors.", chartTitle: "Organic positions over time", tableTitle: "Organic keywords" }),
  "/analytics/toppages/": analysis({ toolkit: "seo", href: "/analytics/toppages/", name: "Top Pages", desc: "See which pages drive the most organic traffic.", chartTitle: "Traffic by page", chartType: "bar", tableTitle: "Top pages" }),
  "/analytics/comparedomains/": analysis({ toolkit: "seo", href: "/analytics/comparedomains/", name: "Compare Domains", desc: "Compare visibility metrics across multiple domains.", chartTitle: "Visibility comparison", chartType: "bar", tableTitle: "Domain comparison" }),
  "/analytics/keywordgap/": analysis({ toolkit: "seo", href: "/analytics/keywordgap/", name: "Keyword Gap", desc: "Find keywords your competitors rank for and you don't.", chartTitle: "Keyword overlap", tableTitle: "Gap keywords" }),
  "/analytics/gap/backlinks/": analysis({ toolkit: "seo", href: "/analytics/gap/backlinks/", name: "Backlink Gap", desc: "Discover link opportunities your competitors already have.", chartTitle: "Referring domains gap", chartType: "bar", tableTitle: "Link prospects" }),
  "/analytics/keywordoverview/": analysis({ toolkit: "seo", href: "/analytics/keywordoverview/", name: "Keyword Overview", desc: "Volume, difficulty, intent, and SERP for any keyword.", entityLabel: "Keyword", chartTitle: "Search volume trend", tableTitle: "Keyword variations" }),
  "/analytics/keywordmagic/": analysis({ toolkit: "seo", href: "/analytics/keywordmagic/", name: "Keyword Magic Tool", desc: "Explore millions of keyword ideas from a seed keyword.", entityLabel: "Keyword", chartTitle: "Keyword groups", chartType: "bar", tableTitle: "Keyword ideas", tabs: ["All", "Questions", "Broad match", "Related"] }),
  "/analytics/refdomains/report/": analysis({ toolkit: "seo", href: "/analytics/refdomains/report/", name: "Referring Domains", desc: "Analyze the quality and trend of referring domains.", chartTitle: "Referring domains trend", chartType: "area", tableTitle: "Referring domains" }),
  "/analytics/ranks/rank/": analysis({ toolkit: "seo", href: "/analytics/ranks/rank/", name: "SEMForge Rank", desc: "The most visible domains ranked by organic traffic.", chartTitle: "Rank distribution", chartType: "bar", tableTitle: "Top ranked domains" }),
  "/topic-research/": analysis({ toolkit: "seo", href: "/topic-research/", name: "Topic Research", desc: "Find subtopics, questions, and headlines for any topic.", entityLabel: "Topic", chartTitle: "Topic interest", tableTitle: "Subtopic ideas" }),
};

/* ---------- AI Visibility analysis ---------- */
export const aiAnalysis: Record<string, AnalysisPageData> = {
  "/ai-seo/competitor-research/": analysis({ toolkit: "ai", href: "/ai-seo/competitor-research/", name: "Competitor Research", desc: "Compare brand mentions and citations across AI engines.", chartTitle: "Share of voice", chartType: "area", tableTitle: "Competitor mentions", legend: ["Your brand", "Competitor"] }),
  "/ai-seo/prompt-research/": analysis({ toolkit: "ai", href: "/ai-seo/prompt-research/", name: "Prompt Research", desc: "Discover the prompts your audience asks AI engines.", entityLabel: "Topic", chartTitle: "Prompt appearances", tableTitle: "Prompts" }),
  "/ai-seo/brand-performance/": analysis({ toolkit: "ai", href: "/ai-seo/brand-performance/", name: "Brand Performance", desc: "Track mentions, sentiment, and platform coverage.", chartTitle: "Mentions by platform", chartType: "bar", tableTitle: "Platform breakdown" }),
  "/ai-seo/perception/": analysis({ toolkit: "ai", href: "/ai-seo/perception/", name: "Perception", desc: "How AI models describe your brand.", chartTitle: "Perception over time", chartType: "area", tableTitle: "Perception themes" }),
  "/ai-seo/narrative-drivers/": analysis({ toolkit: "ai", href: "/ai-seo/narrative-drivers/", name: "Narrative Drivers", desc: "The sources shaping how AI describes your brand.", chartTitle: "Source influence", chartType: "bar", tableTitle: "Narrative sources" }),
  "/ai-seo/questions/": analysis({ toolkit: "ai", href: "/ai-seo/questions/", name: "Questions", desc: "Questions people ask AI about your brand and category.", chartTitle: "Question volume", tableTitle: "Questions" }),
};

/* ---------- Traffic & Market analysis (dynamic slugs) ---------- */
const trafficSeeds: [string, string, string][] = [
  ["traffic-overview", "Traffic Analytics", "Visits, engagement, and channels for any website."],
  ["market-overview", "Market Overview", "Market size, share, and growth for your industry."],
  ["top-pages", "Top Pages", "The pages driving the most traffic on any site."],
  ["ai-traffic", "AI Traffic", "Referral traffic coming from AI engines."],
  ["referral", "Referral", "Traffic from referring websites."],
  ["organic-search", "Organic Search", "Organic search traffic and top keywords."],
  ["paid-search", "Paid Search", "Paid search traffic and ad spend estimates."],
  ["organic-social", "Organic Social", "Organic social traffic by platform."],
  ["paid-social", "Paid Social", "Paid social traffic and campaigns."],
  ["email", "Email", "Traffic driven by email campaigns."],
  ["display-ads", "Display Ads", "Display advertising traffic and creatives."],
  ["sources-destinations", "Sources & Destinations", "Where visitors come from and go next."],
  ["subfolders-subdomains", "Subfolders & Subdomains", "Traffic split by site structure."],
  ["page-groups", "Page Groups", "Compare traffic across grouped URLs."],
  ["usa", "USA Traffic", "Regional traffic data for the United States."],
  ["countries", "Countries", "Traffic broken down by country."],
  ["business-regions", "Business Regions", "Traffic by business region."],
  ["geographical-regions", "Geographical Regions", "Traffic by geographic region."],
  ["demographics", "Demographics", "Age, gender, and audience composition."],
  ["audience-overlap", "Audience Overlap", "Shared visitors across websites."],
  ["socioeconomics", "Socioeconomics", "Income, education, and audience profile."],
  ["behavior", "Behavior", "Interests and behavior patterns of visitors."],
  ["daily-trends", "Daily Trends", "Day-by-day traffic trends."],
  ["industry-and-bulk-analysis", "Industry & Bulk Analysis", "Analyze industries and many domains at once."],
];
export const trafficAnalysis: Record<string, AnalysisPageData> = Object.fromEntries(
  trafficSeeds.map(([slug, name, desc]) => [
    slug,
    analysis({ toolkit: "traffic", href: `/analytics/traffic/${slug}/`, name, desc, chartTitle: "Traffic trend", chartType: "area", tableTitle: "Traffic by source", legend: ["This site", "Competitor"] }),
  ]),
);
export const trafficSlugs = trafficSeeds.map((s) => s[0]);

/* ---------- Ads / PR / Social / Local / Content analysis ---------- */
export const otherAnalysis: Record<string, AnalysisPageData> = {
  "/analytics/adwords/positions/": analysis({ toolkit: "advertising", href: "/analytics/adwords/positions/", name: "Advertising Research", desc: "Competitor paid search keywords and ad copy.", chartTitle: "Paid positions", tableTitle: "Paid keywords" }),
  "/analytics/pla/positions/": analysis({ toolkit: "advertising", href: "/analytics/pla/positions/", name: "PLA Research", desc: "Competitor shopping ads and product listings.", chartTitle: "PLA positions", chartType: "bar", tableTitle: "Product listing ads" }),
  "/pr-toolkit/ai-cited-media/": analysis({ toolkit: "pr", href: "/pr-toolkit/ai-cited-media/", name: "AI-Cited Media", desc: "Media outlets most cited by AI engines.", chartTitle: "Citations over time", chartType: "area", tableTitle: "Cited outlets" }),
  "/pr-toolkit/media-database/": analysis({ toolkit: "pr", href: "/pr-toolkit/media-database/", name: "Media Database", desc: "Search journalists and outlets by beat and region.", entityLabel: "Beat", chartTitle: "Contacts by beat", chartType: "bar", tableTitle: "Journalists & outlets" }),
  "/pr-toolkit/media-monitoring/": analysis({ toolkit: "pr", href: "/pr-toolkit/media-monitoring/", name: "Media Monitoring", desc: "Track brand and keyword mentions across media.", entityLabel: "Query", chartTitle: "Mentions trend", chartType: "area", tableTitle: "Recent mentions" }),
  "/media-monitoring/": analysis({ toolkit: "social", href: "/media-monitoring/", name: "Media Monitoring", desc: "Monitor mentions across social and the web.", entityLabel: "Query", chartTitle: "Mentions trend", chartType: "area", tableTitle: "Recent mentions" }),
  "/map-rank-tracker/": analysis({ toolkit: "local", href: "/map-rank-tracker/", name: "Map Rank Tracker", desc: "Track local map rankings across a geo grid.", entityLabel: "Business", chartTitle: "Average map rank", tableTitle: "Ranking by keyword" }),
  "/content/topic-finder/": analysis({ toolkit: "content", href: "/content/topic-finder/", name: "Topic Finder", desc: "Find content ideas by domain, topic, and region.", entityLabel: "Topic", chartTitle: "Topic interest", tableTitle: "Content ideas" }),
};

/* ---------- Social tool modes (?tool=) ---------- */
export const socialModes: Record<string, AnalysisPageData> = {
  tracker: analysis({ toolkit: "social", href: "/social-media/?tool=tracker", name: "Social Tracker", desc: "Compare your social accounts against competitors.", entityLabel: "Account", chartTitle: "Follower growth", chartType: "area", tableTitle: "Account comparison", legend: ["You", "Competitor"] }),
  "content-insights": analysis({ toolkit: "social", href: "/social-media/?tool=content-insights", name: "Social Content Insights", desc: "See which posts and formats perform best.", entityLabel: "Account", chartTitle: "Engagement by post", chartType: "bar", tableTitle: "Top posts" }),
  analytics: analysis({ toolkit: "social", href: "/social-media/?tool=analytics", name: "Social Analytics", desc: "Channel KPIs and reporting across platforms.", entityLabel: "Account", chartTitle: "Channel performance", chartType: "area", tableTitle: "Platform breakdown" }),
};

/* ---------- Landings ---------- */
/** 도메인 입력 → 분석 결과 페이지(/analytics/overview/)로 이동하는 랜딩 */
const DOMAIN_ANALYZE_PATH = "/analytics/overview/";

function landing(toolkit: string, href: string, title: string, description: string, features: [string, string][], input?: [string, string, string], analyzePath?: string): AppLandingData {
  return {
    toolkit,
    activeHref: href,
    title,
    description,
    inputLabel: input?.[0],
    inputPlaceholder: input?.[1],
    submitLabel: input?.[2],
    analyzePath,
    features: features.map(([t, b]) => ({ title: t, body: b })),
  };
}

export const landings: Record<string, AppLandingData> = {
  seo: landing("seo", "/seo/", "SEO Dashboard", "Track your site's health, rankings, and opportunities in one place.", [["Site Audit", "Find and fix technical issues."], ["Position Tracking", "Monitor rankings daily."], ["Keyword Research", "Discover new opportunities."]], ["Domain", "Enter a domain", "Analyze"], DOMAIN_ANALYZE_PATH),
  ai: landing("ai", "/ai-seo/overview/", "AI Visibility Overview", "Measure and grow how AI engines cite your brand.", [["Prompt Research", "See what your audience asks AI."], ["Brand Performance", "Track mentions and sentiment."], ["Growth Actions", "Prioritized steps to improve."]], ["Domain", "Enter a domain", "Analyze"], DOMAIN_ANALYZE_PATH),
  traffic: landing("traffic", "/analytics/traffic/", "Traffic & Market Dashboard", "Analyze traffic and market share for any website.", [["Traffic Analytics", "Visits, channels, and engagement."], ["Market Overview", "Size and share of your market."], ["Competitor Monitoring", "Track changes over time."]], ["Domain", "Enter a domain", "Analyze"], DOMAIN_ANALYZE_PATH),
  local: landing("local", "/local-business/", "Local Dashboard", "Manage listings, reviews, and local rankings.", [["Listing Management", "Sync your business info."], ["Review Management", "Collect and respond to reviews."], ["Map Rank Tracker", "Track local rankings."]], ["Business", "Enter a business name", "Continue"]),
  content: landing("content", "/content/", "Content Dashboard", "Plan, create, and optimize content that performs.", [["AI Article Generator", "Draft long-form content fast."], ["Content Optimizer", "Improve SEO and readability."], ["Topic Finder", "Find ideas worth writing."]]),
  advertising: landing("advertising", "/advertising/", "Advertising Dashboard", "Research, create, and optimize your ad campaigns.", [["Ads Launch Assistant", "Build campaigns quickly."], ["Advertising Research", "Study competitor ads."], ["Ads AI Agent", "Get campaign recommendations."]], ["Domain", "Enter a domain", "Analyze"], DOMAIN_ANALYZE_PATH),
  pr: landing("pr", "/pr-toolkit/", "AI PR Dashboard", "Find media, pitch stories, and monitor coverage.", [["Media Database", "Find the right journalists."], ["My Emails", "Send and track pitches."], ["Media Monitoring", "Track your coverage."]]),
  social: landing("social", "/social-media/", "Social Dashboard", "Publish, track, and analyze across social platforms.", [["Social Poster", "Schedule and publish posts."], ["Social Tracker", "Benchmark competitors."], ["Social Analytics", "Report on performance."]]),
  reportsSuite: landing("reports", "/my_reports/suite", "Reports", "Build branded, automated reports across every channel.", [["200+ widgets", "Mix data from every toolkit."], ["Templates", "Start from proven layouts."], ["White-label", "Add your own branding."]]),
};

/* ---------- Workspaces ---------- */
/** 연결된 프로젝트 데이터가 없으므로 요약/이슈/테이블은 비워 두고 템플릿이 EmptyState 를 표시한다. */
function workspace(toolkit: string, href: string, title: string, issuesTitle: string): AppWorkspaceData {
  return {
    toolkit,
    activeHref: href,
    title,
    projectLabel: "",
    steps: [],
    summary: [],
    issuesTitle,
    issues: [],
    columns: [],
    rows: [],
    actions: [],
  };
}

export const workspaces: Record<string, AppWorkspaceData> = {
  "/siteaudit/": workspace("seo", "/siteaudit/", "Site Audit", "Issues by severity"),
  "/position-tracking/": workspace("seo", "/position-tracking/", "Position Tracking", "Ranking distribution"),
  "/backlink_audit/": workspace("seo", "/backlink_audit/", "Backlink Audit", "Toxicity review"),
  "/on-page-seo-checker/": workspace("seo", "/on-page-seo-checker/", "On Page SEO Checker", "Optimization ideas"),
  "/organic_traffic_insights/": workspace("seo", "/organic_traffic_insights/", "Organic Traffic Insights", "Connected data"),
  "/analytics/keywordmanager/": workspace("seo", "/analytics/keywordmanager/", "Keyword Strategy Builder", "Keyword clusters"),
  "/ai-seo/growth-plan/": workspace("ai", "/ai-seo/growth-plan/", "Growth Actions", "Prioritized actions"),
  "/analytics/traffic/competitor-monitoring/": workspace("traffic", "/analytics/traffic/competitor-monitoring/", "Competitor Monitoring", "Tracked competitors"),
  "/listings-management/": workspace("local", "/listings-management/", "Listing Management", "Listing status"),
  "/review-management/": workspace("local", "/review-management/", "Review Management", "Recent reviews"),
  "/gbp-optimization/": workspace("local", "/gbp-optimization/", "GBP Optimization", "Profile checklist"),
  "/gbp-ai-agent/": workspace("local", "/gbp-ai-agent/", "GBP AI Agent", "Automated tasks"),
  "/content/articles/": workspace("content", "/content/articles/", "My Content", "Content status"),
  "/advertising/ads-ai-agent": workspace("advertising", "/advertising/ads-ai-agent", "Ads AI Agent", "Recommendations"),
  "/pr-toolkit/media-lists/": workspace("pr", "/pr-toolkit/media-lists/", "Media Lists", "Saved contacts"),
  "/pr-toolkit/emails": workspace("pr", "/pr-toolkit/emails", "My Emails", "Pitch status"),
  "/pr-toolkit/emails/settings/senders/": workspace("pr", "/pr-toolkit/emails/settings/senders/", "Senders & Domains", "Sender setup"),
  "/pr-toolkit/media-monitoring/emails/": workspace("pr", "/pr-toolkit/media-monitoring/emails/", "Alerts & Summaries", "Alert rules"),
  "/my_reports/grid/": workspace("reports", "/my_reports/grid/", "My Reports", "Report status"),
};

/* ---------- Editors ---------- */
/**
 * 편집기 본문은 사용자가 채우는 빈 문서로 시작한다.
 * 점수/제안은 실제 분석 엔진이 없으므로 0(미산출)·빈 목록으로 내려보낸다.
 */
function editor(toolkit: string, href: string, title: string, fields: [string, string, string?][]): AppEditorData {
  return {
    toolkit,
    activeHref: href,
    title,
    briefFields: fields.map(([label, type, placeholder]) => ({ label, type, placeholder })),
    scoreLabel: "Optimization score",
    score: 0,
    suggestions: [],
    previewTitle: title,
    previewBody: [],
    actions: [
      { label: "Save", variant: "outline" },
      { label: "Publish", variant: "primary" },
    ],
  };
}

export const editors: Record<string, AppEditorData> = {
  "/swa/": editor("seo", "/swa/", "SEO Writing Assistant", [["Target keywords", "text", "e.g. seo tools"], ["Tone of voice", "select"], ["Audience", "text"]]),
  "/content/articles/create/": editor("content", "/content/articles/create/", "AI Article Generator", [["Topic", "text", "What is this about?"], ["Brand voice", "select"], ["Length", "select"]]),
  "/content/articles/optimize/": editor("content", "/content/articles/optimize/", "Content Optimizer", [["Target URL", "text"], ["Target keyword", "text"], ["Competitors", "textarea"]]),
  "/content/articles/repurpose/": editor("content", "/content/articles/repurpose/", "Content Repurposing", [["Source content", "textarea"], ["Convert to", "select"], ["Tone", "select"]]),
  "/content/briefs/create/": editor("content", "/content/briefs/create/", "SEO Brief Generator", [["Keyword", "text"], ["Location", "select"], ["Competitors", "textarea"]]),
  "/advertising/ads-launch-assistant": editor("advertising", "/advertising/ads-launch-assistant", "Ads Launch Assistant", [["Product / URL", "text"], ["Goal", "select"], ["Budget", "text"]]),
};

/* ---------- Reports constructor modes ---------- */
export const reportEditors: Record<string, AppEditorData> = {
  base: editor("reports", "/my_reports/constructor", "Report Builder", [["Report name", "text"], ["Date range", "select"], ["Data sources", "textarea"]]),
  ga4: editor("reports", "/my_reports/constructor", "Google Analytics 4 Report", [["GA4 property", "select"], ["Date range", "select"], ["Metrics", "textarea"]]),
  gsc: editor("reports", "/my_reports/constructor", "Google Search Console Report", [["GSC property", "select"], ["Date range", "select"], ["Dimensions", "textarea"]]),
  monthly: editor("reports", "/my_reports/constructor", "Monthly SEO Report", [["Domain", "text"], ["Month", "select"], ["Sections", "textarea"]]),
  themes: editor("reports", "/my_reports/constructor", "Report Themes", [["Brand color", "text"], ["Logo", "text"], ["Font", "select"]]),
  integrations: editor("reports", "/my_reports/constructor", "Report Templates & Integrations", [["Integration", "select"], ["Template", "select"], ["Schedule", "select"]]),
};

/* ---------- App Store ---------- */
/** 앱 마켓플레이스 백엔드가 없으므로 카탈로그는 비어 있다 — 템플릿이 EmptyState 를 표시한다. */
const storeCategories = ["All", "SEO", "Advertising", "Social", "Content", "Local", "Research", "LeadGen"];

export function storeCatalog(title: string, description: string, mode: AppStoreData["mode"] = "store"): AppStoreData {
  return { mode, title, description, categories: storeCategories, apps: [] };
}

export const appStorePages: Record<string, AppStoreData> = {
  store: storeCatalog("App Center", "Extend the platform with apps built by SEMForge and partners."),
  "my-apps": { mode: "my-apps", title: "My Apps", description: "Manage your installed and subscribed apps.", apps: [] },
};

export function appDetail(slug: string): AppStoreData {
  const nice = slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    mode: "detail",
    title: nice,
    description: "This app listing has no connected marketplace data source.",
    apps: [],
  };
}

export const collectionSlugs = [
  "seo", "social-media", "content-creation", "advertising", "ai-apps", "competitor-analysis",
  "smb", "mobile-aso-apps", "Workflows", "for-ecommerce", "video-marketing", "Brand",
  "LeadGen", "Toolkits", "most-popular", "new",
];

export function collection(slug: string): AppStoreData {
  const nice = slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { mode: "collection", title: `${nice} apps`, description: `A curated collection of apps for ${nice.toLowerCase()}.`, categories: storeCategories, apps: [] };
}

export const appFeaturedSlugs: string[] = [];

/* ---------- Home ---------- */
/** 실제 폴더는 서버(src/server/home.ts)가 내려준다. 이 기본값은 빈 상태다. */
export const appHome: AppHomeData = {
  folders: [],
};
