import type {
  AnalysisPageData,
  AppLandingData,
  AppWorkspaceData,
  AppEditorData,
  AppStoreData,
  AppHomeData,
} from "@/types/app";
import { makeKpis, makeSeries, makeRows, columnPresets } from "./mock/generators";

/** 로그인 앱 페이지 데이터. 인벤토리 도구 목록 + 대표 목데이터. */

const COUNTRY = { label: "Country", options: ["United States", "United Kingdom", "Germany", "Global"] };
const PERIOD = { label: "Period", options: ["Last 30 days", "Last 90 days", "Last 12 months"] };
const DEVICE = { label: "Device", options: ["All devices", "Desktop", "Mobile"] };

type Preset = keyof typeof columnPresets;

function analysis(cfg: {
  toolkit: string;
  href: string;
  name: string;
  desc: string;
  entityLabel?: string;
  entity?: string;
  preset: Preset;
  kpis: string[];
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
    entityValue: cfg.entity ?? "northwind.example",
    filters: [COUNTRY, PERIOD, DEVICE],
    kpis: makeKpis(cfg.href, cfg.kpis),
    chartTitle: cfg.chartTitle,
    chartType: cfg.chartType ?? "line",
    series: makeSeries(cfg.href, 12, 5000, true),
    seriesLegend: cfg.legend ?? ["This domain", "Competitor"],
    tableTitle: cfg.tableTitle,
    columns: columnPresets[cfg.preset],
    rows: makeRows(cfg.href, cfg.preset, 10),
    tabs: cfg.tabs,
  };
}

/* ---------- SEO analysis ---------- */
export const seoAnalysis: Record<string, AnalysisPageData> = {
  "/analytics/overview/": analysis({ toolkit: "seo", href: "/analytics/overview/", name: "Domain Overview", desc: "A snapshot of any domain's visibility across search, ads, and backlinks.", preset: "keywords", kpis: ["Authority Score", "Organic Traffic", "Organic Keywords", "Backlinks", "Paid Keywords"], chartTitle: "Organic traffic trend", tableTitle: "Top organic keywords", tabs: ["Overview", "Organic", "Paid", "Backlinks"] }),
  "/analytics/organic/overview": analysis({ toolkit: "seo", href: "/analytics/organic/overview", name: "Organic Research", desc: "Analyze a domain's organic keywords, positions, and competitors.", preset: "keywords", kpis: ["Organic Traffic", "Keywords", "Traffic Cost", "Branded %"], chartTitle: "Organic positions over time", tableTitle: "Organic keywords" }),
  "/analytics/toppages/": analysis({ toolkit: "seo", href: "/analytics/toppages/", name: "Top Pages", desc: "See which pages drive the most organic traffic.", preset: "pages", kpis: ["Pages", "Total Traffic", "Avg Keywords", "Top Page Share"], chartTitle: "Traffic by page", chartType: "bar", tableTitle: "Top pages" }),
  "/analytics/comparedomains/": analysis({ toolkit: "seo", href: "/analytics/comparedomains/", name: "Compare Domains", desc: "Compare visibility metrics across multiple domains.", preset: "domains", kpis: ["Domains", "Avg Authority", "Keyword Overlap", "Traffic Gap"], chartTitle: "Visibility comparison", chartType: "bar", tableTitle: "Domain comparison" }),
  "/analytics/keywordgap/": analysis({ toolkit: "seo", href: "/analytics/keywordgap/", name: "Keyword Gap", desc: "Find keywords your competitors rank for and you don't.", preset: "keywords", kpis: ["Shared", "Missing", "Weak", "Untapped"], chartTitle: "Keyword overlap", tableTitle: "Gap keywords" }),
  "/analytics/gap/backlinks/": analysis({ toolkit: "seo", href: "/analytics/gap/backlinks/", name: "Backlink Gap", desc: "Discover link opportunities your competitors already have.", preset: "domains", kpis: ["Prospects", "Shared Links", "Best Match", "Avg Authority"], chartTitle: "Referring domains gap", chartType: "bar", tableTitle: "Link prospects" }),
  "/analytics/keywordoverview/": analysis({ toolkit: "seo", href: "/analytics/keywordoverview/", name: "Keyword Overview", desc: "Volume, difficulty, intent, and SERP for any keyword.", entityLabel: "Keyword", entity: "marketing platform", preset: "keywords", kpis: ["Volume", "KD %", "CPC", "Results"], chartTitle: "Search volume trend", tableTitle: "Keyword variations" }),
  "/analytics/keywordmagic/": analysis({ toolkit: "seo", href: "/analytics/keywordmagic/", name: "Keyword Magic Tool", desc: "Explore millions of keyword ideas from a seed keyword.", entityLabel: "Keyword", entity: "seo tools", preset: "keywords", kpis: ["Total Keywords", "Questions", "Avg Volume", "Avg KD"], chartTitle: "Keyword groups", chartType: "bar", tableTitle: "Keyword ideas", tabs: ["All", "Questions", "Broad match", "Related"] }),
  "/analytics/backlinks/overview/": analysis({ toolkit: "seo", href: "/analytics/backlinks/overview/", name: "Backlinks", desc: "Explore any domain's backlink profile.", preset: "backlinks", kpis: ["Backlinks", "Referring Domains", "Authority Score", "Follow %"], chartTitle: "New vs lost backlinks", chartType: "area", tableTitle: "Backlinks" }),
  "/analytics/refdomains/report/": analysis({ toolkit: "seo", href: "/analytics/refdomains/report/", name: "Referring Domains", desc: "Analyze the quality and trend of referring domains.", preset: "domains", kpis: ["Referring Domains", "New", "Lost", "Avg Authority"], chartTitle: "Referring domains trend", chartType: "area", tableTitle: "Referring domains" }),
  "/analytics/ranks/rank/": analysis({ toolkit: "seo", href: "/analytics/ranks/rank/", name: "Semrush Rank", desc: "The most visible domains ranked by organic traffic.", preset: "domains", kpis: ["Ranked Domains", "Avg Traffic", "Top Country", "Movers"], chartTitle: "Rank distribution", chartType: "bar", tableTitle: "Top ranked domains" }),
  "/topic-research/": analysis({ toolkit: "seo", href: "/topic-research/", name: "Topic Research", desc: "Find subtopics, questions, and headlines for any topic.", entityLabel: "Topic", entity: "ai search", preset: "keywords", kpis: ["Subtopics", "Questions", "Avg Volume", "Difficulty"], chartTitle: "Topic interest", tableTitle: "Subtopic ideas" }),
};

