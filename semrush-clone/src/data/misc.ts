import type { DetailPageData, ContentDetailData, ContentListData, ToolPageData } from "@/types/templates";

/** 기타 공개 랜딩(PUB-DETAIL), 비교(vs), API 문서(CONTENT), Sensor(TOOL). 모두 대표 문구. */

function detail(title: string, subtitle: string, eyebrow: string): DetailPageData {
  return {
    eyebrow,
    title,
    subtitle,
    primaryCta: { label: "Start free trial", href: "/signup/", variant: "primary" },
    secondaryCta: { label: "Book a demo", href: "/company/sales/", variant: "outline" },
    heroImage: "/toolkits/semrush_one_m.svg",
    benefits: [
      { title: "All-in-one platform", body: "Bring your marketing data together in one connected workspace." },
      { title: "Trusted data", body: "Decisions backed by one of the largest search datasets available." },
      { title: "Built to scale", body: "From solo marketers to enterprise teams, grow without switching tools." },
    ],
    showcase: [
      { heading: "See it in action", body: "A representative walkthrough of the product experience and workflows.", image: "/toolkits/traffic_m.svg" },
    ],
    stats: [
      { value: "10M+", label: "Users" },
      { value: "26B", label: "Keywords" },
      { value: "140", label: "Geo databases" },
    ],
    faqs: [
      { q: `What is ${title}?`, a: subtitle },
      { q: "Is there a free trial?", a: "Yes, you can start with a free trial and upgrade anytime." },
    ],
    finalCta: { heading: "GET STARTED TODAY", cta: { label: "Start free trial", href: "/signup/", variant: "accent" } },
  };
}

export const detailLandings: Record<string, DetailPageData> = {
  one: detail("Semrush One", "SEO and AI visibility unified in one platform, built on years of search intelligence.", "PRODUCT"),
  enterprise: detail("Semrush Enterprise", "Brand visibility at scale for large organizations and complex teams.", "ENTERPRISE"),
  mcp: detail("Semrush MCP", "Bring live Semrush data into your AI assistants through the Model Context Protocol.", "PRODUCT"),
  stats: detail("Our data", "Explore the scale and coverage of the data behind every report.", "DATA"),
  sem: detail("Search Engine Marketing", "Grow visibility across organic and paid search from one platform.", "SEM"),
  "semrush-free-trial": detail("Start your free trial", "Try the full platform free for seven days. Cancel anytime.", "FREE TRIAL"),
  "lp/affiliate-program": detail("Affiliate Program", "Earn by referring new customers to the platform.", "PROGRAM"),
  "lp/enterprise-aio": detail("Enterprise AIO", "AI optimization built for enterprise brand visibility.", "ENTERPRISE"),
  "lp/site-intelligence": detail("Enterprise Site Intelligence", "Deep site and market intelligence for enterprise teams.", "ENTERPRISE"),
  "lp/insights": detail("Insights24", "Consumer and market insights to guide your strategy.", "INSIGHTS"),
  "lp/mfour": detail("Mfour", "Consumer behavior data to sharpen your market decisions.", "INSIGHTS"),
  "lp/semrush-circle": detail("Ambassador Program", "Join our community program and grow with fellow marketers.", "COMMUNITY"),
};

/** vs 비교 (DetailPageData 재사용, 비교 대상만 다름) */
function comparison(competitor: string): DetailPageData {
  return {
    eyebrow: "COMPARE",
    title: `Semrush vs ${competitor}`,
    subtitle: `A representative side-by-side comparison of features, data coverage, and value versus ${competitor}.`,
    primaryCta: { label: "Start free trial", href: "/signup/", variant: "primary" },
    secondaryCta: { label: "See pricing", href: "/pricing/", variant: "outline" },
    benefits: [
      { title: "Broader data", body: "A larger keyword and backlink database for more complete research." },
      { title: "More toolkits", body: "SEO, AI visibility, content, local, PR, and social in one place." },
      { title: "Better reporting", body: "Automated, branded reports across every channel." },
    ],
    stats: [
      { value: "26B", label: "Keywords" },
      { value: "40T", label: "Backlinks" },
      { value: "140", label: "Geo databases" },
    ],
    faqs: [
      { q: `Why choose Semrush over ${competitor}?`, a: `This is a representative comparison highlighting data coverage, toolkits, and reporting versus ${competitor}.` },
      { q: "Can I migrate my data?", a: "Yes, you can set up projects quickly and import where supported." },
    ],
    finalCta: { heading: "TRY IT FREE", cta: { label: "Start free trial", href: "/signup/", variant: "accent" } },
  };
}

export const vsData: Record<string, DetailPageData> = {
  "semrush-vs-moz": comparison("Moz"),
  "semrush-vs-ahrefs": comparison("Ahrefs"),
};

/** API 문서 상세 (CONTENT-DETAIL) */
function apiDoc(title: string, intro: string): ContentDetailData {
  return {
    category: "API",
    title,
    body: [
      { type: "p", text: intro },
      { type: "h2", text: "Getting started" },
      { type: "p", text: "Representative documentation describing authentication and base URLs." },
      { type: "h2", text: "Endpoints" },
      { type: "ul", items: ["List resources", "Retrieve a resource", "Query with parameters"] },
      { type: "h2", text: "Rate limits" },
      { type: "p", text: "Representative description of request limits and quotas." },
    ],
  };
}

export const apiDocs: Record<string, ContentDetailData> = {
  "api-accounts": apiDoc("Accounts API", "Manage account-level access and usage programmatically."),
  "api-analytics": apiDoc("Analytics API", "Access analytics data such as domains, keywords, and backlinks."),
  "api-projects": apiDoc("Projects API", "Create and manage projects and their configurations."),
  "api-use": apiDoc("API Use Guide", "A guide to using the API effectively within limits."),
  bot: apiDoc("Semrush Bot", "How our crawler works and how to manage its access to your site."),
};

export const apiDocumentationList: ContentListData = {
  title: "API Documentation",
  subtitle: "Everything you need to build with the platform's data.",
  categories: ["All", "Accounts", "Analytics", "Projects"],
  variant: "kb",
  posts: [
    { title: "Accounts API", body: "Manage account access and usage.", href: "/api-accounts/", tag: "Accounts" },
    { title: "Analytics API", body: "Access analytics datasets.", href: "/api-analytics/", tag: "Analytics" },
    { title: "Projects API", body: "Manage projects programmatically.", href: "/api-projects/", tag: "Projects" },
    { title: "API Use Guide", body: "Use the API effectively.", href: "/api-use/", tag: "Guide" },
    { title: "API Terms", body: "Terms for API usage.", href: "/api-terms/", tag: "Legal" },
  ],
};

export const sensorTool: ToolPageData = {
  eyebrow: "FREE TOOL",
  title: "Semrush Sensor",
  subtitle: "Track search volatility and spot algorithm changes as they happen.",
  inputPlaceholder: "Select a category",
  inputType: "keyword",
  submitLabel: "View volatility",
  resultPreview: "Sample volatility score. Sign up to track categories and set alerts.",
  howItWorks: [
    { title: "Pick a category", body: "Choose an industry to monitor." },
    { title: "See the score", body: "View daily search volatility on a 0–10 scale." },
    { title: "Get alerts", body: "Create a free account to receive volatility alerts." },
  ],
  faqs: [
    { q: "What does the score mean?", a: "Higher scores indicate more ranking movement, which can signal an algorithm update." },
  ],
  relatedTools: [
    { label: "SERP Checker", href: "/free-tools/serp-checker/" },
    { label: "Position Tracking", href: "/position-tracking/" },
  ],
};
