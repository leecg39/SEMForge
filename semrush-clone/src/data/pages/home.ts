/**
 * PUB-001 홈 콘텐츠.
 * UI/UX 구조 재현용 대표/플레이스홀더 콘텐츠 (원본 마케팅 카피를 그대로 옮기지 않음).
 * 로고/이미지는 중립 플레이스홀더 에셋(public/logos, public/toolkits, public/images).
 */

export const heroData = {
  title: "Grow your visibility everywhere search happens",
  subtitle:
    "One platform to measure and grow how your brand shows up across search, AI answers, and social.",
  inputPlaceholder: "Enter your website",
  country: "US",
  cta: "Get insights",
  demoVideo: "",
  demoPoster: "/images/plg_toolkits.svg",
};

export const logoWall = [
  { name: "Northwind", src: "/logos/Northwind.svg" },
  { name: "Acme", src: "/logos/Acme.svg" },
  { name: "Globex", src: "/logos/Globex.svg" },
  { name: "Initech", src: "/logos/Initech.svg" },
  { name: "Umbrella", src: "/logos/Umbrella.svg" },
  { name: "Hooli", src: "/logos/Hooli.svg" },
  { name: "Contoso", src: "/logos/Contoso.svg" },
  { name: "Vandelay", src: "/logos/Vandelay.svg" },
  { name: "Massive", src: "/logos/Massive.svg" },
  { name: "Stark", src: "/logos/Stark.svg" },
  { name: "Wayne", src: "/logos/Wayne.svg" },
  { name: "Soylent", src: "/logos/Soylent.svg" },
];

export const promoBlocks = [
  {
    id: "semrush-one",
    bg: "#c190ff",
    heading: "Your edge to win every search",
    body: "Unify SEO and AI visibility in a single workspace, built on years of search data.",
    cta: "Try for free",
    href: "/signup/",
    media: "/images/sem_one.svg",
  },
  {
    id: "semrush-mcp",
    bg: "#f3f6f6",
    heading: "Ask AI, get real data",
    body: "Bring live SEO, market, and visibility data into your AI assistant and turn it into actions.",
    cta: "Connect your data",
    href: "/signup/",
    media: "/images/sem_mcp.svg",
  },
  {
    id: "enterprise",
    bg: "image:/images/enterprise_bg.svg",
    heading: "Bigger scale, bigger advantage",
    body: "Dominate brand visibility across markets and domains, everywhere your customers search.",
    cta: "Book a demo",
    href: "/enterprise/",
    media: "/images/enterprise_poster.svg",
  },
];

export const toolkitSlides = [
  { tag: "SEMRUSH ONE", title: "Grow your digital brand visibility", image: "/toolkits/semrush_one_m.svg", alt: "Visibility over time preview" },
  { tag: "SEO", title: "Outrank the rest with better SEO", image: "/toolkits/seo_m.svg", alt: "Site audit insights preview" },
  { tag: "AI VISIBILITY", title: "Get cited by AI answers", image: "/toolkits/ai_visibility_m.svg", alt: "Share of voice preview" },
  { tag: "TRAFFIC AND MARKET", title: "Analyze traffic on any website", image: "/toolkits/traffic_m.svg", alt: "Traffic distribution preview" },
  { tag: "CONTENT", title: "Create search-ready content faster", image: "/toolkits/content_m.svg", alt: "Content workspace preview" },
  { tag: "LOCAL", title: "Own your local presence", image: "/toolkits/local_m.svg", alt: "Local listings preview" },
  { tag: "ADVERTISING", title: "Make every ad dollar work harder", image: "/toolkits/atool_m.svg", alt: "Ad campaign preview" },
  { tag: "AI PR", title: "Build trust through earned press", image: "/toolkits/ai_pr_m.svg", alt: "Media search preview" },
  { tag: "SOCIAL", title: "Manage social in one place", image: "/toolkits/social_m.svg", alt: "Scheduled posts preview" },
];

export const toolkitsSection = {
  label: "SOLUTIONS ( 9 )",
  heading: "GET SEEN. GET CITED. BE THE ANSWER.",
};

