import { ApiError } from "@/lib/api";
import type {
  BacklinkDataset,
  BacklinkFilters,
} from "@/server/backlinks/contracts";

const SORTS: Record<BacklinkDataset, readonly string[]> = {
  links: ["page_score", "domain_score", "first_seen_at", "last_seen_at", "source_url", "target_url"],
  ref_domains: ["backlinks_count", "domain_score", "first_seen_at", "last_seen_at", "domain"],
  anchors: ["domains_count", "backlinks_count", "first_seen_at", "last_seen_at", "anchor"],
  pages: ["domains_count", "backlinks_count", "first_seen_at", "last_seen_at", "source_url"],
};

const DEFAULT_SORT: Record<BacklinkDataset, string> = {
  links: "page_score",
  ref_domains: "backlinks_count",
  anchors: "domains_count",
  pages: "domains_count",
};

export function resolveBacklinkSort(dataset: BacklinkDataset, requested?: string): string {
  if (!requested) return DEFAULT_SORT[dataset];
  if (!SORTS[dataset].includes(requested)) {
    throw new ApiError("VALIDATION_ERROR", "지원하지 않는 정렬 기준입니다.", {
      fields: { sort: SORTS[dataset].join(", ") },
    });
  }
  return requested;
}

function quoted(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function like(value: string): string {
  return quoted(`%${value}%`);
}

/** 클라이언트가 공급자 필터 문법을 직접 주입하지 못하도록 타입된 필터만 컴파일한다. */
export function compileBacklinkFilter(dataset: BacklinkDataset, filters: BacklinkFilters): string | null {
  const conditions: string[] = [];

  if (dataset === "links") {
    if (filters.status === "new") conditions.push("is_new = true");
    if (filters.status === "lost") conditions.push("is_lost = true");
    if (filters.attribute === "follow") conditions.push("is_nofollow = false");
    if (filters.attribute === "nofollow") conditions.push("is_nofollow = true");
    if (filters.attribute === "sponsored") conditions.push("is_sponsored = true");
    if (filters.attribute === "ugc") conditions.push("is_ugc = true");
    if (filters.linkType === "image") conditions.push("is_image = true");
    if (filters.linkType === "form") conditions.push("is_form = true");
    if (filters.linkType === "frame") conditions.push("is_frame = true");
    if (filters.linkType === "text") {
      conditions.push("is_image = false", "is_form = false", "is_frame = false");
    }
  } else if (dataset === "ref_domains") {
    if (filters.status === "new") conditions.push("is_new = true");
    if (filters.status === "lost") conditions.push("is_lost = true");
    if (filters.attribute === "follow") conditions.push("is_follow = true");
    if (filters.attribute === "nofollow") conditions.push("is_follow = false");
  }

  if (filters.search) {
    if (dataset === "links") {
      conditions.push(
        `(source_url LIKE ${like(filters.search)} OR target_url LIKE ${like(filters.search)} OR anchor LIKE ${like(filters.search)})`,
      );
    } else if (dataset === "ref_domains") {
      conditions.push(`domain LIKE ${like(filters.search)}`);
    } else if (dataset === "anchors") {
      conditions.push(`anchor LIKE ${like(filters.search)}`);
    } else {
      conditions.push(`source_url LIKE ${like(filters.search)}`);
    }
  }

  if (filters.dateFrom) conditions.push(`first_seen_at >= ${quoted(filters.dateFrom)}`);
  if (filters.dateTo) conditions.push(`first_seen_at <= ${quoted(`${filters.dateTo}T23:59:59`)}`);

  return conditions.length > 0 ? conditions.join(" AND ") : null;
}

export function listQueryKey(input: {
  dataset: BacklinkDataset;
  page: number;
  pageSize: number;
  sort: string;
  direction: "asc" | "desc";
  filters: BacklinkFilters;
}): string {
  return JSON.stringify({
    dataset: input.dataset,
    page: input.page,
    pageSize: input.pageSize,
    sort: input.sort,
    direction: input.direction,
    filters: input.filters,
  });
}
