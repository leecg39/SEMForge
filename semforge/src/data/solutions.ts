import type { SolutionPageData } from "@/types/templates";

/**
 * PUB-SOLUTION 25종 (use case / size / role / industry).
 * 원본 카피 대신 대표 문구로 목적을 표현. 시드 → 일관 구조 확장.
 */

interface SolutionSeed {
  slug: string;
  group: "Use case" | "Size" | "Role" | "Industry";
  name: string;
  goal: string;
  features: { label: string; href: string; body: string }[];
}

const F = {
  keyword: { label: "Keyword Research", href: "/features/keyword-research/", body: "Find the terms your audience searches for." },
  audit: { label: "Site Audit", href: "/features/site-audit/", body: "Catch and fix technical issues fast." },
  rank: { label: "Rank Tracking", href: "/features/rank-tracking/", body: "Monitor positions across search and AI." },
  ai: { label: "AI Visibility", href: "/features/ai-visibility/", body: "See where AI engines mention you." },
  content: { label: "Content Creation", href: "/features/content-marketing/", body: "Create content that ranks and converts." },
  local: { label: "Local SEO", href: "/features/local-seo/", body: "Win nearby customers across maps." },
  backlinks: { label: "Backlink Analysis", href: "/features/backlink-analysis/", body: "Grow authority with better links." },
  market: { label: "Market Analysis", href: "/features/market-analysis/", body: "Size markets and understand audiences." },
  pr: { label: "Digital PR", href: "/features/digital-pr/", body: "Earn coverage that builds trust." },
  reports: { label: "Marketing Reports", href: "/features/reports/", body: "Report every channel in one place." },
};

const seeds: SolutionSeed[] = [
  { slug: "search-visibility", group: "Use case", name: "Grow search visibility", goal: "grow your visibility across search engines", features: [F.keyword, F.rank, F.audit] },
  { slug: "ai-visibility", group: "Use case", name: "Get recommended by AI", goal: "get cited and recommended by AI engines", features: [F.ai, F.content, F.pr] },
  { slug: "analyze-competitors-market", group: "Use case", name: "Research your market", goal: "understand your market and competitors", features: [F.market, F.keyword, F.backlinks] },
  { slug: "local-search", group: "Use case", name: "Connect with local customers", goal: "reach customers in your area", features: [F.local, F.rank, F.reports] },
  { slug: "create-content", group: "Use case", name: "Create engaging content", goal: "create content that performs", features: [F.content, F.keyword, F.ai] },
  { slug: "technical-seo", group: "Use case", name: "Fix technical site issues", goal: "keep your site technically healthy", features: [F.audit, F.rank, F.keyword] },
  { slug: "off-site-visibility", group: "Use case", name: "Grow off-site authority", goal: "build authority beyond your own site", features: [F.backlinks, F.pr, F.ai] },
  { slug: "client-strategy", group: "Use case", name: "Build client strategies", goal: "build and prove strategies for clients", features: [F.reports, F.market, F.rank] },
  { slug: "rank-on-google", group: "Use case", name: "Rank on Google", goal: "improve your Google rankings", features: [F.keyword, F.audit, F.rank] },
  { slug: "mid-market", group: "Size", name: "Mid-market", goal: "scale marketing across a growing organization", features: [F.reports, F.market, F.rank] },
  { slug: "small-teams", group: "Size", name: "Small teams", goal: "do more with a lean marketing team", features: [F.keyword, F.content, F.audit] },
  { slug: "solopreneurs", group: "Size", name: "Solopreneurs", goal: "run your whole marketing solo", features: [F.content, F.local, F.keyword] },
  { slug: "freelancers", group: "Size", name: "Freelancers", goal: "deliver results and reports for clients", features: [F.reports, F.keyword, F.audit] },
  { slug: "teams", group: "Size", name: "Teams", goal: "collaborate across a marketing team", features: [F.reports, F.rank, F.content] },
  { slug: "business-owners", group: "Role", name: "Business Owners", goal: "grow your business's online presence", features: [F.local, F.keyword, F.reports] },
  { slug: "agencies", group: "Role", name: "Agencies", goal: "manage many clients efficiently", features: [F.reports, F.rank, F.audit] },
  { slug: "seo-professionals", group: "Role", name: "SEO Professionals", goal: "run advanced SEO workflows", features: [F.audit, F.keyword, F.backlinks] },
  { slug: "content-marketers", group: "Role", name: "Content Marketers", goal: "plan and optimize content at scale", features: [F.content, F.keyword, F.ai] },
  { slug: "growth-marketers", group: "Role", name: "Growth Marketers", goal: "drive full-funnel growth", features: [F.market, F.rank, F.reports] },
  { slug: "professional-services", group: "Industry", name: "Professional Services", goal: "attract high-intent local clients", features: [F.local, F.content, F.reports] },
  { slug: "ecommerce", group: "Industry", name: "Retail & Ecommerce", goal: "win product search and marketplace traffic", features: [F.keyword, F.market, F.rank] },
  { slug: "saas", group: "Industry", name: "SaaS & B2B Tech", goal: "drive pipeline through organic and AI search", features: [F.content, F.ai, F.rank] },
  { slug: "healthcare", group: "Industry", name: "Healthcare", goal: "build trust and local visibility", features: [F.local, F.content, F.audit] },
  { slug: "local-business", group: "Industry", name: "Local Business", goal: "get found by customers nearby", features: [F.local, F.rank, F.reports] },
  { slug: "manufacturing", group: "Industry", name: "Manufacturing", goal: "reach buyers researching online", features: [F.market, F.keyword, F.content] },
];

function expand(seed: SolutionSeed): SolutionPageData {
  return {
    eyebrow: seed.group.toUpperCase(),
    title: seed.name,
    subtitle: `Everything you need to ${seed.goal} — in one connected platform built for measurable results.`,
    primaryCta: { label: "Start free trial", href: "/signup/", variant: "primary" },
    problems: [
      { title: "Scattered tools slow you down", body: "Switching between point tools makes it hard to see the full picture." },
      { title: "Hard to prove impact", body: "Without connected data, it's tough to show what's actually working." },
    ],
    workflow: [
      { step: "1", title: "Set up your project", body: "Add your site and competitors to get a tailored starting point." },
      { step: "2", title: "Find your opportunities", body: `See exactly how to ${seed.goal} with prioritized recommendations.` },
      { step: "3", title: "Track and report", body: "Monitor progress and share branded reports automatically." },
    ],
    recommendedFeatures: seed.features,
    stats: [
      { value: "10M+", label: "Marketers use the platform" },
      { value: "26B", label: "Keywords in the database" },
      { value: "140", label: "Geo databases" },
    ],
    testimonials: [
      { quote: `The platform made it simple to ${seed.goal} and show results to our stakeholders.`, author: "Riley Chen", role: seed.name },
    ],
    faqs: [
      { q: `How does this help me ${seed.goal}?`, a: `You get connected tools and data designed to ${seed.goal}, plus reporting to prove the impact.` },
      { q: "Can I try it before buying?", a: "Yes. Start with a free trial and upgrade when you're ready for higher limits." },
    ],
  };
}

export const solutionsData: Record<string, SolutionPageData> = Object.fromEntries(
  seeds.map((s) => [s.slug, expand(s)]),
);

export const solutionSlugs = seeds.map((s) => s.slug);
