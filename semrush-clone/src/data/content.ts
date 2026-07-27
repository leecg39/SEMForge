import type { ContentListData, ContentDetailData, HubCard } from "@/types/templates";

/** PUB-CONTENT-LIST / DETAIL. 대표 콘텐츠(원본 글/제목 아님). */

function cards(prefix: string, n: number, tag: string): HubCard[] {
  return Array.from({ length: n }, (_, i) => ({
    title: `${prefix} ${i + 1}: a practical guide`,
    body: "A representative summary of this piece, covering the key ideas and takeaways for marketers.",
    href: "#",
    tag,
    image: "/toolkits/content_m.svg",
  }));
}

export const blogList: ContentListData = {
  title: "Semrush Blog",
  subtitle: "Actionable marketing insights on SEO, content, AI search, and more.",
  categories: ["All", "SEO", "Content Marketing", "AI Search", "Market Research", "News"],
  variant: "blog",
  featured: {
    title: "The state of AI search in 2026",
    body: "How answer engines are changing discovery, and what marketers should do about it.",
    href: "#",
    tag: "Featured",
    image: "/toolkits/ai_visibility_m.svg",
  },
  posts: cards("SEO insight", 9, "SEO"),
};

export const kbList: ContentListData = {
  title: "Knowledge Base",
  subtitle: "Learn how to use every tool, step by step.",
  categories: ["All", "Getting started", "SEO", "AI Visibility", "Reports", "Billing"],
  variant: "kb",
  posts: cards("How to use", 9, "Guide"),
};

export const academyList: ContentListData = {
  title: "Semrush Academy",
  subtitle: "Free courses and certifications to grow your marketing skills.",
  categories: ["Courses", "Resources", "Onboarding"],
  variant: "academy",
  featured: {
    title: "Getting started with Semrush",
    body: "A free beginner course covering the core workflows end to end.",
    href: "#",
    tag: "Course",
    image: "/toolkits/seo_m.svg",
  },
  posts: cards("Course", 9, "Course"),
};

export const webinarsList: ContentListData = {
  title: "Webinars",
  subtitle: "Live and on-demand sessions with marketing experts.",
  categories: ["All", "Upcoming", "On-demand"],
  variant: "webinars",
  posts: cards("Webinar", 6, "On-demand"),
};

export const newsList: ContentListData = {
  title: "Newsroom",
  subtitle: "Product announcements and company news.",
  categories: ["All", "Product", "Company"],
  variant: "news",
  posts: cards("Announcement", 9, "News"),
};

export const storiesList: ContentListData = {
  title: "Success Stories",
  subtitle: "See how teams grow visibility with the platform.",
  categories: ["All", "Agencies", "Ecommerce", "SaaS", "Local"],
  variant: "stories",
  posts: cards("Customer story", 9, "Story"),
};

export const contentLists: Record<string, ContentListData> = {
  blog: blogList,
  kb: kbList,
  academy: academyList,
  webinars: webinarsList,
  news: newsList,
  stories: storiesList,
};

/** 대표 상세 페이지 (CONTENT-DETAIL 템플릿 검증용) */
export const sampleArticle: ContentDetailData = {
  category: "SEO",
  title: "How to build a keyword strategy that compounds",
  author: "Jordan Lee",
  date: "Jul 2026",
  readingTime: "8 min read",
  toc: ["Why strategy beats volume", "Mapping intent", "Building clusters", "Measuring impact"],
  body: [
    { type: "p", text: "A representative article body used to validate the content detail template layout, typography, and spacing." },
    { type: "h2", text: "Why strategy beats volume" },
    { type: "p", text: "Chasing raw search volume rarely compounds. A durable strategy connects keywords to intent and to the pages that serve it." },
    { type: "ul", items: ["Start from audience questions", "Group by intent, not just topic", "Prioritize by opportunity and effort"] },
    { type: "h2", text: "Mapping intent" },
    { type: "p", text: "Intent mapping ensures each page has a clear job. This keeps your site coherent and easier for search and AI engines to understand." },
    { type: "quote", text: "The best keyword strategy is the one your whole team can act on." },
    { type: "h2", text: "Building clusters" },
    { type: "p", text: "Clusters turn scattered keywords into a structure. A pillar page plus supporting pages signals depth and authority." },
    { type: "h2", text: "Measuring impact" },
    { type: "p", text: "Track positions, visibility, and conversions together so you can prove the strategy is working over time." },
  ],
  related: cards("Related read", 3, "SEO"),
};
