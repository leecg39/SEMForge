import type { BacklinkDataset, BacklinkFilters, BacklinkRow } from "@/server/backlinks/contracts";

const SORTS: Record<BacklinkDataset, readonly string[]> = {
  target_pages: ["url", "link_count"],
  inbound_links: ["source_url", "source_domain", "anchor", "link_count"],
};

const DEFAULT_SORT: Record<BacklinkDataset, string> = {
  target_pages: "link_count",
  inbound_links: "source_url",
};

export function resolveBacklinkSort(dataset: BacklinkDataset, requested?: string): string {
  return requested && SORTS[dataset].includes(requested) ? requested : DEFAULT_SORT[dataset];
}

export function filterBacklinkRows(rows: BacklinkRow[], filters: BacklinkFilters): BacklinkRow[] {
  const search = filters.search.trim().toLocaleLowerCase();
  if (!search) return rows;
  return rows.filter((row) => {
    const values = row.kind === "target_pages"
      ? [row.url]
      : [row.sourceUrl, row.targetUrl, row.sourceDomain, row.anchor ?? ""];
    return values.some((value) => value.toLocaleLowerCase().includes(search));
  });
}

export function sortBacklinkRows(
  rows: BacklinkRow[],
  dataset: BacklinkDataset,
  sort: string,
  direction: "asc" | "desc",
): BacklinkRow[] {
  const factor = direction === "asc" ? 1 : -1;
  const value = (row: BacklinkRow): string | number => {
    if (row.kind === "target_pages") return sort === "url" ? row.url : row.linkCount;
    if (sort === "source_domain") return row.sourceDomain;
    if (sort === "anchor") return row.anchor ?? "";
    if (sort === "link_count") return row.linkCount;
    return row.sourceUrl;
  };
  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    return typeof left === "number" && typeof right === "number"
      ? (left - right) * factor
      : String(left).localeCompare(String(right)) * factor;
  });
}

export function listQueryKey(input: {
  dataset: BacklinkDataset;
  targetPage?: string | null;
  page: number;
  pageSize: number;
  sort: string;
  direction: "asc" | "desc";
  filters: BacklinkFilters;
}): string {
  return JSON.stringify(input);
}
