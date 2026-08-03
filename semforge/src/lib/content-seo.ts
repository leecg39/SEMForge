export type ContentSeoDocument = {
  title: string;
  metaDescription: string;
  body: string;
};

export type ContentSeoSuggestion = {
  id: "title_keyword" | "meta_keyword" | "heading_keyword";
  field: keyof ContentSeoDocument;
  label: string;
  reason: string;
  expectedValue: string;
  replacement: string;
};

export type ContentSeoUndo = {
  suggestionId: ContentSeoSuggestion["id"];
  field: keyof ContentSeoDocument;
  previousValue: string;
  appliedValue: string;
};

function normalized(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/gu, " ").trim();
}

function addKeywordHeading(body: string, keyword: string): string {
  const lines = body.split("\n");
  const titleIndex = lines.findIndex((line) => /^#\s+/u.test(line));
  const insertAt = titleIndex >= 0 ? titleIndex + 1 : 0;
  return [...lines.slice(0, insertAt), "", `## ${keyword} 핵심 정리`, "", ...lines.slice(insertAt)].join("\n").replace(/\n{3,}/gu, "\n\n");
}

export function buildContentSeoSuggestions(document: ContentSeoDocument, keyword: string) {
  const suggestions: ContentSeoSuggestion[] = [];
  const normalizedKeyword = normalized(keyword);
  if (normalizedKeyword && !normalized(document.title).includes(normalizedKeyword)) {
    suggestions.push({ id: "title_keyword", field: "title", label: "제목에 핵심 키워드 반영", reason: "제목에서 핵심 키워드를 찾을 수 없습니다.", expectedValue: document.title, replacement: `${keyword}: ${document.title}`.slice(0, 150) });
  }
  if (document.metaDescription && normalizedKeyword && !normalized(document.metaDescription).includes(normalizedKeyword)) {
    suggestions.push({ id: "meta_keyword", field: "metaDescription", label: "메타 설명에 핵심 키워드 반영", reason: "검색 결과 설명에서 핵심 키워드를 찾을 수 없습니다.", expectedValue: document.metaDescription, replacement: `${keyword} — ${document.metaDescription}`.slice(0, 180) });
  }
  const headings = document.body.split("\n").filter((line) => /^#{2,3}\s+/u.test(line));
  if (normalizedKeyword && !headings.some((heading) => normalized(heading).includes(normalizedKeyword))) {
    suggestions.push({ id: "heading_keyword", field: "body", label: "본문 소제목에 핵심 키워드 반영", reason: "H2/H3 소제목에서 핵심 키워드를 찾을 수 없습니다.", expectedValue: document.body, replacement: addKeywordHeading(document.body, keyword) });
  }
  return suggestions;
}

export function applyContentSeoSuggestion(document: ContentSeoDocument, suggestion: ContentSeoSuggestion) {
  if (document[suggestion.field] !== suggestion.expectedValue) return { document, undo: null };
  return {
    document: { ...document, [suggestion.field]: suggestion.replacement },
    undo: { suggestionId: suggestion.id, field: suggestion.field, previousValue: suggestion.expectedValue, appliedValue: suggestion.replacement } satisfies ContentSeoUndo,
  };
}

export function undoContentSeoSuggestion(document: ContentSeoDocument, undo: ContentSeoUndo) {
  if (document[undo.field] !== undo.appliedValue) return { document, restored: false };
  return { document: { ...document, [undo.field]: undo.previousValue }, restored: true };
}