/* ---------- AI Visibility analysis ---------- */
export const aiAnalysis: Record<string, AnalysisPageData> = {
  "/ai-seo/competitor-research/": analysis({ toolkit: "ai", href: "/ai-seo/competitor-research/", name: "Competitor Research", desc: "Compare brand mentions and citations across AI engines.", preset: "domains", kpis: ["Share of Voice", "Mentions", "Citations", "Gap"], chartTitle: "Share of voice", chartType: "area", tableTitle: "Competitor mentions", legend: ["Your brand", "Competitor"] }),
  "/ai-seo/prompt-research/": analysis({ toolkit: "ai", href: "/ai-seo/prompt-research/", name: "Prompt Research", desc: "Discover the prompts your audience asks AI engines.", entityLabel: "Topic", entity: "marketing tools", preset: "keywords", kpis: ["Prompts", "Your Appearances", "Avg Position", "Coverage"], chartTitle: "Prompt appearances", tableTitle: "Prompts" }),
  "/ai-seo/brand-performance/": analysis({ toolkit: "ai", href: "/ai-seo/brand-performance/", name: "Brand Performance", desc: "Track mentions, sentiment, and platform coverage.", preset: "traffic", kpis: ["Mentions", "Positive %", "Neutral %", "Negative %"], chartTitle: "Mentions by platform", chartType: "bar", tableTitle: "Platform breakdown" }),
  "/ai-seo/perception/": analysis({ toolkit: "ai", href: "/ai-seo/perception/", name: "Perception", desc: "How AI models describe your brand.", preset: "keywords", kpis: ["Themes", "Positive", "Neutral", "Negative"], chartTitle: "Perception over time", chartType: "area", tableTitle: "Perception themes" }),
  "/ai-seo/narrative-drivers/": analysis({ toolkit: "ai", href: "/ai-seo/narrative-drivers/", name: "Narrative Drivers", desc: "The sources shaping how AI describes your brand.", preset: "domains", kpis: ["Sources", "Influence Score", "New Sources", "Coverage"], chartTitle: "Source influence", chartType: "bar", tableTitle: "Narrative sources" }),
  "/ai-seo/questions/": analysis({ toolkit: "ai", href: "/ai-seo/questions/", name: "Questions", desc: "Questions people ask AI about your brand and category.", preset: "keywords", kpis: ["Questions", "Answered", "Your Coverage", "Opportunities"], chartTitle: "Question volume", tableTitle: "Questions" }),
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
    analysis({ toolkit: "traffic", href: `/analytics/traffic/${slug}/`, name, desc, preset: "traffic", kpis: ["Visits", "Unique Visitors", "Pages / Visit", "Avg Duration", "Bounce Rate"], chartTitle: "Traffic trend", chartType: "area", tableTitle: "Traffic by source", legend: ["This site", "Competitor"] }),
  ]),
);
export const trafficSlugs = trafficSeeds.map((s) => s[0]);

