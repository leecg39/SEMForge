import type {
  AdvertisingResearchReport,
  AdvertisingResearchRunView,
} from "@/server/advertising/contracts";

export interface ResearchOutcomeItem {
  status: "queued" | "running" | "completed" | "failed";
  adCount: number;
  shoppingCount: number;
  shoppingAvailability: "available" | "no_results" | "unavailable";
}

export function summarizeResearchOutcomes(items: ResearchOutcomeItem[]) {
  return {
    zeroResultKeywords: items.filter(
      (item) => item.status === "completed" && item.adCount === 0 && item.shoppingCount === 0,
    ).length,
    failedKeywords: items.filter((item) => item.status === "failed").length,
  };
}

export function derivePlaAvailability(
  status: AdvertisingResearchRunView["status"],
  items: ResearchOutcomeItem[],
): AdvertisingResearchReport["coverage"]["plaAvailability"] {
  if (status === "queued" || status === "running") return "checking";
  if (items.some((item) => item.shoppingAvailability === "available")) return "available";
  if (items.some((item) => item.shoppingAvailability === "no_results")) return "no_results";
  return "unavailable";
}
