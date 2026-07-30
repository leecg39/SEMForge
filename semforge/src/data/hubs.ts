import type { HubPageData, HubCard } from "@/types/templates";
import { featuresData, featureSlugs } from "./features";
import { solutionsData, solutionSlugs } from "./solutions";
import { toolsData, toolSlugs } from "./tools";

/** PUB-HUB 카탈로그 페이지들. 기존 데이터에서 카드 파생. */

const featureTabMap: Record<string, string> = {
  "keyword-research": "Research", "competitor-analysis": "Research", "market-analysis": "Research",
  "backlink-analysis": "Research", "ai-visibility": "Research", "prompt-research": "Research",
  "content-marketing": "Create & optimize", "site-audit": "Create & optimize", "digital-pr": "Create & optimize",
  "brand-sentiment": "Create & optimize",
  "rank-tracking": "Track", "reports": "Track", "local-seo": "Track",
};

const featureCards: HubCard[] = featureSlugs.map((slug) => ({
  title: featuresData[slug].title.split(":")[0],
  body: featuresData[slug].subtitle,
  href: `/features/${slug}/`,
  tag: featureTabMap[slug] ?? "Research",
  image: featuresData[slug].heroImage,
}));

const solutionCards: HubCard[] = solutionSlugs.map((slug) => ({
  title: solutionsData[slug].title,
  body: solutionsData[slug].subtitle,
  href: `/solutions/${slug}/`,
  tag: solutionsData[slug].eyebrow
    ? solutionsData[slug].eyebrow!.charAt(0) + solutionsData[slug].eyebrow!.slice(1).toLowerCase()
    : "Use case",
}));

const toolCards: HubCard[] = toolSlugs.map((slug) => ({
  title: toolsData[slug].title,
  body: toolsData[slug].subtitle,
  href: `/free-tools/${slug}/`,
  tag: toolsData[slug].inputType === "text" ? "Writing" : "SEO",
}));

export const hubs: Record<string, HubPageData> = {
  features: {
    eyebrow: "FEATURES",
    title: "All the features to grow your visibility",
    subtitle: "Explore the toolkits that help you research, create, and track across every search surface.",
    tabs: ["All", "Research", "Create & optimize", "Track"],
    cards: featureCards,
    primaryCta: { label: "Start free trial", href: "/signup/", variant: "accent" },
  },
  solutions: {
    eyebrow: "SOLUTIONS",
    title: "Solutions for every team and goal",
    subtitle: "Find the right mix of tools for your role, size, industry, and use case.",
    tabs: ["All", "Use case", "Size", "Role", "Industry"],
    cards: solutionCards,
    primaryCta: { label: "Start free trial", href: "/signup/", variant: "accent" },
  },
  "use-cases": {
    eyebrow: "USE CASES",
    title: "Use cases",
    subtitle: "Explore what you can achieve, from search visibility to AI recommendations.",
    tabs: ["All", "Use case"],
    cards: solutionCards.filter((c) => c.tag === "Use case"),
  },
  role: {
    eyebrow: "BY ROLE",
    title: "Solutions by role",
    subtitle: "Tailored workflows for owners, agencies, SEOs, content and growth marketers.",
    tabs: ["All", "Role"],
    cards: solutionCards.filter((c) => c.tag === "Role"),
  },
  industry: {
    eyebrow: "BY INDUSTRY",
    title: "Solutions by industry",
    subtitle: "See how teams in your industry grow visibility and pipeline.",
    tabs: ["All", "Industry"],
    cards: solutionCards.filter((c) => c.tag === "Industry"),
  },
  "free-tools": {
    eyebrow: "FREE TOOLS",
    title: "Free marketing tools",
    subtitle: "Quick, free tools for SEO, content, and AI visibility. No credit card required.",
    tabs: ["All", "SEO", "Writing"],
    cards: toolCards,
    primaryCta: { label: "Create a free account", href: "/signup/", variant: "accent" },
  },
  "ai-writing-tools": {
    eyebrow: "FREE TOOLS",
    title: "AI writing tools",
    subtitle: "Generate, rewrite, and refine text with free AI-powered writing tools.",
    cards: toolCards.filter((c) => c.tag === "Writing"),
  },
  "free-tools-seo": {
    eyebrow: "FREE TOOLS",
    title: "Free SEO tools",
    subtitle: "Check rankings, keywords, authority, and technical health for free.",
    cards: toolCards.filter((c) => c.tag === "SEO"),
  },
  "free-tools-local": {
    eyebrow: "FREE TOOLS",
    title: "Local SEO tools",
    subtitle: "Free tools to help local businesses get found nearby.",
    cards: toolCards.filter((c) => c.tag === "SEO").slice(0, 6),
  },
  vs: {
    eyebrow: "COMPARE",
    title: "Compare SEMForge",
    subtitle: "See how SEMForge stacks up against other tools across features and data.",
    cards: [
      { title: "SEMForge vs Moz", body: "Compare features, data coverage, and pricing.", href: "/vs/semforge-vs-moz/", tag: "Compare" },
      { title: "SEMForge vs Ahrefs", body: "Compare features, data coverage, and pricing.", href: "/vs/semforge-vs-ahrefs/", tag: "Compare" },
    ],
  },
  "website-top": {
    eyebrow: "TOP WEBSITES",
    title: "Top websites by traffic",
    subtitle: "Explore the most visited websites by country and category.",
    cards: ["All categories", "News", "Ecommerce", "Finance", "Technology", "Travel", "Health", "Sports", "Education"].map((c) => ({
      title: c,
      body: "Explore the leading websites in this category.",
      href: "/website/top/",
      tag: "Category",
    })),
  },
  "trending-websites": {
    eyebrow: "TRENDING",
    title: "Trending websites",
    subtitle: "Discover fast-growing websites across countries and industries.",
    cards: ["Global", "United States", "United Kingdom", "Germany", "France", "Japan", "India", "Brazil"].map((c) => ({
      title: c,
      body: "See trending sites in this region.",
      href: "/trending-websites/global/all/",
      tag: "Region",
    })),
  },
  integrations: {
    eyebrow: "PLATFORM",
    title: "Integrations",
    subtitle: "Connect SEMForge with the tools your team already uses.",
    cards: ["Google Analytics 4", "Google Search Console", "Looker Studio", "Google Business Profile", "Google Ads", "Meta Ads", "Zapier", "Slack", "WordPress"].map((c) => ({
      title: c,
      body: `Connect ${c} to sync data and automate reporting.`,
      href: "/company/partner-integrations/",
      tag: "Integration",
    })),
  },
};
