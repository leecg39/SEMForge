import type { DetailPageData } from "@/types/templates";

/**
 * PUB-DETAIL 기능 상세 13종. 원본 카피를 옮기지 않고,
 * 기능 목적(인벤토리 기준)을 대표 문구로 표현. 시드에서 일관 구조로 확장.
 */

interface FeatureSeed {
  slug: string;
  name: string;
  category: string;
  what: string;
  connected: { label: string; href: string }[];
}

const seeds: FeatureSeed[] = [
  { slug: "ai-visibility", name: "AI Visibility", category: "AI SEARCH", what: "measure and grow how AI engines and answer boxes cite your brand", connected: [{ label: "AI Visibility Overview", href: "/ai-seo/overview/" }, { label: "Prompt Research", href: "/ai-seo/prompt-research/" }] },
  { slug: "backlink-analysis", name: "Backlink Analysis", category: "OFF-SITE SEO", what: "explore any site's link profile and find new link opportunities", connected: [{ label: "Backlinks", href: "/analytics/backlinks/overview/" }, { label: "Backlink Audit", href: "/backlink_audit/" }] },
  { slug: "brand-sentiment", name: "AI Brand Sentiment", category: "AI SEARCH", what: "track how AI models describe and perceive your brand", connected: [{ label: "Brand Performance", href: "/ai-seo/brand-performance/" }, { label: "Perception", href: "/ai-seo/perception/" }] },
  { slug: "competitor-analysis", name: "Competitor Analysis", category: "COMPETITIVE RESEARCH", what: "reveal any competitor's strategy across search, traffic, and ads", connected: [{ label: "Domain Overview", href: "/analytics/overview/" }, { label: "Keyword Gap", href: "/analytics/keywordgap/" }] },
  { slug: "content-marketing", name: "Content Creation", category: "CONTENT", what: "plan, create, and optimize content that ranks and converts", connected: [{ label: "AI Article Generator", href: "/content/articles/create/" }, { label: "Content Optimizer", href: "/content/articles/optimize/" }] },
  { slug: "digital-pr", name: "Digital PR", category: "AI PR", what: "find journalists, pitch stories, and earn coverage that builds authority", connected: [{ label: "Media Database", href: "/pr-toolkit/media-database/" }, { label: "Media Monitoring", href: "/pr-toolkit/media-monitoring/" }] },
  { slug: "keyword-research", name: "Keyword Research", category: "SEO", what: "find the keywords worth ranking for and understand their intent", connected: [{ label: "Keyword Magic Tool", href: "/analytics/keywordmagic/" }, { label: "Keyword Overview", href: "/analytics/keywordoverview/" }] },
  { slug: "local-seo", name: "Local SEO", category: "LOCAL", what: "get found by nearby customers across maps, listings, and reviews", connected: [{ label: "Listing Management", href: "/listings-management/" }, { label: "Map Rank Tracker", href: "/map-rank-tracker/" }] },
  { slug: "market-analysis", name: "Market Analysis", category: "TRAFFIC & MARKET", what: "size any market and understand audience behavior and share", connected: [{ label: "Market Overview", href: "/analytics/traffic/market-overview/" }, { label: "Traffic Analytics", href: "/analytics/traffic/traffic-overview/" }] },
  { slug: "prompt-research", name: "Prompt Research", category: "AI SEARCH", what: "discover the prompts your audience asks AI and where you appear", connected: [{ label: "Prompt Research", href: "/ai-seo/prompt-research/" }, { label: "Competitor Research", href: "/ai-seo/competitor-research/" }] },
  { slug: "rank-tracking", name: "Rank Tracking", category: "SEO", what: "monitor your positions across search and AI results every day", connected: [{ label: "Position Tracking", href: "/position-tracking/" }, { label: "Organic Research", href: "/analytics/organic/overview" }] },
  { slug: "reports", name: "Marketing Reports", category: "REPORTING", what: "bring every channel into one branded, automated report", connected: [{ label: "My Reports", href: "/my_reports/grid/" }, { label: "Report Builder", href: "/my_reports/constructor" }] },
  { slug: "site-audit", name: "Technical Site Audit", category: "SEO", what: "crawl your site, catch technical issues, and prioritize fixes", connected: [{ label: "Site Audit", href: "/siteaudit/" }, { label: "On Page SEO Checker", href: "/on-page-seo-checker/" }] },
];

function expand(seed: FeatureSeed): DetailPageData {
  const N = seed.name;
  return {
    eyebrow: seed.category,
    title: `${N}: ${seed.what}`,
    subtitle: `Use ${N} to ${seed.what}. Turn insight into action with data trusted by marketing teams worldwide.`,
    primaryCta: { label: "Start free trial", href: "/signup/", variant: "primary" },
    secondaryCta: { label: "Book a demo", href: "/company/sales/", variant: "outline" },
    heroImage: `/toolkits/${["seo_m", "ai_visibility_m", "traffic_m", "content_m"][seed.slug.length % 4]}.svg`,
    benefits: [
      { title: "See the full picture", body: `Get a complete view so you can ${seed.what} without switching tools.` },
      { title: "Act on clear priorities", body: "Every report highlights what matters most so your team knows the next step." },
      { title: "Track progress over time", body: "Monitor changes, benchmark competitors, and prove the impact of your work." },
    ],
    showcase: [
      { heading: `Everything you need for ${N.toLowerCase()}`, body: `A focused workspace to ${seed.what}, with filters, comparisons, and exports built in.`, image: "/toolkits/seo_m.svg" },
      { heading: "Built to fit your workflow", body: "Save projects, schedule updates, and share results with your team or clients.", image: "/toolkits/traffic_m.svg" },
    ],
    connectedTools: seed.connected,
    stats: [
      { value: "26B", label: "Keywords tracked" },
      { value: "800M", label: "Domain profiles" },
      { value: "140", label: "Geo databases" },
    ],
    testimonials: [
      { quote: `${N} gave our team the clarity we were missing and made reporting effortless.`, author: "Jordan Lee", role: "Marketing Lead" },
      { quote: "We finally have one source of truth for our whole team to rally around.", author: "Sam Rivera", role: "SEO Manager" },
    ],
    faqs: [
      { q: `What is ${N}?`, a: `${N} is a toolset that helps you ${seed.what}, so you can make faster, more confident decisions.` },
      { q: `Do I need a paid plan to use ${N}?`, a: "You can explore core features on a free trial. Advanced limits and exports are available on paid plans." },
      { q: "How often is the data updated?", a: "Datasets refresh regularly, and tracked projects can update daily depending on your plan." },
    ],
    finalCta: { heading: `GET STARTED WITH ${N.toUpperCase()}`, cta: { label: "Start free trial", href: "/signup/", variant: "accent" } },
  };
}

export const featuresData: Record<string, DetailPageData> = Object.fromEntries(
  seeds.map((s) => [s.slug, expand(s)]),
);

export const featureSlugs = seeds.map((s) => s.slug);
