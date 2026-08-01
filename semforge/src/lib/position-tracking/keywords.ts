export const MAX_TRACKING_KEYWORDS = 20;

export interface SetupKeyword {
  keyword: string;
  tags: string[];
}

function cleanTag(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

export function normalizeKeyword(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 200);
}

export function parseKeywordText(text: string, commonTags: string[] = []): SetupKeyword[] {
  const tags = [...new Set(commonTags.map(cleanTag).filter(Boolean))].slice(0, 20);
  const seen = new Set<string>();
  const keywords: SetupKeyword[] = [];
  for (const raw of text.replace(/^\uFEFF/, "").split(/[\n,]/)) {
    const keyword = normalizeKeyword(raw);
    const key = keyword.toLocaleLowerCase();
    if (!keyword || seen.has(key)) continue;
    seen.add(key);
    keywords.push({ keyword, tags: [...tags] });
  }
  return keywords.slice(0, MAX_TRACKING_KEYWORDS);
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

/** CSV 열: keyword 또는 키워드, 선택 열 tags/태그(| 또는 ; 구분). */
export function parseKeywordCsv(csv: string): SetupKeyword[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]).map((cell) => cell.trim().toLocaleLowerCase());
  const keywordIndex = header.findIndex((cell) => cell === "keyword" || cell === "키워드");
  const tagIndex = header.findIndex((cell) => cell === "tags" || cell === "tag" || cell === "태그");
  const startsWithHeader = keywordIndex >= 0;
  const start = startsWithHeader ? 1 : 0;
  const resolvedKeywordIndex = startsWithHeader ? keywordIndex : 0;
  const seen = new Set<string>();
  const result: SetupKeyword[] = [];
  for (let index = start; index < lines.length; index += 1) {
    const cells = parseCsvLine(lines[index]);
    const keyword = normalizeKeyword(cells[resolvedKeywordIndex] ?? "");
    const key = keyword.toLocaleLowerCase();
    if (!keyword || seen.has(key)) continue;
    seen.add(key);
    const tags = tagIndex >= 0
      ? [...new Set((cells[tagIndex] ?? "").split(/[|;]/).map(cleanTag).filter(Boolean))].slice(0, 20)
      : [];
    result.push({ keyword, tags });
    if (result.length >= MAX_TRACKING_KEYWORDS) break;
  }
  return result;
}

export function mergeSetupKeywords(
  current: SetupKeyword[],
  incoming: SetupKeyword[]
): SetupKeyword[] {
  const merged = new Map<string, SetupKeyword>();
  for (const row of [...current, ...incoming]) {
    const keyword = normalizeKeyword(row.keyword);
    if (!keyword) continue;
    const key = keyword.toLocaleLowerCase();
    const existing = merged.get(key);
    merged.set(key, {
      keyword: existing?.keyword ?? keyword,
      tags: [...new Set([...(existing?.tags ?? []), ...row.tags.map(cleanTag).filter(Boolean)])].slice(0, 20),
    });
    if (merged.size >= MAX_TRACKING_KEYWORDS) break;
  }
  return [...merged.values()];
}
