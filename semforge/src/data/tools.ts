import type { ToolPageData } from "@/types/templates";

/** PUB-TOOL 무료 도구 17종. 대표 문구 + 도구 목적(인벤토리 기준). */

interface ToolSeed {
  slug: string;
  name: string;
  input: "url" | "keyword" | "text";
  placeholder: string;
  submit: string;
  does: string;
}

const seeds: ToolSeed[] = [
  { slug: "ai-overviews-visibility-checker", name: "AI Overviews Visibility Checker", input: "url", placeholder: "Enter your domain", submit: "Check visibility", does: "see how often your domain appears in AI Overviews" },
  { slug: "ai-search-visibility-checker", name: "AI Search Visibility Checker", input: "url", placeholder: "Enter your domain", submit: "Check visibility", does: "grade your visibility across AI search engines" },
  { slug: "competitor-finder", name: "Competitor Finder", input: "url", placeholder: "Enter your domain", submit: "Find competitors", does: "discover your closest search competitors" },
  { slug: "keyword-rank-checker", name: "Keyword Rank Checker", input: "url", placeholder: "Enter domain and keyword", submit: "Check rank", does: "check your position for any keyword" },
  { slug: "keyword-search-volume-checker", name: "Keyword Search Volume Checker", input: "keyword", placeholder: "Enter a keyword", submit: "Get volume", does: "see monthly search volume for a keyword" },
  { slug: "plagiarism-checker", name: "Plagiarism Checker", input: "text", placeholder: "Paste your text", submit: "Check text", does: "check text for duplicate content" },
  { slug: "serp-checker", name: "SERP Checker", input: "keyword", placeholder: "Enter a keyword", submit: "Check SERP", does: "preview the search results for a keyword" },
  { slug: "serp-simulator", name: "SERP Simulator", input: "text", placeholder: "Enter title and description", submit: "Preview snippet", does: "preview how your snippet looks in search" },
  { slug: "sitemap-generator", name: "Sitemap Generator", input: "url", placeholder: "Enter your site URL", submit: "Generate sitemap", does: "generate an XML sitemap for your site" },
  { slug: "website-authority-checker", name: "Website Authority Checker", input: "url", placeholder: "Enter your domain", submit: "Check authority", does: "measure a domain's authority score" },
  { slug: "ai-text-generator", name: "AI Text Generator", input: "text", placeholder: "Describe what to write", submit: "Generate text", does: "generate text from a prompt" },
  { slug: "paragraph-rewriter", name: "Paragraph Rewriter", input: "text", placeholder: "Paste a paragraph", submit: "Rewrite", does: "rewrite a paragraph in a new way" },
  { slug: "title-generator", name: "Title Generator", input: "text", placeholder: "Enter your topic", submit: "Generate titles", does: "generate title ideas for your topic" },
  { slug: "paraphrasing-tool", name: "Paraphrasing Tool", input: "text", placeholder: "Paste your text", submit: "Paraphrase", does: "paraphrase text while keeping meaning" },
  { slug: "sentence-rewriter", name: "Sentence Rewriter", input: "text", placeholder: "Paste a sentence", submit: "Rewrite", does: "rewrite a sentence clearly" },
  { slug: "word-counter", name: "Word Counter", input: "text", placeholder: "Paste your text", submit: "Count words", does: "count words and characters in your text" },
  { slug: "summary-generator", name: "Summary Generator", input: "text", placeholder: "Paste your text", submit: "Summarize", does: "summarize long text into key points" },
];

const related = [
  { label: "Keyword Search Volume Checker", href: "/free-tools/keyword-search-volume-checker/" },
  { label: "SERP Checker", href: "/free-tools/serp-checker/" },
  { label: "Website Authority Checker", href: "/free-tools/website-authority-checker/" },
];

function expand(seed: ToolSeed): ToolPageData {
  return {
    eyebrow: "FREE TOOL",
    title: seed.name,
    subtitle: `A free tool to ${seed.does}. No credit card required.`,
    inputPlaceholder: seed.placeholder,
    inputType: seed.input,
    submitLabel: seed.submit,
    resultPreview: `Sample result — sign up for the full report to ${seed.does} with complete data.`,
    howItWorks: [
      { title: "Enter your details", body: `Add your ${seed.input === "url" ? "domain" : seed.input} to get started.` },
      { title: "Get instant results", body: `We instantly ${seed.does}.` },
      { title: "Go deeper for free", body: "Create a free account to unlock the full report and history." },
    ],
    faqs: [
      { q: `Is the ${seed.name} free?`, a: "Yes. You can run checks for free. A free account unlocks more detail." },
      { q: "How accurate are the results?", a: "Results are based on the same datasets that power the full platform." },
    ],
    relatedTools: related.filter((r) => !r.href.includes(seed.slug)),
  };
}

export const toolsData: Record<string, ToolPageData> = Object.fromEntries(
  seeds.map((s) => [s.slug, expand(s)]),
);

export const toolSlugs = seeds.map((s) => s.slug);
