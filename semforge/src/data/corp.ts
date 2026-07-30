import type { CorpPageData } from "@/types/templates";

/** PUB-CORP 회사/문의/법률/파트너 페이지. 대표 문구. */

const contactForm = {
  fields: [
    { label: "Full name", type: "text", name: "name" },
    { label: "Work email", type: "email", name: "email" },
    { label: "Company", type: "text", name: "company" },
    { label: "Company size", type: "select", name: "size" },
    { label: "How can we help?", type: "textarea", name: "message" },
  ],
  submit: "Send message",
};

const legalBody = (title: string) => [
  { type: "p" as const, text: `This is a representative ${title.toLowerCase()} used to demonstrate the legal page layout. It is not a real legal document.` },
  { type: "h2" as const, text: "1. Overview" },
  { type: "p" as const, text: "Placeholder text describing the scope of this document and who it applies to." },
  { type: "h2" as const, text: "2. Your information" },
  { type: "p" as const, text: "Placeholder text describing how information is handled, stored, and used." },
  { type: "h2" as const, text: "3. Your choices" },
  { type: "ul" as const, items: ["Access and update your data", "Manage communication preferences", "Contact us with questions"] },
  { type: "h2" as const, text: "4. Contact" },
  { type: "p" as const, text: "Placeholder contact details for questions about this document." },
];

export const corpData: Record<string, CorpPageData> = {
  company: {
    title: "About us",
    subtitle: "We build tools that help businesses grow their visibility everywhere search happens.",
    variant: "about",
    body: [
      { type: "h2", text: "Our mission" },
      { type: "p", text: "A representative mission statement describing our focus on measurable brand visibility." },
      { type: "h2", text: "How we work" },
      { type: "p", text: "Placeholder description of company values and how the team operates." },
    ],
    stats: [
      { value: "2008", label: "Founded" },
      { value: "10M+", label: "Users" },
      { value: "1,500+", label: "Team members" },
      { value: "140", label: "Geo databases" },
    ],
  },
  sales: {
    title: "Talk to our sales team",
    subtitle: "Tell us about your goals and we'll show you how the platform can help.",
    variant: "sales",
    form: contactForm,
    stats: [
      { value: "10M+", label: "Marketers" },
      { value: "30%", label: "Fortune 500 use us" },
    ],
    faqs: [
      { q: "What happens after I submit?", a: "A specialist will reach out to schedule a personalized demo." },
      { q: "Is there a minimum contract?", a: "Plans are flexible; your specialist will tailor options to your needs." },
    ],
  },
  contacts: {
    title: "Contact us",
    subtitle: "Reach the right team for sales, support, or press.",
    variant: "contact",
    form: contactForm,
    body: [
      { type: "h3", text: "Support" },
      { type: "p", text: "Find answers in the Knowledge Base or reach our support team from your account." },
      { type: "h3", text: "Press" },
      { type: "p", text: "For media inquiries, contact our communications team." },
    ],
  },
  partners: {
    title: "Partners",
    subtitle: "Grow together through our partner and integration programs.",
    variant: "partners",
    body: [
      { type: "h2", text: "Partner programs" },
      { type: "p", text: "Representative overview of agency, affiliate, and technology partnerships." },
    ],
    stats: [
      { value: "20K+", label: "Partners" },
      { value: "100+", label: "Integrations" },
    ],
  },
  "select": {
    title: "SEMForge Select",
    subtitle: "A curated directory of vetted agencies and experts.",
    variant: "partners",
    body: [
      { type: "h2", text: "Find a trusted expert" },
      { type: "p", text: "Representative description of how to find and work with certified partners." },
    ],
  },
  "global-issues": {
    title: "Global Issues Index",
    subtitle: "A data project exploring how the world searches for social issues.",
    variant: "about",
    body: [
      { type: "h2", text: "About the project" },
      { type: "p", text: "Representative description of the research methodology and findings." },
    ],
  },
  "legal/privacy-policy": {
    title: "Privacy Policy",
    subtitle: "Last updated: 2026",
    variant: "legal",
    body: legalBody("Privacy Policy"),
  },
  "legal/terms": {
    title: "Terms of Service",
    subtitle: "Last updated: 2026",
    variant: "legal",
    body: legalBody("Terms of Service"),
  },
  "api-terms": {
    title: "API Terms",
    subtitle: "Last updated: 2026",
    variant: "legal",
    body: legalBody("API Terms"),
  },
};