/* ---------- Ads / PR / Social / Local / Content analysis ---------- */
export const otherAnalysis: Record<string, AnalysisPageData> = {
  "/analytics/adwords/positions/": analysis({ toolkit: "advertising", href: "/analytics/adwords/positions/", name: "Advertising Research", desc: "Competitor paid search keywords and ad copy.", preset: "keywords", kpis: ["Paid Keywords", "Traffic", "Traffic Cost", "Ads"], chartTitle: "Paid positions", tableTitle: "Paid keywords" }),
  "/analytics/pla/positions/": analysis({ toolkit: "advertising", href: "/analytics/pla/positions/", name: "PLA Research", desc: "Competitor shopping ads and product listings.", preset: "keywords", kpis: ["PLA Keywords", "Products", "Avg Price", "Sellers"], chartTitle: "PLA positions", chartType: "bar", tableTitle: "Product listing ads" }),
  "/pr-toolkit/ai-cited-media/": analysis({ toolkit: "pr", href: "/pr-toolkit/ai-cited-media/", name: "AI-Cited Media", desc: "Media outlets most cited by AI engines.", preset: "domains", kpis: ["Outlets", "Citations", "New", "Reach"], chartTitle: "Citations over time", chartType: "area", tableTitle: "Cited outlets" }),
  "/pr-toolkit/media-database/": analysis({ toolkit: "pr", href: "/pr-toolkit/media-database/", name: "Media Database", desc: "Search journalists and outlets by beat and region.", entityLabel: "Beat", entity: "technology", preset: "domains", kpis: ["Contacts", "Outlets", "Beats", "Regions"], chartTitle: "Contacts by beat", chartType: "bar", tableTitle: "Journalists & outlets" }),
  "/pr-toolkit/media-monitoring/": analysis({ toolkit: "pr", href: "/pr-toolkit/media-monitoring/", name: "Media Monitoring", desc: "Track brand and keyword mentions across media.", entityLabel: "Query", entity: "your brand", preset: "traffic", kpis: ["Mentions", "Reach", "Sentiment", "Sources"], chartTitle: "Mentions trend", chartType: "area", tableTitle: "Recent mentions" }),
  "/media-monitoring/": analysis({ toolkit: "social", href: "/media-monitoring/", name: "Media Monitoring", desc: "Monitor mentions across social and the web.", entityLabel: "Query", entity: "your brand", preset: "traffic", kpis: ["Mentions", "Reach", "Engagement", "Sentiment"], chartTitle: "Mentions trend", chartType: "area", tableTitle: "Recent mentions" }),
  "/map-rank-tracker/": analysis({ toolkit: "local", href: "/map-rank-tracker/", name: "Map Rank Tracker", desc: "Track local map rankings across a geo grid.", entityLabel: "Business", entity: "Contoso Cafe", preset: "keywords", kpis: ["Avg Rank", "Grid Points", "Top 3 %", "Change"], chartTitle: "Average map rank", tableTitle: "Ranking by keyword" }),
  "/content/topic-finder/": analysis({ toolkit: "content", href: "/content/topic-finder/", name: "Topic Finder", desc: "Find content ideas by domain, topic, and region.", entityLabel: "Topic", entity: "content marketing", preset: "keywords", kpis: ["Ideas", "Questions", "Avg Volume", "Difficulty"], chartTitle: "Topic interest", tableTitle: "Content ideas" }),
};

