import type {
  ContentResearchSnapshot,
  ContentRunInput,
  ContentSeoAnalysis,
  GeneratedArticle,
} from "@/server/content/contracts";
import { buildContentSeoSuggestions } from "@/lib/content-seo";

function normalized(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}

export function countContentWords(markdown: string): number {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean).length;
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value)));
}

function topicalTerms(research: ContentResearchSnapshot): string[] {
  const stopwords = new Set([
    "the", "and", "for", "with", "from", "this", "that", "what", "how",
    "및", "하는", "대한", "에서", "으로", "방법", "가이드", "완벽", "알아보기",
  ]);
  const counts = new Map<string, number>();
  for (const result of research.results.slice(0, 10)) {
    for (const token of normalized(`${result.title} ${result.description}`).split(" ")) {
      if (token.length < 2 || stopwords.has(token) || /^\d+$/u.test(token)) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([term]) => term);
}

export function scoreContentArticle(input: {
  article: GeneratedArticle;
  requirements: ContentRunInput;
  research: ContentResearchSnapshot | null;
}): ContentSeoAnalysis {
  const wordCount = countContentWords(input.article.markdown);
  const suggestions = buildContentSeoSuggestions({
    title: input.article.title,
    metaDescription: input.article.metaDescription,
    body: input.article.markdown,
  }, input.requirements.keyword);
  if (!input.research || input.research.results.length === 0) {
    return {
      model: "semforge-content-v1",
      score: null,
      unavailableReason: "TalorData SERP 근거가 없어 SEO 점수를 계산하지 않았습니다.",
      wordCount,
      suggestions,
      breakdown: null,
    };
  }

  const keyword = normalized(input.requirements.keyword);
  const title = normalized(input.article.title);
  const markdown = normalized(input.article.markdown);
  const headings = input.article.markdown
    .split("\n")
    .filter((line) => /^#{2,3}\s+/u.test(line))
    .map(normalized);
  const paragraphs = input.article.markdown
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.replace(/^#{1,6}\s+/u, "").trim())
    .filter(Boolean);

  const topics = topicalTerms(input.research);
  const coveredTopics = topics.filter((term) => markdown.includes(term)).length;
  const serpCoverage = clamp(topics.length ? (coveredTopics / topics.length) * 25 : 0, 25);

  let structure = 0;
  if (headings.length >= 3) structure += 10;
  else structure += Math.min(8, headings.length * 3);
  if (/^#\s+.+/mu.test(input.article.markdown)) structure += 5;
  if (paragraphs.length >= 5) structure += 5;
  if (/^[-*]\s+|^\d+\.\s+/mu.test(input.article.markdown)) structure += 3;
  if (paragraphs.some((paragraph) => paragraph.length >= 80)) structure += 2;
  structure = clamp(structure, 25);

  const keywordOccurrences = keyword
    ? markdown.split(keyword).length - 1
    : 0;
  let keywordPlacement = 0;
  if (keyword && title.includes(keyword)) keywordPlacement += 7;
  if (keyword && headings.some((heading) => heading.includes(keyword))) keywordPlacement += 5;
  if (keywordOccurrences >= 2) keywordPlacement += 5;
  if (keywordOccurrences >= 4) keywordPlacement += 3;
  keywordPlacement = clamp(keywordPlacement, 20);

  const averageParagraphLength = paragraphs.length
    ? paragraphs.reduce((sum, paragraph) => sum + paragraph.length, 0) / paragraphs.length
    : 0;
  let readability = 0;
  if (paragraphs.length >= 5) readability += 5;
  if (averageParagraphLength >= 40 && averageParagraphLength <= 500) readability += 6;
  if (paragraphs.filter((paragraph) => paragraph.length > 800).length === 0) readability += 4;
  readability = clamp(readability, 15);

  const lengthRatio = wordCount / input.requirements.targetWordCount;
  let metadataAndLength = 0;
  if (input.article.metaDescription.length >= 70 && input.article.metaDescription.length <= 180) {
    metadataAndLength += 7;
  }
  if (keyword && normalized(input.article.metaDescription).includes(keyword)) metadataAndLength += 3;
  if (lengthRatio >= 0.8 && lengthRatio <= 1.25) metadataAndLength += 5;
  else if (lengthRatio >= 0.6 && lengthRatio <= 1.5) metadataAndLength += 2;
  metadataAndLength = clamp(metadataAndLength, 15);

  const breakdown = {
    serpCoverage,
    structure,
    keywordPlacement,
    readability,
    metadataAndLength,
  };
  return {
    model: "semforge-content-v1",
    score: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
    unavailableReason: null,
    wordCount,
    suggestions,
    breakdown,
  };
}
