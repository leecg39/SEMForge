import { ApiError } from "@/lib/api";

/**
 * 목록 API 공통 쿼리 파서.
 * URL 쿼리스트링이 화면 상태(검색·필터·정렬·페이지)의 단일 출처가 되도록
 * 서버와 클라이언트가 같은 파라미터 이름을 사용한다.
 */

export type TrashScope = "active" | "trashed" | "all";

export interface ListQuery {
  q: string | null;
  page: number;
  pageSize: number;
  offset: number;
  sortField: string;
  sortDir: "asc" | "desc";
  scope: TrashScope;
  filters: Record<string, string[]>;
}

export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  q: string | null;
  sort: string;
  scope: TrashScope;
  filters: Record<string, string[]>;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const RESERVED = new Set(["q", "page", "pageSize", "sort", "scope"]);

export function parseListQuery(
  request: Request,
  options: {
    sortableFields: readonly string[];
    defaultSort?: string;
    filterableFields?: readonly string[];
    defaultPageSize?: number;
  }
): ListQuery {
  const url = new URL(request.url);
  const params = url.searchParams;

  const rawPage = Number.parseInt(params.get("page") ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawPageSize = Number.parseInt(
    params.get("pageSize") ?? String(options.defaultPageSize ?? DEFAULT_PAGE_SIZE),
    10
  );
  const pageSize =
    Number.isFinite(rawPageSize) && rawPageSize > 0
      ? Math.min(rawPageSize, MAX_PAGE_SIZE)
      : (options.defaultPageSize ?? DEFAULT_PAGE_SIZE);

  const sortRaw = params.get("sort") ?? options.defaultSort ?? `${options.sortableFields[0]}:desc`;
  const [sortField, sortDirRaw] = sortRaw.split(":");
  if (!options.sortableFields.includes(sortField)) {
    throw new ApiError("VALIDATION_ERROR", `정렬할 수 없는 필드입니다: ${sortField}`, {
      fields: { sort: `허용 값: ${options.sortableFields.join(", ")}` },
    });
  }
  const sortDir = sortDirRaw === "asc" ? "asc" : "desc";

  const scopeRaw = params.get("scope") ?? "active";
  if (scopeRaw !== "active" && scopeRaw !== "trashed" && scopeRaw !== "all") {
    throw new ApiError("VALIDATION_ERROR", "scope 는 active, trashed, all 중 하나여야 합니다.", {
      fields: { scope: "active | trashed | all" },
    });
  }

  const filters: Record<string, string[]> = {};
  const allowed = new Set(options.filterableFields ?? []);
  for (const [key, value] of params.entries()) {
    if (RESERVED.has(key)) continue;
    if (!allowed.has(key)) continue;
    if (value === "") continue;
    filters[key] = (filters[key] ?? []).concat(value.split(",").filter(Boolean));
  }

  const q = params.get("q")?.trim() || null;

  return {
    q,
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    sortField,
    sortDir,
    scope: scopeRaw,
    filters,
  };
}

export function listMeta(query: ListQuery, total: number): ListMeta {
  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    q: query.q,
    sort: `${query.sortField}:${query.sortDir}`,
    scope: query.scope,
    filters: query.filters,
  };
}

/** SQLite LIKE 와일드카드를 이스케이프해 사용자 입력을 그대로 검색어로 쓴다. */
export function likePattern(input: string): string {
  const escaped = input.replace(/[\\%_]/g, (m) => `\\${m}`);
  return `%${escaped}%`;
}
