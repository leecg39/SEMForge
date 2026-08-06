import { createHmac } from "node:crypto";
import type { MarketingAttributionKind } from "./contracts";

const TRACKING_KEYS = new Set(["gclid", "dclid", "fbclid", "msclkid"]);
export const MARKETING_FRESH_MS = 90 * 60 * 1000;
export const MARKETING_STALE_MAX_MS = 24 * 60 * 60 * 1000;

export function normalizeMarketingUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || TRACKING_KEYS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
  return url.toString().replace(/\?$/u, "");
}

export function classifyFreshness(fetchedAt: Date, now = new Date()): "fresh" | "stale" | "expired" {
  const age = Math.max(0, now.getTime() - fetchedAt.getTime());
  if (age <= MARKETING_FRESH_MS) return "fresh";
  if (age <= MARKETING_STALE_MAX_MS) return "stale";
  return "expired";
}

export function attributionKind(input: {
  gclid?: string | null;
  utmSource?: string | null;
  crmSource?: string | null;
  explicitCampaignBinding?: boolean;
  gscLandingMatch?: boolean;
}): MarketingAttributionKind {
  if (input.gclid?.trim() || input.utmSource?.trim() || input.crmSource?.trim() || input.explicitCampaignBinding) {
    return "confirmed";
  }
  return input.gscLandingMatch ? "inferred" : "unattributed";
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function calculateKpis(input: {
  clicks: number;
  sessions: number;
  cost: number;
  conversions: number;
  revenue: number;
}) {
  return {
    clickSessionRatio: ratio(input.sessions, input.clicks),
    cpa: ratio(input.cost, input.conversions),
    roas: ratio(input.revenue, input.cost),
  };
}

export function pseudonymizeMarketingId(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}
