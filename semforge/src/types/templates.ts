/** 페이지 템플릿 데이터 계약. 모든 PUB-* / APP-* 페이지가 이 타입을 인스턴스화한다. */

export interface CtaLink {
  label: string;
  href: string;
  variant?: "primary" | "accent" | "outline" | "dark";
}

export interface FeatureItem {
  title: string;
  body: string;
  icon?: string;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface StatItem {
  value: string;
  label: string;
}

export interface TestimonialItem {
  quote: string;
  author: string;
  role: string;
}

/** PUB-DETAIL: 기능/제품 상세 랜딩 */
export interface DetailPageData {
  eyebrow?: string;
  title: string;
  subtitle: string;
  primaryCta: CtaLink;
  secondaryCta?: CtaLink;
  heroImage?: string;
  benefits: FeatureItem[];
  showcase?: { heading: string; body: string; image: string }[];
  connectedTools?: { label: string; href: string }[];
  stats?: StatItem[];
  testimonials?: TestimonialItem[];
  faqs?: FaqItem[];
  finalCta?: { heading: string; cta: CtaLink };
}

/** PUB-SOLUTION: 역할/문제/산업 솔루션 */
export interface SolutionPageData {
  eyebrow?: string;
  title: string;
  subtitle: string;
  primaryCta: CtaLink;
  problems?: FeatureItem[];
  workflow?: { step: string; title: string; body: string }[];
  recommendedFeatures?: { label: string; href: string; body: string }[];
  stats?: StatItem[];
  testimonials?: TestimonialItem[];
  faqs?: FaqItem[];
}

/** PUB-HUB: 카탈로그/허브 */
export interface HubCard {
  title: string;
  body?: string;
  href: string;
  tag?: string;
  image?: string;
}
export interface HubPageData {
  eyebrow?: string;
  title: string;
  subtitle: string;
  tabs?: string[];
  cards: HubCard[];
  primaryCta?: CtaLink;
}

/** PUB-PRICING */
export interface PricingPlan {
  name: string;
  price: string;
  period?: string;
  tagline: string;
  features: string[];
  cta: CtaLink;
  highlight?: boolean;
}
export interface PricingPageData {
  title: string;
  subtitle: string;
  toolkits?: { label: string; href: string; active?: boolean }[];
  plans: PricingPlan[];
  comparison?: { section: string; rows: { label: string; values: string[] }[] }[];
  faqs?: FaqItem[];
}

/** PUB-TOOL: 무료 인터랙티브 도구 */
export interface ToolPageData {
  eyebrow?: string;
  title: string;
  subtitle: string;
  inputPlaceholder: string;
  inputType?: "url" | "keyword" | "text";
  submitLabel: string;
  resultPreview?: string;
  howItWorks?: FeatureItem[];
  faqs?: FaqItem[];
  relatedTools?: { label: string; href: string }[];
}

/** PUB-CONTENT-LIST: Blog/KB/Academy 목록 */
export interface ContentListData {
  title: string;
  subtitle?: string;
  categories?: string[];
  featured?: HubCard;
  posts: HubCard[];
  variant?: "blog" | "kb" | "academy" | "news" | "stories" | "webinars";
}

/** PUB-CONTENT-DETAIL: 글/문서/강의 상세 */
export interface ContentDetailData {
  category?: string;
  title: string;
  author?: string;
  date?: string;
  readingTime?: string;
  toc?: string[];
  body: { type: "p" | "h2" | "h3" | "ul" | "quote"; text?: string; items?: string[] }[];
  related?: HubCard[];
}

/** PUB-CORP: 회사/문의/법률 */
export interface CorpPageData {
  title: string;
  subtitle?: string;
  variant?: "about" | "contact" | "sales" | "legal" | "partners";
  body?: { type: "p" | "h2" | "h3" | "ul"; text?: string; items?: string[] }[];
  stats?: StatItem[];
  form?: { fields: { label: string; type: string; name: string }[]; submit: string };
  faqs?: FaqItem[];
}

/** PUB-AUTH: 로그인/가입 */
export interface AuthPageData {
  mode: "login" | "signup";
  title: string;
  subtitle?: string;
  submitLabel: string;
  altPrompt: { text: string; linkLabel: string; href: string };
}

export interface PageMeta {
  id: string;
  title: string;
  description?: string;
}