/* ---------- Social tool modes (?tool=) ---------- */
export const socialModes: Record<string, AnalysisPageData> = {
  tracker: analysis({ toolkit: "social", href: "/social-media/?tool=tracker", name: "Social Tracker", desc: "Compare your social accounts against competitors.", entityLabel: "Account", entity: "@contoso", preset: "traffic", kpis: ["Followers", "Engagement", "Posts", "Growth"], chartTitle: "Follower growth", chartType: "area", tableTitle: "Account comparison", legend: ["You", "Competitor"] }),
  "content-insights": analysis({ toolkit: "social", href: "/social-media/?tool=content-insights", name: "Social Content Insights", desc: "See which posts and formats perform best.", entityLabel: "Account", entity: "@contoso", preset: "pages", kpis: ["Posts", "Avg Engagement", "Best Format", "Reach"], chartTitle: "Engagement by post", chartType: "bar", tableTitle: "Top posts" }),
  analytics: analysis({ toolkit: "social", href: "/social-media/?tool=analytics", name: "Social Analytics", desc: "Channel KPIs and reporting across platforms.", entityLabel: "Account", entity: "@contoso", preset: "traffic", kpis: ["Impressions", "Engagement", "Clicks", "Followers"], chartTitle: "Channel performance", chartType: "area", tableTitle: "Platform breakdown" }),
};

/* ---------- Landings ---------- */
function landing(toolkit: string, href: string, title: string, description: string, features: [string, string][], input?: [string, string, string]): AppLandingData {
  return {
    toolkit,
    activeHref: href,
    title,
    description,
    inputLabel: input?.[0],
    inputPlaceholder: input?.[1],
    submitLabel: input?.[2],
    features: features.map(([t, b]) => ({ title: t, body: b })),
  };
}

export const landings: Record<string, AppLandingData> = {
  seo: landing("seo", "/seo/", "SEO Dashboard", "Track your site's health, rankings, and opportunities in one place.", [["Site Audit", "Find and fix technical issues."], ["Position Tracking", "Monitor rankings daily."], ["Keyword Research", "Discover new opportunities."]], ["Domain", "Enter a domain", "Analyze"]),
  ai: landing("ai", "/ai-seo/overview/", "AI Visibility Overview", "Measure and grow how AI engines cite your brand.", [["Prompt Research", "See what your audience asks AI."], ["Brand Performance", "Track mentions and sentiment."], ["Growth Actions", "Prioritized steps to improve."]], ["Domain", "Enter a domain", "Analyze"]),
  traffic: landing("traffic", "/analytics/traffic/", "Traffic & Market Dashboard", "Analyze traffic and market share for any website.", [["Traffic Analytics", "Visits, channels, and engagement."], ["Market Overview", "Size and share of your market."], ["Competitor Monitoring", "Track changes over time."]], ["Domain", "Enter a domain", "Analyze"]),
  local: landing("local", "/local-business/", "Local Dashboard", "Manage listings, reviews, and local rankings.", [["Listing Management", "Sync your business info."], ["Review Management", "Collect and respond to reviews."], ["Map Rank Tracker", "Track local rankings."]], ["Business", "Enter a business name", "Continue"]),
  content: landing("content", "/content/", "Content Dashboard", "Plan, create, and optimize content that performs.", [["AI Article Generator", "Draft long-form content fast."], ["Content Optimizer", "Improve SEO and readability."], ["Topic Finder", "Find ideas worth writing."]]),
  advertising: landing("advertising", "/advertising/", "Advertising Dashboard", "Research, create, and optimize your ad campaigns.", [["Ads Launch Assistant", "Build campaigns quickly."], ["Advertising Research", "Study competitor ads."], ["Ads AI Agent", "Get campaign recommendations."]], ["Domain", "Enter a domain", "Analyze"]),
  pr: landing("pr", "/pr-toolkit/", "AI PR Dashboard", "Find media, pitch stories, and monitor coverage.", [["Media Database", "Find the right journalists."], ["My Emails", "Send and track pitches."], ["Media Monitoring", "Track your coverage."]]),
  social: landing("social", "/social-media/", "Social Dashboard", "Publish, track, and analyze across social platforms.", [["Social Poster", "Schedule and publish posts."], ["Social Tracker", "Benchmark competitors."], ["Social Analytics", "Report on performance."]]),
  reportsSuite: landing("reports", "/my_reports/suite", "Reports", "Build branded, automated reports across every channel.", [["200+ widgets", "Mix data from every toolkit."], ["Templates", "Start from proven layouts."], ["White-label", "Add your own branding."]]),
};

