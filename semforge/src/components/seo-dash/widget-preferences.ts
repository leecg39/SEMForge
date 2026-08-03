export const SEO_WIDGET_IDS = [
  "aiSearch",
  "seoMetrics",
  "positionTracking",
  "siteAudit",
  "onPageSeo",
  "backlinkAudit",
  "organicTrafficInsights",
  "trafficAnalytics",
  "topSearchPages",
  "organicRank",
  "backlinks",
  "googleConnect",
] as const;

export type SeoWidgetId = (typeof SEO_WIDGET_IDS)[number];

const SEO_WIDGET_ID_SET = new Set<string>(SEO_WIDGET_IDS);

export function parseHiddenWidgets(value: string | null): SeoWidgetId[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item, index, rows): item is SeoWidgetId =>
        typeof item === "string" &&
        SEO_WIDGET_ID_SET.has(item) &&
        rows.indexOf(item) === index,
    );
  } catch {
    return [];
  }
}

export function preferenceStorageKey(scope: string) {
  return `semforge:seo-dashboard:v1:${scope}`;
}
