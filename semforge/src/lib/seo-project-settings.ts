import { z } from "zod";

export const SEO_WIDGET_KEYS = [
  "aiSearch",
  "seoMetrics",
  "positionTracking",
  "siteAudit",
  "onPageSeo",
  "backlinkAudit",
  "organicTrafficInsights",
  "trafficAnalytics",
  "organicPositions",
  "backlinks",
  "googleServices",
] as const;

export type SeoWidgetKey = (typeof SEO_WIDGET_KEYS)[number];

export interface SeoProjectSettingsValue {
  countryCode: string;
  device: "desktop" | "mobile";
  searchEngine: "google" | "bing";
  resultScope: "domain" | "subdomain" | "path";
  hiddenWidgets: SeoWidgetKey[];
}

export const DEFAULT_SEO_PROJECT_SETTINGS: SeoProjectSettingsValue = {
  countryCode: "US",
  device: "desktop",
  searchEngine: "google",
  resultScope: "domain",
  hiddenWidgets: [],
};

const countryCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{2}$/, "국가 코드는 영문 2자리여야 합니다."));

export const seoProjectSettingsPatchSchema = z
  .object({
    countryCode: countryCodeSchema.optional(),
    device: z.enum(["desktop", "mobile"]).optional(),
    searchEngine: z.enum(["google", "bing"]).optional(),
    resultScope: z.enum(["domain", "subdomain", "path"]).optional(),
    hiddenWidgets: z
      .array(z.enum(SEO_WIDGET_KEYS))
      .max(SEO_WIDGET_KEYS.length)
      .transform((keys) => [...new Set(keys)])
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "변경할 설정을 하나 이상 입력해 주세요.",
  });

export type SeoProjectSettingsPatch = z.infer<typeof seoProjectSettingsPatchSchema>;

export function parseStoredHiddenWidgets(value: string): SeoWidgetKey[] {
  try {
    const parsed = JSON.parse(value);
    const result = z.array(z.enum(SEO_WIDGET_KEYS)).safeParse(parsed);
    return result.success ? [...new Set(result.data)] : [];
  } catch {
    return [];
  }
}