/* ---------- Workspaces ---------- */
function workspace(toolkit: string, href: string, title: string, project: string, preset: Preset, issuesTitle: string): AppWorkspaceData {
  return {
    toolkit,
    activeHref: href,
    title,
    projectLabel: project,
    steps: [
      { title: "Connect", done: true },
      { title: "Configure", done: true },
      { title: "Run", done: false },
    ],
    summary: makeKpis(href, ["Score", "Items", "Fixed", "Pending"]),
    issuesTitle,
    issues: [
      { severity: "error", label: "Critical issues to fix", count: 12 },
      { severity: "warning", label: "Warnings to review", count: 34 },
      { severity: "notice", label: "Notices", count: 57 },
    ],
    columns: columnPresets[preset],
    rows: makeRows(href, preset, 8),
    actions: [
      { label: "Re-run", variant: "primary" },
      { label: "Export", variant: "outline" },
    ],
  };
}

export const workspaces: Record<string, AppWorkspaceData> = {
  "/siteaudit/": workspace("seo", "/siteaudit/", "Site Audit", "northwind.example", "pages", "Issues by severity"),
  "/position-tracking/": workspace("seo", "/position-tracking/", "Position Tracking", "northwind.example", "keywords", "Ranking distribution"),
  "/backlink_audit/": workspace("seo", "/backlink_audit/", "Backlink Audit", "northwind.example", "backlinks", "Toxicity review"),
  "/on-page-seo-checker/": workspace("seo", "/on-page-seo-checker/", "On Page SEO Checker", "northwind.example", "pages", "Optimization ideas"),
  "/organic_traffic_insights/": workspace("seo", "/organic_traffic_insights/", "Organic Traffic Insights", "northwind.example", "pages", "Connected data"),
  "/analytics/keywordmanager/": workspace("seo", "/analytics/keywordmanager/", "Keyword Strategy Builder", "northwind.example", "keywords", "Keyword clusters"),
  "/ai-seo/growth-plan/": workspace("ai", "/ai-seo/growth-plan/", "Growth Actions", "northwind.example", "pages", "Prioritized actions"),
  "/analytics/traffic/competitor-monitoring/": workspace("traffic", "/analytics/traffic/competitor-monitoring/", "Competitor Monitoring", "northwind.example", "domains", "Tracked competitors"),
  "/listings-management/": workspace("local", "/listings-management/", "Listing Management", "Contoso Cafe", "domains", "Listing status"),
  "/review-management/": workspace("local", "/review-management/", "Review Management", "Contoso Cafe", "pages", "Recent reviews"),
  "/gbp-optimization/": workspace("local", "/gbp-optimization/", "GBP Optimization", "Contoso Cafe", "pages", "Profile checklist"),
  "/gbp-ai-agent/": workspace("local", "/gbp-ai-agent/", "GBP AI Agent", "Contoso Cafe", "pages", "Automated tasks"),
  "/content/articles/": workspace("content", "/content/articles/", "My Content", "Workspace", "pages", "Content status"),
  "/advertising/ads-ai-agent": workspace("advertising", "/advertising/ads-ai-agent", "Ads AI Agent", "northwind.example", "keywords", "Recommendations"),
  "/pr-toolkit/media-lists/": workspace("pr", "/pr-toolkit/media-lists/", "Media Lists", "Workspace", "domains", "Saved contacts"),
  "/pr-toolkit/emails": workspace("pr", "/pr-toolkit/emails", "My Emails", "Workspace", "pages", "Pitch status"),
  "/pr-toolkit/emails/settings/senders/": workspace("pr", "/pr-toolkit/emails/settings/senders/", "Senders & Domains", "Workspace", "domains", "Sender setup"),
  "/pr-toolkit/media-monitoring/emails/": workspace("pr", "/pr-toolkit/media-monitoring/emails/", "Alerts & Summaries", "Workspace", "pages", "Alert rules"),
  "/my_reports/grid/": workspace("reports", "/my_reports/grid/", "My Reports", "Workspace", "pages", "Report status"),
};

