/**
 * llms.txt 원문을 파싱하고 문서 품질을 진단하는 순수 모듈.
 *
 * 네트워크나 저장소에 접근하지 않으며 전달받은 문자열을 변경하지 않는다.
 */

export const LLMS_TXT_CHARS_PER_TOKEN = 4;
export const LLMS_TXT_MAX_ESTIMATED_TOKENS = 4_000;

export const LLMS_TXT_SCORE_WEIGHTS = {
  h1: 25,
  summary: 10,
  sections: 15,
  links: 15,
  absoluteUrls: 15,
  linkTitles: 10,
  optionalSection: 0,
  length: 10,
} as const;

export const LLMS_TXT_GRADE_THRESHOLDS = {
  A: 90,
  B: 80,
  C: 70,
  D: 60,
  F: 0,
} as const;

export interface LlmsTxtLink {
  readonly title: string;
  readonly url: string;
  readonly note: string | null;
}

export interface LlmsTxtSection {
  readonly name: string;
  readonly links: readonly LlmsTxtLink[];
}

export interface LlmsTxtDocument {
  readonly title: string | null;
  readonly summary: string | null;
  readonly description: string | null;
  readonly sections: readonly LlmsTxtSection[];
}

export type LlmsTxtCheckStatus = "pass" | "fail" | "warning";

export interface LlmsTxtCheck {
  readonly passed: boolean;
  readonly status: LlmsTxtCheckStatus;
  readonly reason: string;
}

export interface LlmsTxtChecks {
  readonly h1: LlmsTxtCheck;
  readonly summary: LlmsTxtCheck;
  readonly sections: LlmsTxtCheck;
  readonly links: LlmsTxtCheck;
  readonly absoluteUrls: LlmsTxtCheck;
  readonly linkTitles: LlmsTxtCheck;
  readonly optionalSection: LlmsTxtCheck;
  readonly length: LlmsTxtCheck;
}

export type LlmsTxtGrade = keyof typeof LLMS_TXT_GRADE_THRESHOLDS;

export interface LlmsTxtAssessment {
  readonly isLlmsTxt: boolean;
  readonly invalidReason: string | null;
  readonly document: LlmsTxtDocument;
  readonly checks: LlmsTxtChecks;
  readonly estimatedTokens: number;
  readonly score: number;
  readonly grade: LlmsTxtGrade;
}

const H1_PATTERN = /^#(?!#)\s+(.+?)\s*#*\s*$/;
const H2_PATTERN = /^##(?!#)\s+(.+?)\s*#*\s*$/;
const SUMMARY_PATTERN = /^>\s*(.+?)\s*$/;
const LINK_PATTERN = /^\s*[-*+]\s+\[([^\]]*)\]\(\s*(\S+?)(?:\s+["'][^"']*["'])?\s*\)\s*(?::\s*(.*?))?\s*$/;
const HTML_DOCUMENT_PATTERN = /^(?:<!doctype\b|<html\b)/i;
const MARKDOWN_STRUCTURE_PATTERN = /(?:^|\n)\s*(?:#{1,6}\s+\S|>\s*\S|[-*+]\s+\[[^\]]*\]\([^)]+\))/m;

function headingText(line: string, pattern: RegExp): string | null {
  const match = pattern.exec(line);
  return match ? match[1]!.trim() : null;
}

function parseLink(line: string): LlmsTxtLink | null {
  const match = LINK_PATTERN.exec(line);
  if (!match) return null;

  const rawUrl = match[2]!.trim();
  const url = rawUrl.startsWith("<") && rawUrl.endsWith(">") ? rawUrl.slice(1, -1) : rawUrl;
  const note = match[3]?.trim() ?? "";

  return {
    title: match[1]!.trim(),
    url,
    note: note.length > 0 ? note : null,
  };
}

function parseDescription(lines: readonly string[], firstSectionIndex: number): string | null {
  const paragraphs: string[] = [];
  let current: string[] = [];

  const finishParagraph = () => {
    if (current.length === 0) return;
    paragraphs.push(current.join(" "));
    current = [];
  };

  for (const line of lines.slice(0, firstSectionIndex)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      finishParagraph();
      continue;
    }
    if (
      H1_PATTERN.test(trimmed) ||
      SUMMARY_PATTERN.test(trimmed) ||
      /^#{2,6}\s+/.test(trimmed) ||
      /^[-*+]\s+/.test(trimmed)
    ) {
      finishParagraph();
      continue;
    }
    current.push(trimmed);
  }
  finishParagraph();

  return paragraphs.length > 0 ? paragraphs.join("\n\n") : null;
}

/** llms.txt 원문에서 제목, 요약, 설명과 섹션별 링크를 추출한다. */
export function parseLlmsTxt(source: string): LlmsTxtDocument {
  const lines = source.split(/\r?\n/);
  const title = lines.map((line) => headingText(line, H1_PATTERN)).find((value) => value !== null) ?? null;
  const summary =
    lines.map((line) => headingText(line, SUMMARY_PATTERN)).find((value) => value !== null) ??
    null;
  const firstSectionIndex = lines.findIndex((line) => H2_PATTERN.test(line.trim()));
  const description = parseDescription(
    lines,
    firstSectionIndex === -1 ? lines.length : firstSectionIndex,
  );
  const sections: LlmsTxtSection[] = [];
  let currentSection: { name: string; links: LlmsTxtLink[] } | null = null;

  for (const line of lines) {
    const sectionName = headingText(line.trim(), H2_PATTERN);
    if (sectionName !== null) {
      if (currentSection) sections.push(currentSection);
      currentSection = { name: sectionName, links: [] };
      continue;
    }
    if (!currentSection) continue;

    const link = parseLink(line);
    if (link) currentSection.links.push(link);
  }
  if (currentSection) sections.push(currentSection);

  return { title, summary, description, sections };
}

