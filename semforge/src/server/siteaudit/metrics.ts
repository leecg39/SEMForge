import type { PsiCwv } from "@/server/psi/client";

export interface StoredPsiMetrics {
  scores: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
  };
  cwv: PsiCwv;
  fetchedAt: string;
  source: "pagespeed-insights";
}

export interface StoredThemeScore {
  key: string;
  score: number | null;
  measurable: boolean;
}

export type SiteAuditMetricKey =
  | "crawledPages"
  | "siteHealth"
  | "aiSearch"
  | "errors"
  | "warnings"
  | "crawlability"
  | "https"
  | "internationalSeo"
  | "performance"
  | "internalLinking"
  | "markup"
  | "coreWebVitals";

export type SiteAuditMetricValues = Record<SiteAuditMetricKey, number | null>;

export function coreWebVitalsPassRate(cwv: PsiCwv | null | undefined): number | null {
  if (!cwv) return null;
  const checks: boolean[] = [];
  if (cwv.lcpMs !== undefined) checks.push(cwv.lcpMs <= 2_500);
  if (cwv.cls !== undefined) checks.push(cwv.cls <= 0.1);
  if (cwv.inpMs !== undefined) checks.push(cwv.inpMs <= 200);
  if (checks.length === 0) return null;
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function metricValues(input: {
  crawledPages: number;
  siteHealth: number | null;
  errorCount: number;
  warningCount: number;
  themes: StoredThemeScore[];
  psi: StoredPsiMetrics | null;
}): SiteAuditMetricValues {
  const theme = new Map(input.themes.map((item) => [item.key, item]));
  const themeValue = (key: string) => {
    const item = theme.get(key);
    return item?.measurable ? item.score : null;
  };
  return {
    crawledPages: input.crawledPages,
    siteHealth: input.siteHealth,
    aiSearch: themeValue("aiSearch"),
    errors: input.errorCount,
    warnings: input.warningCount,
    crawlability: themeValue("crawlability"),
    https: themeValue("https"),
    internationalSeo: themeValue("internationalSeo"),
    performance: input.psi?.scores.performance ?? null,
    internalLinking: themeValue("internalLinking"),
    markup: themeValue("markup"),
    coreWebVitals: coreWebVitalsPassRate(input.psi?.cwv),
  };
}

export function metricDeltas(
  current: SiteAuditMetricValues,
  previous: SiteAuditMetricValues | null
): SiteAuditMetricValues {
  return Object.fromEntries(
    (Object.keys(current) as SiteAuditMetricKey[]).map((key) => {
      const currentValue = current[key];
      const previousValue = previous?.[key] ?? null;
      return [
        key,
        currentValue === null || previousValue === null
          ? null
          : currentValue - previousValue,
      ];
    })
  ) as SiteAuditMetricValues;
}

export function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
