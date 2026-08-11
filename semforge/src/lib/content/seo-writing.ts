export interface SeoWritingCheck {
  key: "title" | "keywordTitle" | "length" | "readability" | "keywordUsage" | "density";
  passed: boolean;
  points: number;
  maxPoints: number;
}

export interface SeoWritingAnalysis {
  score: number;
  wordCount: number;
  sentenceCount: number;
  averageSentenceWords: number;
  keywordOccurrences: number;
  keywordDensity: number;
  checks: SeoWritingCheck[];
}

function words(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
}

function occurrences(haystack: string, needle: string): number {
  const source = haystack.toLocaleLowerCase();
  const target = needle.trim().toLocaleLowerCase();
  if (!target) return 0;
  let count = 0;
  let offset = 0;
  while ((offset = source.indexOf(target, offset)) >= 0) {
    count += 1;
    offset += target.length;
  }
  return count;
}

export function analyzeSeoWriting(input: {
  title: string;
  body: string;
  keywords: string[];
}): SeoWritingAnalysis {
  const bodyWords = words(input.body);
  const sentenceParts = input.body
    .split(/[.!?。！？]+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const sentenceCount = sentenceParts.length;
  const averageSentenceWords = sentenceCount > 0 ? bodyWords.length / sentenceCount : 0;
  const keywords = [...new Set(input.keywords.map((keyword) => keyword.trim()).filter(Boolean))];
  const keywordOccurrences = keywords.reduce(
    (sum, keyword) => sum + occurrences(input.body, keyword),
    0,
  );
  const keywordWordUnits = keywords.reduce((sum, keyword) => sum + words(keyword).length, 0);
  const keywordDensity =
    bodyWords.length > 0 && keywordWordUnits > 0
      ? (keywordOccurrences * keywordWordUnits * 100) / bodyWords.length
      : 0;
  const titleHasKeyword = keywords.some((keyword) => occurrences(input.title, keyword) > 0);

  const checks: SeoWritingCheck[] = [
    { key: "title", passed: input.title.trim().length >= 15 && input.title.trim().length <= 70, points: input.title.trim().length >= 15 && input.title.trim().length <= 70 ? 15 : 0, maxPoints: 15 },
    { key: "keywordTitle", passed: titleHasKeyword, points: titleHasKeyword ? 20 : 0, maxPoints: 20 },
    { key: "length", passed: bodyWords.length >= 300, points: bodyWords.length >= 300 ? 20 : bodyWords.length >= 100 ? 10 : 0, maxPoints: 20 },
    { key: "readability", passed: averageSentenceWords > 0 && averageSentenceWords <= 25, points: averageSentenceWords > 0 && averageSentenceWords <= 25 ? 20 : averageSentenceWords <= 35 && sentenceCount > 0 ? 10 : 0, maxPoints: 20 },
    { key: "keywordUsage", passed: keywordOccurrences > 0, points: keywordOccurrences > 0 ? 15 : 0, maxPoints: 15 },
    { key: "density", passed: keywordDensity >= 0.5 && keywordDensity <= 2.5, points: keywordDensity >= 0.5 && keywordDensity <= 2.5 ? 10 : 0, maxPoints: 10 },
  ];

  return {
    score: checks.reduce((sum, check) => sum + check.points, 0),
    wordCount: bodyWords.length,
    sentenceCount,
    averageSentenceWords: Math.round(averageSentenceWords * 10) / 10,
    keywordOccurrences,
    keywordDensity: Math.round(keywordDensity * 100) / 100,
    checks,
  };
}