export const statsSection = {
  label: "STATS AND FACTS",
  heading: "THE DATA YOU NEED TO OUTRANK THE COMPETITION",
  cta: { label: "Learn more", href: "/stats/" },
  stats: [
    { value: "26B", unit: "Keywords", note: "More keywords means more ways to win." },
    { value: "40T", unit: "Backlinks", note: "Build credibility with a large link database." },
    { value: "800M", unit: "Domain profiles", note: "Market insight at your fingertips." },
    { value: "140", unit: "Geo databases", note: "Coverage all around the world." },
    { value: "280M+", unit: "LLM prompts", note: "Track more prompts, grow faster." },
  ],
};

export const aiVisibilityIndex = {
  label: "AI VISIBILITY INDEX",
  body: "Explore the strategies powering AI search leaders and get clear steps to build your own.",
  cta: { label: "Explore the index", href: "/ext/ai-visibility-index.semrush.com/" },
  tableHead: ["Brand", "Mentions"],
  rows: [
    { brand: "northwind.example", mentions: "1.1M" },
    { brand: "acme.example", mentions: "877K" },
    { brand: "globex.example", mentions: "600K" },
    { brand: "initech.example", mentions: "597K" },
    { brand: "umbrella.example", mentions: "541K" },
    { brand: "hooli.example", mentions: "477K" },
    { brand: "contoso.example", mentions: "468K" },
    { brand: "vandelay.example", mentions: "436K" },
    { brand: "massive.example", mentions: "425K" },
    { brand: "stark.example", mentions: "320K" },
  ],
};

export const testimonialSection = {
  label: "OUR CUSTOMERS",
  heading: "HOW WE HELP MARKETERS WIN",
  logo: "/images/testimonials/brand.svg",
  quote:
    "This platform helped our team work more efficiently and focus on the work that actually moves visibility.",
  author: "Alex Morgan",
  role: "Head of Growth, Contoso",
  stat: { value: "+370%", note: "Increase in share of voice" },
  avatar: "/images/testimonials/avatar.svg",
};

export const resourcesSection = {
  label: "RESOURCES ( 9 )",
  heading: "STAY AHEAD OF WHAT'S NEXT",
  cards: [
    { title: "A unified solution for the AI search era", body: "How unified visibility, competitive insight, and content optimization come together in one workflow.", tags: ["News", "Product Update"], image: "/images/resources/adobe_brand_visibility.svg", href: "/news/" },
    { title: "The AI search operating system", body: "A free playbook to get your brand found, understood, and recommended in AI search.", tags: ["News", "Playbook"], image: "/images/resources/ai_search_os.svg", href: "/news/" },
    { title: "Where ambitious marketers take center stage", body: "Practical strategies, expert feedback, and a community built for marketers who play to win.", tags: ["Spotlight"], image: "/images/resources/spotlight.svg", href: "/academy/webinars/" },
    { title: "New partnership brings search data into the builder", body: "Search intelligence integrated directly into the building experience for faster iteration.", tags: ["News", "Product Update"], image: "/images/resources/semrush_lovable_anouncement.svg", href: "/news/" },
    { title: "Strengthening enterprise brand visibility", body: "How brand visibility, SEO, and AI-driven customer experience come together at scale.", tags: ["News"], image: "/images/resources/adobe_semrush_announcement.svg", href: "/news/" },
    { title: "FAQ for customers", body: "Answers to the most important questions: what changes, what stays the same, and what to expect next.", tags: ["News"], image: "/images/resources/adobe_semrush_announcement_faq.svg", href: "/news/" },
    { title: "Direct access to data inside AI chat", body: "A go-to integration to streamline daily tasks and centralize your data where you work.", tags: ["News", "Product Update"], image: "/images/resources/direct_access.svg", href: "/news/" },
    { title: "How we drive LLM visibility", body: "A systematic approach that nearly tripled AI share of voice, with real data behind it.", tags: ["Blog", "Article"], image: "/images/resources/ai_visibility_share_of_voice.svg", href: "/blog/" },
    { title: "Sharpen your marketing skills with free webinars", body: "A free certification course on how AI is changing search and how to grow your visibility.", tags: ["Academy Course"], image: "/images/resources/free_webinars.svg", href: "/academy/" },
  ],
};