/* ---------- Editors ---------- */
function editor(toolkit: string, href: string, title: string, fields: [string, string, string?][], preview: string[]): AppEditorData {
  return {
    toolkit,
    activeHref: href,
    title,
    briefFields: fields.map(([label, type, placeholder]) => ({ label, type, placeholder })),
    scoreLabel: "Optimization score",
    score: 72,
    suggestions: [
      { label: "Add target keyword to title", status: "ok" },
      { label: "Improve readability", status: "todo" },
      { label: "Add 2 internal links", status: "todo" },
      { label: "Meta description length", status: "ok" },
    ],
    previewTitle: title + " draft",
    previewBody: preview,
    actions: [
      { label: "Save", variant: "outline" },
      { label: "Publish", variant: "primary" },
    ],
  };
}

const draft = [
  "This is a representative draft used to demonstrate the editor layout and interactions.",
  "The editor pairs a brief panel with a live preview and a real-time optimization score.",
  "Suggestions on the right update as you edit, guiding you toward a stronger result.",
];

export const editors: Record<string, AppEditorData> = {
  "/swa/": editor("seo", "/swa/", "SEO Writing Assistant", [["Target keywords", "text", "e.g. seo tools"], ["Tone of voice", "select"], ["Audience", "text"]], draft),
  "/content/articles/create/": editor("content", "/content/articles/create/", "AI Article Generator", [["Topic", "text", "What is this about?"], ["Brand voice", "select"], ["Length", "select"]], draft),
  "/content/articles/optimize/": editor("content", "/content/articles/optimize/", "Content Optimizer", [["Target URL", "text"], ["Target keyword", "text"], ["Competitors", "textarea"]], draft),
  "/content/articles/repurpose/": editor("content", "/content/articles/repurpose/", "Content Repurposing", [["Source content", "textarea"], ["Convert to", "select"], ["Tone", "select"]], draft),
  "/content/briefs/create/": editor("content", "/content/briefs/create/", "SEO Brief Generator", [["Keyword", "text"], ["Location", "select"], ["Competitors", "textarea"]], draft),
  "/advertising/ads-launch-assistant": editor("advertising", "/advertising/ads-launch-assistant", "Ads Launch Assistant", [["Product / URL", "text"], ["Goal", "select"], ["Budget", "text"]], draft),
};

/* ---------- Reports constructor modes ---------- */
export const reportEditors: Record<string, AppEditorData> = {
  base: editor("reports", "/my_reports/constructor", "Report Builder", [["Report name", "text"], ["Date range", "select"], ["Data sources", "textarea"]], ["Drag widgets from the panel to build your report.", "Mix data from every toolkit in a single branded document."]),
  ga4: editor("reports", "/my_reports/constructor", "Google Analytics 4 Report", [["GA4 property", "select"], ["Date range", "select"], ["Metrics", "textarea"]], ["A representative GA4 report template.", "Connect your property to populate live data."]),
  gsc: editor("reports", "/my_reports/constructor", "Google Search Console Report", [["GSC property", "select"], ["Date range", "select"], ["Dimensions", "textarea"]], ["A representative Search Console report template."]),
  monthly: editor("reports", "/my_reports/constructor", "Monthly SEO Report", [["Domain", "text"], ["Month", "select"], ["Sections", "textarea"]], ["A representative monthly SEO report template."]),
  themes: editor("reports", "/my_reports/constructor", "Report Themes", [["Brand color", "text"], ["Logo", "text"], ["Font", "select"]], ["Apply white-label branding to your reports."]),
  integrations: editor("reports", "/my_reports/constructor", "Report Templates & Integrations", [["Integration", "select"], ["Template", "select"], ["Schedule", "select"]], ["Choose a template or connect an integration to begin."]),
};

