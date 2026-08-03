import type { BacklinkDataset } from "@/server/backlinks/contracts";

export const BACKLINK_SORT_OPTIONS: Record<BacklinkDataset, readonly string[]> = {
  links: ["page_score", "domain_score", "first_seen_at", "last_seen_at"],
  ref_domains: ["backlinks_count", "domain_score", "first_seen_at", "last_seen_at"],
  anchors: ["domains_count", "backlinks_count", "first_seen_at", "last_seen_at"],
  pages: ["domains_count", "backlinks_count", "first_seen_at", "last_seen_at"],
};

const DEFAULT_SORT: Record<BacklinkDataset, string> = {
  links: "page_score",
  ref_domains: "backlinks_count",
  anchors: "domains_count",
  pages: "domains_count",
};

export function resolveInitialBacklinkSort(
  dataset: BacklinkDataset,
  requested?: string,
): string {
  return requested && BACKLINK_SORT_OPTIONS[dataset].includes(requested)
    ? requested
    : DEFAULT_SORT[dataset];
}
