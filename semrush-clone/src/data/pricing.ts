import type { PricingPageData, PricingPlan } from "@/types/templates";

/** PUB-PRICING 11종. 대표 플랜/가격(예시 수치, 원본 가격 아님). */

const toolkits = [
  { label: "Semrush One", href: "/pricing/semrush-one/" },
  { label: "SEO", href: "/pricing/seo/" },
  { label: "AI Visibility", href: "/pricing/ai/" },
  { label: "Traffic & Market", href: "/pricing/traffic-and-market/" },
  { label: "Local", href: "/pricing/local/" },
  { label: "Content", href: "/pricing/content/" },
  { label: "Social", href: "/pricing/social/" },
  { label: "Advertising", href: "/pricing/advertising/" },
  { label: "AI PR", href: "/pricing/pr/" },
  { label: "Enterprise", href: "/pricing/enterprise/" },
];

function plans(base: number, name: string): PricingPlan[] {
  return [
    {
      name: "Starter",
      price: `$${base}`,
      period: "/mo",
      tagline: `Get started with ${name}.`,
      features: ["1 user seat", "5 projects", "Daily updates", "Core reports", "Email support"],
      cta: { label: "Start free trial", href: "/signup/", variant: "outline" },
    },
    {
      name: "Pro+",
      price: `$${base * 2}`,
      period: "/mo",
      tagline: "For growing teams that need more.",
      features: ["3 user seats", "25 projects", "Historical data", "Advanced reports", "Priority support", "API access"],
      cta: { label: "Start free trial", href: "/signup/", variant: "accent" },
      highlight: true,
    },
    {
      name: "Advanced",
      price: `$${base * 4}`,
      period: "/mo",
      tagline: "For agencies and larger teams.",
      features: ["10 user seats", "Unlimited projects", "White-label reports", "Extended limits", "Onboarding", "API access"],
      cta: { label: "Start free trial", href: "/signup/", variant: "outline" },
    },
  ];
}

function make(slug: string, title: string, base: number): PricingPageData {
  return {
    title,
    subtitle: "Choose a plan that fits your team. Upgrade or cancel anytime.",
    toolkits: toolkits.map((t) => ({ ...t, active: t.href.includes(`/pricing/${slug}/`) })),
    plans: plans(base, title),
    comparison: [
      {
        section: "Core",
        rows: [
          { label: "User seats", values: ["1", "3", "10"] },
          { label: "Projects", values: ["5", "25", "Unlimited"] },
          { label: "Keywords tracked", values: ["500", "1,500", "5,000"] },
        ],
      },
      {
        section: "Reporting",
        rows: [
          { label: "Scheduled reports", values: ["–", "✓", "✓"] },
          { label: "White-label", values: ["–", "–", "✓"] },
          { label: "API access", values: ["–", "✓", "✓"] },
        ],
      },
    ],
    faqs: [
      { q: "Can I change plans later?", a: "Yes, you can upgrade or downgrade at any time from your account." },
      { q: "Is there a free trial?", a: "Yes, every plan starts with a free trial. No credit card required to explore." },
      { q: "Do you offer annual billing?", a: "Yes. Annual billing saves you compared to paying monthly." },
    ],
  };
}

export const pricingData: Record<string, PricingPageData> = {
  "semrush-one": make("semrush-one", "Semrush One pricing", 99),
  seo: make("seo", "SEO pricing", 79),
  ai: make("ai", "AI Visibility pricing", 89),
  "traffic-and-market": make("traffic-and-market", "Traffic & Market pricing", 129),
  local: make("local", "Local pricing", 29),
  content: make("content", "Content pricing", 59),
  social: make("social", "Social pricing", 39),
  advertising: make("advertising", "Advertising pricing", 49),
  pr: make("pr", "AI PR pricing", 69),
};

export const pricingHub: PricingPageData = {
  ...make("", "Plans and pricing", 99),
  subtitle: "Pick the toolkit you need, or get everything with Semrush One.",
};

export const pricingEnterprise: PricingPageData = {
  title: "Enterprise pricing",
  subtitle: "Custom plans for large organizations. Talk to our team for a tailored quote.",
  toolkits: toolkits.map((t) => ({ ...t, active: t.href.includes("enterprise") })),
  plans: [
    {
      name: "Enterprise",
      price: "Custom",
      tagline: "Built around your organization's scale and needs.",
      features: ["Unlimited seats", "Custom data limits", "SSO & security review", "Dedicated success manager", "Custom onboarding", "SLA"],
      cta: { label: "Contact sales", href: "/company/sales/", variant: "accent" },
      highlight: true,
    },
  ],
  faqs: [
    { q: "How is Enterprise priced?", a: "Enterprise pricing is tailored to your scale, seats, and data needs. Contact sales for a quote." },
    { q: "Do you support SSO?", a: "Yes, Enterprise plans include SSO and a security review process." },
  ],
};

export const pricingSlugs = Object.keys(pricingData);