/* ---------- App Store ---------- */
const storeApps = [
  { name: "AdClarity", category: "Advertising", blurb: "Display, social, and video advertising intelligence.", price: "From $199/mo", rating: 4.6 },
  { name: "SERP Gap Analyzer", category: "SEO", blurb: "Find content gaps against the top-ranking pages.", price: "From $29/mo", rating: 4.4 },
  { name: "CallRail", category: "LeadGen", blurb: "Call tracking and lead attribution.", price: "From $45/mo", rating: 4.7 },
  { name: "Influencer Analytics", category: "Social", blurb: "Discover and vet influencers for campaigns.", price: "From $169/mo", rating: 4.3 },
  { name: "Exploding Topics", category: "Research", blurb: "Spot trending topics before they take off.", price: "From $39/mo", rating: 4.5 },
  { name: "AdCreative.ai", category: "Advertising", blurb: "Generate ad creatives with AI.", price: "From $29/mo", rating: 4.2 },
  { name: "Local Rank Tracker", category: "Local", blurb: "Track local pack rankings by location.", price: "From $19/mo", rating: 4.1 },
  { name: "Content Sync", category: "Content", blurb: "Publish content to your CMS in one click.", price: "Free", rating: 4.0 },
  { name: "Backlink Monitor", category: "SEO", blurb: "Get alerts when links are gained or lost.", price: "From $15/mo", rating: 4.3 },
];

const storeCategories = ["All", "SEO", "Advertising", "Social", "Content", "Local", "Research", "LeadGen"];

export function storeCatalog(title: string, description: string, mode: AppStoreData["mode"] = "store"): AppStoreData {
  return { mode, title, description, categories: storeCategories, apps: storeApps };
}

export const appStorePages: Record<string, AppStoreData> = {
  store: storeCatalog("App Center", "Extend the platform with apps built by Semrush and partners."),
  "my-apps": { mode: "my-apps", title: "My Apps", description: "Manage your installed and subscribed apps.", apps: storeApps.slice(0, 4) },
};

export function appDetail(slug: string): AppStoreData {
  const found = storeApps.find((a) => a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").includes(slug.split("-")[0])) ?? storeApps[0];
  return {
    mode: "detail",
    title: found.name,
    description: found.blurb,
    apps: storeApps.filter((a) => a.category === found.category && a.name !== found.name).slice(0, 3),
    detail: {
      name: found.name,
      blurb: found.blurb,
      longDescription: [
        `${found.name} is a representative App Center listing used to demonstrate the app detail layout.`,
        "It shows the description, features, ratings, and an install card with pricing.",
      ],
      price: found.price,
      features: ["One-click install", "Data synced with your projects", "Team access", "Regular updates"],
    },
  };
}

export const collectionSlugs = [
  "seo", "social-media", "content-creation", "advertising", "ai-apps", "competitor-analysis",
  "smb", "mobile-aso-apps", "Workflows", "for-ecommerce", "video-marketing", "Brand",
  "LeadGen", "Toolkits", "most-popular", "new",
];

export function collection(slug: string): AppStoreData {
  const nice = slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { mode: "collection", title: `${nice} apps`, description: `A curated collection of apps for ${nice.toLowerCase()}.`, categories: storeCategories, apps: storeApps };
}

export const appFeaturedSlugs = [
  "adclarity-advertising-intelligence",
  "serp-gap-analyzer",
  "callrail",
  "influencer-marketing-platform",
  "exploding-topics",
  "adcreative-ai",
];

/* ---------- Home ---------- */
export const appHome: AppHomeData = {
  folders: [
    { name: "My websites", sites: 4 },
    { name: "Client projects", sites: 9, shared: true },
    { name: "Competitors", sites: 6 },
    { name: "Local businesses", sites: 3 },
  ],
};