function passed(reason: string): LlmsTxtCheck {
  return { passed: true, status: "pass", reason };
}

function failed(reason: string): LlmsTxtCheck {
  return { passed: false, status: "fail", reason };
}

function warned(reason: string): LlmsTxtCheck {
  return { passed: false, status: "warning", reason };
}

function isAbsoluteUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol.length > 1;
  } catch {
    return false;
  }
}

function invalidDocumentReason(source: string): string | null {
  const trimmed = source.trim();
  if (trimmed.length === 0) return "문서가 비어 있어 llms.txt로 볼 수 없습니다.";
  if (HTML_DOCUMENT_PATTERN.test(trimmed)) {
    return "HTML 문서가 반환되어 llms.txt로 볼 수 없습니다.";
  }
  if (!MARKDOWN_STRUCTURE_PATTERN.test(source)) {
    return "llms.txt에 필요한 마크다운 구조가 전혀 없습니다.";
  }
  return null;
}

function gradeForScore(score: number): LlmsTxtGrade {
  if (score >= LLMS_TXT_GRADE_THRESHOLDS.A) return "A";
  if (score >= LLMS_TXT_GRADE_THRESHOLDS.B) return "B";
  if (score >= LLMS_TXT_GRADE_THRESHOLDS.C) return "C";
  if (score >= LLMS_TXT_GRADE_THRESHOLDS.D) return "D";
  return "F";
}

/** 공개된 가중치에 따라 통과한 항목의 점수를 합산한다. */
export function calculateLlmsTxtScore(checks: LlmsTxtChecks): number {
  const checkNames = Object.keys(LLMS_TXT_SCORE_WEIGHTS) as (keyof LlmsTxtChecks)[];
  return checkNames.reduce(
    (score, name) => score + (checks[name].passed ? LLMS_TXT_SCORE_WEIGHTS[name] : 0),
    0,
  );
}

/** llms.txt 여부와 구조·링크·길이 품질을 진단한다. */
export function assessLlmsTxt(source: string): LlmsTxtAssessment {
  const document = parseLlmsTxt(source);
  const lines = source.split(/\r?\n/);
  const h1Count = lines.filter((line) => H1_PATTERN.test(line.trim())).length;
  const links = document.sections.flatMap((section) => section.links);
  const relativeLinks = links.filter((link) => !isAbsoluteUrl(link.url));
  const emptyTitleLinks = links.filter((link) => link.title.length === 0);
  const hasOptionalSection = document.sections.some(
    (section) => section.name.trim().toLowerCase() === "optional",
  );
  const estimatedTokens = Math.ceil(source.length / LLMS_TXT_CHARS_PER_TOKEN);
  const invalidReason = invalidDocumentReason(source);

  const h1 =
    h1Count === 1
      ? passed("H1 제목이 정확히 1개 있습니다.")
      : h1Count === 0
        ? failed("H1 제목이 없습니다.")
        : failed(`H1 제목이 ${h1Count}개 있어 하나만 남겨야 합니다.`);
  const summary = document.summary
    ? passed("한 줄 요약이 blockquote로 제공되었습니다.")
    : failed("blockquote 형식의 한 줄 요약이 없습니다.");
  const sections =
    document.sections.length > 0
      ? passed(`H2 섹션이 ${document.sections.length}개 있습니다.`)
      : failed("링크를 묶는 H2 섹션이 없습니다.");
  const linkCheck =
    links.length > 0 ? passed(`링크가 ${links.length}개 있습니다.`) : failed("링크가 없습니다.");
  const absoluteUrls =
    links.length === 0
      ? failed("절대 URL 여부를 검사할 링크가 없습니다.")
      : relativeLinks.length === 0
        ? passed("모든 링크가 절대 URL입니다.")
        : warned(
            `상대경로이거나 유효하지 않은 URL이 ${relativeLinks.length}개 있어 절대 URL로 바꿔야 합니다.`,
          );
  const linkTitles =
    links.length === 0
      ? failed("제목을 검사할 링크가 없습니다.")
      : emptyTitleLinks.length === 0
        ? passed("모든 링크에 제목이 있습니다.")
        : failed(`제목이 비어 있는 링크가 ${emptyTitleLinks.length}개 있습니다.`);
  const optionalSection = hasOptionalSection
    ? passed("Optional 섹션으로 낮은 우선순위 링크를 구분했습니다.")
    : failed("Optional 섹션을 사용하지 않았습니다. 이 항목은 선택 사항이며 점수에는 반영되지 않습니다.");
  const length =
    estimatedTokens <= LLMS_TXT_MAX_ESTIMATED_TOKENS
      ? passed(
          `예상 ${estimatedTokens}토큰으로 ${LLMS_TXT_MAX_ESTIMATED_TOKENS}토큰 예산 이내입니다.`,
        )
      : warned(
          `예상 ${estimatedTokens}토큰으로 ${LLMS_TXT_MAX_ESTIMATED_TOKENS}토큰 예산을 초과합니다.`,
        );
  const checks: LlmsTxtChecks = {
    h1,
    summary,
    sections,
    links: linkCheck,
    absoluteUrls,
    linkTitles,
    optionalSection,
    length,
  };
  const score = invalidReason === null ? calculateLlmsTxtScore(checks) : 0;

  return {
    isLlmsTxt: invalidReason === null,
    invalidReason,
    document,
    checks,
    estimatedTokens,
    score,
    grade: gradeForScore(score),
  };
}
